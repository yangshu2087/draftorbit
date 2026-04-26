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
  type ChatMessage,
  type RoutingContentFormat,
  type RoutedChatResult as OpenRouterRoutedChatResult,
  type RouterTaskType,
} from '../../common/openrouter.service';
import {
  ModelGatewayService,
  type ModelGatewayChatResult,
  type ModelProviderKey,
  type ModelRoutingProfile,
  isInvalidTestHighEvidenceModel,
  resolveModelRoutingProfile
} from '../../common/model-gateway.service';
import type { BriefInputDto, GenerateStartMode } from './start-generation.dto';
import { buildPackageStepMetadata } from './package-step-metadata';
import {
  buildDraftPayloadFallback,
  buildArticleHumanizedFallback,
  buildQualitySignalReport,
  buildThreadHumanizedFallback,
  buildTweetHumanizedFallback,
  buildContentStrategyContext,
  composePublishReadyTweet,
  detectContentAntiPatterns,
  enforceTweetLength,
  extractIntentFromPrompt as deriveIntentFromPrompt,
  extractIntentFocus as deriveIntentFocus,
  formatThreadPosts,
  formatXArticleText as formatStrategicArticleText,
  renderStrategyPromptContext,
  sanitizeGeneratedText,
  tightenTweetForEngagement,
  type ContentFormat,
  type ContentStrategyContext,
  type QualitySignalReport
} from './content-strategy';
import { ContentBenchmarkService } from './content-benchmark.service';
import { VisualPlanningService, type VisualPlan } from './visual-planning.service';
import { normalizeVisualRequest, type VisualRequest } from './visual-request';
import { DerivativeGuidanceService, type DerivativeReadiness } from './derivative-guidance.service';
import { buildContentQualityGate, type ContentQualityGateResult } from './content-quality-gate';
import {
  BaoyuRuntimeService,
  type BaoyuRuntimeMeta,
  type BaoyuSkillName,
  type BaoyuVisualAsset
} from './baoyu-runtime.service';
import { SourceCaptureService, type SourceArtifact, type SourceCaptureResult } from './source-capture.service';

const STEP_ORDER: StepName[] = [
  StepName.HOTSPOT,
  StepName.OUTLINE,
  StepName.DRAFT,
  StepName.HUMANIZE,
  StepName.IMAGE,
  StepName.PACKAGE
];

const QUALITY_THRESHOLD = 72;

type RoutedChatResult = ModelGatewayChatResult | (OpenRouterRoutedChatResult & { provider?: ModelProviderKey; profile?: ModelRoutingProfile });

type PriceGuard = {
  prompt: number;
  completion: number;
  image: number;
  web_search: number;
};

