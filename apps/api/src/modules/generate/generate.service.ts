import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DraftStatus,
  GenerationStatus,
  GenerationType,
  ProviderType,
  StepName,
  StepStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  UsageEventType
} from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import {
  OpenRouterService,
  type ChatMessage,
  type RoutedChatResult,
  type RouterTaskType
} from '../../common/openrouter.service';
import type { BriefInputDto, GenerateStartMode } from './start-generation.dto';

const STEP_ORDER: StepName[] = [
  StepName.HOTSPOT,
  StepName.OUTLINE,
  StepName.DRAFT,
  StepName.HUMANIZE,
  StepName.IMAGE,
  StepName.PACKAGE
];

const QUALITY_THRESHOLD = 72;

type PriceGuard = {
  prompt: number;
  completion: number;
  image: number;
  web_search: number;
};

const PLAN_COST_GUARDS: Record<SubscriptionPlan, PriceGuard> = {
  FREE: { prompt: 0.0001, completion: 0.0002, image: 0.002, web_search: 0.001 },
  STARTER: { prompt: 0.00015, completion: 0.00035, image: 0.003, web_search: 0.0015 },
  PRO: { prompt: 0.00025, completion: 0.00055, image: 0.006, web_search: 0.0025 },
  PREMIUM: { prompt: 0.00045, completion: 0.001, image: 0.01, web_search: 0.004 }
};

const TRIAL_HIGH_GUARD: PriceGuard = {
  prompt: 0.0008,
  completion: 0.0015,
  image: 0.012,
  web_search: 0.006
};

const CONSERVATIVE_GUARD: PriceGuard = {
  prompt: 0.00008,
  completion: 0.00018,
  image: 0.002,
  web_search: 0.0008
};

const MONTHLY_MODEL_BUDGET_USD: Record<SubscriptionPlan, number> = {
  FREE: 1.2,
  STARTER: 5.7,
  PRO: 14.7,
  PREMIUM: 29.7
};

export type ChainSseEvent = {
  step: StepName | 'error';
  status: 'running' | 'done' | 'failed';
  content?: string;
};

export type PackageResult = {
  tweet: string;
  charCount: number;
  imageKeywords: string[];
  variants: { tone: string; text: string }[];
  quality: {
    readability: number;
    density: number;
    platformFit: number;
    aiTrace: number;
    total: number;
  };
  routing: {
    trialMode: boolean;
    primaryModel: string;
    routingTier: string;
  };
  budget: {
    ratio: number;
    conservativeMode: boolean;
  };
};

type GenerationStartInput = {
  mode: GenerateStartMode;
  brief?: BriefInputDto;
  customPrompt?: string;
  legacyPrompt?: string;
  type?: GenerationType;
  language?: string;
  useStyle?: boolean;
};

type ResearchStepPayload = {
  researchPoints: string[];
  hookCandidates: string[];
  angleSummary: string;
};

type OutlineStepPayload = {
  title: string;
  hook: string;
  body: string[];
  cta: string;
};

type DraftStepPayload = {
  primaryTweet: string;
  thread?: string[];
};

type HumanizeStepPayload = {
  humanized: string;
  aiTraceRisk: number;
};

type MediaIdea = {
  title: string;
  composition: string;
  keywords: string[];
};

type MediaStepPayload = {
  ideas: MediaIdea[];
  searchKeywords: string[];
};

function toDecimalString(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(6);
}

function decimalToNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const parsed = Number(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function cleanJsonText(input: string): string {
  const trimmed = input.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) return fence[1].trim();

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

function normalizeStringList(value: unknown, max = 6): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, max);
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

