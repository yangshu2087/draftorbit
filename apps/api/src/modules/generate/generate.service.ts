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
import { buildPackageStepMetadata } from './package-step-metadata';

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
  stepLatencyMs: Record<'research' | 'outline' | 'draft' | 'humanize' | 'media' | 'package', number | null>;
  stepExplain: Record<'research' | 'outline' | 'draft' | 'humanize' | 'media' | 'package', string>;
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

type PackageStepPayload = {
  tweet: string;
  variants: Array<{ tone: string; text: string }>;
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

const META_STOP_WORDS = new Set([
  '用户意图',
  '输出形式',
  '需要配图',
  '自动完成',
  '用户风格摘要',
  '已连接证据',
  'draftorbit',
  'operator',
  'hook',
  'thread',
  'cta',
  'title',
  'body',
  'article',
  'tweet',
  'yes',
  'no',
  '目标',
  '受众'
]);

function stripFormatSuffix(text: string): string {
  return text
    .replace(/适合\s*X\s*的发布文案/giu, '')
    .replace(/的?(观点)?(短推|串推|长文|文章|发布文案)$/u, '')
    .replace(/的?\s*(tweet|thread|article)$/iu, '')
    .trim();
}

export function extractIntentFromPrompt(prompt: string): string {
  const matched = prompt.match(/^用户意图：(.*)$/m)?.[1]?.trim();
  return matched && matched.length > 0 ? matched : prompt.trim();
}

export function extractIntentFocus(prompt: string): string {
  const intent = extractIntentFromPrompt(prompt).replace(/\s+/g, ' ').trim();

  const about = intent.match(/关于\s*([^，。！？；\n]+)/u)?.[1];
  if (about) {
    return stripFormatSuffix(about) || intent;
  }

  const transform = intent.match(/把(.+?)整理成/u)?.[1];
  if (transform) {
    return stripFormatSuffix(transform) || intent;
  }

  const normalized = stripFormatSuffix(
    intent
      .replace(/^(帮我|请|给我|麻烦)\s*/u, '')
      .replace(/^参考我最近的风格[，,]?\s*/u, '')
      .replace(/^(写一条|发一条|写一篇|写个|整理成一条|整理成|输出一条|做一条)\s*/u, '')
  );

  return normalized || intent;
}

function extractTopKeywords(input: string, max = 8): string[] {
  const tokens = (input.match(/[\p{L}\p{N}_-]{2,}/gu) ?? [])
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const stopWords = new Set([
    '这个',
    '那个',
    '我们',
    '你们',
    '他们',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'the'
  ]);

  const counter = new Map<string, number>();
  for (const token of tokens) {
    if (stopWords.has(token) || META_STOP_WORDS.has(token)) continue;
    counter.set(token, (counter.get(token) ?? 0) + 1);
  }

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([token]) => token);
}

function ensureSentenceEnding(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[。！？!?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])\s*/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeSectionTitle(value: string): string {
  return value
    .replace(/^\d+[.、]\s*/u, '')
    .replace(/^[一二三四五六七八九十]+[、.．]\s*/u, '')
    .replace(/[。！？；：]+$/u, '')
    .trim();
}