function extractFirstSourceHeading(sourceContext: string): string {
  const yamlTitle = sourceContext.match(/^title:\s*"([^"]+)"/mu)?.[1]?.trim();
  if (yamlTitle) return yamlTitle;
  const markdownTitle = sourceContext.match(/^##\s+(.+)$/mu)?.[1]?.trim();
  if (markdownTitle) return markdownTitle;
  const sourceTitle = sourceContext.match(/^# Source:\s+(.+)$/mu)?.[1]?.trim();
  return sourceTitle || '这条最新来源';
}

function cleanSourceSnippet(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/gu, (match) => match.replace(/^\[|\]\([^)]+\)$/gu, ''))
    .replace(/^#+\s*/u, '')
    .replace(/^[-*]\s+/u, '')
    .replace(/^>\s*/u, '')
    .replace(/[`*_~|]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function shortenSourceTitle(title: string): string {
  const cleaned = cleanSourceSnippet(title)
    .replace(/^Source:\s*/iu, '')
    .replace(/[，,。！？!?；;：:].*$/u, '')
    .trim();
  const chars = [...cleaned];
  return chars.length > 34 ? `${chars.slice(0, 34).join('')}…` : cleaned || '这条最新来源';
}

function stripSourceFrontMatter(sourceContext: string): string {
  return sourceContext.replace(/^---\s*[\s\S]*?\n---\s*/u, '');
}

function scoreSourceFactSnippet(line: string): number {
  let score = 0;
  if (/(Hermes|Agent|OpenClaw|GitHub|Stars?|学习循环|Learning Loop|记忆|框架|发布|更新|支持|模型|工具|开源)/iu.test(line)) score += 8;
  if (/(解决|不同|特别之处|核心|能力|变化|之前|现在|从.*到|不是.*而是)/u.test(line)) score += 4;
  if (/(202\d年\d{1,2}月\d{1,2}日|来自北京|下载客户端|独家抢先看|广告|免责声明|图片来源)/u.test(line)) score -= 10;
  if (/(读者留言|谐音梗|叫 Hermes 爱马仕)/u.test(line)) score -= 4;
  return score;
}

function extractSourceFactSnippets(sourceContext: string, title: string): string[] {
  const seen = new Set<string>();
  const titleKey = cleanSourceSnippet(title).replace(/\s+/gu, '').slice(0, 32);
  const candidates = stripSourceFrontMatter(sourceContext)
    .split(/\n+/u)
    .map(cleanSourceSnippet)
    .filter((line) => line.length >= 18 && line.length <= 180)
    .filter((line) => !/^(?:url|requestedUrl|coverImage|title|summary|adapter|capturedAt|conversionMethod|kind|language):/iu.test(line))
    .filter((line) => !/^source$/iu.test(line))
    .filter((line) => !/^https?:\/\//iu.test(line))
    .filter((line) => !/(?:^\d{4}年\d{1,2}月\d{1,2}日|下载客户端|独家抢先看|读者留言说可以叫)/u.test(line))
    .filter((line) => !/(?:cookie|copyright|privacy policy|terms of use|登录|注册|广告合作|免责声明)/iu.test(line))
    .filter((line) => {
      const key = line.replace(/\s+/gu, '');
      if (!key || (titleKey && key.startsWith(titleKey))) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return candidates
    .map((line, index) => ({ line, index, score: scoreSourceFactSnippet(line) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.line)
    .slice(0, 4);
}

function buildSourceGroundedArticleFallback(input: { focus: string; sourceContext?: string | null; cta?: string | null }): string {
  const sourceContext = input.sourceContext ?? '';
  const title = extractFirstSourceHeading(sourceContext);
  const shortTitle = shortenSourceTitle(title);
  const facts = extractSourceFactSnippets(sourceContext, title);
  const firstFact = facts[0] ?? `来源标题指向的核心事件是：“${title}”。`;
  const secondFact = facts[1] ?? '来源里至少给出了一个明确对象，写作时要先把对象、动作和影响边界讲清楚。';
  const thirdFact = facts[2] ?? '如果来源细节还不够，文章应该明确保守处理，而不是把“最新”扩写成模型想象。';
  const fourthFact = facts[3] ?? '最适合视觉化的不是口号，而是“之前怎么做、现在哪一步变了”的 before/after。';
  const focus = input.focus.trim() || shortTitle;
  const cta = input.cta?.trim();
  const safeCta =
    cta && !/(读完以后，你最想先改哪一步|继续扩写|欢迎|评论区|你怎么看)/u.test(cta)
      ? cta
      : `如果你正在判断“${shortTitle}”这类变化，你会先看它眼前省下的动作，还是长期维护成本？`;

  return [
    `${shortTitle}，真正的变化不在名字上`,
    '',
    '导语',
    `${firstFact} 这件事值得停一下，不是因为它被贴上了“最新”标签，而是因为它把“${focus}”背后的一个具体问题推到台前：旧流程留下了什么，新方案试图补上什么。`,
    '',
    '一、先看它解决的旧问题',
    `${secondFact} 放到使用场景里看，读者真正关心的不是名词有多新，而是之前哪一步最费劲：配置、记忆、跨端运行，还是长期维护。具体到这条材料，它至少给了一个可讨论的对象，而不是一句空泛的“升级了”。`,
    '',
    '二、再看它把哪一步变短了',
    `如果只说“影响很大”，读者还是不知道该怎么判断。更具体的看法，是把之前和现在拆开：之前用户、团队或开发者需要怎样完成这件事，现在这条变化让哪一步变短、变清楚，或者变得更有争议。材料里可用的支撑点是：${thirdFact}`,
    '',
    '三、最后看它值不值得长期押注',
    `最新消息最容易写成热闹，但真正有用的判断要回到取舍：它带来的效率提升、成本变化和长期风险，哪一个会影响用户接下来的选择。适合做成对比图的一点是：${fourthFact}`,
    '',
    '结尾',
    safeCta
  ].join('\n');
}

export function buildSourceGroundedTweetFallback(input: { focus: string; sourceContext?: string | null; cta?: string | null }): string {
  const sourceContext = input.sourceContext ?? '';
  const title = extractFirstSourceHeading(sourceContext);
  const shortTitle = shortenSourceTitle(title);
  const facts = extractSourceFactSnippets(sourceContext, title);
  const firstFact = facts[0] ?? `来源标题指向的核心对象是“${shortTitle}”。`;
  const secondFact = facts[1] ?? '这条来源只支撑它已经写明的对象、用途和边界，不支撑额外想象。';
  const focus = input.focus.trim() || shortTitle;
  const body = [
    `${shortTitle} 这条来源能写，但只能写它已经说清楚的部分。`,
    '',
    `比如来源里的核心事实是：${firstFact} 这能支撑的内容，是解释“${focus}”具体解决什么场景，而不是泛泛说趋势。`,
    '',
    `我会把第二个判断落在边界上：${secondFact} 这样发出去像一条有依据的运营判断，而不是追热点。`
  ].join('\n');
  return enforceTweetLength(body, 280);
}

export function buildSourceGroundedThreadFallback(input: { focus: string; sourceContext?: string | null; cta?: string | null }): string[] {
  const sourceContext = input.sourceContext ?? '';
  const title = extractFirstSourceHeading(sourceContext);
  const shortTitle = shortenSourceTitle(title);
  const facts = extractSourceFactSnippets(sourceContext, title);
  const firstFact = facts[0] ?? `来源标题指向的核心对象是“${shortTitle}”。`;
  const secondFact = facts[1] ?? '来源没有给出的部分，不能自动补成更大的趋势判断。';
  const cta =
    input.cta?.trim() && !/(欢迎|评论区|你怎么看|继续扩写|读完以后)/u.test(input.cta)
      ? input.cta.trim()
      : '如果继续生成，我会基于同一条来源重写成更窄的判断句，再配一张“来源→正文→图文”的流程卡。';

  return [
    `1/4\n${shortTitle} 这条来源可以写，但不要把它扩成“最新大趋势”。\n它先提供的是一个可核验事实：${firstFact}`,
    `2/4\n比如这类来源最适合先解决一个问题：让读者知道对象是什么、能用在哪、不能证明什么。可用的第二层支撑是：${secondFact}`,
    '3/4\n先按“事实→影响→边界”重写：事实只取来源已写明的内容；影响只写能从事实推出的场景；边界明确说还不能证明更大的结论。',
    `4/4\n${cta}`
  ].map((post) => sanitizeGeneratedText(post, 'thread'));
}

function hasSourceBlockedQualityGate(qualityGate: ContentQualityGateResult): boolean {
  return Boolean(qualityGate.sourceRequired && qualityGate.sourceStatus && qualityGate.sourceStatus !== 'ready');
}

function markSourceReadyRepairFailed(qualityGate: ContentQualityGateResult): ContentQualityGateResult {
  const hardFails = [...new Set([...qualityGate.hardFails, 'source_ready_repair_attempted', 'source_ready_repair_failed'])];
  return {
    ...qualityGate,
    status: 'failed',
    safeToDisplay: false,
    hardFails,
    userMessage: '来源已采用，但这版文案还需重写。',
    recoveryAction: 'retry',
    judgeNotes: [
      ...new Set([
        ...qualityGate.judgeNotes,
        'source_ready_repair_attempted',
        'source_ready_repair_failed',
        '来源抓取成功，但自动修复后的正文仍未通过质量门；前端应提供基于同一来源重写的恢复路径。'
      ])
    ]
  };
}

function hasRepairableArticleStructureFail(qualityGate: ContentQualityGateResult): boolean {
  return qualityGate.hardFails.some((flag) =>
    ['article_generic_scaffold', 'article_too_few_sections', 'article_empty_section'].includes(flag)
  );
}

function providerTypeFromModelProvider(provider: ModelProviderKey | undefined): ProviderType {
  if (provider === 'openai') return ProviderType.OPENAI;
  if (provider === 'openrouter') return ProviderType.OPENROUTER;
  if (provider === 'codex-local') return ProviderType.CODEX_LOCAL;
  if (provider === 'ollama') return ProviderType.OLLAMA;
  return ProviderType.MOCK;
}

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
  thread?: string[];
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
    profile?: ModelRoutingProfile;
    provider?: ModelProviderKey;
  };
  budget: {
    ratio: number;
    conservativeMode: boolean;
  };
  qualitySignals: QualitySignalReport;
  visualPlan: VisualPlan | null;
  visualAssets?: BaoyuVisualAsset[];
  sourceArtifacts?: SourceArtifact[];
  runtime?: BaoyuRuntimeMeta;
  derivativeReadiness: DerivativeReadiness | null;
  qualityGate?: ContentQualityGateResult;
  stepLatencyMs: Record<'research' | 'outline' | 'draft' | 'humanize' | 'media' | 'package', number | null>;
  stepExplain: Record<'research' | 'outline' | 'draft' | 'humanize' | 'media' | 'package', string>;
};

export function buildSourceBlockedPackageResult(input: {
  format: ContentFormat;
  focus: string;
  sourceCapture: Pick<SourceCaptureResult, 'artifacts' | 'hardFails' | 'sourceRequired' | 'sourceStatus'>;
  routingProfile: ModelRoutingProfile;
  trialMode: boolean;
  budgetRatio: number;
  conservativeMode: boolean;
}): PackageResult {
  const qualitySignals = buildQualitySignalReport('', input.format);
  const qualityGate = buildContentQualityGate({
    format: input.format,
    focus: input.focus,
    text: '',
    qualitySignals,
    visualPlan: null,
    sourceRequired: input.sourceCapture.sourceRequired,
    sourceStatus: input.sourceCapture.sourceStatus,
    sourceHardFails: input.sourceCapture.hardFails
  });

  return {
    tweet: '',
    charCount: 0,
    imageKeywords: [],
    variants: [],
    quality: {
      readability: 0,
      density: 0,
      platformFit: 0,
      aiTrace: 0,
      total: 0
    },
    routing: {
      trialMode: input.trialMode,
      primaryModel: 'source-blocked',
      routingTier: 'source-blocked',
      profile: input.routingProfile
    },
    budget: {
      ratio: Number(input.budgetRatio.toFixed(4)),
      conservativeMode: input.conservativeMode
    },
    qualitySignals,
    visualPlan: null,
    visualAssets: [],
    sourceArtifacts: input.sourceCapture.artifacts,
    derivativeReadiness: null,
    qualityGate,
    stepLatencyMs: {
      research: null,
      outline: null,
      draft: null,
      humanize: null,
      media: null,
      package: null
    },
    stepExplain: {
      research: 'Source preflight：本次请求需要可靠来源，未进入草稿生成。',
      outline: '等待可靠来源后继续。',
      draft: '等待可靠来源后继续。',
      humanize: '等待可靠来源后继续。',
      media: '等待可靠来源后继续。',
      package: '已生成可恢复的来源拦截包，未交付坏稿。'
    }
  };
}

type GenerationStartInput = {
  mode: GenerateStartMode;
  brief?: BriefInputDto;
  customPrompt?: string;
  legacyPrompt?: string;
  type?: GenerationType;
  language?: string;
  useStyle?: boolean;
  visualRequest?: VisualRequest;
  contentProjectId?: string;
};

type ResearchStepPayload = {
  researchPoints: string[];
  hookCandidates: string[];
  angleSummary: string;
  sourceShape?: string;
  bestEvidenceSlot?: string;
  visualizablePoints?: string[];
  postStructureRecommendation?: string;
};

type OutlineStepPayload = {
  title: string;
  hook: string;
  body: string[];
  cta: string;
  evidencePlan?: string[];
  visualPlan?: string[];
  derivativeHints?: string[];
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
  thread?: string[];
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
    @Inject(ModelGatewayService) private readonly modelGateway: ModelGatewayService,
    @Inject(ContentBenchmarkService) private readonly contentBenchmark: ContentBenchmarkService,
    @Inject(VisualPlanningService) private readonly visualPlanning: VisualPlanningService,
    @Inject(DerivativeGuidanceService) private readonly derivativeGuidance: DerivativeGuidanceService,
    @Inject(SourceCaptureService) private readonly sourceCapture: SourceCaptureService,
    @Inject(BaoyuRuntimeService) private readonly baoyuRuntime: BaoyuRuntimeService
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

  private get heuristicFallbackAllowed(): boolean {
    const raw = process.env.ALLOW_HEURISTIC_FALLBACK?.trim().toLowerCase();
    return raw !== 'false' && raw !== '0';
  }

  private get qualityRepairEnabled(): boolean {
    return this.routingProfile === 'test_high' || this.routingProfile === 'local_quality';
  }

  private isHeuristicRoutedResult(routed: RoutedChatResult | null | undefined): boolean {
    if (!routed) return true;
    if (this.routingProfile === 'test_high') {
      return isInvalidTestHighEvidenceModel({ modelUsed: routed.modelUsed, provider: routed.provider });
    }
    return routed.routingTier === 'free_first' || /draftorbit\/heuristic|mock\/|openrouter\/free/iu.test(routed.modelUsed);
  }

  private enforceRealModelGate(input: {
    routed: RoutedChatResult | null | undefined;
    qualityGate: ContentQualityGateResult;
  }): ContentQualityGateResult {
    if (this.heuristicFallbackAllowed && this.routingProfile !== 'test_high') return input.qualityGate;
    if (!this.isHeuristicRoutedResult(input.routed)) return input.qualityGate;

    return {
      ...input.qualityGate,
      status: 'failed',
      safeToDisplay: false,
      hardFails: [...new Set([...input.qualityGate.hardFails, 'real_model_unavailable'])],
      judgeNotes: [
        ...input.qualityGate.judgeNotes,
        'test_high / real-model 回归不能用 draftorbit/heuristic 或 free_first 路径作为可展示结果。'
      ]
    };
  }

  private mergeGateHardFails(input: {
    qualityGate: ContentQualityGateResult;
    hardFails: string[];
    judgeNotes?: string[];
  }): ContentQualityGateResult {
    if (input.hardFails.length === 0) return input.qualityGate;
    return {
      ...input.qualityGate,
      status: 'failed',
      safeToDisplay: false,
      hardFails: [...new Set([...input.qualityGate.hardFails, ...input.hardFails])],
      judgeNotes: [...new Set([...input.qualityGate.judgeNotes, ...(input.judgeNotes ?? [])])]
    };
  }

  private sourceGateNotes(sourceCapture: SourceCaptureResult): string[] {
    if (!sourceCapture.sourceRequired || sourceCapture.sourceStatus === 'ready') return [];
    switch (sourceCapture.sourceStatus) {
      case 'not_configured':
        return ['这次输入需要最新来源，但 search provider/Tavily 未配置；请粘贴 URL 或配置 TAVILY_API_KEY。'];
      case 'ambiguous':
        return ['搜索结果指向多个可能实体，不能猜测用户要写哪一个；请补一句限定语或粘贴目标 URL。'];
      case 'failed':
      default:
        return ['搜索或 baoyu markdown 抓取没有得到可用来源；不能编造最新事实。'];
    }
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
      costUsd: 0,
      provider: 'openrouter',
      profile: this.routingProfile
    };
  }

  private contentFormatFromGenerationType(type: GenerationType): ContentFormat {
    if (type === GenerationType.THREAD) return 'thread';
    if (type === GenerationType.LONG) return 'article';
    return 'tweet';
  }

  private routingFormatHint(input: { format: ContentFormat; visualRequest?: VisualRequest | null }): RoutingContentFormat {
    if (input.visualRequest?.mode === 'diagram') return 'diagram';
    return input.format;
  }

  private get gptVisualSpecEnabled(): boolean {
    return process.env.GENERATE_GPT_VISUAL_SPEC_ENABLED !== '0';
  }

  private async buildBackgroundVisualPlan(params: {
    userId: string;
    workspaceId: string | null;
    generationId: string;
    trialMode: boolean;
    maxPrice?: PriceGuard;
    format: ContentFormat;
    focus: string;
    text: string;
    outline: OutlineStepPayload | null;
    visualRequest?: VisualRequest | null;
    contextLines: string[];
  }): Promise<VisualPlan> {
    const fallbackPlan = this.visualPlanning.buildPlan({
      format: params.format,
      focus: params.focus,
      text: params.text,
      outline: params.outline
        ? { title: params.outline.title, hook: params.outline.hook, body: params.outline.body }
        : null,
      visualRequest: params.visualRequest
    });

    if (!this.gptVisualSpecEnabled || this.routingProfile === 'local_free') return fallbackPlan;

    try {
      const routed = await this.modelGateway.chatWithRouting(
        [
          {
            role: 'system',
            content:
              '你是 DraftOrbit 的图文视觉规格总监。只输出严格 JSON；不要输出 prompt、链路说明、provider、模型名或 stderr。视觉规格必须服务于最终正文，适合渲染成 SVG/HTML/Markdown。'
          },
          {
            role: 'user',
            content: [
              ...params.contextLines,
              `体裁：${params.format}`,
              `主题：${params.focus}`,
              `最终正文：${params.text}`,
              '输出 JSON schema：{"primaryAsset":"cover|cards|infographic|illustration|diagram","visualizablePoints":["具体可画场景"],"keywords":["短关键词"],"items":[{"kind":"cover|cards|infographic|illustration|diagram","type":"...","layout":"...","style":"...","palette":"...","cue":"一句具体画面","reason":"为什么这张图服务正文"}]}',
              '要求：tweet 用 cover；thread 用 cards；article 至少 cover/infographic/illustration；diagram 意图必须给 diagram。cue 不得包含 userPrompt、V4 Creator Studio request、系统提示或模型错误。'
            ].join('\n')
          }
        ],
        {
          taskType: 'media',
          contentFormat: this.routingFormatHint({ format: params.format, visualRequest: params.visualRequest }),
          trialMode: params.trialMode,
          forceHighTier: true,
          maxPrice: params.maxPrice,
          temperature: 0.35,
          maxTokens: 900
        }
      );

      await this.recordUsage({
        userId: params.userId,
        workspaceId: params.workspaceId,
        generationId: params.generationId,
        eventType: UsageEventType.IMAGE,
        routed,
        trialMode: params.trialMode
      });

      return this.parseJson(routed.content, (value) =>
        this.visualPlanning.buildPlanFromSpec({
          format: params.format,
          focus: params.focus,
          text: params.text,
          spec: value,
          outline: params.outline
            ? { title: params.outline.title, hook: params.outline.hook, body: params.outline.body }
            : null,
          visualRequest: params.visualRequest
        })
      ) ?? fallbackPlan;
    } catch {
      return fallbackPlan;
    }
  }

  private buildFastResearchPayload(context: ContentStrategyContext): ResearchStepPayload {
    const anchor = context.focus || extractTopKeywords(context.intent, 1)[0] || '内容表达';
    const exampleHook = context.highPerformingExamples[0]?.hook ?? context.hookPatterns[0] ?? null;
    const audienceHint = /AI/u.test(anchor) ? '对 AI 产品、增长和内容策略敏感的人' : '已经在 X 上表达但互动不稳定的人';

    return {
      researchPoints: [
        `受众假设：这条内容应该先打中“${audienceHint}”，让他在前两句就知道这条为什么值得看。`,
        `核心判断：围绕“${anchor}”先给一个明确立场，再立刻补一个例子或 before/after。`,
        `互动驱动：结尾不要泛泛邀请讨论，改成让读者必须做选择或给出经验的问题。`
      ],
      hookCandidates: [
        exampleHook || `多数人把“${anchor}”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。`,
        `如果你的“${anchor}”总像说明书，问题通常不在知识，而在开头没有先给判断。`,
        `真正拖慢“${anchor}”的，往往不是不会写，而是把三个意思塞进同一条内容里。`
      ],
      angleSummary: `先给清晰判断，再补具体例子，最后用一个带选择的问题把回复拉出来。`,
      sourceShape: context.format === 'article' ? '长文先判断后展开' : context.format === 'thread' ? '首条 promise + 中段推进' : '单条判断 + 例子 + 问题',
      bestEvidenceSlot: context.format === 'article' ? '每个小节前半段' : '开头判断后的第二句',
      visualizablePoints: [
        `${anchor} 的常见误区`,
        `${anchor} 的 before/after 对比`,
        `${anchor} 的下一步动作`
      ],
      postStructureRecommendation:
        context.format === 'article'
          ? '标题/导语/3-5 节/结尾，每节都要可视化'
          : context.format === 'thread'
            ? '首条给判断，中段每条推进一个点'
            : '单条里同时保留判断、例子和问题'
    };
  }

  private buildFastOutlinePayload(context: ContentStrategyContext, research: ResearchStepPayload): OutlineStepPayload {
    const titleSeed = context.focus || extractTopKeywords(context.intent, 2).join(' · ') || 'X 内容写作';
    const defaultBodyByFormat: Record<ContentFormat, string[]> = {
      tweet: ['先给一个明确判断。', '再补一个真实例子。', '最后抛出一个让人愿意回复的问题。'],
      thread: [
        `为什么多数“${titleSeed}”内容没人停下来`,
        '先把判断讲清楚，再补一个具体例子',
        '最后把问题抛给读者，而不是自说自话'
      ],
      article: [
        `多数人写“${titleSeed}”时，为什么第一段就失去读者`,
        '先给判断，再补一个具体例子，读者才会继续读',
        '把表达动作排成稳定节奏，比等灵感更有效'
      ]
    };

    const body = research.researchPoints
      .slice(0, context.format === 'article' ? 4 : 3)
      .map((row) => row.replace(/^.+：/, '').trim())
      .filter(Boolean)
      .map((row) =>
        /(让他在前两句就知道|立刻补一个例子或 before\/after|结尾不要泛泛邀请讨论|回复驱动|受众假设|核心判断)/u.test(
          row
        )
          ? ''
          : row
      )
      .filter(Boolean);

    return {
      title: context.format === 'article' ? `${titleSeed}：先把判断讲清楚，再让读者继续读下去` : titleSeed,
      hook:
        research.hookCandidates[0] ??
        `多数关于“${titleSeed}”的内容不缺信息，缺的是让人愿意停下来的第一句。`,
      body:
        body.length >= 2
          ? body
          : defaultBodyByFormat[context.format],
      cta:
        context.format === 'article'
          ? '读完以后，你最想先改哪一步？'
          : '如果只能先改一个动作，你会先改哪一个？',
      evidencePlan: [
        '先给一个最常见场景',
        '补一个 before/after 或反例',
        '最后收束成一个可执行动作'
      ],
      visualPlan:
        context.format === 'article'
          ? ['封面图聚焦主判断', '至少 2 个小节可视化成插图', '收尾可压成信息图']
          : context.format === 'thread'
            ? ['首条适合封面', '中段适合卡片或对比图', '结尾不需要额外图，只收束判断']
            : ['优先单图封面或单张观点卡'],
      derivativeHints:
        context.format === 'article'
          ? ['适合 markdown/html 导出', '适合 slide-style summary']
          : context.format === 'thread'
            ? ['适合 markdown 摘要', '有机会切成 slide-style summary']
            : ['适合卡片化']
    };
  }

  private buildFastMediaPayload(text: string, visualPlan?: VisualPlan | null): MediaStepPayload {
    const keywords = [...new Set([...(visualPlan?.keywords ?? []), ...extractTopKeywords(text, 8)])];
    const searchKeywords =
      keywords.length > 0 ? keywords : ['x content workflow', 'social media operations', 'engagement analytics'];

    return {
      ideas:
        visualPlan?.items.slice(0, 3).map((item) => ({
          title:
            item.kind === 'cover'
              ? '主判断封面图'
              : item.kind === 'infographic'
                ? '结构信息图'
                : item.kind === 'illustration'
                  ? '章节插图方案'
                  : '观点卡片组',
          composition: `${item.layout}；重点突出：${item.cue}`,
          keywords: searchKeywords.slice(0, 4)
        })) ??
        [
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
    context: ContentStrategyContext;
  }): PackageStepPayload {
    if (params.type === GenerationType.LONG) {
      return {
        tweet: formatStrategicArticleText({
          focus: params.context.focus,
          title: params.outline?.title,
          hook: params.outline?.hook,
          body: params.outline?.body,
          cta: params.outline?.cta,
          humanized: params.humanized
        }),
        variants: []
      };
    }

    if (params.type === GenerationType.THREAD) {
      const thread = formatThreadPosts({
        focus: params.context.focus,
        hook: params.outline?.hook,
        body: params.outline?.body,
        cta: params.outline?.cta,
        humanized: params.humanized
      });

      return {
        tweet: thread.join('\n\n'),
        thread,
        variants: []
      };
    }

    const merged = composePublishReadyTweet({
      focus: params.context.focus,
      hook: params.outline?.hook?.trim(),
      cta: params.outline?.cta?.trim(),
      humanized: sanitizeGeneratedText(params.humanized, params.context.format)
    });

    const concise = tightenTweetForEngagement(
      merged
        .replace(/。+/g, '。')
        .replace(/欢迎留言.*$/, params.outline?.cta?.trim() || '你现在最想先改的是开头、例子，还是结尾？'),
      250,
      params.context.focus
    );

    const strategic = tightenTweetForEngagement(
      `${merged.replace(/[。！？!?]+$/u, '')}。先把判断讲清楚，再补一个真实例子。`,
      250,
      params.context.focus
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

  private get routingProfile(): ModelRoutingProfile {
    return resolveModelRoutingProfile();
  }

  private async resolveDynamicCostGuard(params: {
    userId: string;
    plan: SubscriptionPlan;
    trialMode: boolean;
  }) {
    if (this.routingProfile === 'test_high') {
      return {
        maxPrice: undefined,
        budgetRatio: 0,
        conservativeMode: false
      };
    }

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
    const format = this.contentFormatFromGenerationType(type);
    const base = type === GenerationType.LONG ? this.scoreArticleQuality(text) : this.scoreTweetQuality(text);
    const strategy = buildQualitySignalReport(text, format);

    const readability = clampPercent(
      base.readability * 0.45 + strategy.conversationality * 0.22 + strategy.humanLikeness * 0.18 + strategy.structuralReadability * 0.15
    );
    const density = clampPercent(
      base.density * 0.18 + strategy.specificity * 0.3 + strategy.evidence * 0.28 + strategy.visualizability * 0.12 + strategy.derivativeReadiness * 0.12
    );
    const platformFit = clampPercent(
      base.platformFit * 0.35 +
        strategy.hookStrength * 0.25 +
        strategy.ctaNaturalness * 0.15 +
        (100 - strategy.antiPatternPenalty) * 0.25
    );
    const aiTrace = clampPercent(base.aiTrace * 0.5 + (100 - strategy.antiPatternPenalty) * 0.5);
    const total = clampPercent(readability * 0.24 + density * 0.26 + platformFit * 0.3 + aiTrace * 0.2);

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
          providerType: providerTypeFromModelProvider(params.routed.provider),
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
    maxPrice?: PriceGuard;
    eventType: UsageEventType;
    taskType: RouterTaskType;
    contentFormat?: RoutingContentFormat;
    promptMessages: ChatMessage[];
    validator: (value: unknown) => T | null;
    schemaHint: string;
  }): Promise<{ data: T; routed: RoutedChatResult; raw: string }> {
    const first = await this.modelGateway.chatWithRouting(params.promptMessages, {
      taskType: params.taskType,
      contentFormat: params.contentFormat,
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

    const retry = await this.modelGateway.chatWithRouting(retryMessages, {
      taskType: params.taskType,
      contentFormat: params.contentFormat,
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
    const sourceShape = String(data.sourceShape ?? '').trim() || undefined;
    const bestEvidenceSlot = String(data.bestEvidenceSlot ?? '').trim() || undefined;
    const visualizablePoints = normalizeStringList(data.visualizablePoints, 6);
    const postStructureRecommendation = String(data.postStructureRecommendation ?? '').trim() || undefined;
    return {
      researchPoints,
      hookCandidates,
      angleSummary,
      sourceShape,
      bestEvidenceSlot,
      visualizablePoints: visualizablePoints.length > 0 ? visualizablePoints : undefined,
      postStructureRecommendation
    };
  }

  private validateOutlineStep(value: unknown): OutlineStepPayload | null {
    if (!value || typeof value !== 'object') return null;
    const data = value as Record<string, unknown>;
    const title = String(data.title ?? '').trim();
    const hook = String(data.hook ?? '').trim();
    const body = normalizeStringList(data.body, 6);
    const cta = String(data.cta ?? '').trim();
    if (!title || !hook || body.length < 2 || !cta) return null;
    const evidencePlan = normalizeStringList(data.evidencePlan, 6);
    const visualPlan = normalizeStringList(data.visualPlan, 6);
    const derivativeHints = normalizeStringList(data.derivativeHints, 6);
    return {
      title,
      hook,
      body,
      cta,
      evidencePlan: evidencePlan.length > 0 ? evidencePlan : undefined,
      visualPlan: visualPlan.length > 0 ? visualPlan : undefined,
      derivativeHints: derivativeHints.length > 0 ? derivativeHints : undefined
    };
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
        contentProjectId: input.contentProjectId ?? null,
        prompt: resolved.prompt,
        type: input.type ?? GenerationType.TWEET,
        language: input.language ?? 'zh',
        style,
        status: GenerationStatus.RUNNING,
        visualRequest: input.visualRequest ? normalizeVisualRequest(input.visualRequest, input.type === GenerationType.LONG ? 'article' : input.type === GenerationType.THREAD ? 'thread' : 'tweet') : undefined,
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
    let visualPlan: VisualPlan | null = null;
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
    const userIntent = deriveIntentFromPrompt(prompt);
    const intentFocus = deriveIntentFocus(prompt);
    const withImageRequested = /需要配图：\s*yes/iu.test(prompt);
    const sourceCapture = await this.sourceCapture.captureFromIntent({ runId: generationId, intent: userIntent });
    const sourcePromptContext = sourceCapture.sourceContext
      ? `已抓取并清洗的外部来源（只可依据这些内容补充最新信息）：\n${sourceCapture.sourceContext}`
      : sourceCapture.sourceRequired && sourceCapture.sourceStatus !== 'ready'
        ? `外部来源状态：${this.sourceGateNotes(sourceCapture).join('；') || '用户意图需要最新信息，但没有可用来源；不要编造最新事实。'}`
        : '外部来源状态：本次不需要额外联网来源。';
    const sourceGateInput = {
      sourceRequired: sourceCapture.sourceRequired,
      sourceStatus: sourceCapture.sourceStatus,
      sourceHardFails: sourceCapture.hardFails
    } as const;
    const language = gen.language;
    const styleAnalysis = (() => {
      if (!gen.style) return null;
      try {
        return JSON.parse(gen.style) as unknown;
      } catch {
        return gen.style;
      }
    })();
    const strategyContext = this.contentBenchmark.buildBenchmarkContext({
      intent: userIntent,
      format: this.contentFormatFromGenerationType(gen.type),
      language,
      styleAnalysis
    });
    const visualRequest = normalizeVisualRequest((gen.visualRequest as VisualRequest | null) ?? null, strategyContext.format);
    const strategyPromptContext = renderStrategyPromptContext(strategyContext);
    const benchmarkPromptContext = this.contentBenchmark.buildPromptContext({
      format: strategyContext.format,
      focus: strategyContext.focus
    });
    if (sourceCapture.sourceRequired && sourceCapture.sourceStatus !== 'ready') {
      const startedAt = new Date();
      const researchContent = JSON.stringify({
        researchPoints: ['需要可靠来源后再生成。'],
        hookCandidates: [],
        angleSummary: '这次请求涉及最新事实，但当前没有可用可靠来源。DraftOrbit 已停止生成，避免编造。',
        sourceShape: sourceCapture.sourceStatus,
        bestEvidenceSlot: '请粘贴来源 URL 或配置搜索 provider。',
        visualizablePoints: [],
        postStructureRecommendation: '补充来源后再生成。'
      } satisfies ResearchStepPayload);
      yield { step: StepName.HOTSPOT, status: 'running' };
      await this.prisma.db.generationStep.update({
        where: { generationId_step: { generationId, step: StepName.HOTSPOT } },
        data: {
          status: StepStatus.DONE,
          startedAt,
          completedAt: new Date(),
          content: researchContent
        }
      });
      yield { step: StepName.HOTSPOT, status: 'done', content: researchContent };

      const pkg = buildSourceBlockedPackageResult({
        format: strategyContext.format,
        focus: strategyContext.focus,
        sourceCapture,
        routingProfile: this.routingProfile,
        trialMode,
        budgetRatio,
        conservativeMode
      });
      const packageContent = JSON.stringify(pkg);
      const packageStartedAt = new Date();
      await this.prisma.db.generationStep.update({
        where: { generationId_step: { generationId, step: StepName.PACKAGE } },
        data: {
          status: StepStatus.DONE,
          startedAt: packageStartedAt,
          completedAt: new Date(),
          content: packageContent
        }
      });
      await this.prisma.db.generation.update({
        where: { id: generationId },
        data: { status: GenerationStatus.DONE, result: pkg as object }
      });
      yield { step: StepName.PACKAGE, status: 'done', content: packageContent };
      return;
    }
    if (outlinePayload) {
      const restoredOutline = outlinePayload as OutlineStepPayload;
      visualPlan = this.visualPlanning.buildPlan({
        format: strategyContext.format,
        focus: strategyContext.focus,
        text: [restoredOutline.title, restoredOutline.hook, ...restoredOutline.body].join('。'),
        outline: restoredOutline,
        visualRequest
      });
    }
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
            researchPayload = this.buildFastResearchPayload(strategyContext);
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
              contentFormat: this.routingFormatHint({ format: strategyContext.format, visualRequest }),
              schemaHint:
                '{"researchPoints":["..."],"hookCandidates":["..."],"angleSummary":"..."}',
              validator: (value) => this.validateResearchStep(value),
              promptMessages: [
                {
                  role: 'system',
                  content:
                    '你是中文 X 内容策略编辑。请输出严格 JSON，不要 markdown，不要额外解释。先判断受众、核心主张、张力点、证据计划、回复驱动。'
                },
                {
                  role: 'user',
                  content: [
                    `原始需求：${userIntent}`,
                    `聚焦主题：${intentFocus}`,
                    sourcePromptContext,
                    strategyPromptContext,
                    benchmarkPromptContext,
                    `语言：${language}`,
                    '请产出：2-5 个 researchPoints（受众假设 / 核心判断 / 张力点 / 证据计划 / 回复驱动）、2-5 个 hookCandidates、一个 angleSummary，并尽量补 sourceShape/bestEvidenceSlot/visualizablePoints/postStructureRecommendation。避免空泛运营套话。'
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
            outlinePayload = this.buildFastOutlinePayload(strategyContext, researchPayload);
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
              contentFormat: this.routingFormatHint({ format: strategyContext.format, visualRequest }),
              schemaHint: '{"title":"...","hook":"...","body":["..."],"cta":"..."}',
              validator: (value) => this.validateOutlineStep(value),
              promptMessages: [
                {
                  role: 'system',
                  content:
                    '输出严格 JSON，字段固定为 title/hook/body/cta。tweet 要给出单条结构，thread 要给出可逐条推进的展开顺序，article 要给出 3-5 个真正能写成小节的 body 要点。'
                },
                {
                  role: 'user',
                  content: [
                    `原始需求：${userIntent}`,
                    `聚焦主题：${intentFocus}`,
                    sourcePromptContext,
                    strategyPromptContext,
                    benchmarkPromptContext,
                    `研究角度：${researchPayload.researchPoints.join(' | ')}`,
                    `候选钩子：${researchPayload.hookCandidates.join(' | ')}`,
                    researchPayload.bestEvidenceSlot ? `最佳证据位：${researchPayload.bestEvidenceSlot}` : null,
                    researchPayload.visualizablePoints?.length ? `可视化位点：${researchPayload.visualizablePoints.join(' | ')}` : null,
                    '请生成可直接用于 X 的结构化大纲。不要把正文方向写成“流程万能论”或“欢迎留言讨论”式空结尾，并尽量补 evidencePlan/visualPlan/derivativeHints。'
                  ]
                    .filter((item): item is string => Boolean(item))
                    .join('\n')
                }
              ]
            });

            outlinePayload = result.data;
            content = JSON.stringify(result.data);
          }
          visualPlan = this.visualPlanning.buildPlan({
            format: strategyContext.format,
            focus: strategyContext.focus,
            text: [outlinePayload.title, outlinePayload.hook, ...outlinePayload.body].join('。'),
            outline: outlinePayload,
            visualRequest
          });
        } else if (stepName === StepName.DRAFT) {
          if (!outlinePayload) {
            throw new Error('缺少 outline 数据，无法继续生成 draft');
          }

          const draftMessages: ChatMessage[] = [
            {
              role: 'system',
              content:
                gen.type === GenerationType.LONG
                  ? `你是 X 长文编辑。${styleInjection} 输出 JSON。primaryTweet 字段必须是适合 X 文章的完整长文初稿，包含标题、导语、3-5 个小节、结尾行动句；不要加 hashtag；每节都要推进一个具体意思，并补一个最常见场景、反例或 before/after；thread 留空即可。`
                  : gen.type === GenerationType.THREAD
                    ? `你是中文 X thread 写作专家。${styleInjection} 输出 JSON。首条先给强判断和继续读的理由；后续每条只推进一个新信息；不要写“下面我只拆”“讲清为什么”这种解释腔。`
                    : `你是中文 X 平台写作专家。${styleInjection} 输出 JSON。优先写 2-3 句内的紧凑 tweet：先给判断，再给一个具体例子或证据，最后再给动作或问题；不要把同一个判断解释两遍。`
            },
            {
              role: 'user',
              content: [
                `语言：${language}`,
                `原始需求：${userIntent}`,
                `聚焦主题：${intentFocus}`,
                sourcePromptContext,
                strategyPromptContext,
                benchmarkPromptContext,
                `标题：${outlinePayload.title}`,
                `Hook：${outlinePayload.hook}`,
                `Body：${outlinePayload.body.join(' / ')}`,
                `CTA：${outlinePayload.cta}`,
                outlinePayload.evidencePlan?.length ? `证据计划：${outlinePayload.evidencePlan.join(' / ')}` : null,
                outlinePayload.visualPlan?.length ? `图文规划：${outlinePayload.visualPlan.join(' / ')}` : null,
                outlinePayload.derivativeHints?.length ? `导出提示：${outlinePayload.derivativeHints.join(' / ')}` : null,
                `类型：${gen.type}`,
                gen.type === GenerationType.LONG
                  ? '要求：primaryTweet 必须是 X 文章格式正文；不要写成 tweet/thread 的短格式；每个小节都至少补一个具体场景、反例或动作。'
                  : gen.type === GenerationType.THREAD
                    ? '要求：primaryTweet 是首条，thread 必须返回 4-7 条内、逐条推进的数组；不要出现“下面我只拆”“讲清为什么”这类解释腔。'
                    : '要求：primaryTweet 必须可发布，像真人在 X 上说话；默认控制在 90-180 个中文字符，极限不超过 220；不要把同一个判断解释两遍；thread 可选。'
              ]
                .filter((item): item is string => Boolean(item))
                .join('\n')
            }
          ];

          try {
            const result = await this.generateJsonStep<DraftStepPayload>({
              userId,
              workspaceId: gen.workspaceId,
              generationId,
              trialMode,
              maxPrice,
              eventType: UsageEventType.GENERATION,
              taskType: 'draft',
              contentFormat: this.routingFormatHint({ format: strategyContext.format, visualRequest }),
              schemaHint: '{"primaryTweet":"...","thread":["..."]}',
              validator: (value) => this.validateDraftStep(value),
              promptMessages: draftMessages
            });

            draftPayload = result.data;
            draftRouted = result.routed;
            content = JSON.stringify(result.data);
          } catch {
            let fallbackRouted: RoutedChatResult | null = null;
            let fallbackText = '';

            try {
              fallbackRouted = await this.modelGateway.chatWithRouting(
                [
                  ...draftMessages,
                  {
                    role: 'system',
                    content:
                      gen.type === GenerationType.LONG
                        ? '上一轮结构化输出失败。现在改为输出纯文本长文初稿，保留标题、导语、小节与结尾，不要输出 JSON；每节至少补一个真实场景、反例或动作。'
                        : gen.type === GenerationType.THREAD
                          ? '上一轮结构化输出失败。现在改为输出纯文本 thread 草稿：先给首条判断，再把展开顺序写自然，不要输出 JSON；不要写“下面我只拆”“讲清为什么”这种解释腔。'
                          : '上一轮结构化输出失败。现在改为输出纯文本 tweet 草稿，不要输出 JSON；默认控制在 90-180 个中文字符，极限不超过 220。'
                  }
                ],
                {
                  taskType: 'draft',
                  contentFormat: this.routingFormatHint({ format: strategyContext.format, visualRequest }),
                  trialMode,
                  maxPrice,
                  temperature: 0.6
                }
              );

              await this.recordUsage({
                userId,
                workspaceId: gen.workspaceId,
                generationId,
                eventType: UsageEventType.GENERATION,
                routed: fallbackRouted,
                trialMode
              });

              fallbackText = sanitizeGeneratedText(
                fallbackRouted.content.trim(),
                this.contentFormatFromGenerationType(gen.type)
              );
            } catch {
              fallbackRouted = null;
            }

            if (!fallbackRouted && (this.routingProfile === 'test_high' || !this.heuristicFallbackAllowed)) {
              try {
                const compactPrompt =
                  gen.type === GenerationType.THREAD
                    ? `4条thread。题:${strategyContext.focus}。每条短。要:判断/周一场景/动作/问题。禁:给我一条/更像真人/下面拆。`
                    : gen.type === GenerationType.LONG
                      ? `短文提纲。题:${strategyContext.focus}。要:标题/导语/3节/结尾；每节带场景。禁:方法论标题。`
                      : `短推。题:${strategyContext.focus}。写:判断→周一/周三场景→问题。禁:给我一条/更像真人/欢迎留言。`;
                const compactRouted = await this.modelGateway.chatWithRouting(
                  [
                    { role: 'user', content: compactPrompt }
                  ],
                  {
                    taskType: 'draft',
                    contentFormat: this.routingFormatHint({ format: strategyContext.format, visualRequest }),
                    trialMode,
                    forceHighTier: true,
                    maxPrice,
                    maxTokens: 32,
                    temperature: 0.55
                  }
                );

                fallbackRouted = compactRouted;
                try {
                  await this.recordUsage({
                    userId,
                    workspaceId: gen.workspaceId,
                    generationId,
                    eventType: UsageEventType.GENERATION,
                    routed: compactRouted,
                    trialMode
                  });
                } catch {
                  // Keep the real routed result for quality/routing evidence even if usage logging is temporarily unavailable.
                }

                const parsedCompact = this.parseJson(compactRouted.content, (value) => this.validateDraftStep(value));
                fallbackText = sanitizeGeneratedText(
                  parsedCompact?.primaryTweet ?? compactRouted.content.trim(),
                  this.contentFormatFromGenerationType(gen.type)
                );
              } catch {
                fallbackRouted = null;
              }
            }

            draftPayload = buildDraftPayloadFallback({
              format: this.contentFormatFromGenerationType(gen.type),
              focus: strategyContext.focus,
              title: outlinePayload.title,
              hook: outlinePayload.hook,
              body: outlinePayload.body,
              cta: outlinePayload.cta,
              draftPrimaryTweet: fallbackText || undefined
            });
            draftRouted = fallbackRouted ?? this.buildHeuristicRoutedResult();
            content = JSON.stringify(draftPayload);
          }
        } else if (stepName === StepName.HUMANIZE) {
          if (!draftPayload) throw new Error('缺少 draft 数据，无法继续 humanize');

          try {
            const result = await this.generateJsonStep<HumanizeStepPayload>({
              userId,
              workspaceId: gen.workspaceId,
              generationId,
              trialMode,
              maxPrice,
              eventType: UsageEventType.NATURALIZATION,
              taskType: 'humanize',
              contentFormat: this.routingFormatHint({ format: strategyContext.format, visualRequest }),
              schemaHint: '{"humanized":"...","aiTraceRisk":0.12}',
              validator: (value) => this.validateHumanizeStep(value),
              promptMessages: [
                {
                  role: 'system',
                  content:
                    gen.type === GenerationType.LONG
                      ? '你是中文母语长文编辑。去 AI 味但不改变观点，保留标题、导语、小节与换行结构，补足例子感和可 skim 的短段落，返回 JSON。'
                      : gen.type === GenerationType.THREAD
                        ? '你是中文母语编辑。去 AI 味但不改变观点，保留观点、例子和对话感；删掉解释腔桥段，像真人在连续发串推，返回 JSON。'
                        : '你是中文母语编辑。去 AI 味但不改变观点，保留观点、例子和对话感；默认控制在 90-180 个中文字符，极限不超过 220，返回 JSON。'
                },
                {
                  role: 'user',
                  content: [
                    strategyPromptContext,
                    benchmarkPromptContext,
                    sourcePromptContext,
                    `原稿：${draftPayload.primaryTweet}`,
                    '请输出 humanized 文案与 aiTraceRisk(0~1)。'
                  ].join('\n')
                }
              ]
            });

            humanizedPayload = result.data;
            humanizeRouted = result.routed;
            content = JSON.stringify(result.data);
          } catch (error) {
            humanizedPayload = {
              humanized:
                gen.type === GenerationType.LONG
                  ? buildArticleHumanizedFallback({
                      title: outlinePayload?.title,
                      hook: outlinePayload?.hook,
                      body: outlinePayload?.body,
                      cta: outlinePayload?.cta,
                      draftPrimaryTweet: draftPayload.primaryTweet
                    })
                  : gen.type === GenerationType.THREAD
                    ? buildThreadHumanizedFallback({
                        hook: outlinePayload?.hook,
                        body: outlinePayload?.body,
                        cta: outlinePayload?.cta,
                        draftPrimaryTweet: draftPayload.primaryTweet
                      })
                    : buildTweetHumanizedFallback({
                        focus: strategyContext.focus,
                        hook: outlinePayload?.hook,
                        cta: outlinePayload?.cta,
                        draftPrimaryTweet: draftPayload.primaryTweet
                      }),
              aiTraceRisk: 0.38
            };
            humanizeRouted = draftRouted ?? this.buildHeuristicRoutedResult();
            content = JSON.stringify(humanizedPayload);
          }
        } else if (stepName === StepName.IMAGE) {
          if (!humanizedPayload) throw new Error('缺少 humanized 数据，无法继续 media');
          if (!visualPlan) {
            visualPlan = this.visualPlanning.buildPlan({
              format: strategyContext.format,
              focus: strategyContext.focus,
              text: humanizedPayload.humanized,
              outline: outlinePayload,
              visualRequest
            });
          }

          if (this.fastPathEnabled) {
            mediaPayload = this.buildFastMediaPayload(humanizedPayload.humanized, visualPlan);
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
              contentFormat: this.routingFormatHint({ format: strategyContext.format, visualRequest }),
              schemaHint:
                '{"ideas":[{"title":"...","composition":"...","keywords":["..."]}],"searchKeywords":["..."]}',
              validator: (value) => this.validateMediaStep(value),
              promptMessages: [
                {
                  role: 'system',
                  content: '你是内容配图策划。输出严格 JSON。配图要服务于观点和例子，不要做空泛概念图。'
                },
                {
                  role: 'user',
                  content: [
                    strategyPromptContext,
                    benchmarkPromptContext,
                    sourcePromptContext,
                    `文案：${humanizedPayload.humanized}`,
                    visualPlan
                      ? `内部图文规划：${visualPlan.items.map((item) => `${item.kind}:${item.cue}`).join(' | ')}`
                      : null,
                    '请给出 2-3 个配图创意，每个包含 title/composition/keywords。'
                  ]
                    .filter((item): item is string => Boolean(item))
                    .join('\n')
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
          if (!visualPlan) {
            visualPlan = this.visualPlanning.buildPlan({
              format: strategyContext.format,
              focus: strategyContext.focus,
              text: humanizedPayload.humanized,
              outline: outlinePayload,
              visualRequest
            });
          }

          let packagePayload: PackageStepPayload;
          if (this.fastPathEnabled || gen.type === GenerationType.LONG) {
            packagePayload = this.buildFastPackagePayload({
              humanized: humanizedPayload.humanized,
              outline: outlinePayload,
              media: mediaPayload,
              type: gen.type,
              context: strategyContext
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
              contentFormat: this.routingFormatHint({ format: strategyContext.format, visualRequest }),
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
                const thread = normalizeStringList(data.thread, 10);
                return {
                  tweet,
                  thread: thread.length > 0 ? thread : undefined,
                  variants
                };
              },
              promptMessages: [
                {
                  role: 'system',
                  content:
                    gen.type === GenerationType.THREAD
                        ? '你是 X thread 发布编辑。输出严格 JSON。tweet 是整组串推的总预览文本，thread 是逐条可发数组；不要写空洞编号，也不要写“下面我只拆”“讲清为什么”这类解释腔。'
                        : '你是发布编辑。输出严格 JSON。tweet 要更紧凑、更像真人说话，默认控制在 90-180 个中文字符，极限不超过 220；不要把同一个判断解释两遍。'
                },
                {
                  role: 'user',
                  content: [
                    `原始需求：${userIntent}`,
                    strategyPromptContext,
                    benchmarkPromptContext,
                    sourcePromptContext,
                    `主文案：${humanizedPayload.humanized}`,
                    `结构：${outlinePayload?.body.join(' | ') ?? ''}`,
                    `配图关键词：${mediaPayload.searchKeywords.join(' | ')}`,
                    visualPlan
                      ? `内部图文规划：${visualPlan.items.map((item) => `${item.kind}:${item.cue}`).join(' | ')}`
                      : null,
                    gen.type === GenerationType.THREAD
                        ? '输出最终 thread：tweet 是总览文案，thread 是逐条数组；variants 可为空；删掉解释腔桥段。'
                        : '输出最终 tweet 和不少于2条 variants（不同语气）；tweet 默认控制在 90-180 个中文字符，极限不超过 220。'
                  ]
                    .filter((item): item is string => Boolean(item))
                    .join('\n')
                }
              ]
            });

            packagePayload = packageResponse.data;
            packageRouted = packageResponse.routed;
          }

          if (gen.type === GenerationType.LONG) {
            packagePayload = {
              tweet: formatStrategicArticleText({
                focus: strategyContext.focus,
                title: outlinePayload?.title,
                hook: outlinePayload?.hook,
                body: outlinePayload?.body,
                cta: outlinePayload?.cta,
                humanized: humanizedPayload.humanized
              }),
              variants: []
            };
          }

          let finalThread =
            gen.type === GenerationType.THREAD
              ? formatThreadPosts({
                  focus: strategyContext.focus,
                  hook: outlinePayload?.hook,
                  body: outlinePayload?.body,
                  cta: outlinePayload?.cta,
                  humanized:
                    packagePayload.thread?.join('\n\n').trim() || humanizedPayload.humanized
                })
                  .map((item) => sanitizeGeneratedText(item, 'thread'))
                  .filter(Boolean)
              : undefined;

          let finalTweet = sanitizeGeneratedText(
            finalThread?.length ? finalThread.join('\n\n') : packagePayload.tweet.trim(),
            strategyContext.format
          );
          if (gen.type === GenerationType.TWEET) {
            finalTweet = composePublishReadyTweet({
              focus: strategyContext.focus,
              hook: outlinePayload?.hook?.trim(),
              cta: outlinePayload?.cta?.trim(),
              humanized: finalTweet
            });
          }
          const hardFailFlags = detectContentAntiPatterns(finalTweet, strategyContext.focus);
          let quality = this.scoreGeneratedContent(finalTweet, gen.type);
          let qualitySignals = buildQualitySignalReport(finalTweet, strategyContext.format);
          const tweetTooLong = gen.type === GenerationType.TWEET && [...finalTweet].length > 280;
          const articleTitle = finalTweet.split('\n')[0]?.trim() ?? '';
          const articleNeedsTitleRewrite =
            gen.type === GenerationType.LONG && /(先把|再让|讲清楚|节奏|动作)/u.test(articleTitle);
          const threadNeedsStructureRewrite =
            gen.type === GenerationType.THREAD && (!finalThread || finalThread.length < 4);
          const hardFailRewriteFlags = ['prompt_leakage', 'object_leakage', 'random_suffix', 'meta_pollution', 'garbage_hashtag'];
          const shouldCritiquePass =
            this.routingProfile === 'test_high' ||
            tweetTooLong ||
            quality.total < QUALITY_THRESHOLD ||
            articleNeedsTitleRewrite ||
            threadNeedsStructureRewrite ||
            hardFailFlags.some((flag) => hardFailRewriteFlags.includes(flag));

          if (shouldCritiquePass) {
            const formatInstruction =
              gen.type === GenerationType.THREAD
                ? '把它改成 4-6 条真正可发的 thread。第 1 条负责判断和继续读理由，第 2 条必须给具体场景或反例，第 3 条给动作/拆解，最后一条自然收束或提问。不要输出教程口吻。'
                : gen.type === GenerationType.LONG
                  ? '把它改成真正可读的 X 长文：标题、导语、3-4 节、结尾。标题要像真人文章标题，不要像方法论提纲；每节都要补一个具体场景、反例或动作。'
                  : '把它改成更利落的 tweet：默认 90-180 个中文字符，结构固定为判断→具体例子/场景→自然问题。';
            const sceneContract =
              gen.type === GenerationType.THREAD
                ? '禁止把第 2 条写成抽象建议，必须出现真实场景、用户原话、第一条/第一屏、before-after 之一。'
                : gen.type === GenerationType.LONG
                  ? '禁止章节只有抽象判断；每一节至少要给一个真实摩擦、反例、before-after 或具体动作。'
                  : '禁止把第 2 句写成“先把/删掉/换成”这种抽象指导；必须给一个真实场景、坏例子或 before-after。';
            try {
              const rewrite = await this.modelGateway.chatWithRouting(
                [
                  {
                    role: 'system',
                    content:
                      '你是 X 平台写作批评与重写专家。先在脑中批评最弱的一句，再直接输出重写后的纯文本成品，不要输出分析过程。'
                  },
                  {
                    role: 'user',
                    content: [
                      strategyPromptContext,
                      `请在不改变观点的前提下重写以下文案，目标质量分 >= ${QUALITY_THRESHOLD}。`,
                      `体裁合同：${formatInstruction}`,
                      `场景合同：${sceneContract}`,
                      `当前问题：${[
                        ...(hardFailFlags.length > 0 ? hardFailFlags : ['hook 不够强或不够具体']),
                        ...(articleNeedsTitleRewrite ? ['标题仍然像方法论提纲'] : []),
                        ...(threadNeedsStructureRewrite ? ['thread 没有稳定拆成 4-6 条'] : []),
                        ...(tweetTooLong ? ['长度超出单条推文限制'] : [])
                      ].join('、')}`,
                      `文案：${finalTweet}`
                    ].join('\n')
                  }
                ],
                {
                  taskType: 'package',
                  contentFormat: this.routingFormatHint({ format: strategyContext.format, visualRequest }),
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
                let rewrittenThread = finalThread;
                const cleanedRewrite =
                  gen.type === GenerationType.TWEET
                    ? composePublishReadyTweet({
                        focus: strategyContext.focus,
                        hook: outlinePayload?.hook?.trim(),
                        cta: outlinePayload?.cta?.trim(),
                        humanized: enforceTweetLength(sanitizeGeneratedText(rewritten, strategyContext.format))
                      })
                    : gen.type === GenerationType.THREAD
                      ? (() => {
                          rewrittenThread = formatThreadPosts({
                            focus: strategyContext.focus,
                            hook: outlinePayload?.hook,
                            body: outlinePayload?.body,
                            cta: outlinePayload?.cta,
                            humanized: rewritten
                          });
                          return sanitizeGeneratedText(rewrittenThread.join('\n\n'), strategyContext.format);
                        })()
                      : sanitizeGeneratedText(
                          formatStrategicArticleText({
                            focus: strategyContext.focus,
                            title: outlinePayload?.title,
                            hook: outlinePayload?.hook,
                            body: outlinePayload?.body,
                            cta: outlinePayload?.cta,
                            humanized: rewritten
                          }),
                          strategyContext.format
                        );
                const rewriteQuality = this.scoreGeneratedContent(cleanedRewrite, gen.type);
                if (this.routingProfile === 'test_high' || tweetTooLong || rewriteQuality.total >= quality.total) {
                  finalTweet = cleanedRewrite;
                  finalThread = rewrittenThread;
                  quality = rewriteQuality;
                  qualitySignals = buildQualitySignalReport(finalTweet, strategyContext.format);
                }
              }
            } catch {
              packageRouted = packageRouted ?? humanizeRouted ?? draftRouted ?? this.buildHeuristicRoutedResult();
            }
          }

          if (gen.type === GenerationType.TWEET && [...finalTweet].length > 280) {
            finalTweet = enforceTweetLength(finalTweet);
            quality = this.scoreGeneratedContent(finalTweet, gen.type);
            qualitySignals = buildQualitySignalReport(finalTweet, strategyContext.format);
          }
          const rebuildFinalVisualPlan = () =>
            this.visualPlanning.buildPlan({
              format: strategyContext.format,
              focus: strategyContext.focus,
              text: finalTweet,
              outline: outlinePayload
                ? {
                    title: outlinePayload.title,
                    hook: outlinePayload.hook,
                    body: outlinePayload.body
                  }
                : null,
              visualRequest
            });

          let finalVisualPlan = await this.buildBackgroundVisualPlan({
            userId,
            workspaceId: gen.workspaceId,
            generationId,
            trialMode,
            maxPrice,
            format: strategyContext.format,
            focus: strategyContext.focus,
            text: finalTweet,
            outline: outlinePayload,
            visualRequest,
            contextLines: [strategyPromptContext, benchmarkPromptContext, sourcePromptContext].filter(Boolean)
          });
          let qualityGate = buildContentQualityGate({
            format: strategyContext.format,
            focus: strategyContext.focus,
            text: finalTweet,
            qualitySignals,
            visualPlan: finalVisualPlan,
            ...sourceGateInput
          });
          qualityGate = this.mergeGateHardFails({
            qualityGate,
            hardFails: sourceCapture.hardFails,
            judgeNotes: this.sourceGateNotes(sourceCapture)
          });
          qualityGate = this.enforceRealModelGate({ routed: packageRouted, qualityGate });
          let sourceGroundedFallbackUsed = false;

          if (!qualityGate.safeToDisplay && this.qualityRepairEnabled) {
            for (let attempt = 0; attempt < 2 && !qualityGate.safeToDisplay; attempt += 1) {
              try {
                const gateRewrite = await this.modelGateway.chatWithRouting(
                  [
                    {
                      role: 'system',
                      content:
                        '你是 DraftOrbit 最终质量门的重写专家。只输出一版可直接发布的成品，不输出解释；禁止复述用户 prompt，禁止空泛建议，必须包含真实场景或 before/after。'
                    },
                    {
                      role: 'user',
                      content: [
                        strategyPromptContext,
                        `体裁：${strategyContext.format}`,
                        `真实主题：${strategyContext.focus}`,
                        `当前质量门失败：${qualityGate.hardFails.join('、')}`,
                        gen.type === GenerationType.LONG && hasRepairableArticleStructureFail(qualityGate)
                          ? '该失败属于长文结构失败：必须改成标题、导语、3 个有具体动作/场景的小节、结尾；禁止输出写作过程提示或方法论脚手架。'
                          : null,
                        qualityGate.judgeNotes.length ? `judge notes：${qualityGate.judgeNotes.join('；')}` : null,
                        '请重写为能通过质量门的最终稿：',
                        finalTweet
                      ]
                        .filter((item): item is string => Boolean(item))
                        .join('\n')
                    }
                  ],
                  {
                    taskType: 'package',
                    contentFormat: this.routingFormatHint({ format: strategyContext.format, visualRequest }),
                    trialMode,
                    forceHighTier: true,
                    maxPrice,
                    temperature: 0.45
                  }
                );

                const rewritten = gateRewrite.content.trim();
                packageRouted = gateRewrite;
                await this.recordUsage({
                  userId,
                  workspaceId: gen.workspaceId,
                  generationId,
                  eventType: UsageEventType.GENERATION,
                  routed: gateRewrite,
                  trialMode
                });

                if (!rewritten) break;

                if (gen.type === GenerationType.TWEET) {
                  finalTweet = composePublishReadyTweet({
                    focus: strategyContext.focus,
                    hook: outlinePayload?.hook?.trim(),
                    cta: outlinePayload?.cta?.trim(),
                    humanized: enforceTweetLength(sanitizeGeneratedText(rewritten, strategyContext.format))
                  });
                } else if (gen.type === GenerationType.THREAD) {
                  finalThread = formatThreadPosts({
                    focus: strategyContext.focus,
                    hook: outlinePayload?.hook,
                    body: outlinePayload?.body,
                    cta: outlinePayload?.cta,
                    humanized: rewritten
                  });
                  finalTweet = sanitizeGeneratedText(finalThread.join('\n\n'), strategyContext.format);
                } else {
                  finalTweet = sanitizeGeneratedText(
                    formatStrategicArticleText({
                      focus: strategyContext.focus,
                      title: outlinePayload?.title,
                      hook: outlinePayload?.hook,
                      body: outlinePayload?.body,
                      cta: outlinePayload?.cta,
                      humanized: rewritten
                    }),
                    strategyContext.format
                  );
                }

                quality = this.scoreGeneratedContent(finalTweet, gen.type);
                qualitySignals = buildQualitySignalReport(finalTweet, strategyContext.format);
                finalVisualPlan = rebuildFinalVisualPlan();
                qualityGate = buildContentQualityGate({
                  format: strategyContext.format,
                  focus: strategyContext.focus,
                  text: finalTweet,
                  qualitySignals,
                  visualPlan: finalVisualPlan,
                  ...sourceGateInput
                });
                qualityGate = this.mergeGateHardFails({
                  qualityGate,
                  hardFails: sourceCapture.hardFails,
                  judgeNotes: this.sourceGateNotes(sourceCapture)
                });
                qualityGate = this.enforceRealModelGate({ routed: packageRouted, qualityGate });
              } catch {
                packageRouted = packageRouted ?? humanizeRouted ?? draftRouted ?? this.buildHeuristicRoutedResult();
                break;
              }
            }
          }

          if (!qualityGate.safeToDisplay && this.qualityRepairEnabled && gen.type === GenerationType.TWEET) {
            finalTweet = buildTweetHumanizedFallback({
              focus: strategyContext.focus,
              hook: outlinePayload?.hook,
              cta: outlinePayload?.cta,
              draftPrimaryTweet: draftPayload?.primaryTweet || finalTweet
            });
            quality = this.scoreGeneratedContent(finalTweet, gen.type);
            qualitySignals = buildQualitySignalReport(finalTweet, strategyContext.format);
            finalVisualPlan = rebuildFinalVisualPlan();
            qualityGate = buildContentQualityGate({
              format: strategyContext.format,
              focus: strategyContext.focus,
              text: finalTweet,
              qualitySignals,
              visualPlan: finalVisualPlan,
              ...sourceGateInput
            });
            qualityGate = this.mergeGateHardFails({
              qualityGate,
              hardFails: sourceCapture.hardFails,
              judgeNotes: this.sourceGateNotes(sourceCapture)
            });
            qualityGate = this.enforceRealModelGate({ routed: packageRouted, qualityGate });
          }

          if (!qualityGate.safeToDisplay && this.qualityRepairEnabled && gen.type === GenerationType.THREAD) {
            finalThread = formatThreadPosts({
              focus: strategyContext.focus,
              hook: outlinePayload?.hook,
              body: outlinePayload?.body,
              cta: outlinePayload?.cta,
              humanized: ''
            });
            finalTweet = sanitizeGeneratedText(finalThread.join('\n\n'), strategyContext.format);
            quality = this.scoreGeneratedContent(finalTweet, gen.type);
            qualitySignals = buildQualitySignalReport(finalTweet, strategyContext.format);
            finalVisualPlan = rebuildFinalVisualPlan();
            qualityGate = buildContentQualityGate({
              format: strategyContext.format,
              focus: strategyContext.focus,
              text: finalTweet,
              qualitySignals,
              visualPlan: finalVisualPlan,
              ...sourceGateInput
            });
            qualityGate = this.mergeGateHardFails({
              qualityGate,
              hardFails: sourceCapture.hardFails,
              judgeNotes: this.sourceGateNotes(sourceCapture)
            });
            qualityGate = this.enforceRealModelGate({ routed: packageRouted, qualityGate });
          }

          if (
            !qualityGate.safeToDisplay &&
            this.qualityRepairEnabled &&
            gen.type === GenerationType.LONG &&
            !hasSourceBlockedQualityGate(qualityGate)
          ) {
            finalTweet = sanitizeGeneratedText(
              sourceCapture.sourceStatus === 'ready' && sourceCapture.sourceContext
                ? buildSourceGroundedArticleFallback({
                    focus: strategyContext.focus,
                    sourceContext: sourceCapture.sourceContext,
                    cta: outlinePayload?.cta
                  })
                : formatStrategicArticleText({
                    focus: strategyContext.focus,
                    title: outlinePayload?.title,
                    hook: outlinePayload?.hook,
                    body: outlinePayload?.body,
                    cta: outlinePayload?.cta,
                    humanized: ''
                  }),
              strategyContext.format
            );
            quality = this.scoreGeneratedContent(finalTweet, gen.type);
            qualitySignals = buildQualitySignalReport(finalTweet, strategyContext.format);
            finalVisualPlan = rebuildFinalVisualPlan();
            qualityGate = buildContentQualityGate({
              format: strategyContext.format,
              focus: strategyContext.focus,
              text: finalTweet,
              qualitySignals,
              visualPlan: finalVisualPlan,
              ...sourceGateInput
            });
            qualityGate = this.mergeGateHardFails({
              qualityGate,
              hardFails: sourceCapture.hardFails,
              judgeNotes: this.sourceGateNotes(sourceCapture)
            });
            qualityGate = this.enforceRealModelGate({ routed: packageRouted, qualityGate });
          }

          if (
            !qualityGate.safeToDisplay &&
            this.qualityRepairEnabled &&
            sourceCapture.sourceStatus === 'ready' &&
            Boolean(sourceCapture.sourceContext) &&
            !hasSourceBlockedQualityGate(qualityGate)
          ) {
            sourceGroundedFallbackUsed = true;
            if (gen.type === GenerationType.THREAD) {
              finalThread = buildSourceGroundedThreadFallback({
                focus: strategyContext.focus,
                sourceContext: sourceCapture.sourceContext,
                cta: outlinePayload?.cta
              });
              finalTweet = sanitizeGeneratedText(finalThread.join('\n\n'), strategyContext.format);
            } else if (gen.type === GenerationType.LONG) {
              finalThread = undefined;
              finalTweet = sanitizeGeneratedText(
                buildSourceGroundedArticleFallback({
                  focus: strategyContext.focus,
                  sourceContext: sourceCapture.sourceContext,
                  cta: outlinePayload?.cta
                }),
                strategyContext.format
              );
            } else {
              finalThread = undefined;
              finalTweet = buildSourceGroundedTweetFallback({
                focus: strategyContext.focus,
                sourceContext: sourceCapture.sourceContext,
                cta: outlinePayload?.cta
              });
            }
            quality = this.scoreGeneratedContent(finalTweet, gen.type);
            qualitySignals = buildQualitySignalReport(finalTweet, strategyContext.format);
            finalVisualPlan = rebuildFinalVisualPlan();
            qualityGate = buildContentQualityGate({
              format: strategyContext.format,
              focus: strategyContext.focus,
              text: finalTweet,
              qualitySignals,
              visualPlan: finalVisualPlan,
              ...sourceGateInput
            });
            qualityGate = this.mergeGateHardFails({
              qualityGate,
              hardFails: sourceCapture.hardFails,
              judgeNotes: this.sourceGateNotes(sourceCapture)
            });
            qualityGate = this.enforceRealModelGate({ routed: packageRouted, qualityGate });
            if (qualityGate.safeToDisplay) {
              qualityGate = {
                ...qualityGate,
                judgeNotes: [...new Set([...qualityGate.judgeNotes, 'source_grounded_fallback_used'])]
              };
            }
          }

          if (
            sourceGroundedFallbackUsed &&
            !qualityGate.safeToDisplay &&
            sourceCapture.sourceStatus === 'ready' &&
            Boolean(sourceCapture.sourceContext)
          ) {
            qualityGate = markSourceReadyRepairFailed(qualityGate);
          }

          const displayTweet = qualityGate.safeToDisplay ? finalTweet : '';
          const displayThread = qualityGate.safeToDisplay && finalThread?.length ? finalThread : undefined;
          const displayVisualPlan = qualityGate.safeToDisplay ? finalVisualPlan : null;
          const derivativeReadiness = displayVisualPlan
            ? this.derivativeGuidance.buildReadiness({
                format: strategyContext.format,
                text: finalTweet,
                visualPlan: displayVisualPlan
              })
            : null;
          const visualArtifacts =
            qualityGate.safeToDisplay && displayVisualPlan && withImageRequested
              ? await this.baoyuRuntime.generateVisualArtifacts({
                  runId: generationId,
                  format: strategyContext.format,
                  focus: strategyContext.focus,
                  text: finalTweet,
                  visualPlan: displayVisualPlan,
                  withImage: withImageRequested,
                  visualRequest
                })
              : null;
          if (qualityGate.safeToDisplay) {
            const visualGate = buildContentQualityGate({
              format: strategyContext.format,
              focus: strategyContext.focus,
              text: finalTweet,
              qualitySignals,
              visualPlan: displayVisualPlan,
              visualAssets: visualArtifacts?.assets ?? [],
              requireVisualAssets: withImageRequested,
              ...sourceGateInput
            });
            qualityGate = {
              ...qualityGate,
              visualHardFails: visualGate.visualHardFails ?? [],
              judgeNotes: [...new Set([...qualityGate.judgeNotes, ...visualGate.judgeNotes])]
            };
          }
          const runtimeSkills = new Set<BaoyuSkillName>();
          if (sourceCapture.artifacts.length > 0) {
            for (const artifact of sourceCapture.artifacts) {
              if (artifact.kind === 'youtube') runtimeSkills.add('baoyu-youtube-transcript');
              else if (artifact.kind === 'x') runtimeSkills.add('baoyu-danger-x-to-markdown');
              else runtimeSkills.add('baoyu-url-to-markdown');
            }
          }
          if (visualArtifacts) runtimeSkills.add('baoyu-imagine');

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
            tweet: displayTweet,
            thread: displayThread,
            charCount: [...displayTweet].length,
            imageKeywords: qualityGate.safeToDisplay ? mediaPayload.searchKeywords : [],
            variants: packagePayload.variants
              .map((variant) => ({
                tone: variant.tone,
                text: sanitizeGeneratedText(variant.text, strategyContext.format)
              }))
              .filter((variant) => Boolean(variant.text)),
            quality,
            routing: {
              trialMode,
              primaryModel: packageRouted?.modelUsed ?? 'draftorbit/heuristic',
              routingTier: packageRouted?.routingTier ?? 'free_first',
              profile: this.routingProfile,
              provider: packageRouted?.provider
            },
            budget: {
              ratio: Number(budgetRatio.toFixed(4)),
              conservativeMode
            },
            qualitySignals,
            visualPlan: displayVisualPlan,
            visualAssets: visualArtifacts?.assets ?? [],
            sourceArtifacts: sourceCapture.artifacts,
            runtime:
              runtimeSkills.size > 0
                ? this.baoyuRuntime.runtimeMeta([...runtimeSkills])
                : undefined,
            derivativeReadiness,
            qualityGate,
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
