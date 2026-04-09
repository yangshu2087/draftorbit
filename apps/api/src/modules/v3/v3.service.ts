import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  GenerationStatus,
  GenerationType,
  LearningSourceType,
  PublishJobStatus,
  StepName,
  SubscriptionPlan
} from '@draftorbit/db';
import { resolveXArticlePublishCapability } from '@draftorbit/shared';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';
import { BillingService } from '../billing/billing.service';
import { GenerateService, type PackageResult } from '../generate/generate.service';
import { HistoryService } from '../history/history.service';
import { LearningSourcesService } from '../learning-sources/learning-sources.service';
import { PublishService } from '../publish/publish.service';
import { XAccountsService } from '../x-accounts/x-accounts.service';
import type {
  V3BillingCheckoutDto,
  V3ConnectLocalFilesDto,
  V3ConnectObsidianDto,
  V3ConnectTargetDto,
  V3ConnectUrlsDto,
  V3PublishArticleCompleteDto,
  V3PublishConfirmDto,
  V3PublishPrepareDto,
  V3RunChatDto
} from './v3.dto';

export type V3Stage = 'research' | 'strategy' | 'draft' | 'voice' | 'media' | 'publish_prep' | 'error';

const ACTIVE_JOB_STATUSES = [
  PublishJobStatus.PENDING,
  PublishJobStatus.QUEUED,
  PublishJobStatus.RUNNING
] as const;

const FAILED_JOB_STATUSES = [PublishJobStatus.FAILED, PublishJobStatus.CANCELED] as const;

export function mapGenerationStepToV3Stage(step: StepName | 'error' | string): { stage: V3Stage; label: string } {
  switch (step) {
    case StepName.HOTSPOT:
    case 'HOTSPOT':
      return { stage: 'research', label: '正在研究话题' };
    case StepName.OUTLINE:
    case 'OUTLINE':
      return { stage: 'strategy', label: '正在规划结构' };
    case StepName.DRAFT:
    case 'DRAFT':
      return { stage: 'draft', label: '正在生成草稿' };
    case StepName.HUMANIZE:
    case 'HUMANIZE':
      return { stage: 'voice', label: '正在匹配你的文风' };
    case StepName.IMAGE:
    case 'IMAGE':
      return { stage: 'media', label: '正在整理配图建议' };
    case StepName.PACKAGE:
    case 'PACKAGE':
      return { stage: 'publish_prep', label: '正在准备可发布结果' };
    default:
      return { stage: 'error', label: '生成失败' };
  }
}

export function buildV3SourceEvidence(
  sources: Array<{ sourceType: string; sourceRef: string; metadata?: Record<string, unknown> | null }>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const source of sources) {
    const connector = String(source.metadata?.connector ?? '').trim();
    let label: string | null = null;

    if (connector === 'x_self' || source.sourceType === 'X_TIMELINE') {
      label = '已学习你的 X 历史内容';
    } else if (
      connector === 'x_target' ||
      (/x\.com\//i.test(source.sourceRef) && source.sourceType === 'URL')
    ) {
      label = '已学习目标账号 / 推文链接';
    } else if (connector === 'obsidian' || connector === 'local_file' || source.sourceType === 'IMPORT_CSV') {
      label = '已接入 Obsidian / 本地知识库';
    } else if (source.sourceType === 'URL') {
      label = '已接入外部链接知识';
    }

    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }

  return result;
}

