import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  GenerationType,
  LearningSourceType,
  PublishChannel,
  PublishJobStatus,
  ReplyJobStatus,
  ReplyRiskLevel,
  XAccountStatus
} from '@draftorbit/db';
import { WorkspaceContextService } from '../../common/workspace-context.service';
import { BillingService } from '../billing/billing.service';
import { GenerateService } from '../generate/generate.service';
import { LearningSourcesService } from '../learning-sources/learning-sources.service';
import { OpsService } from '../ops/ops.service';
import { PublishService } from '../publish/publish.service';
import { ReplyJobsService } from '../reply-jobs/reply-jobs.service';
import { UsageService } from '../usage/usage.service';
import { VoiceProfilesService } from '../voice-profiles/voice-profiles.service';
import { XAccountsService } from '../x-accounts/x-accounts.service';
import { PrismaService } from '../../common/prisma.service';
import type { ChatMessageDto, GenerateRunDto } from './v2.dto';

const DEFAULT_LANGUAGE = 'zh';

export type V2BriefInput = {
  objective: string;
  audience: string;
  tone: string;
  postType: string;
  cta: string;
  topicPreset: string;
};

function pickByKeyword<T>(
  text: string,
  rules: Array<{ match: RegExp; value: T }>,
  fallback: T
): T {
  for (const rule of rules) {
    if (rule.match.test(text)) return rule.value;
  }
  return fallback;
}

export function deriveBriefFromIntent(intent: string): V2BriefInput {
  const normalized = intent.trim().toLowerCase();
  const compactTopic = intent.trim().replace(/\s+/g, ' ').slice(0, 48) || 'X 内容运营';

  const objective = pickByKeyword(
    normalized,
    [
      { match: /(转化|成交|线索|下单|购买|注册|signup|conversion|sales)/, value: '转化' },
      { match: /(品牌|认知|心智|brand|awareness)/, value: '品牌认知' },
      { match: /(涨粉|增长|follower|growth)/, value: '涨粉' },
      { match: /(互动|评论|留言|engagement|reply)/, value: '互动' }
    ],
    '互动'
  );

  const audience = pickByKeyword(
    normalized,
    [
      { match: /(创作者|creator)/, value: '创作者' },
      { match: /(开发者|dev|developer)/, value: '独立开发者' },
      { match: /(品牌|marketing|运营)/, value: '品牌运营' },
      { match: /(ai|模型|agent|llm)/, value: 'AI 从业者' }
    ],
    '创作者'
  );

  const tone = pickByKeyword(
    normalized,
    [
      { match: /(犀利|锋利|hot take|controversial)/, value: '观点锋利' },
      { match: /(轻松|口语|casual|friendly)/, value: '口语亲和' },
      { match: /(专业|严谨|framework|strategy)/, value: '专业清晰' }
    ],
    '专业清晰'
  );

  const postType = pickByKeyword(
    normalized,
    [
      { match: /(教程|步骤|how to|guide|清单)/, value: '教程清单' },
      { match: /(案例|复盘|case study|拆解)/, value: '案例复盘' },
      { match: /(热点|新闻|trend|点评)/, value: '热点点评' }
    ],
    '观点短推'
  );

  const cta = pickByKeyword(
    normalized,
    [
      { match: /(转发|分享|retweet|repost)/, value: '同意请点赞转发' },
      { match: /(关注|follow|订阅)/, value: '关注获取后续更新' }
    ],
    '欢迎留言讨论'
  );

  return {
    objective,
    audience,
    tone,
    postType,
    cta,
    topicPreset: compactTopic
  };
}

