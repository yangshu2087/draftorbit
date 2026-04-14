import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  GenerationStatus,
  GenerationType,
  LearningSourceType,
  PublishJobStatus,
  StepName,
  SubscriptionPlan
} from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';
import { BillingService } from '../billing/billing.service';
import { BaoyuRuntimeService } from '../generate/baoyu-runtime.service';
import { buildContentQualityGate } from '../generate/content-quality-gate';
import type { ContentFormat } from '../generate/content-strategy';
import { GenerateService, type PackageResult } from '../generate/generate.service';
import { HistoryService } from '../history/history.service';
import { LearningSourcesService } from '../learning-sources/learning-sources.service';
import { PublishService } from '../publish/publish.service';
import { XAccountsService } from '../x-accounts/x-accounts.service';
import { buildV3SuggestedAction, normalizeXArticleUrl, resolveXArticlePublishCapability } from './v3.helpers';
import type {
  V3BillingCheckoutDto,
  V3ConnectLocalFilesDto,
  V3ConnectObsidianDto,
  V3ConnectTargetDto,
  V3ConnectUrlsDto,
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
  return {
    blockingReason: 'ARTICLE_PUBLISH_NOT_SUPPORTED',
    nextAction: 'export_article',
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

function formatFromGenerationType(type: GenerationType): ContentFormat {
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
  if (typeof record.voice_summary === 'string' && record.voice_summary.trim()) {
    return record.voice_summary.trim();
  }
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

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildStoredZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/^\/+/u, ''), 'utf8');
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function isInsideBaoyuArtifactRoot(candidatePath: string): boolean {
  const artifactRoot = path.resolve(process.cwd(), 'artifacts', 'baoyu-runtime');
  const normalized = path.resolve(candidatePath);
  return normalized === artifactRoot || normalized.startsWith(`${artifactRoot}${path.sep}`);
}

function buildRiskFlags(pkg: PackageResult | null, format: 'tweet' | 'thread' | 'article'): string[] {
  if (!pkg) return ['结果包缺失，请重新生成'];
  const flags: string[] = [];
  if (pkg.qualityGate?.status === 'failed') {
    flags.push('质量门未通过，坏稿已被拦截，请再来一版或调整输入。');
  }
  if (format === 'article') {
    const sectionCount = (pkg.tweet.match(/(?:^|\n)[一二三四五六七八九十]、/gu) ?? []).length;
    if (pkg.charCount < 400) flags.push('长文偏短，建议补充 3-5 个小节');
    if (sectionCount < 3) flags.push('长文结构偏弱，建议至少保留 3 个小节');
    if (/#[\p{L}0-9_]+/u.test(pkg.tweet)) flags.push('X 长文正文不建议带 hashtag');
  } else if (format === 'thread') {
    const posts = pkg.thread?.length ? pkg.thread : pkg.tweet.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    if (posts.length < 3) flags.push('串推展开偏弱，建议至少拆成 3 条');
    if (posts.some((post) => [...post].length > 280)) flags.push('至少有一条串推超出 280 字限制');
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
      return `开头切入点：${parsed.hook}`;
    }
    if ((step === 'DRAFT' || step === StepName.DRAFT) && typeof parsed.primaryTweet === 'string') {
      return String(parsed.primaryTweet).slice(0, 100);
    }
    if ((step === 'HUMANIZE' || step === StepName.HUMANIZE) && typeof parsed.humanized === 'string') {
      return String(parsed.humanized).slice(0, 100);
    }
    if ((step === 'IMAGE' || step === StepName.IMAGE) && Array.isArray(parsed.searchKeywords)) {
      return `配图方向：${parsed.searchKeywords.slice(0, 3).join(' / ')}`;
    }
    if ((step === 'PACKAGE' || step === StepName.PACKAGE) && typeof parsed.tweet === 'string') {
      const quality = parsed.quality && typeof parsed.quality === 'object' ? parsed.quality as Record<string, unknown> : null;
      const total = quality && typeof quality.total === 'number' ? ` · 质量 ${quality.total}` : '';
      return `结果已准备好${total}`;
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
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(BaoyuRuntimeService) private readonly baoyuRuntime: BaoyuRuntimeService
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
      suggestedAction: buildV3SuggestedAction({
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
        steps: true,
        usageLogs: {
          select: {
            model: true,
            modelUsed: true,
            routingTier: true,
            costUsd: true,
            inputTokens: true,
            outputTokens: true
          },
          orderBy: { createdAt: 'asc' }
        },
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

    const format =
      generation.type === GenerationType.THREAD
        ? 'thread'
        : generation.type === GenerationType.LONG
          ? 'article'
          : 'tweet';

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
            routing: pkg.routing ?? null,
            qualitySignals: pkg.qualitySignals
              ? {
                  hookStrength: pkg.qualitySignals.hookStrength,
                  specificity: pkg.qualitySignals.specificity,
                  evidenceDensity: pkg.qualitySignals.evidence,
                  humanLikeness: pkg.qualitySignals.humanLikeness,
                  conversationalFlow: pkg.qualitySignals.conversationality,
                  visualizability: pkg.qualitySignals.visualizability,
                  ctaNaturalness: pkg.qualitySignals.ctaNaturalness
                }
              : null,
            visualPlan: pkg.visualPlan ?? null,
            visualAssets: pkg.visualAssets ?? [],
            sourceArtifacts: pkg.sourceArtifacts ?? [],
            runtime: pkg.runtime ?? null,
            derivativeReadiness: pkg.derivativeReadiness ?? null,
            qualityGate: pkg.qualityGate ?? null,
            usage: generation.usageLogs.map((log) => ({
              model: log.model,
              modelUsed: log.modelUsed ?? log.model,
              routingTier: log.routingTier ?? null,
              costUsd: Number(log.costUsd ?? 0),
              inputTokens: log.inputTokens,
              outputTokens: log.outputTokens
            })),
            riskFlags: buildRiskFlags(pkg, format),
            requestCostUsd: null,
            whySummary,
            evidenceSummary: [
              ...buildV3SourceEvidence(state.sources),
              ...(pkg.sourceArtifacts ?? [])
                .filter((artifact) => artifact.status === 'ready')
                .map((artifact) => artifact.title || artifact.url || artifact.kind)
                .filter(Boolean)
            ],
            stepLatencyMs: pkg.stepLatencyMs ?? null
          }
        : null,
      publish: generation.publishJobs.map((job) => ({
        id: job.id,
        status: job.status,
        xAccountId: job.xAccountId,
        xAccountHandle: job.xAccount?.handle ?? null,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        externalPostId: job.externalPostId,
        lastError: job.lastError
      })),
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

  async getRunAsset(userId: string, id: string, assetId: string) {
    const generation = await this.prisma.db.generation.findFirst({ where: { id, userId } });
    if (!generation) throw new NotFoundException('生成任务不存在');
    return this.readRunAssetFromGeneration(generation.result, assetId);
  }

  async retryRunVisualAssets(userId: string, id: string) {
    const generation = await this.prisma.db.generation.findFirst({ where: { id, userId } });
    if (!generation) throw new NotFoundException('生成任务不存在');
    const pkg = parsePackageResult(generation.result);
    if (!pkg?.visualPlan) throw new BadRequestException('当前结果没有可重试的图文规划');
    if (!pkg.tweet?.trim()) throw new BadRequestException('当前结果没有可用于重试图片的正文');

    const format = formatFromGenerationType(generation.type);
    const focus =
      pkg.imageKeywords.find((item) => item.trim()) ??
      pkg.visualPlan.visualizablePoints.find((item) => item.trim()) ??
      pkg.tweet.slice(0, 80);
    const visualArtifacts = await this.baoyuRuntime.generateVisualArtifacts({
      runId: generation.id,
      format,
      focus,
      text: pkg.tweet,
      visualPlan: pkg.visualPlan,
      withImage: true
    });
    const refreshedGate = buildContentQualityGate({
      format,
      focus,
      text: pkg.tweet,
      visualPlan: pkg.visualPlan,
      visualAssets: visualArtifacts.assets,
      requireVisualAssets: true
    });
    const mergedStatus: 'failed' | 'passed' =
      pkg.qualityGate?.status === 'failed' || refreshedGate.status === 'failed' ? 'failed' : 'passed';
    const mergedQualityGate = {
      status: mergedStatus,
      safeToDisplay: pkg.qualityGate?.safeToDisplay !== false && refreshedGate.safeToDisplay !== false,
      hardFails: Array.from(new Set([...(pkg.qualityGate?.hardFails ?? []), ...refreshedGate.hardFails])),
      visualHardFails: refreshedGate.visualHardFails ?? [],
      userMessage: refreshedGate.userMessage ?? pkg.qualityGate?.userMessage,
      recoveryAction: refreshedGate.recoveryAction ?? pkg.qualityGate?.recoveryAction,
      judgeNotes: Array.from(new Set([...(pkg.qualityGate?.judgeNotes ?? []), ...refreshedGate.judgeNotes]))
    };
    const nextPkg: PackageResult = {
      ...pkg,
      visualAssets: visualArtifacts.assets,
      runtime: this.baoyuRuntime.runtimeMeta([
        ...new Set([...(pkg.runtime?.skills ?? []), ...visualArtifacts.runtime.skills])
      ]),
      qualityGate: mergedQualityGate
    };

    await this.prisma.db.generation.update({
      where: { id: generation.id },
      data: { result: nextPkg as unknown as object }
    });

    return this.getRun(userId, id);
  }

  async getRunAssetPublic(id: string, assetId: string) {
    const generation = await this.prisma.db.generation.findFirst({ where: { id } });
    if (!generation) throw new NotFoundException('生成任务不存在');
    return this.readRunAssetFromGeneration(generation.result, assetId);
  }

  async getRunAssetsZipPublic(id: string) {
    const generation = await this.prisma.db.generation.findFirst({ where: { id } });
    if (!generation) throw new NotFoundException('生成任务不存在');
    const pkg = parsePackageResult(generation.result);
    const readyAssets = (pkg?.visualAssets ?? []).filter((asset) => asset.status === 'ready' && asset.assetPath);
    const entries: Array<{ name: string; data: Buffer }> = [];

    for (const asset of readyAssets) {
      const normalized = path.resolve(asset.assetPath!);
      if (!isInsideBaoyuArtifactRoot(normalized)) continue;
      const data = await fs.readFile(normalized);
      const ext = path.extname(normalized) || '.svg';
      entries.push({ name: `${asset.id || path.basename(normalized, ext)}${ext}`, data });
      if (asset.promptPath) {
        const promptPath = path.resolve(asset.promptPath);
        if (isInsideBaoyuArtifactRoot(promptPath)) {
          entries.push({ name: `prompts/${asset.id || path.basename(promptPath, path.extname(promptPath))}.md`, data: await fs.readFile(promptPath) });
        }
      }
    }

    for (const sourceArtifact of pkg?.sourceArtifacts ?? []) {
      if (sourceArtifact.status !== 'ready' || !sourceArtifact.markdownPath) continue;
      const markdownPath = path.resolve(sourceArtifact.markdownPath);
      if (!isInsideBaoyuArtifactRoot(markdownPath)) continue;
      const slug = `${sourceArtifact.kind}-${path.basename(markdownPath, path.extname(markdownPath)) || 'source'}.md`;
      entries.push({ name: `sources/${slug}`, data: await fs.readFile(markdownPath) });
    }

    if (entries.length === 0) throw new NotFoundException('没有可下载的视觉资产');
    return { data: buildStoredZip(entries), contentType: 'application/zip', filename: `${id}-visual-assets.zip` };
  }

  private async readRunAssetFromGeneration(result: unknown, assetId: string) {
    const pkg = parsePackageResult(result);
    const asset = pkg?.visualAssets?.find((item) => item.id === assetId && item.status === 'ready');
    if (!asset?.assetPath) throw new NotFoundException('视觉资产不存在或尚未生成');

    const normalized = path.resolve(asset.assetPath);
    if (!normalized.includes(`${path.sep}artifacts${path.sep}baoyu-runtime${path.sep}`)) {
      throw new NotFoundException('视觉资产路径无效');
    }

    const data = await fs.readFile(normalized);
    const ext = path.extname(normalized).toLowerCase();
    const contentType =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.svg'
            ? 'image/svg+xml'
            : 'image/png';
    return { data, contentType };
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
    const format =
      generation.type === GenerationType.THREAD
        ? 'thread'
        : generation.type === GenerationType.LONG
          ? 'article'
          : 'tweet';
    const publishGuard = resolveV3PublishGuard(format);
    const selected = input.xAccountId
      ? state.xAccounts.find((row) => row.id === input.xAccountId) ?? null
      : state.defaultXAccount;

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

    const format =
      generation.type === GenerationType.THREAD
        ? 'thread'
        : generation.type === GenerationType.LONG
          ? 'article'
          : 'tweet';
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

  async completeArticlePublish(userId: string, input: { runId: string; url: string; xAccountId?: string }) {
    const generation = await this.prisma.db.generation.findFirst({
      where: { id: input.runId, userId }
    });
    if (!generation) {
      throw new NotFoundException('生成任务不存在');
    }
    if (generation.type !== GenerationType.LONG) {
      throw new BadRequestException('只有长文支持记录文章链接');
    }

    const normalizedUrl = normalizeXArticleUrl(input.url);
    if (!normalizedUrl) {
      throw new BadRequestException('请输入有效的 X 文章链接');
    }

    const state = await this.getWorkspaceScopedState(userId);
    const capability = resolveXArticlePublishCapability();
    const publishedAt = new Date();

    const record = await this.prisma.db.publishRecord.upsert({
      where: { generationId: input.runId },
      create: {
        userId,
        workspaceId: state.workspaceId,
        generationId: input.runId,
        externalTweetId: normalizedUrl,
        publishedAt
      },
      update: {
        workspaceId: state.workspaceId,
        externalTweetId: normalizedUrl,
        publishedAt
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId: state.workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'publish_record',
        resourceId: record.id,
        payload: {
          generationId: input.runId,
          publishMode: capability.mode,
          externalUrl: normalizedUrl,
          xAccountId: input.xAccountId ?? null
        }
      }
    });

    return {
      ok: true,
      runId: input.runId,
      publishMode: capability.mode,
      externalUrl: normalizedUrl,
      nextAction: capability.nextAction
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
        const format =
          run.type === GenerationType.THREAD ? 'thread' : run.type === GenerationType.LONG ? 'article' : 'tweet';
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
      published: jobs
        .filter((job) => job.status === PublishJobStatus.SUCCEEDED)
        .map((job) => ({
          id: job.id,
          runId: job.generationId,
          status: job.status,
          xAccountHandle: job.xAccount?.handle ?? null,
          externalPostId: job.externalPostId,
          updatedAt: job.updatedAt.toISOString()
        }))
        .concat(
          runs
            .filter((run) => run.type === GenerationType.LONG && run.publishRecord)
            .map((run) => ({
              id: run.publishRecord!.id,
              runId: run.id,
              status: 'SUCCEEDED',
              xAccountHandle: null,
              externalPostId: run.publishRecord!.externalTweetId,
              updatedAt: run.publishRecord!.publishedAt.toISOString()
            }))
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