export function buildV3PromptEnvelope(input: {
  intent: string;
  format: 'tweet' | 'thread' | 'article';
  withImage: boolean;
  styleSummary?: string | null;
  sourceEvidence?: string[];
}) {
  return [
    '你是 DraftOrbit 的 X AI Operator。',
    `用户意图：${input.intent.trim()}`,
    `输出形式：${input.format}`,
    `需要配图：${input.withImage ? 'yes' : 'no'}`,
    '自动完成：意图理解、结构规划、文风适配、X 平台合规检查。',
    '不要把问题反抛给用户，不要要求用户再填写复杂 brief。',
    '请你自动判断目标受众、表达角度、hook、thread 结构、CTA 与风险控制。',
    input.format === 'article'
      ? '如果输出 article，请按 X 文章格式组织：标题、导语、3-5 个小节、结尾行动句；不要写成 tweet/thread 的短格式。'
      : '如果输出 tweet/thread，请优先保证可直接发布、读完即可懂。 ',
    input.styleSummary ? `用户风格摘要：${input.styleSummary}` : '用户风格摘要：如有历史内容，请优先匹配其稳定表达方式。',
    input.sourceEvidence && input.sourceEvidence.length > 0
      ? `已连接证据：${input.sourceEvidence.join('；')}`
      : '已连接证据：若缺少外部证据，请基于用户意图与 X 平台语境完成生成。'
  ].join('\n');
}

export function resolveV3PublishGuard(format: 'tweet' | 'thread' | 'article') {
  if (format !== 'article') return null;
  const capability = resolveXArticlePublishCapability();
  return {
    blockingReason: 'ARTICLE_PUBLISH_NOT_SUPPORTED',
    nextAction: capability.nextAction,
    message: '当前长文暂不支持直接发布，请先复制到 X 文章编辑器。'
  };
}

type SourceRow = {
  id: string;
  sourceType: LearningSourceType;
  sourceRef: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

function generationTypeFromFormat(format: 'tweet' | 'thread' | 'article'): GenerationType {
  if (format === 'thread') return GenerationType.THREAD;
  if (format === 'article') return GenerationType.LONG;
  return GenerationType.TWEET;
}

function formatFromGenerationType(type: GenerationType): 'tweet' | 'thread' | 'article' {
  if (type === GenerationType.THREAD) return 'thread';
  if (type === GenerationType.LONG) return 'article';
  return 'tweet';
}

function normalizeTargetRef(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, '').replace(/^https?:\/\/x\.com\//i, '').split(/[/?#]/)[0];
  if (!handle) return trimmed;
  return `https://x.com/${handle}`;
}

function extractStyleSummary(analysis: unknown): string | null {
  if (!analysis || typeof analysis !== 'object') return null;
  const record = analysis as Record<string, unknown>;
  const pieces: string[] = [];
  for (const key of ['tone', 'vocabulary', 'sentence_structure', 'topic_preferences', 'emoji_usage']) {
    const value = record[key];
    if (!value) continue;
    if (Array.isArray(value)) {
      const joined = value.map((item) => String(item).trim()).filter(Boolean).slice(0, 3).join('、');
      if (joined) pieces.push(`${key}:${joined}`);
      continue;
    }
    if (typeof value === 'string' && value.trim()) {
      pieces.push(`${key}:${value.trim()}`);
    }
  }
  return pieces.length > 0 ? pieces.join('；') : null;
}

function parsePackageResult(result: unknown): PackageResult | null {
  if (!result || typeof result !== 'object') return null;
  const row = result as Record<string, unknown>;
  if (typeof row.tweet !== 'string') return null;
  return row as unknown as PackageResult;
}

function buildRiskFlags(pkg: PackageResult | null, format: 'tweet' | 'thread' | 'article'): string[] {
  if (!pkg) return ['结果包缺失，请重新生成'];
  const flags: string[] = [];
  if (format === 'article') {
    const sectionCount = (pkg.tweet.match(/(?:^|\n)[一二三四五六七八九十]、/gu) ?? []).length;
    if (pkg.charCount < 400) flags.push('长文偏短，建议补充 3-5 个小节');
    if (sectionCount < 3) flags.push('长文结构偏弱，建议至少保留 3 个小节');
    if (/#[\p{L}0-9_]+/u.test(pkg.tweet)) flags.push('X 长文正文不建议带 hashtag');
  } else if (pkg.charCount > 280) {
    flags.push('长度超出单条推文限制');
  }
  if ((pkg.quality?.aiTrace ?? 100) < 68) flags.push('AI 痕迹偏重，建议再来一版');
  if ((pkg.quality?.platformFit ?? 100) < 70) flags.push('平台适配度偏低，建议手动编辑');
  if ((pkg.quality?.total ?? 100) < 72) flags.push('整体质量未达到推荐阈值');
  return flags;
}

function summarizeStepContent(step: string, content?: string): string | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if ((step === 'HOTSPOT' || step === StepName.HOTSPOT) && typeof parsed.angleSummary === 'string') {
      return parsed.angleSummary;
    }
    if ((step === 'OUTLINE' || step === StepName.OUTLINE) && typeof parsed.hook === 'string') {
      return `已确定 hook：${parsed.hook}`;
    }
    if ((step === 'DRAFT' || step === StepName.DRAFT) && typeof parsed.primaryTweet === 'string') {
      return String(parsed.primaryTweet).slice(0, 100);
    }
    if ((step === 'HUMANIZE' || step === StepName.HUMANIZE) && typeof parsed.humanized === 'string') {
      return String(parsed.humanized).slice(0, 100);
    }
    if ((step === 'IMAGE' || step === StepName.IMAGE) && Array.isArray(parsed.searchKeywords)) {
      return `配图关键词：${parsed.searchKeywords.slice(0, 3).join(' / ')}`;
    }
    if ((step === 'PACKAGE' || step === StepName.PACKAGE) && typeof parsed.tweet === 'string') {
      const quality = parsed.quality && typeof parsed.quality === 'object' ? parsed.quality as Record<string, unknown> : null;
      const total = quality && typeof quality.total === 'number' ? ` · 质量 ${quality.total}` : '';
      return `结果包已就绪${total}`;
    }
  } catch {
    return content.slice(0, 100);
  }
  return content.slice(0, 100);
}