export function normalizeKnowledgePaths(paths: string[]): string[] {
  return [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
}

@Injectable()
export class V2Service {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService,
    @Inject(GenerateService) private readonly generate: GenerateService,
    @Inject(LearningSourcesService) private readonly learningSources: LearningSourcesService,
    @Inject(XAccountsService) private readonly xAccounts: XAccountsService,
    @Inject(VoiceProfilesService) private readonly voiceProfiles: VoiceProfilesService,
    @Inject(PublishService) private readonly publish: PublishService,
    @Inject(ReplyJobsService) private readonly replyJobs: ReplyJobsService,
    @Inject(OpsService) private readonly ops: OpsService,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(BillingService) private readonly billing: BillingService
  ) {}

  private resolveSessionTitle(title?: string): string {
    const trimmed = title?.trim();
    if (trimmed) return trimmed.slice(0, 80);
    const now = new Date();
    return `Chat Session ${now.toISOString().slice(0, 16).replace('T', ' ')}`;
  }

  private async ensureSession(workspaceId: string, sessionId?: string | null) {
    if (!sessionId) return null;
    const session = await this.prisma.db.contentProject.findFirst({
      where: {
        id: sessionId,
        workspaceId
      }
    });
    if (!session) {
      throw new NotFoundException('会话不存在或不属于当前工作区');
    }
    return session;
  }

  async createChatSession(userId: string, title?: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const session = await this.prisma.db.contentProject.create({
      data: {
        workspaceId,
        name: this.resolveSessionTitle(title),
        description: 'DraftOrbit V2 chat-first session',
        metadata: {
          version: 'v2',
          mode: 'chat-first',
          reasoningVisibility: 'step_summary'
        }
      }
    });

    return {
      sessionId: session.id,
      title: session.name,
      createdAt: session.createdAt.toISOString(),
      nextAction: 'send_message'
    };
  }

  async runGeneration(userId: string, input: GenerateRunDto | ChatMessageDto) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    let session = await this.ensureSession(workspaceId, (input as GenerateRunDto).sessionId ?? null);

    if (!session) {
      const created = await this.createChatSession(userId);
      session = await this.prisma.db.contentProject.findUnique({ where: { id: created.sessionId } });
    }

    const intent = (
      (input as GenerateRunDto).intent ??
      (input as ChatMessageDto).message ??
      (input as GenerateRunDto).advanced?.customPrompt ??
      ''
    ).trim();

    if (!intent && !(input as GenerateRunDto).brief) {
      throw new BadRequestException('缺少生成意图：请提供 intent 或 message');
    }

    const requestedMode = (input as GenerateRunDto).mode ?? ((input as GenerateRunDto).brief ? 'brief' : 'advanced');
    const brief =
      requestedMode === 'brief'
        ? (input as GenerateRunDto).brief ?? deriveBriefFromIntent(intent)
        : undefined;

    const generationId = await this.generate.startGeneration(userId, {
      mode: requestedMode,
      brief,
      customPrompt: requestedMode === 'advanced' ? intent : undefined,
      type: (input as GenerateRunDto).type ?? GenerationType.TWEET,
      language: (input as GenerateRunDto).language ?? DEFAULT_LANGUAGE,
      useStyle: (input as GenerateRunDto).useStyle ?? true
    });

    if (session) {
      await this.prisma.db.contentProject.update({
        where: { id: session.id },
        data: {
          metadata: {
            ...((session.metadata as Record<string, unknown>) ?? {}),
            lastIntent: intent.slice(0, 240),
            lastGenerationId: generationId,
            updatedAt: new Date().toISOString()
          }
        }
      });
    }

    return {
      sessionId: session?.id ?? null,
      generationId,
      status: 'queued',
      streamUrl: `/v2/generate/${generationId}/stream`,
      resultUrl: `/v2/generate/${generationId}`,
      nextAction: 'watch_reasoning'
    };
  }

  async listGenerationHistory(userId: string, limit = 20) {
    return this.generate.listGenerations(userId, limit);
  }

  async connectObsidian(userId: string, input: {
    vaultPath: string;
    xAccountId?: string;
    includePatterns?: string[];
    autoLearn?: boolean;
  }) {
    const source = await this.learningSources.create(userId, {
      sourceType: LearningSourceType.IMPORT_CSV,
      sourceRef: input.vaultPath,
      xAccountId: input.xAccountId,
      metadata: {
        connector: 'obsidian',
        includePatterns: input.includePatterns ?? ['**/*.md'],
        mode: 'hybrid'
      }
    });

    const autoLearn = input.autoLearn ?? true;
    const learning = autoLearn ? await this.learningSources.runLearning(userId, source.id) : null;

    return {
      connector: 'obsidian',
      source,
      learning,
      nextAction: autoLearn ? 'wait_learning_complete' : 'run_learning'
    };
  }

  async connectLocalFiles(userId: string, input: {
    paths: string[];
    xAccountId?: string;
    autoLearn?: boolean;
  }) {
    const paths = normalizeKnowledgePaths(input.paths);
    if (paths.length === 0) {
      throw new BadRequestException('至少提供一个本地文件路径');
    }

    const createdSources = [];
    for (const refPath of paths) {
      const source = await this.learningSources.create(userId, {
        sourceType: LearningSourceType.IMPORT_CSV,
        sourceRef: refPath,
        xAccountId: input.xAccountId,
        metadata: {
          connector: 'local_file',
          mode: 'hybrid'
        }
      });
      createdSources.push(source);
    }

    const autoLearn = input.autoLearn ?? true;
    const learningJobs = autoLearn
      ? await Promise.all(createdSources.map((source) => this.learningSources.runLearning(userId, source.id)))
      : [];

    return {
      connector: 'local_files',
      count: createdSources.length,
      sources: createdSources,
      learningJobs,
      nextAction: autoLearn ? 'wait_learning_complete' : 'run_learning'
    };
  }

  async importKnowledgeUrls(userId: string, input: {
    urls: string[];
    xAccountId?: string;
    autoLearn?: boolean;
  }) {
    const urls = normalizeKnowledgePaths(input.urls);
    if (urls.length === 0) {
      throw new BadRequestException('至少提供一个 URL');
    }

    const sources = [];
    for (const url of urls) {
      const source = await this.learningSources.create(userId, {
        sourceType: LearningSourceType.URL,
        sourceRef: url,
        xAccountId: input.xAccountId,
        metadata: {
          connector: 'url',
          mode: 'hybrid'
        }
      });
      sources.push(source);
    }

    const autoLearn = input.autoLearn ?? true;
    const learningJobs = autoLearn
      ? await Promise.all(sources.map((source) => this.learningSources.runLearning(userId, source.id)))
      : [];

    return {
      connector: 'url',
      count: sources.length,
      sources,
      learningJobs,
      nextAction: autoLearn ? 'wait_learning_complete' : 'run_learning'
    };
  }

  async rebuildStyleProfile(userId: string, profileId?: string) {
    if (profileId) {
      const profile = await this.voiceProfiles.rebuildStub(userId, profileId);
      return {
        created: false,
        profile,
        nextAction: 'regenerate_content'
      };
    }

    const profiles = await this.voiceProfiles.list(userId);
    if (profiles.length === 0) {
      const created = await this.voiceProfiles.create(userId, {
        name: 'Auto Style DNA',
        profile: {
          style: 'auto-learned',
          language: 'zh',
          source: 'v2-style-rebuild',
          notes: ['从历史内容自动学习表达节奏与用词偏好']
        }
      });
      const profile = await this.voiceProfiles.rebuildStub(userId, created.id);
      return {
        created: true,
        profile,
        nextAction: 'regenerate_content'
      };
    }

    const target = profiles[0];
    const profile = await this.voiceProfiles.rebuildStub(userId, target.id);
    return {
      created: false,
      profile,
      nextAction: 'regenerate_content'
    };
  }

  async queuePublish(
    userId: string,
    input: {
      generationId?: string;
      draftId?: string;
      channel?: PublishChannel;
      scheduledFor?: string;
      xAccountId?: string;
    }
  ) {
    if (!input.generationId && !input.draftId) {
      throw new BadRequestException('必须提供 generationId 或 draftId');
    }

    if (input.draftId) {
      const result = await this.publish.publishDraft(
        userId,
        input.draftId,
        input.scheduledFor,
        input.xAccountId
      );
      return {
        ...result,
        nextAction: 'watch_publish_queue'
      };
    }

    if (!input.generationId) {
      throw new BadRequestException('缺少 generationId');
    }

    const channel = input.channel ?? PublishChannel.X_TWEET;
    const result =
      channel === PublishChannel.X_THREAD
        ? await this.publish.publishThread(userId, input.generationId, input.xAccountId)
        : await this.publish.publishTweet(userId, input.generationId, input.xAccountId);

    return {
      ...result,
      nextAction: 'watch_publish_queue'
    };
  }

  async listPublishJobs(
    userId: string,
    options?: {
      limit?: number;
      page?: number;
      pageSize?: number;
      status?: PublishJobStatus;
    }
  ) {
    return this.publish.listJobs(userId, options ?? {});
  }

  async retryPublishJob(userId: string, id: string) {
    return this.publish.retryJob(userId, id);
  }

  async startXOAuth(userId: string) {
    return this.xAccounts.startOAuthBind(userId);
  }

  async listXAccounts(
    userId: string,
    options?: {
      page?: number;
      pageSize?: number;
      status?: XAccountStatus;
    }
  ) {
    return this.xAccounts.list(userId, options ?? {});
  }

  async bindXAccountManual(
    userId: string,
    input: {
      twitterUserId: string;
      handle: string;
      status?: XAccountStatus;
    }
  ) {
    return this.xAccounts.bindManual(userId, input);
  }

  async setDefaultXAccount(userId: string, id: string) {
    return this.xAccounts.setDefault(userId, id);
  }

  async updateXAccountStatus(userId: string, id: string, status: XAccountStatus) {
    return this.xAccounts.updateStatus(userId, id, status);
  }

  async removeXAccount(userId: string, id: string) {
    return this.xAccounts.remove(userId, id);
  }

  async handleXOAuthCallback(state: string, code: string) {
    return this.xAccounts.handleOAuthCallback(state, code);
  }

  async getOpsDashboard(userId: string) {
    return this.ops.dashboardOverview(userId);
  }

  async listReplyJobs(
    userId: string,
    options?: {
      page?: number;
      pageSize?: number;
      status?: ReplyJobStatus;
    }
  ) {
    return this.replyJobs.list(userId, options ?? {});
  }

  async syncReplyMentions(userId: string, input: { xAccountId?: string; sourcePostId?: string }) {
    return this.replyJobs.syncMentions(userId, input);
  }

  async addReplyCandidate(
    userId: string,
    replyJobId: string,
    input: { content: string; riskLevel?: ReplyRiskLevel; riskScore?: number }
  ) {
    return this.replyJobs.addCandidate(userId, replyJobId, input);
  }

  async approveReplyCandidate(userId: string, replyJobId: string, candidateId: string) {
    return this.replyJobs.approveCandidate(userId, replyJobId, candidateId);
  }

  async sendReply(userId: string, replyJobId: string, candidateId?: string) {
    return this.replyJobs.sendApproved(userId, replyJobId, candidateId);
  }

  async getUsageOverview(userId: string, options?: { eventsLimit?: number; days?: number }) {
    return this.usage.overview(userId, {
      eventsLimit: options?.eventsLimit,
      trendDays: options?.days
    });
  }

  getBillingPlans() {
    return this.billing.getPlans();
  }

  async getBillingSubscription(userId: string) {
    return this.billing.getSubscription(userId);
  }

  async getBillingUsage(userId: string) {
    return this.billing.getUsageSummary(userId);
  }

  async createCheckout(userId: string, plan: 'STARTER' | 'PRO' | 'PREMIUM', cycle: 'MONTHLY' | 'YEARLY') {
    return this.billing.createCheckoutSession(userId, plan, cycle);
  }

  async cancelBillingSubscription(userId: string, mode: 'AT_PERIOD_END' | 'IMMEDIATE') {
    return this.billing.cancelSubscription(userId, mode);
  }

  async refundBilling(
    userId: string,
    input: {
      mode: 'PARTIAL' | 'FULL';
      amountUsd?: number;
      reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent';
    }
  ) {
    return this.billing.createRefund(userId, input);
  }
}