@Injectable()
export class GenerateService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OpenRouterService) private readonly openRouter: OpenRouterService
  ) {}

  private buildPromptFromBrief(brief: BriefInputDto): string {
    return [
      `目标：${brief.objective}`,
      `受众：${brief.audience}`,
      `语气：${brief.tone}`,
      `帖子类型：${brief.postType}`,
      `CTA：${brief.cta}`,
      `主题模板：${brief.topicPreset}`
    ].join('；');
  }

  private resolveStartPrompt(input: GenerationStartInput): { mode: GenerateStartMode; prompt: string; brief?: BriefInputDto } {
    if (input.mode === 'brief') {
      if (!input.brief) {
        throw new BadRequestException('brief 模式必须提供 brief 参数');
      }
      return {
        mode: 'brief',
        prompt: this.buildPromptFromBrief(input.brief),
        brief: input.brief
      };
    }

    const advancedPrompt = input.customPrompt?.trim() || input.legacyPrompt?.trim();
    if (!advancedPrompt) {
      throw new BadRequestException('advanced 模式必须提供 customPrompt 或 prompt');
    }

    return {
      mode: 'advanced',
      prompt: advancedPrompt
    };
  }

  private resolveCostGuard(plan: SubscriptionPlan, trialMode: boolean): PriceGuard {
    if (trialMode) return TRIAL_HIGH_GUARD;
    return PLAN_COST_GUARDS[plan] ?? PLAN_COST_GUARDS.STARTER;
  }

  private async resolveDynamicCostGuard(params: {
    userId: string;
    plan: SubscriptionPlan;
    trialMode: boolean;
  }) {
    const baseGuard = this.resolveCostGuard(params.plan, params.trialMode);
    const budget = params.trialMode ? 1.2 : MONTHLY_MODEL_BUDGET_USD[params.plan] ?? MONTHLY_MODEL_BUDGET_USD.STARTER;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const aggregate = await this.prisma.db.usageLog.aggregate({
      where: {
        userId: params.userId,
        createdAt: { gte: monthStart }
      },
      _sum: {
        requestCostUsd: true
      }
    });

    const spent = decimalToNumber(aggregate._sum.requestCostUsd);
    const budgetRatio = budget > 0 ? spent / budget : 0;

    if (budgetRatio >= 1) {
      return {
        maxPrice: CONSERVATIVE_GUARD,
        budgetRatio,
        conservativeMode: true
      };
    }

    if (budgetRatio >= 0.85) {
      return {
        maxPrice: {
          prompt: Math.min(baseGuard.prompt, 0.00012),
          completion: Math.min(baseGuard.completion, 0.00028),
          image: Math.min(baseGuard.image, 0.0035),
          web_search: Math.min(baseGuard.web_search, 0.0012)
        },
        budgetRatio,
        conservativeMode: true
      };
    }

    return {
      maxPrice: baseGuard,
      budgetRatio,
      conservativeMode: false
    };
  }

  private isTrialMode(subscription: {
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
  } | null): boolean {
    if (!subscription) return false;
    if (subscription.status !== SubscriptionStatus.TRIALING) return false;
    if (!subscription.trialEndsAt) return true;
    return subscription.trialEndsAt.getTime() > Date.now();
  }

  private scoreTweetQuality(text: string): PackageResult['quality'] {
    const chars = [...text].length;
    const sentenceCount = Math.max(1, text.split(/[。！？!?\.]/).filter((line) => line.trim()).length);
    const avgSentence = chars / sentenceCount;

    const readabilityBase =
      chars < 70 ? 62 : chars > 300 ? 58 : 78 - Math.abs(150 - chars) * 0.08;
    const readability = clampPercent(readabilityBase - Math.max(0, avgSentence - 45) * 0.6);

    const signalTokens = ['数据', '增长', '案例', '步骤', '策略', '复盘', '结论', '建议', '行动'];
    const densityHits = signalTokens.reduce((sum, token) => (text.includes(token) ? sum + 1 : sum), 0);
    const density = clampPercent(45 + densityHits * 9);

    const hashtagCount = (text.match(/#[\p{L}0-9_]+/gu) ?? []).length;
    const mentionCount = (text.match(/@[\p{L}0-9_]+/gu) ?? []).length;
    const platformFitBase = chars <= 280 ? 88 : Math.max(35, 88 - (chars - 280) * 0.35);
    const platformFit = clampPercent(platformFitBase - Math.max(0, hashtagCount - 3) * 4 - Math.max(0, mentionCount - 2) * 5);

    const aiTracePatterns = [
      /总而言之/g,
      /综上所述/g,
      /作为.?AI/g,
      /首先[^。!?]{0,24}其次/g,
      /在这个时代/g,
      /我们可以看到/g
    ];
    const aiTraceHits = aiTracePatterns.reduce((sum, rule) => sum + (text.match(rule)?.length ?? 0), 0);
    const aiTrace = clampPercent(95 - aiTraceHits * 18);

    const total = clampPercent(readability * 0.3 + density * 0.25 + platformFit * 0.25 + aiTrace * 0.2);

    return {
      readability,
      density,
      platformFit,
      aiTrace,
      total
    };
  }

  private async recordUsage(params: {
    userId: string;
    workspaceId: string | null;
    generationId: string;
    eventType: UsageEventType;
    routed: RoutedChatResult;
    trialMode: boolean;
    qualityScore?: number;
  }) {
    const usage = await this.prisma.db.usageLog.create({
      data: {
        userId: params.userId,
        workspaceId: params.workspaceId,
        generationId: params.generationId,
        eventType: params.eventType,
        model: params.routed.modelUsed,
        modelUsed: params.routed.modelUsed,
        routingTier: params.routed.routingTier,
        fallbackDepth: params.routed.fallbackDepth,
        inputTokens: params.routed.inputTokens,
        outputTokens: params.routed.outputTokens,
        costUsd: toDecimalString(params.routed.costUsd),
        requestCostUsd: toDecimalString(params.routed.costUsd),
        qualityScore:
          typeof params.qualityScore === 'number' && Number.isFinite(params.qualityScore)
            ? Number(params.qualityScore.toFixed(2))
            : null,
        trialMode: params.trialMode
      }
    });

    if (params.workspaceId) {
      await this.prisma.db.tokenCostLog.create({
        data: {
          workspaceId: params.workspaceId,
          usageLogId: usage.id,
          providerType: ProviderType.OPENROUTER,
          model: params.routed.modelUsed,
          inputTokens: params.routed.inputTokens,
          outputTokens: params.routed.outputTokens,
          costUsd: toDecimalString(params.routed.costUsd)
        }
      });
    }
  }

  private async recordQualityGate(params: {
    userId: string;
    workspaceId: string | null;
    generationId: string;
    qualityScore: number;
    routed: RoutedChatResult;
    trialMode: boolean;
  }) {
    await this.prisma.db.usageLog.create({
      data: {
        userId: params.userId,
        workspaceId: params.workspaceId,
        generationId: params.generationId,
        eventType: UsageEventType.GENERATION,
        model: params.routed.modelUsed,
        modelUsed: params.routed.modelUsed,
        routingTier: params.routed.routingTier,
        fallbackDepth: params.routed.fallbackDepth,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: '0',
        requestCostUsd: '0',
        qualityScore: Number(params.qualityScore.toFixed(2)),
        trialMode: params.trialMode
      }
    });
  }

  private parseJson<T>(raw: string, validator: (value: unknown) => T | null): T | null {
    try {
      const parsed = JSON.parse(cleanJsonText(raw));
      return validator(parsed);
    } catch {
      return null;
    }
  }

  private async generateJsonStep<T>(params: {
    userId: string;
    workspaceId: string | null;
    generationId: string;
    trialMode: boolean;
    maxPrice: PriceGuard;
    eventType: UsageEventType;
    taskType: RouterTaskType;
    promptMessages: ChatMessage[];
    validator: (value: unknown) => T | null;
    schemaHint: string;
  }): Promise<{ data: T; routed: RoutedChatResult; raw: string }> {
    const first = await this.openRouter.chatWithRouting(params.promptMessages, {
      taskType: params.taskType,
      trialMode: params.trialMode,
      maxPrice: params.maxPrice,
      temperature: 0.65
    });

    await this.recordUsage({
      userId: params.userId,
      workspaceId: params.workspaceId,
      generationId: params.generationId,
      eventType: params.eventType,
      routed: first,
      trialMode: params.trialMode
    });

    const firstParsed = this.parseJson(first.content, params.validator);
    if (firstParsed) {
      return { data: firstParsed, routed: first, raw: first.content };
    }

    const retryMessages: ChatMessage[] = [
      ...params.promptMessages,
      {
        role: 'system',
        content: `上一轮输出未通过 schema 校验。请仅返回 JSON，严格匹配结构：${params.schemaHint}`
      }
    ];

    const retry = await this.openRouter.chatWithRouting(retryMessages, {
      taskType: params.taskType,
      trialMode: params.trialMode,
      forceHighTier: true,
      maxPrice: params.maxPrice,
      temperature: 0.5
    });

    await this.recordUsage({
      userId: params.userId,
      workspaceId: params.workspaceId,
      generationId: params.generationId,
      eventType: params.eventType,
      routed: retry,
      trialMode: params.trialMode
    });

    const parsedRetry = this.parseJson(retry.content, params.validator);
    if (!parsedRetry) {
      throw new Error('结构化输出校验失败（已自动重试一次）');
    }

    return { data: parsedRetry, routed: retry, raw: retry.content };
  }

  private validateResearchStep(value: unknown): ResearchStepPayload | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const researchPoints = normalizeStringList(data.researchPoints, 6);
    const hookCandidates = normalizeStringList(data.hookCandidates, 5);
    const angleSummary = String(data.angleSummary ?? '').trim();
    if (researchPoints.length < 2 || hookCandidates.length < 2 || !angleSummary) return null;
    return { researchPoints, hookCandidates, angleSummary };
  }

  private validateOutlineStep(value: unknown): OutlineStepPayload | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const title = String(data.title ?? '').trim();
    const hook = String(data.hook ?? '').trim();
    const body = normalizeStringList(data.body, 6);
    const cta = String(data.cta ?? '').trim();
    if (!title || !hook || body.length < 2 || !cta) return null;
    return { title, hook, body, cta };
  }

  private validateDraftStep(value: unknown): DraftStepPayload | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const primaryTweet = String(data.primaryTweet ?? '').trim();
    if (!primaryTweet) return null;
    const thread = normalizeStringList(data.thread, 10);
    return { primaryTweet, thread: thread.length > 0 ? thread : undefined };
  }

  private validateHumanizeStep(value: unknown): HumanizeStepPayload | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const humanized = String(data.humanized ?? '').trim();
    const aiTraceRiskRaw = Number(data.aiTraceRisk ?? 0.4);
    if (!humanized) return null;
    return {
      humanized,
      aiTraceRisk: Number.isFinite(aiTraceRiskRaw) ? Math.max(0, Math.min(1, aiTraceRiskRaw)) : 0.4
    };
  }

  private validateMediaStep(value: unknown): MediaStepPayload | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const ideasRaw = Array.isArray(data.ideas) ? data.ideas : [];
    const ideas = ideasRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as Record<string, unknown>;
        const title = String(row.title ?? '').trim();
        const composition = String(row.composition ?? '').trim();
        const keywords = normalizeStringList(row.keywords, 6);
        if (!title || !composition || keywords.length === 0) return null;
        return { title, composition, keywords } satisfies MediaIdea;
      })
      .filter((item): item is MediaIdea => Boolean(item))
      .slice(0, 3);

    if (ideas.length === 0) return null;

    const searchKeywords = normalizeStringList(data.searchKeywords, 12);
    return {
      ideas,
      searchKeywords: searchKeywords.length > 0 ? searchKeywords : ideas.flatMap((item) => item.keywords).slice(0, 12)
    };
  }

  async startGeneration(userId: string, input: GenerationStartInput): Promise<string> {
    const member = await this.prisma.db.workspaceMember.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });

    let style: string | null = null;
    if (input.useStyle) {
      const ts = await this.prisma.db.tweetStyle.findUnique({ where: { userId } });
      if (ts?.analysisResult !== undefined && ts.analysisResult !== null) {
        style = JSON.stringify(ts.analysisResult);
      }
    }

    const resolved = this.resolveStartPrompt(input);

    const gen = await this.prisma.db.generation.create({
      data: {
        userId,
        workspaceId: member?.workspaceId ?? null,
        prompt: resolved.prompt,
        type: input.type ?? GenerationType.TWEET,
        language: input.language ?? 'zh',
        style,
        status: GenerationStatus.RUNNING,
        steps: {
          create: STEP_ORDER.map((step) => ({
            step,
            status: StepStatus.PENDING
          }))
        }
      }
    });

    return gen.id;
  }

  async *runReasoningChain(
    generationId: string,
    userId: string
  ): AsyncGenerator<ChainSseEvent> {
    const gen = await this.prisma.db.generation.findFirst({
      where: { id: generationId, userId },
      include: {
        steps: true,
        user: {
          select: {
            subscription: {
              select: {
                plan: true,
                status: true,
                trialEndsAt: true
              }
            }
          }
        }
      }
    });

    if (!gen) throw new NotFoundException('Generation not found');

    if (gen.status === GenerationStatus.DONE) {
      for (const name of STEP_ORDER) {
        const s = gen.steps.find((t) => t.step === name);
        if (s?.content != null) {
          yield { step: s.step, status: 'done', content: s.content };
        }
      }
      return;
    }

    if (gen.status === GenerationStatus.FAILED) {
      yield { step: 'error', status: 'failed', content: 'Generation already failed' };
      return;
    }

    const trialMode = this.isTrialMode(gen.user.subscription ?? null);
    const plan = gen.user.subscription?.plan ?? SubscriptionPlan.STARTER;
    const { maxPrice, budgetRatio, conservativeMode } = await this.resolveDynamicCostGuard({
      userId,
      plan,
      trialMode
    });

    let researchPayload: ResearchStepPayload | null = null;
    let outlinePayload: OutlineStepPayload | null = null;
    let draftPayload: DraftStepPayload | null = null;
    let humanizedPayload: HumanizeStepPayload | null = null;
    let mediaPayload: MediaStepPayload | null = null;

    const hydrateFromDone = () => {
      for (const s of gen.steps) {
        if (s.status !== StepStatus.DONE || s.content == null) continue;
        switch (s.step) {
          case StepName.HOTSPOT:
            researchPayload = this.parseJson(s.content, (value) => this.validateResearchStep(value));
            break;
          case StepName.OUTLINE:
            outlinePayload = this.parseJson(s.content, (value) => this.validateOutlineStep(value));
            break;
          case StepName.DRAFT:
            draftPayload = this.parseJson(s.content, (value) => this.validateDraftStep(value));
            break;
          case StepName.HUMANIZE:
            humanizedPayload = this.parseJson(s.content, (value) => this.validateHumanizeStep(value));
            break;
          case StepName.IMAGE:
            mediaPayload = this.parseJson(s.content, (value) => this.validateMediaStep(value));
            break;
          default:
            break;
        }
      }
    };

    hydrateFromDone();

    const prompt = gen.prompt;
    const language = gen.language;
    const styleInjection = gen.style
      ? `Match this learned voice/style (JSON hints): ${gen.style}.`
      : '保持自然、有观点、适合 X 发布。';

    for (const stepName of STEP_ORDER) {
      const row = await this.prisma.db.generationStep.findUnique({
        where: { generationId_step: { generationId, step: stepName } }
      });
      if (!row) throw new Error(`Missing step ${stepName}`);

      if (row.status === StepStatus.DONE && row.content != null) {
        yield { step: stepName, status: 'done', content: row.content };
        continue;
      }

      yield { step: stepName, status: 'running' };

      await this.prisma.db.generationStep.update({
        where: { id: row.id },
        data: { status: StepStatus.RUNNING, startedAt: new Date() }
      });

      try {
        let content = '';

        if (stepName === StepName.HOTSPOT) {
          const result = await this.generateJsonStep<ResearchStepPayload>({
            userId,
            workspaceId: gen.workspaceId,
            generationId,
            trialMode,
            maxPrice,
            eventType: UsageEventType.GENERATION,
            taskType: 'research',
            schemaHint:
              '{"researchPoints":["..."],"hookCandidates":["..."],"angleSummary":"..."}',
            validator: (value) => this.validateResearchStep(value),
            promptMessages: [
              {
                role: 'system',
                content:
                  '你是 X 内容策略编辑。请输出严格 JSON，不要 markdown，不要额外解释。'
              },
              {
                role: 'user',
                content: [
                  `主题：${prompt}`,
                  `语言：${language}`,
                  '请产出：2-5 个研究角度 researchPoints、2-5 个开头钩子 hookCandidates、一个 angleSummary。'
                ].join('\n')
              }
            ]
          });
          researchPayload = result.data;
          content = JSON.stringify(result.data);
        } else if (stepName === StepName.OUTLINE) {
          if (!researchPayload) {
            throw new Error('缺少 research 数据，无法继续生成 outline');
          }

          const result = await this.generateJsonStep<OutlineStepPayload>({
            userId,
            workspaceId: gen.workspaceId,
            generationId,
            trialMode,
            maxPrice,
            eventType: UsageEventType.GENERATION,
            taskType: 'outline',
            schemaHint: '{"title":"...","hook":"...","body":["..."],"cta":"..."}',
            validator: (value) => this.validateOutlineStep(value),
            promptMessages: [
              {
                role: 'system',
                content: '输出严格 JSON，字段固定为 title/hook/body/cta。'
              },
              {
                role: 'user',
                content: [
                  `主题：${prompt}`,
                  `研究角度：${researchPayload.researchPoints.join(' | ')}`,
                  `候选钩子：${researchPayload.hookCandidates.join(' | ')}`,
                  '请生成可直接用于 X 的结构化大纲。'
                ].join('\n')
              }
            ]
          });

          outlinePayload = result.data;
          content = JSON.stringify(result.data);
        } else if (stepName === StepName.DRAFT) {
          if (!outlinePayload) {
            throw new Error('缺少 outline 数据，无法继续生成 draft');
          }

          const result = await this.generateJsonStep<DraftStepPayload>({
            userId,
            workspaceId: gen.workspaceId,
            generationId,
            trialMode,
            maxPrice,
            eventType: UsageEventType.GENERATION,
            taskType: 'draft',
            schemaHint: '{"primaryTweet":"...","thread":["..."]}',
            validator: (value) => this.validateDraftStep(value),
            promptMessages: [
              {
                role: 'system',
                content: `你是 X 平台写作专家。${styleInjection} 输出 JSON。`
              },
              {
                role: 'user',
                content: [
                  `语言：${language}`,
                  `标题：${outlinePayload.title}`,
                  `Hook：${outlinePayload.hook}`,
                  `Body：${outlinePayload.body.join(' / ')}`,
                  `CTA：${outlinePayload.cta}`,
                  `类型：${gen.type}`,
                  '要求：primaryTweet 必须可发布；thread 可选。'
                ].join('\n')
              }
            ]
          });

          draftPayload = result.data;
          content = JSON.stringify(result.data);
        } else if (stepName === StepName.HUMANIZE) {
          if (!draftPayload) throw new Error('缺少 draft 数据，无法继续 humanize');

          const result = await this.generateJsonStep<HumanizeStepPayload>({
            userId,
            workspaceId: gen.workspaceId,
            generationId,
            trialMode,
            maxPrice,
            eventType: UsageEventType.NATURALIZATION,
            taskType: 'humanize',
            schemaHint: '{"humanized":"...","aiTraceRisk":0.12}',
            validator: (value) => this.validateHumanizeStep(value),
            promptMessages: [
              {
                role: 'system',
                content: '你是中文母语编辑。去 AI 味但不改变观点，返回 JSON。'
              },
              {
                role: 'user',
                content: [
                  `原稿：${draftPayload.primaryTweet}`,
                  '请输出 humanized 文案与 aiTraceRisk(0~1)。'
                ].join('\n')
              }
            ]
          });

          humanizedPayload = result.data;
          content = JSON.stringify(result.data);
        } else if (stepName === StepName.IMAGE) {
          if (!humanizedPayload) throw new Error('缺少 humanized 数据，无法继续 media');

          const result = await this.generateJsonStep<MediaStepPayload>({
            userId,
            workspaceId: gen.workspaceId,
            generationId,
            trialMode,
            maxPrice,
            eventType: UsageEventType.IMAGE,
            taskType: 'media',
            schemaHint:
              '{"ideas":[{"title":"...","composition":"...","keywords":["..."]}],"searchKeywords":["..."]}',
            validator: (value) => this.validateMediaStep(value),
            promptMessages: [
              {
                role: 'system',
                content: '你是内容配图策划。输出严格 JSON。'
              },
              {
                role: 'user',
                content: [
                  `文案：${humanizedPayload.humanized}`,
                  '请给出 2-3 个配图创意，每个包含 title/composition/keywords。'
                ].join('\n')
              }
            ]
          });

          mediaPayload = result.data;
          content = JSON.stringify(result.data);
        } else if (stepName === StepName.PACKAGE) {
          if (!humanizedPayload || !mediaPayload) {
            throw new Error('缺少 humanized/media 数据，无法打包发布');
          }

          const packageResponse = await this.generateJsonStep<{
            tweet: string;
            variants: Array<{ tone: string; text: string }>;
          }>({
            userId,
            workspaceId: gen.workspaceId,
            generationId,
            trialMode,
            maxPrice,
            eventType: UsageEventType.GENERATION,
            taskType: 'package',
            schemaHint: '{"tweet":"...","variants":[{"tone":"formal","text":"..."}]}',
            validator: (value) => {
              if (!value || typeof value !== 'object') return null;
              const data = value as Record<string, unknown>;
              const tweet = String(data.tweet ?? '').trim();
              if (!tweet) return null;
              const variantsRaw = Array.isArray(data.variants) ? data.variants : [];
              const variants = variantsRaw
                .map((item) => {
                  if (!item || typeof item !== 'object') return null;
                  const row = item as Record<string, unknown>;
                  const tone = String(row.tone ?? '').trim();
                  const text = String(row.text ?? '').trim();
                  if (!tone || !text) return null;
                  return { tone, text };
                })
                .filter((item): item is { tone: string; text: string } => Boolean(item))
                .slice(0, 4);
              return {
                tweet,
                variants
              };
            },
            promptMessages: [
              {
                role: 'system',
                content: '你是发布编辑。输出严格 JSON。'
              },
              {
                role: 'user',
                content: [
                  `主文案：${humanizedPayload.humanized}`,
                  `配图关键词：${mediaPayload.searchKeywords.join(' | ')}`,
                  '输出最终 tweet 和不少于2条 variants（不同语气）。'
                ].join('\n')
              }
            ]
          });

          let finalTweet = packageResponse.data.tweet.trim();
          let quality = this.scoreTweetQuality(finalTweet);

          if (quality.total < QUALITY_THRESHOLD) {
            const rewrite = await this.openRouter.chatWithRouting(
              [
                {
                  role: 'system',
                  content: '你是 X 平台写作润色专家，输出纯文本。'
                },
                {
                  role: 'user',
                  content: [
                    `请在不改变观点的前提下重写以下文案，目标质量分 >= ${QUALITY_THRESHOLD}。`,
                    `文案：${finalTweet}`
                  ].join('\n')
                }
              ],
              {
                taskType: 'package',
                trialMode,
                forceHighTier: true,
                maxPrice,
                temperature: 0.55
              }
            );

            const rewritten = rewrite.content.trim();
            await this.recordUsage({
              userId,
              workspaceId: gen.workspaceId,
              generationId,
              eventType: UsageEventType.GENERATION,
              routed: rewrite,
              trialMode
            });

            if (rewritten) {
              const rewriteQuality = this.scoreTweetQuality(rewritten);
              if (rewriteQuality.total >= quality.total) {
                finalTweet = rewritten;
                quality = rewriteQuality;
              }
            }
          }

          const pkg: PackageResult = {
            tweet: finalTweet,
            charCount: [...finalTweet].length,
            imageKeywords: mediaPayload.searchKeywords,
            variants: packageResponse.data.variants,
            quality,
            routing: {
              trialMode,
              primaryModel: packageResponse.routed.modelUsed,
              routingTier: packageResponse.routed.routingTier
            },
            budget: {
              ratio: Number(budgetRatio.toFixed(4)),
              conservativeMode
            }
          };

          content = JSON.stringify(pkg);

          await this.recordQualityGate({
            userId,
            workspaceId: gen.workspaceId,
            generationId,
            qualityScore: quality.total,
            routed: packageResponse.routed,
            trialMode
          });

          await this.prisma.db.generationStep.update({
            where: { id: row.id },
            data: {
              status: StepStatus.DONE,
              content,
              completedAt: new Date()
            }
          });

          await this.prisma.db.generation.update({
            where: { id: generationId },
            data: { status: GenerationStatus.DONE, result: pkg as object }
          });

          if (gen.workspaceId) {
            const draft = await this.prisma.db.draft.create({
              data: {
                workspaceId: gen.workspaceId,
                userId,
                language,
                status: DraftStatus.DRAFT,
                title: prompt.slice(0, 64),
                latestContent: pkg.tweet,
                currentVersion: 1,
                metadata: {
                  generationMode: gen.prompt.includes('目标：') ? 'brief' : 'advanced',
                  quality
                }
              }
            });

            await this.prisma.db.draftVersion.create({
              data: {
                draftId: draft.id,
                versionNo: 1,
                content: pkg.tweet,
                tone: 'main',
                createdById: userId
              }
            });
          }

          yield { step: StepName.PACKAGE, status: 'done', content };
          return;
        }

        await this.prisma.db.generationStep.update({
          where: { id: row.id },
          data: {
            status: StepStatus.DONE,
            content,
            completedAt: new Date()
          }
        });
        yield { step: stepName, status: 'done', content };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.db.generationStep.update({
          where: { id: row.id },
          data: { status: StepStatus.FAILED, completedAt: new Date() }
        });
        await this.prisma.db.generation.update({
          where: { id: generationId },
          data: { status: GenerationStatus.FAILED }
        });
        yield { step: 'error', status: 'failed', content: message };
        return;
      }
    }
  }

  async getGeneration(id: string, userId: string) {
    const gen = await this.prisma.db.generation.findFirst({
      where: { id, userId },
      include: { steps: { orderBy: { step: 'asc' } } }
    });
    if (!gen) throw new NotFoundException('Generation not found');
    return gen;
  }

  async listGenerations(userId: string, limit = 20) {
    return this.prisma.db.generation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { steps: { orderBy: { step: 'asc' } } }
    });
  }
}