@Injectable()
export class V3Service {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService,
    @Inject(GenerateService) private readonly generate: GenerateService,
    @Inject(LearningSourcesService) private readonly learningSources: LearningSourcesService,
    @Inject(XAccountsService) private readonly xAccounts: XAccountsService,
    @Inject(HistoryService) private readonly history: HistoryService,
    @Inject(PublishService) private readonly publish: PublishService,
    @Inject(BillingService) private readonly billing: BillingService
  ) {}

  private async getWorkspaceScopedState(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const [user, xAccounts, sources, style] = await Promise.all([
      this.prisma.db.user.findUnique({
        where: { id: userId },
        include: { subscription: true }
      }),
      this.xAccounts.list(userId, { pageSize: 20 }),
      this.learningSources.list(userId),
      this.prisma.db.tweetStyle.findUnique({ where: { userId } })
    ]);

    if (!user) throw new NotFoundException('用户不存在');

    const defaultXAccount = xAccounts.find((row) => row.isDefault) ?? xAccounts[0] ?? null;
    return { workspaceId, user, xAccounts, sources: sources as SourceRow[], style, defaultXAccount };
  }

  private buildSuggestedAction(input: {
    defaultXAccount: { id: string } | null;
    sources: SourceRow[];
    styleSummary: string | null;
  }) {
    if (!input.defaultXAccount) return 'connect_x_self';
    if (!input.styleSummary) return 'rebuild_profile';
    if (input.sources.length === 0) return 'connect_learning_source';
    return 'run_first_generation';
  }

  async bootstrapSession(userId: string) {
    const state = await this.getWorkspaceScopedState(userId);
    const styleSummary = extractStyleSummary(state.style?.analysisResult ?? null);
    const sourceEvidence = buildV3SourceEvidence(state.sources);

    return {
      user: {
        id: state.user.id,
        handle: state.user.handle,
        plan: state.user.subscription?.plan ?? SubscriptionPlan.FREE
      },
      workspaceId: state.workspaceId,
      defaultXAccount: state.defaultXAccount
        ? {
            id: state.defaultXAccount.id,
            handle: state.defaultXAccount.handle,
            status: state.defaultXAccount.status,
            isDefault: state.defaultXAccount.isDefault
          }
        : null,
      counts: {
        xAccounts: state.xAccounts.length,
        sources: state.sources.length
      },
      sourceEvidence,
      profile: {
        ready: Boolean(styleSummary),
        styleSummary,
        sourceCount: state.sources.length
      },
      suggestedAction: this.buildSuggestedAction({
        defaultXAccount: state.defaultXAccount,
        sources: state.sources,
        styleSummary
      })
    };
  }

  async runChat(userId: string, input: V3RunChatDto) {
    const state = await this.getWorkspaceScopedState(userId);
    const styleSummary = extractStyleSummary(state.style?.analysisResult ?? null);
    const sourceEvidence = buildV3SourceEvidence(state.sources);
    const prompt = buildV3PromptEnvelope({
      intent: input.intent,
      format: input.format,
      withImage: input.withImage,
      styleSummary,
      sourceEvidence
    });

    const generationId = await this.generate.startGeneration(userId, {
      mode: 'advanced',
      customPrompt: prompt,
      type: generationTypeFromFormat(input.format),
      language: 'zh',
      useStyle: true
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId: state.workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'v3_run',
        resourceId: generationId,
        payload: {
          intent: input.intent,
          format: input.format,
          withImage: input.withImage,
          xAccountId: input.xAccountId ?? null,
          safeMode: input.safeMode ?? true
        }
      }
    });

    return {
      runId: generationId,
      stage: 'queued',
      nextAction: 'watch_generation',
      blockingReason: null,
      streamUrl: `/v3/chat/runs/${generationId}/stream`
    };
  }

  async *streamRun(runId: string, userId: string): AsyncGenerator<{
    stage: V3Stage;
    label: string;
    status: 'running' | 'done' | 'failed';
    summary?: string | null;
  }> {
    for await (const event of this.generate.runReasoningChain(runId, userId)) {
      if (event.step === 'error') {
        yield {
          stage: 'error',
          label: '生成失败',
          status: 'failed',
          summary: event.content ?? '生成失败'
        };
        continue;
      }
      const mapped = mapGenerationStepToV3Stage(event.step);
      yield {
        stage: mapped.stage,
        label: mapped.label,
        status: event.status,
        summary: summarizeStepContent(event.step, event.content)
      };
    }
  }

  async getRun(userId: string, id: string) {
    const generation = await this.prisma.db.generation.findFirst({
      where: { id, userId },
      include: {
        publishRecord: true,
        steps: true,
        publishJobs: {
          include: {
            xAccount: {
              select: { id: true, handle: true, isDefault: true, status: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (!generation) throw new NotFoundException('生成任务不存在');

    const state = await this.getWorkspaceScopedState(userId);
    const pkg = parsePackageResult(generation.result);
    const whySummary = pkg?.stepExplain
      ? Object.values(pkg.stepExplain).filter(Boolean).slice(0, 3)
      : [];

    const format = formatFromGenerationType(generation.type);
    const manualPublish = generation.publishRecord
      ? [{
          id: generation.publishRecord.id,
          status: 'MANUAL_RECORDED',
          xAccountId: null,
          xAccountHandle: null,
          createdAt: generation.publishRecord.publishedAt.toISOString(),
          updatedAt: generation.publishRecord.publishedAt.toISOString(),
          externalPostId: generation.publishRecord.externalTweetId,
          lastError: null
        }]
      : [];

    return {
      runId: generation.id,
      status: generation.status,
      format,
      result: pkg
        ? {
            text: pkg.tweet,
            variants: pkg.variants,
            imageKeywords: pkg.imageKeywords,
            qualityScore: pkg.quality?.total ?? null,
            quality: pkg.quality,
            riskFlags: buildRiskFlags(pkg, format),
            requestCostUsd: null,
            whySummary,
            evidenceSummary: buildV3SourceEvidence(state.sources),
            stepLatencyMs: pkg.stepLatencyMs ?? null
          }
        : null,
      publish: [
        ...manualPublish,
        ...generation.publishJobs.map((job) => ({
          id: job.id,
          status: job.status,
          xAccountId: job.xAccountId,
          xAccountHandle: job.xAccount?.handle ?? null,
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString(),
          externalPostId: job.externalPostId,
          lastError: job.lastError
        }))
      ],
      stages: generation.steps.map((step) => {
        const mapped = mapGenerationStepToV3Stage(step.step);
        return {
          stage: mapped.stage,
          label: mapped.label,
          status: step.status,
          summary: summarizeStepContent(step.step, step.content ?? undefined)
        };
      })
    };
  }

  async connectSelfX(userId: string) {
    return this.xAccounts.startOAuthBind(userId);
  }

  async finishSelfXOAuth(state: string, code: string) {
    return {
      ...(await this.xAccounts.handleOAuthCallback(state, code)),
      nextAction: 'connect_learning_source',
      blockingReason: null
    };
  }

  async connectTargetX(userId: string, input: V3ConnectTargetDto) {
    const normalizedRef = normalizeTargetRef(input.handleOrUrl);
    const source = await this.learningSources.create(userId, {
      sourceType: LearningSourceType.URL,
      sourceRef: normalizedRef,
      metadata: {
        connector: 'x_target',
        originalInput: input.handleOrUrl
      }
    });
    await this.learningSources.runLearning(userId, source.id);
    return {
      ok: true,
      source,
      nextAction: 'run_first_generation'
    };
  }

  async connectObsidian(userId: string, input: V3ConnectObsidianDto) {
    const source = await this.learningSources.create(userId, {
      sourceType: LearningSourceType.IMPORT_CSV,
      sourceRef: input.vaultPath,
      metadata: {
        connector: 'obsidian',
        includePatterns: input.includePatterns ?? ['**/*.md']
      }
    });
    await this.learningSources.runLearning(userId, source.id);
    return { ok: true, source, nextAction: 'run_first_generation' };
  }

  async connectLocalFiles(userId: string, input: V3ConnectLocalFilesDto) {
    const created = [];
    for (const path of input.paths.map((row) => row.trim()).filter(Boolean)) {
      const source = await this.learningSources.create(userId, {
        sourceType: LearningSourceType.IMPORT_CSV,
        sourceRef: path,
        metadata: { connector: 'local_file' }
      });
      await this.learningSources.runLearning(userId, source.id);
      created.push(source);
    }
    return { ok: true, count: created.length, sources: created, nextAction: 'run_first_generation' };
  }

  async connectUrls(userId: string, input: V3ConnectUrlsDto) {
    const created = [];
    for (const url of input.urls.map((row) => row.trim()).filter(Boolean)) {
      const source = await this.learningSources.create(userId, {
        sourceType: LearningSourceType.URL,
        sourceRef: url,
        metadata: { connector: 'url' }
      });
      await this.learningSources.runLearning(userId, source.id);
      created.push(source);
    }
    return { ok: true, count: created.length, sources: created, nextAction: 'run_first_generation' };
  }

  async getProfile(userId: string) {
    const state = await this.getWorkspaceScopedState(userId);
    return {
      styleSummary: extractStyleSummary(state.style?.analysisResult ?? null),
      styleSampleCount: state.style?.sampleCount ?? 0,
      styleLastAnalyzedAt: state.style?.lastAnalyzedAt?.toISOString() ?? null,
      sourceEvidence: buildV3SourceEvidence(state.sources),
      sources: state.sources.map((source) => ({
        id: source.id,
        sourceType: source.sourceType,
        sourceRef: source.sourceRef,
        connector: String(source.metadata?.connector ?? ''),
        createdAt: source.createdAt.toISOString()
      })),
      xAccounts: state.xAccounts.map((account) => ({
        id: account.id,
        handle: account.handle,
        status: account.status,
        isDefault: account.isDefault,
        tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null
      }))
    };
  }

  async rebuildProfile(userId: string) {
    let analysis: unknown;
    try {
      analysis = await this.history.analyzeStyle(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const normalized = message.toLowerCase();
      if (
        normalized.includes('no access token') ||
        normalized.includes('no twitter account') ||
        normalized.includes('no twitter account bound')
      ) {
        throw new BadRequestException({
          code: 'PROFILE_REBUILD_BLOCKED',
          message: '缺少可用的 X 历史数据，请先完成 X 账号绑定后再重建画像',
          details: {
            nextAction: 'connect_x_self',
            blockingReason: 'X_ACCOUNT_NOT_READY'
          }
        });
      }
      throw error;
    }
    return {
      ok: true,
      styleSummary: extractStyleSummary(analysis),
      nextAction: 'run_first_generation'
    };
  }

  async preparePublish(userId: string, input: V3PublishPrepareDto) {
    const state = await this.getWorkspaceScopedState(userId);
    const generation = await this.prisma.db.generation.findFirst({ where: { id: input.runId, userId } });
    if (!generation) {
      throw new NotFoundException({
        code: 'RUN_NOT_FOUND',
        message: '生成任务不存在',
        details: {
          nextAction: 'run_first_generation',
          blockingReason: 'RUN_NOT_FOUND'
        }
      });
    }
    if (generation.status !== GenerationStatus.DONE) {
      throw new BadRequestException({
        code: 'RUN_NOT_READY',
        message: '生成尚未完成，无法准备发布',
        details: {
          nextAction: 'watch_generation',
          blockingReason: 'RUN_NOT_READY'
        }
      });
    }

    const pkg = parsePackageResult(generation.result);
    const format = formatFromGenerationType(generation.type);
    const publishGuard = resolveV3PublishGuard(format);
    const selected = input.xAccountId
      ? state.xAccounts.find((row) => row.id === input.xAccountId) ?? null
      : state.defaultXAccount;
    const articleCapability = format === 'article' ? resolveXArticlePublishCapability() : null;

    return {
      runId: input.runId,
      xAccount: selected
        ? {
            id: selected.id,
            handle: selected.handle,
            status: selected.status,
            isDefault: selected.isDefault
          }
        : null,
      safeMode: input.safeMode ?? true,
      blockingReason: publishGuard?.blockingReason ?? (!selected ? 'NO_ACTIVE_X_ACCOUNT' : null),
      nextAction: publishGuard?.nextAction ?? (!selected ? 'connect_x_self' : 'confirm_publish'),
      exportGuide: articleCapability
        ? {
            mode: articleCapability.mode,
            openUrl: articleCapability.openUrl,
            nativeApiAvailable: articleCapability.nativeApiAvailable,
            description: articleCapability.description
          }
        : null,
      preview: pkg
        ? {
            text: pkg.tweet,
            charCount: pkg.charCount,
            qualityScore: pkg.quality.total,
            riskFlags: buildRiskFlags(pkg, format),
            imageKeywords: pkg.imageKeywords
          }
        : null
    };
  }

  async confirmPublish(userId: string, input: V3PublishConfirmDto) {
    const generation = await this.prisma.db.generation.findFirst({ where: { id: input.runId, userId } });
    if (!generation) {
      throw new NotFoundException({
        code: 'RUN_NOT_FOUND',
        message: '生成任务不存在',
        details: {
          nextAction: 'run_first_generation',
          blockingReason: 'RUN_NOT_FOUND'
        }
      });
    }
    if (generation.status !== GenerationStatus.DONE) {
      throw new BadRequestException({
        code: 'RUN_NOT_READY',
        message: '生成尚未完成，无法发布',
        details: {
          nextAction: 'watch_generation',
          blockingReason: 'RUN_NOT_READY'
        }
      });
    }

    const format = formatFromGenerationType(generation.type);
    const publishGuard = resolveV3PublishGuard(format);
    if (publishGuard) {
      throw new BadRequestException({
        code: publishGuard.blockingReason,
        message: publishGuard.message,
        details: {
          nextAction: publishGuard.nextAction,
          blockingReason: publishGuard.blockingReason
        }
      });
    }

    const result = generation.type === GenerationType.THREAD
      ? await this.publish.publishThread(userId, input.runId, input.xAccountId)
      : await this.publish.publishTweet(userId, input.runId, input.xAccountId);

    return {
      ...result,
      runId: input.runId,
      nextAction: 'open_queue'
    };
  }

  async completeArticlePublish(userId: string, input: V3PublishArticleCompleteDto) {
    const generation = await this.prisma.db.generation.findFirst({
      where: { id: input.runId, userId }
    });
    if (!generation) {
      throw new NotFoundException({
        code: 'RUN_NOT_FOUND',
        message: '生成任务不存在',
        details: {
          nextAction: 'run_first_generation',
          blockingReason: 'RUN_NOT_FOUND'
        }
      });
    }
    if (generation.status !== GenerationStatus.DONE) {
      throw new BadRequestException({
        code: 'RUN_NOT_READY',
        message: '生成尚未完成，无法记录文章发布结果',
        details: {
          nextAction: 'watch_generation',
          blockingReason: 'RUN_NOT_READY'
        }
      });
    }
    if (generation.type !== GenerationType.LONG) {
      throw new BadRequestException({
        code: 'ARTICLE_ONLY',
        message: '只有长文结果才能记录 X 文章发布链接',
        details: {
          nextAction: 'open_queue',
          blockingReason: 'ARTICLE_ONLY'
        }
      });
    }

    const result = await this.publish.completeManualArticlePublish(userId, input.runId, input.url, input.xAccountId);
    return {
      ...result,
      runId: input.runId,
      nextAction: 'export_article'
    };
  }

  async getQueue(userId: string, limit = 20) {
    const runs = await this.prisma.db.generation.findMany({
      where: { userId, status: GenerationStatus.DONE },
      include: {
        publishRecord: true,
        publishJobs: {
          include: {
            xAccount: {
              select: { id: true, handle: true, isDefault: true, status: true }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50)
    });

    const jobs = await this.publish.listJobs(userId, { limit: Math.min(Math.max(limit, 1), 50) });
    const pendingReview = runs
      .filter((run) => run.publishJobs.length === 0 && !run.publishRecord)
      .map((run) => {
        const pkg = parsePackageResult(run.result);
        const format = formatFromGenerationType(run.type);
        return {
          runId: run.id,
          format,
          text: pkg?.tweet ?? null,
          qualityScore: pkg?.quality.total ?? null,
          riskFlags: buildRiskFlags(pkg, format),
          createdAt: run.createdAt.toISOString(),
          nextAction: format === 'article' ? 'export_article' : 'confirm_publish'
        };
      });

    const publishedByJobs = jobs
      .filter((job) => job.status === PublishJobStatus.SUCCEEDED)
      .map((job) => ({
        id: job.id,
        runId: job.generationId,
        status: job.status,
        xAccountHandle: job.xAccount?.handle ?? null,
        externalPostId: job.externalPostId,
        updatedAt: job.updatedAt.toISOString()
      }));

    const publishedByManualArticles = runs
      .filter((run) => Boolean(run.publishRecord))
      .map((run) => ({
        id: run.publishRecord!.id,
        runId: run.id,
        status: 'MANUAL_RECORDED',
        xAccountHandle: null,
        externalPostId: run.publishRecord?.externalTweetId ?? null,
        updatedAt: run.publishRecord?.publishedAt.toISOString() ?? run.updatedAt.toISOString()
      }));

    return {
      review: pendingReview,
      queued: jobs
        .filter((job) => ACTIVE_JOB_STATUSES.includes(job.status as (typeof ACTIVE_JOB_STATUSES)[number]))
        .map((job) => ({
          id: job.id,
          runId: job.generationId,
          status: job.status,
          xAccountId: job.xAccountId,
          xAccountHandle: job.xAccount?.handle ?? null,
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString(),
          lastError: job.lastError,
          nextAction: 'wait_publish'
        })),
      published: [...publishedByJobs, ...publishedByManualArticles].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
      ),
      failed: jobs
        .filter((job) => FAILED_JOB_STATUSES.includes(job.status as (typeof FAILED_JOB_STATUSES)[number]))
        .map((job) => ({
          id: job.id,
          runId: job.generationId,
          status: job.status,
          xAccountHandle: job.xAccount?.handle ?? null,
          lastError: job.lastError,
          updatedAt: job.updatedAt.toISOString(),
          nextAction: 'retry_manually'
        }))
    };
  }

  getBillingPlans() {
    return this.billing.getPlans();
  }

  async createCheckout(userId: string, plan: V3BillingCheckoutDto['plan'], cycle: V3BillingCheckoutDto['cycle']) {
    return this.billing.createCheckoutSession(userId, plan, cycle);
  }
}