export function formatXArticleText(input: {
  title?: string | null;
  hook?: string | null;
  body?: string[];
  cta?: string | null;
  humanized: string;
}): string {
  const sentences = splitSentences(input.humanized);
  const title = input.title?.trim() || 'X 长文草稿';
  const lead = ensureSentenceEnding(input.hook?.trim() || sentences[0] || input.humanized.trim());
  const remaining = sentences.filter((sentence) => sentence !== lead);
  const sectionTitles = (input.body ?? [])
    .map(normalizeSectionTitle)
    .filter(Boolean)
    .slice(0, 5);
  const fallbackSections = ['先把目标收紧到一个动作', '把内容生产做成固定流程', '用复盘把下一轮迭代接上'];
  const finalSectionTitles = sectionTitles.length > 0 ? sectionTitles : fallbackSections;
  const numerals = ['一', '二', '三', '四', '五'];
  const ending = ensureSentenceEnding(input.cta?.trim() || '如果你愿意，我也可以继续把它拆成 thread 版本。');

  const blocks: string[] = [title.trim(), '', '导语', lead];
  finalSectionTitles.forEach((section, index) => {
    const paragraph = ensureSentenceEnding(
      remaining[index] || `这一节重点是“${section}”。请把它落实成清晰动作，再进入下一步。`
    );
    blocks.push('', `${numerals[index] ?? `${index + 1}`}、${section}`, paragraph);
  });
  blocks.push('', '结尾', ending);

  return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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

  private get fastPathEnabled(): boolean {
    return process.env.GENERATE_FAST_PATH_ENABLED !== '0';
  }

  private enforceTweetLength(text: string, maxChars = 280): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    const chars = [...trimmed];
    if (chars.length <= maxChars) return trimmed;
    return `${chars.slice(0, Math.max(0, maxChars - 1)).join('')}…`;
  }

  private buildHeuristicRoutedResult(sourceModel = 'draftorbit/heuristic'): RoutedChatResult {
    return {
      content: '',
      modelUsed: sourceModel,
      routingTier: 'free_first',
      fallbackDepth: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0
    };
  }

  private buildFastResearchPayload(prompt: string): ResearchStepPayload {
    const focus = extractIntentFocus(prompt);
    const keywords = extractTopKeywords(focus, 4);
    const anchor = focus || keywords[0] || '内容运营';
    const supportingKeywords = keywords.filter(
      (item) => item !== anchor.toLowerCase() && item !== 'ai' && item !== 'x'
    );
    const secondary = supportingKeywords[0] ?? '执行效率';
    const tertiary = supportingKeywords[1] ?? '互动反馈';

    return {
      researchPoints: [
        `核心痛点：围绕“${anchor}”的执行链路不稳定，导致内容产出波动。`,
        `增长杠杆：用“${secondary}”拆解动作，把选题到发布做成固定节奏。`,
        `复盘重点：关注“${tertiary}”与发布反馈，形成下一轮优化闭环。`
      ],
      hookCandidates: [
        `别再靠灵感写 ${anchor}，把流程跑顺才是增长关键。`,
        `多数账号做不出结果，不是不会写，而是“${secondary}”没有标准化。`,
        `把 ${anchor} 做成可复用流程，互动与稳定性会同时提升。`
      ],
      angleSummary: `以“${anchor}”为主线，强调流程化执行与可复盘增长。`
    };
  }

  private buildFastOutlinePayload(prompt: string, research: ResearchStepPayload): OutlineStepPayload {
    const focus = extractIntentFocus(prompt);
    const titleSeed = focus || extractTopKeywords(prompt, 2).join(' · ') || 'X 运营提效';
    const body = research.researchPoints
      .slice(0, 3)
      .map((row, index) => `${index + 1}. ${row.replace(/^.+：/, '')}`)
      .filter(Boolean);

    return {
      title: `${titleSeed}：把内容链路跑成稳定系统`,
      hook: research.hookCandidates[0] ?? '稳定流程比偶然爆款更可复制。',
      body: body.length >= 2 ? body : ['先对齐目标与受众。', '再固化选题到发布节奏。', '最后用复盘驱动下一轮优化。'],
      cta: '你最想先优化哪一步？欢迎留言，我给你具体建议。'
    };
  }

  private buildFastMediaPayload(text: string): MediaStepPayload {
    const keywords = extractTopKeywords(text, 8);
    const searchKeywords =
      keywords.length > 0 ? keywords : ['x content workflow', 'social media operations', 'engagement analytics'];

    return {
      ideas: [
        {
          title: '流程可视化主图',
          composition: '中轴流程箭头 + 左右关键动作卡片，突出“选题-草稿-审批-发布-复盘”',
          keywords: searchKeywords.slice(0, 4)
        },
        {
          title: '运营数据对比图',
          composition: '左右对比版式，展示流程化前后互动数据变化',
          keywords: searchKeywords.slice(2, 6).length > 0 ? searchKeywords.slice(2, 6) : searchKeywords.slice(0, 4)
        }
      ],
      searchKeywords
    };
  }

  private buildFastPackagePayload(params: {
    humanized: string;
    outline: OutlineStepPayload | null;
    media: MediaStepPayload;
    type: GenerationType;
  }): PackageStepPayload {
    if (params.type === GenerationType.LONG) {
      return {
        tweet: formatXArticleText({
          title: params.outline?.title,
          hook: params.outline?.hook,
          body: params.outline?.body,
          cta: params.outline?.cta,
          humanized: params.humanized
        }),
        variants: []
      };
    }

    const outlineHook = params.outline?.hook?.trim();
    const base = this.enforceTweetLength(params.humanized);
    const hookPrefix = outlineHook ? `${outlineHook.replace(/[。！!？?]+$/, '')} ` : '';
    const keyword = params.media.searchKeywords[0]?.replace(/[^\p{L}\p{N}_-]/gu, '') ?? '';
    const tailTag = keyword ? ` #${keyword}` : '';
    const merged = this.enforceTweetLength(`${hookPrefix}${base}${tailTag}`.trim());

    const concise = this.enforceTweetLength(
      merged
        .replace(/，/g, '，')
        .replace(/。+/g, '。')
        .replace(/欢迎留言.*$/, '欢迎交流。')
    );

    const strategic = this.enforceTweetLength(
      `${merged} 先把流程稳定，再追求更高频率与规模。`
    );

    const variants = [
      { tone: '简洁', text: concise },
      { tone: '专业', text: strategic }
    ];

    return {
      tweet: merged,
      variants
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

  private scoreArticleQuality(text: string): PackageResult['quality'] {
    const chars = [...text].length;
    const sections = (text.match(/(?:^|\n)[一二三四五六七八九十]、/gu) ?? []).length;
    const paragraphs = text.split(/\n{2,}/).filter((block) => block.trim()).length;
    const hashtagCount = (text.match(/#[\p{L}0-9_]+/gu) ?? []).length;

    const readabilityBase =
      chars < 320 ? 56 : chars > 5000 ? 60 : 84 - Math.abs(1100 - chars) * 0.018;
    const readability = clampPercent(readabilityBase + Math.min(3, paragraphs) * 2);

    const signalTokens = ['问题', '流程', '步骤', '建议', '复盘', '结论', '动作', '策略', '节奏'];
    const densityHits = signalTokens.reduce((sum, token) => (text.includes(token) ? sum + 1 : sum), 0);
    const density = clampPercent(48 + densityHits * 6 + Math.min(4, sections) * 5);

    const platformFit = clampPercent(
      52 +
        Math.min(5, sections) * 7 +
        (text.includes('导语') ? 6 : 0) +
        (text.includes('结尾') ? 6 : 0) -
        hashtagCount * 12
    );

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

    const total = clampPercent(readability * 0.28 + density * 0.24 + platformFit * 0.28 + aiTrace * 0.2);

    return {
      readability,
      density,
      platformFit,
      aiTrace,
      total
    };
  }

  private scoreGeneratedContent(text: string, type: GenerationType): PackageResult['quality'] {
    return type === GenerationType.LONG ? this.scoreArticleQuality(text) : this.scoreTweetQuality(text);
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
    let draftRouted: RoutedChatResult | null = null;
    let humanizeRouted: RoutedChatResult | null = null;
    let packageRouted: RoutedChatResult | null = null;
    const fastPathApplied: Partial<Record<'research' | 'outline' | 'media' | 'package', boolean>> = {};

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

    const stepTimingRows = new Map(
      gen.steps.map((step) => [step.step, { step: step.step, startedAt: step.startedAt ?? null, completedAt: step.completedAt ?? null }])
    );

    const prompt = gen.prompt;
    const userIntent = extractIntentFromPrompt(prompt);
    const intentFocus = extractIntentFocus(prompt);
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

      const startedAt = row.startedAt ?? new Date();
      await this.prisma.db.generationStep.update({
        where: { id: row.id },
        data: { status: StepStatus.RUNNING, startedAt }
      });
      stepTimingRows.set(stepName, { step: stepName, startedAt, completedAt: null });

      try {
        let content = '';

        if (stepName === StepName.HOTSPOT) {
          if (this.fastPathEnabled) {
            researchPayload = this.buildFastResearchPayload(prompt);
            fastPathApplied.research = true;
            content = JSON.stringify(researchPayload);
          } else {
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
                    `原始需求：${userIntent}`,
                    `聚焦主题：${intentFocus}`,
                    `语言：${language}`,
                    '请产出：2-5 个研究角度 researchPoints、2-5 个开头钩子 hookCandidates、一个 angleSummary。'
                  ].join('\n')
                }
              ]
            });
            researchPayload = result.data;
            content = JSON.stringify(result.data);
          }
        } else if (stepName === StepName.OUTLINE) {
          if (!researchPayload) {
            throw new Error('缺少 research 数据，无法继续生成 outline');
          }

          if (this.fastPathEnabled) {
            outlinePayload = this.buildFastOutlinePayload(prompt, researchPayload);
            fastPathApplied.outline = true;
            content = JSON.stringify(outlinePayload);
          } else {
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
                    `原始需求：${userIntent}`,
                    `聚焦主题：${intentFocus}`,
                    `研究角度：${researchPayload.researchPoints.join(' | ')}`,
                    `候选钩子：${researchPayload.hookCandidates.join(' | ')}`,
                    '请生成可直接用于 X 的结构化大纲。'
                  ].join('\n')
                }
              ]
            });

            outlinePayload = result.data;
            content = JSON.stringify(result.data);
          }
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
                content:
                  gen.type === GenerationType.LONG
                    ? `你是 X 长文编辑。${styleInjection} 输出 JSON。primaryTweet 字段必须是适合 X 文章的完整长文初稿，包含标题、导语、3-5 个小节、结尾行动句；不要加 hashtag；thread 留空即可。`
                    : `你是 X 平台写作专家。${styleInjection} 输出 JSON。`
              },
              {
                role: 'user',
                content: [
                  `语言：${language}`,
                  `原始需求：${userIntent}`,
                  `聚焦主题：${intentFocus}`,
                  `标题：${outlinePayload.title}`,
                  `Hook：${outlinePayload.hook}`,
                  `Body：${outlinePayload.body.join(' / ')}`,
                  `CTA：${outlinePayload.cta}`,
                  `类型：${gen.type}`,
                  gen.type === GenerationType.LONG
                    ? '要求：primaryTweet 必须是 X 文章格式正文；不要写成 tweet/thread 的短格式。'
                    : '要求：primaryTweet 必须可发布；thread 可选。'
                ].join('\n')
              }
            ]
          });

          draftPayload = result.data;
          draftRouted = result.routed;
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
                content:
                  gen.type === GenerationType.LONG
                    ? '你是中文母语长文编辑。去 AI 味但不改变观点，保留标题、导语、小节与换行结构，返回 JSON。'
                    : '你是中文母语编辑。去 AI 味但不改变观点，返回 JSON。'
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
          humanizeRouted = result.routed;
          content = JSON.stringify(result.data);
        } else if (stepName === StepName.IMAGE) {
          if (!humanizedPayload) throw new Error('缺少 humanized 数据，无法继续 media');

          if (this.fastPathEnabled) {
            mediaPayload = this.buildFastMediaPayload(humanizedPayload.humanized);
            fastPathApplied.media = true;
            content = JSON.stringify(mediaPayload);
          } else {
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
          }
        } else if (stepName === StepName.PACKAGE) {
          if (!humanizedPayload || !mediaPayload) {
            throw new Error('缺少 humanized/media 数据，无法打包发布');
          }

          let packagePayload: PackageStepPayload;
          if (this.fastPathEnabled) {
            packagePayload = this.buildFastPackagePayload({
              humanized: humanizedPayload.humanized,
              outline: outlinePayload,
              media: mediaPayload,
              type: gen.type
            });
            packageRouted = humanizeRouted ?? draftRouted ?? this.buildHeuristicRoutedResult();
            fastPathApplied.package = true;
          } else {
            const packageResponse = await this.generateJsonStep<PackageStepPayload>({
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
                  content:
                    gen.type === GenerationType.LONG
                      ? '你是 X 长文发布编辑。输出严格 JSON。tweet 字段必须是适合 X 文章编辑器的完整长文，包含标题、导语、3-5 个小节、结尾行动句；不要加 hashtag；不要输出 thread。'
                      : '你是发布编辑。输出严格 JSON。'
                },
                {
                  role: 'user',
                  content: [
                    `原始需求：${userIntent}`,
                    `主文案：${humanizedPayload.humanized}`,
                    `结构：${outlinePayload?.body.join(' | ') ?? ''}`,
                    `配图关键词：${mediaPayload.searchKeywords.join(' | ')}`,
                    gen.type === GenerationType.LONG
                      ? '输出最终长文正文到 tweet 字段；variants 可为空。'
                      : '输出最终 tweet 和不少于2条 variants（不同语气）。'
                  ].join('\n')
                }
              ]
            });

            packagePayload = packageResponse.data;
            packageRouted = packageResponse.routed;
          }

          let finalTweet = packagePayload.tweet.trim();
          let quality = this.scoreGeneratedContent(finalTweet, gen.type);

          if (quality.total < QUALITY_THRESHOLD) {
            const rewrite = await this.openRouter.chatWithRouting(
              [
                {
                  role: 'system',
                  content:
                    gen.type === GenerationType.LONG
                      ? '你是 X 长文润色编辑，保留标题、导语、小节、结尾结构，输出纯文本，不要 hashtag。'
                      : '你是 X 平台写作润色专家，输出纯文本。'
                },
                {
                  role: 'user',
                  content: [
                    `请在不改变观点的前提下重写以下${gen.type === GenerationType.LONG ? '长文' : '文案'}，目标质量分 >= ${QUALITY_THRESHOLD}。`,
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
            packageRouted = rewrite;
            await this.recordUsage({
              userId,
              workspaceId: gen.workspaceId,
              generationId,
              eventType: UsageEventType.GENERATION,
              routed: rewrite,
              trialMode
            });

            if (rewritten) {
              const rewriteQuality = this.scoreGeneratedContent(rewritten, gen.type);
              if (rewriteQuality.total >= quality.total) {
                finalTweet = rewritten;
                quality = rewriteQuality;
              }
            }
          }

          const packageCompletedAt = new Date();
          stepTimingRows.set(stepName, { step: stepName, startedAt, completedAt: packageCompletedAt });
          const stepMetadata = buildPackageStepMetadata([...stepTimingRows.values()]);
          const stepExplain = { ...stepMetadata.stepExplain };
          if (fastPathApplied.research) {
            stepExplain.research = 'Fast path：基于意图模板快速抽取研究角度与钩子，降低首段等待时间。';
          }
          if (fastPathApplied.outline) {
            stepExplain.outline = 'Fast path：由研究结果直接生成结构化大纲，减少一次模型往返。';
          }
          if (fastPathApplied.media) {
            stepExplain.media = 'Fast path：按文案关键词生成素材建议与检索词，保证可发布素材包。';
          }
          if (fastPathApplied.package) {
            stepExplain.package = 'Fast path：本地拼装发布包并做质量门控，必要时才触发模型重写。';
          }

          const pkg: PackageResult = {
            tweet: finalTweet,
            charCount: [...finalTweet].length,
            imageKeywords: mediaPayload.searchKeywords,
            variants: packagePayload.variants,
            quality,
            routing: {
              trialMode,
              primaryModel: packageRouted?.modelUsed ?? 'draftorbit/heuristic',
              routingTier: packageRouted?.routingTier ?? 'free_first'
            },
            budget: {
              ratio: Number(budgetRatio.toFixed(4)),
              conservativeMode
            },
            stepLatencyMs: stepMetadata.stepLatencyMs,
            stepExplain
          };

          content = JSON.stringify(pkg);

          await this.recordQualityGate({
            userId,
            workspaceId: gen.workspaceId,
            generationId,
            qualityScore: quality.total,
            routed: packageRouted ?? this.buildHeuristicRoutedResult(),
            trialMode
          });

          await this.prisma.db.generationStep.update({
            where: { id: row.id },
            data: {
              status: StepStatus.DONE,
              content,
              completedAt: packageCompletedAt
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

        const completedAt = new Date();
        await this.prisma.db.generationStep.update({
          where: { id: row.id },
          data: {
            status: StepStatus.DONE,
            content,
            completedAt
          }
        });
        stepTimingRows.set(stepName, { step: stepName, startedAt, completedAt });
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
