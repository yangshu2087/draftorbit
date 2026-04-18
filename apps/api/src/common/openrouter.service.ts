import { Injectable } from '@nestjs/common';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export type RouterTaskType =
  | 'research'
  | 'hook'
  | 'outline'
  | 'draft'
  | 'humanize'
  | 'media'
  | 'package'
  | 'generic';

export type RoutingContentFormat = 'tweet' | 'thread' | 'article' | 'diagram' | 'generic';

export type RoutingTier = 'trial_high' | 'free_first' | 'floor' | 'quality_fallback';
export type OpenRouterRoutingProfile = 'local' | 'test_high' | 'prod_balanced';

export type RoutedChatOptions = {
  taskType?: RouterTaskType;
  contentFormat?: RoutingContentFormat;
  temperature?: number;
  trialMode?: boolean;
  forceHighTier?: boolean;
  timeoutMs?: number;
  maxCandidates?: number;
  maxTokens?: number;
  maxPrice?: {
    prompt?: number;
    completion?: number;
    image?: number;
    web_search?: number;
  };
};

export type RoutedChatResult = {
  content: string;
  modelUsed: string;
  routingTier: RoutingTier;
  fallbackDepth: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  provider?: 'openrouter';
};

// 默认使用 OpenRouter 免费路由，保证“开箱即跑”与成本可控。
// 生产环境可通过 OPENROUTER_*_MODELS 覆盖为更激进的分层模型组合。
const DEFAULT_FREE_MODELS = ['openrouter/free'] as const;
const DEFAULT_FLOOR_MODELS = [
  'google/gemini-3-flash-preview',
  'openai/gpt-5.4-mini',
  'deepseek/deepseek-v3.2',
  'google/gemma-4-31b-it'
] as const;
const DEFAULT_HIGH_MODELS = [
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-5.4',
  'google/gemini-3.1-pro-preview',
  // Account/provider-access fallback: some OpenRouter accounts can see the
  // frontier model ids but receive provider ToS 403 at runtime. Keep these
  // quality-oriented alternatives ahead of the floor pool so `test_high`
  // still uses a real high-quality path instead of silently dropping to floor.
  'x-ai/grok-4.20',
  'qwen/qwen3-max',
  'moonshotai/kimi-k2-thinking',
  'z-ai/glm-4.6',
  'deepseek/deepseek-v3.2'
] as const;
const DEFAULT_TASK_TIMEOUT_MS = 20000;
const DEFAULT_TASK_MAX_CANDIDATES = 2;

const TASK_TIMEOUT_MS: Record<RouterTaskType, number> = {
  research: 12000,
  hook: 12000,
  outline: 12000,
  draft: 24000,
  humanize: 18000,
  media: 10000,
  package: 12000,
  generic: DEFAULT_TASK_TIMEOUT_MS
};

const TASK_MAX_CANDIDATES: Record<RouterTaskType, number> = {
  research: 2,
  hook: 2,
  outline: 2,
  draft: 2,
  humanize: 2,
  media: 1,
  package: 2,
  generic: DEFAULT_TASK_MAX_CANDIDATES
};

const TASK_MAX_TOKENS: Record<RouterTaskType, number> = {
  research: 1600,
  hook: 900,
  outline: 1800,
  draft: 4096,
  humanize: 4096,
  media: 1200,
  package: 3000,
  generic: 1600
};

const QUALITY_CRITICAL_TASKS = new Set<RouterTaskType>(['hook', 'draft', 'humanize', 'package']);
const CONTEXT_BUILDING_TASKS = new Set<RouterTaskType>(['research', 'outline', 'media']);

function parseModelList(value: string | undefined, fallback: readonly string[]): string[] {
  const raw = (value ?? '').trim();
  const parts = (!raw ? [...fallback] : raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean));

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const model of parts) {
    if (seen.has(model)) continue;
    seen.add(model);
    deduped.push(model);
  }
  return deduped;
}

function parseCost(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function resolveOpenRouterRoutingProfile(
  rawProfile = process.env.OPENROUTER_ROUTING_PROFILE,
  nodeEnv = process.env.NODE_ENV
): OpenRouterRoutingProfile {
  const normalized = rawProfile?.trim().toLowerCase();
  if (normalized === 'local' || normalized === 'test_high' || normalized === 'prod_balanced') {
    return normalized;
  }
  return nodeEnv === 'production' ? 'prod_balanced' : 'local';
}

@Injectable()
export class OpenRouterService {
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  private get apiKey(): string | null {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    return key ? key : null;
  }

  private get mockMode(): boolean {
    return process.env.OPENROUTER_MOCK_MODE === '1';
  }

  private detectMockPayload(messages: ChatMessage[]): string {
    const marker = Math.random().toString(36).slice(2, 8);
    const joined = messages
      .map((item) => item.content)
      .join('\n')
      .toLowerCase();

    if (joined.includes('researchpoints') && joined.includes('hookcandidates')) {
      return JSON.stringify({
        researchPoints: [
          '受众假设：这条内容应该先打中已经在做内容、但第一句总抓不住人的创作者。',
          '核心判断：内容不讲人话，往往不是知识不够，而是开头没有先给判断。',
          '证据计划：给一个真实例子，说明“同一条内容为什么这样写会更容易被读完”。'
        ],
        hookCandidates: [
          '多数内容没人停下来，不是主题不行，而是第一句没有给判断。',
          '如果你的推文总像说明书，问题通常不在知识，而在开头。',
          '同样一个观点，先给判断再给例子，读完率会高很多。'
        ],
        angleSummary: '先给结论，再补例子，最后用一个带选择的问题拉回复。'
      });
    }

    if (
      joined.includes('title/hook/body/cta') ||
      (joined.includes('"title"') && joined.includes('"hook"') && joined.includes('"cta"'))
    ) {
      return JSON.stringify({
        title: '别把内容写成说明书',
        hook: '多数推文没人停下来，不是观点不够，而是第一句没先给判断。',
        body: ['先把最想让读者记住的判断说出来', '马上补一个例子或反例', '最后抛出一个让人愿意回复的问题'],
        cta: '如果只能先改一个地方，你会先改开头、例子，还是结尾？'
      });
    }

    if (joined.includes('primarytweet') || joined.includes('"thread"')) {
      if (joined.includes('类型：long') || joined.includes('x 文章')) {
        return JSON.stringify({
          primaryTweet: [
            'AI 产品冷启动，不要从写文案开始',
            '',
            '导语',
            '冷启动最难的不是没人看见，而是你还没把增长动作排成稳定节奏。',
            '',
            '一、先把目标收紧到一个动作',
            '先确认这一轮到底要涨认知、涨互动，还是拿到第一批精准反馈。',
            '',
            '二、把内容生产做成固定流程',
            '把选题、出稿、审批、发布、复盘排成固定节奏，内容质量才会稳定上升。',
            '',
            '三、用复盘把下一轮迭代接上',
            '每次发布后只保留真正有效的结构和表达，下一轮才会越做越顺。',
            '',
            '结尾',
            '如果你愿意，我也可以把这篇再拆成 thread 版本。'
          ].join('\n'),
          thread: []
        });
      }

      return JSON.stringify({
        primaryTweet:
          `多数 X 账号发不起来，不是因为没观点，而是第一句总在解释背景。先把判断说出来，再补一个具体例子，读者才会愿意继续看。`,
        thread: [
          '1/4\n先别急着铺背景。\n\n第一句先告诉读者：这条内容最重要的判断是什么。',
          '2/4\n再补一个具体例子。\n\n比如同样写 AI 产品冷启动，直接讲“第一条别同时讲定位、功能和故事”，比空谈方法更容易让人停下来。',
          '3/4\n中段只推进一个意思。\n\n一条说判断，一条说例子，一条说动作，不要一条里塞完三个层次。',
          '4/4\n最后再抛问题。\n\n如果只能先改一个位置，你会先改开头、例子，还是结尾？'
        ]
      });
    }

    if (joined.includes('humanized') || joined.includes('aitracerisk')) {
      return JSON.stringify({
        humanized:
          `很多内容看起来信息很多，但读者读完一句就滑走了。问题通常不是你懂得不够，而是第一句没有先给判断。先把立场讲清楚，再补一个具体例子，读者才知道为什么要继续看。`,
        aiTraceRisk: 0.18
      });
    }

    if (
      (joined.includes('"ideas"') && joined.includes('"searchkeywords"')) ||
      joined.includes('配图创意')
    ) {
      return JSON.stringify({
        ideas: [
          {
            title: '运营流程图',
            composition: '简洁流程箭头 + 关键节点高亮',
            keywords: ['content workflow', 'x marketing', 'pipeline']
          },
          {
            title: '复盘面板',
            composition: '数据卡片 + 趋势折线图',
            keywords: ['analytics dashboard', 'engagement growth', 'social stats']
          }
        ],
        searchKeywords: ['x content workflow', 'social media dashboard', 'engagement analytics']
      });
    }

    if (
      (joined.includes('"tweet"') && joined.includes('"variants"')) ||
      joined.includes('输出最终 tweet') ||
      joined.includes('输出最终长文正文')
    ) {
      if (joined.includes('x 长文发布编辑') || joined.includes('x 文章编辑器')) {
        return JSON.stringify({
          tweet: [
            'AI 产品冷启动，不要从写文案开始',
            '',
            '导语',
            '冷启动最难的不是没人看见，而是你还没把增长动作排成稳定节奏。',
            '',
            '一、先把目标收紧到一个动作',
            '先把问题收紧到一个目标动作，团队判断才会稳定。',
            '',
            '二、把内容生产做成固定流程',
            '把选题、出稿、审批、发布、复盘排成连续动作，质量才不会忽高忽低。',
            '',
            '三、用复盘把下一轮迭代接上',
            '只有把复盘接进下一轮，增长才会逐步变得可复制。',
            '',
            '结尾',
            '如果你愿意，我也可以把这篇再拆成 thread 版本。'
          ].join('\n'),
          variants: []
        });
      }

      return JSON.stringify({
        tweet:
          `多数推文没人停下来，不是主题不对，而是第一句还在绕。先把判断说出来，再补一个具体例子，读者才会愿意继续看。你现在最常卡在开头、例子，还是结尾？`,
        variants: [
          {
            tone: '专业',
            text: '真正影响读完率的，往往不是信息量，而是你有没有先给读者一个明确判断。'
          },
          {
            tone: '简洁',
            text: '别先解释背景。先给判断，再给例子。'
          }
        ]
      });
    }

    if (joined.includes('输出纯文本') || joined.includes('重写')) {
      if (joined.includes('x 长文润色编辑')) {
        return [
          'AI 产品冷启动，不要从写文案开始',
          '',
          '导语',
          '冷启动最难的不是没人看见，而是你还没把增长动作排成稳定节奏。',
          '',
          '一、先把目标收紧到一个动作',
          '先明确这一轮最重要的增长动作，内容判断才不会失焦。',
          '',
          '二、把内容生产做成固定流程',
          '把选题、出稿、审批、发布、复盘连成固定节奏，质量才会稳定上升。',
          '',
          '三、用复盘把下一轮迭代接上',
          '每一次复盘都要服务下一次迭代，这样内容才会越来越准。',
          '',
          '结尾',
          '如果你愿意，我也可以把这篇再拆成 thread 版本。'
        ].join('\n');
      }

      return '流程稳定，增长才可复制。先把内容动作标准化，再追求更高频率。';
    }

    return '已完成（mock）：这是用于本地验收的占位输出。';
  }

  private get freeModels(): string[] {
    return parseModelList(process.env.OPENROUTER_FREE_MODELS, DEFAULT_FREE_MODELS);
  }

  private get floorModels(): string[] {
    return parseModelList(process.env.OPENROUTER_FLOOR_MODELS, DEFAULT_FLOOR_MODELS);
  }

  private get highModels(): string[] {
    return parseModelList(process.env.OPENROUTER_HIGH_MODELS, DEFAULT_HIGH_MODELS);
  }

  private get routingProfile(): OpenRouterRoutingProfile {
    return resolveOpenRouterRoutingProfile();
  }

  private readPositiveIntEnv(name: string): number | null {
    const raw = process.env[name]?.trim();
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    const intValue = Math.floor(parsed);
    return intValue > 0 ? intValue : null;
  }

  private resolveTaskTimeoutMs(taskType: RouterTaskType | undefined): number {
    const globalTimeout = this.readPositiveIntEnv('OPENROUTER_TIMEOUT_MS');
    if (globalTimeout) return globalTimeout;
    return TASK_TIMEOUT_MS[taskType ?? 'generic'] ?? DEFAULT_TASK_TIMEOUT_MS;
  }

  private resolveTaskMaxCandidates(taskType: RouterTaskType | undefined): number {
    const globalMax = this.readPositiveIntEnv('OPENROUTER_MAX_CANDIDATES');
    if (globalMax) return globalMax;
    return TASK_MAX_CANDIDATES[taskType ?? 'generic'] ?? DEFAULT_TASK_MAX_CANDIDATES;
  }

  private resolveTaskMaxTokens(taskType: RouterTaskType | undefined): number {
    const globalMaxTokens = this.readPositiveIntEnv('OPENROUTER_MAX_TOKENS');
    if (globalMaxTokens) return globalMaxTokens;
    return TASK_MAX_TOKENS[taskType ?? 'generic'] ?? TASK_MAX_TOKENS.generic;
  }

  private resolveReducedMaxTokensAfter402(error: Error, currentMaxTokens: number): number | null {
    if (!/OpenRouter error 402/u.test(error.message)) return null;
    const affordable = Number(error.message.match(/(?:can only afford|can afford)\s+(\d+)/iu)?.[1] ?? 0);
    if (Number.isFinite(affordable) && affordable > 0 && affordable < 16) return null;
    const parsedBudget = Number.isFinite(affordable) && affordable > 0 ? Math.max(16, Math.floor(affordable * 0.9)) : 0;
    const fallbackBudget = Math.floor(currentMaxTokens * 0.65);
    const localCeiling = currentMaxTokens > 320 ? currentMaxTokens - 256 : currentMaxTokens - 1;
    const reduced = Math.min(localCeiling, parsedBudget || fallbackBudget);
    if (!Number.isFinite(reduced) || reduced < 16 || reduced >= currentMaxTokens) return null;
    return reduced;
  }

  private buildCandidates(options: RoutedChatOptions): Array<{ model: string; tier: RoutingTier }> {
    const task = options.taskType ?? 'generic';
    const trialMode = options.trialMode === true;
    const highTier: RoutingTier = trialMode ? 'trial_high' : 'quality_fallback';
    const profile = this.routingProfile;
    const forceHigh = options.forceHighTier === true;
    const prefersHigh = QUALITY_CRITICAL_TASKS.has(task);
    const prefersContext = CONTEXT_BUILDING_TASKS.has(task);

    let candidates: Array<{ model: string; tier: RoutingTier }>;
    if (forceHigh) {
      candidates = [
        ...this.highModels.map((model) => ({ model, tier: highTier })),
        ...this.floorModels.map((model) => ({ model, tier: 'floor' as RoutingTier }))
      ];
    } else if (profile === 'test_high') {
      candidates = [
        ...this.highModels.map((model) => ({ model, tier: highTier })),
        ...this.floorModels.map((model) => ({ model, tier: 'floor' as RoutingTier }))
      ];
    } else if (profile === 'prod_balanced') {
      candidates = prefersHigh
        ? [
            ...this.highModels.map((model) => ({ model, tier: highTier })),
            ...this.floorModels.map((model) => ({ model, tier: 'floor' as RoutingTier }))
          ]
        : [
            ...this.floorModels.map((model) => ({ model, tier: 'floor' as RoutingTier })),
            ...this.highModels.map((model) => ({ model, tier: 'quality_fallback' as RoutingTier }))
          ];
    } else {
      candidates = prefersContext
        ? [
            ...this.freeModels.map((model) => ({ model, tier: 'free_first' as RoutingTier })),
            ...this.floorModels.map((model) => ({ model, tier: 'floor' as RoutingTier })),
            ...this.highModels.map((model) => ({ model, tier: 'quality_fallback' as RoutingTier }))
          ]
        : [
            ...this.floorModels.map((model) => ({ model, tier: 'floor' as RoutingTier })),
            ...this.highModels.map((model) => ({ model, tier: highTier }))
          ];
    }

    const seen = new Set<string>();
    const deduped: Array<{ model: string; tier: RoutingTier }> = [];
    for (const candidate of candidates) {
      if (seen.has(candidate.model)) continue;
      seen.add(candidate.model);
      deduped.push(candidate);
    }
    return deduped;
  }

  private resolveProfileCandidateFloor(task: RouterTaskType, forceHighTier: boolean): number {
    const profile = this.routingProfile;
    const freeCount = this.freeModels.length > 0 ? 1 : 0;
    const floorCount = this.floorModels.length > 0 ? 1 : 0;
    const highCount = this.highModels.length > 0 ? 1 : 0;

    if (forceHighTier) {
      return this.highModels.length + this.floorModels.length;
    }

    if (profile === 'test_high') {
      return this.highModels.length + this.floorModels.length;
    }

    if (profile === 'prod_balanced') {
      if (QUALITY_CRITICAL_TASKS.has(task)) {
        return this.highModels.length + this.floorModels.length;
      }
      return this.floorModels.length + this.highModels.length;
    }

    if (CONTEXT_BUILDING_TASKS.has(task)) {
      return Math.min(freeCount + floorCount + highCount, this.freeModels.length + this.floorModels.length + this.highModels.length);
    }

    return Math.min(this.floorModels.length + highCount, this.floorModels.length + this.highModels.length);
  }

  private async runChatRequest(input: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    timeoutMs: number;
    maxTokens: number;
    maxPrice?: RoutedChatOptions['maxPrice'];
    providerSortByPrice?: boolean;
  }) {
    if (this.mockMode) {
      const mockLatencyMs = this.readPositiveIntEnv('OPENROUTER_MOCK_LATENCY_MS') ?? 0;
      if (mockLatencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, mockLatencyMs));
      }
      return {
        content: this.detectMockPayload(input.messages),
        model: 'mock/openrouter-local',
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          costUsd: 0
        }
      };
    }

    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const body: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      stream: false
    };

    if (input.providerSortByPrice) {
      body.provider = { sort: 'price' };
    }

    if (input.maxPrice) {
      body.max_price = input.maxPrice;
    }

    const controller = new AbortController();
    const deadline = Date.now() + input.timeoutMs;
    let res: Response;
    try {
      res = await this.fetchWithTimeout({
        model: input.model,
        timeoutMs: input.timeoutMs,
        controller,
        request: () =>
          fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'X-Title': 'DraftOrbit'
            },
            body: JSON.stringify(body),
            signal: controller.signal
          })
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenRouter timeout after ${input.timeoutMs}ms (${input.model})`);
      }
      throw error;
    }

    const remainingMs = Math.max(1, deadline - Date.now());
    const bodyText = await this.readResponseTextWithTimeout({
      response: res,
      timeoutMs: remainingMs,
      model: input.model,
      controller
    });

    if (!res.ok) {
      throw new Error(`OpenRouter error ${res.status}: ${bodyText}`);
    }

    const data = JSON.parse(bodyText) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        cost?: number | string;
        total_cost?: number | string;
      };
    };

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      model: data.model ?? input.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        costUsd: parseCost(data.usage?.cost ?? data.usage?.total_cost)
      }
    };
  }

  private async fetchWithTimeout<T>(input: {
    model: string;
    timeoutMs: number;
    controller: AbortController;
    request: () => Promise<T>;
  }): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        input.controller.abort();
        reject(new Error(`OpenRouter timeout after ${input.timeoutMs}ms (${input.model})`));
      }, input.timeoutMs);

      input
        .request()
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          if (error instanceof Error && error.name === 'AbortError') {
            reject(new Error(`OpenRouter timeout after ${input.timeoutMs}ms (${input.model})`));
            return;
          }
          reject(error);
        });
    });
  }

  private async readResponseTextWithTimeout(input: {
    response: Response;
    timeoutMs: number;
    model: string;
    controller: AbortController;
  }): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        input.controller.abort();
        reject(new Error(`OpenRouter timeout after ${input.timeoutMs}ms (${input.model})`));
      }, input.timeoutMs);

      input.response
        .text()
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  async chatWithRouting(messages: ChatMessage[], options: RoutedChatOptions = {}): Promise<RoutedChatResult> {
    const taskType = options.taskType ?? 'generic';
    const timeoutMs = options.timeoutMs ?? this.resolveTaskTimeoutMs(taskType);
    const maxTokens = options.maxTokens ?? this.resolveTaskMaxTokens(taskType);
    const candidatePool = this.buildCandidates(options);
    const explicitMaxCandidates = options.maxCandidates ?? this.readPositiveIntEnv('OPENROUTER_MAX_CANDIDATES');
    const profileCandidateFloor = this.resolveProfileCandidateFloor(taskType, options.forceHighTier === true);
    const targetCandidates = explicitMaxCandidates ?? Math.max(this.resolveTaskMaxCandidates(taskType), profileCandidateFloor);
    const maxCandidates = Math.max(1, Math.min(candidatePool.length, targetCandidates));
    const candidates = candidatePool.slice(0, maxCandidates);
    if (candidates.length === 0) {
      throw new Error('No OpenRouter model candidates configured');
    }

    let lastError: Error | null = null;

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      try {
        let attemptMaxTokens = maxTokens;
        let result: {
          content: string;
          model: string;
          usage: { promptTokens: number; completionTokens: number; costUsd: number };
        } | null = null;

        for (let tokenAttempt = 0; tokenAttempt < 4; tokenAttempt += 1) {
          try {
            result = await this.runChatRequest({
              model: candidate.model,
              messages,
              temperature: options.temperature ?? 0.7,
              timeoutMs,
              maxTokens: attemptMaxTokens,
              maxPrice: options.maxPrice,
              providerSortByPrice: candidate.tier === 'free_first' || candidate.tier === 'floor'
            });
            break;
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            const reducedMaxTokens = this.resolveReducedMaxTokensAfter402(error, attemptMaxTokens);
            if (!reducedMaxTokens) throw error;
            attemptMaxTokens = reducedMaxTokens;
          }
        }

        if (!result) throw new Error(`OpenRouter request failed after token-budget retries (${candidate.model})`);

        return {
          content: result.content,
          modelUsed: result.model,
          routingTier: candidate.tier,
          fallbackDepth: i,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          costUsd: result.usage.costUsd,
          provider: 'openrouter'
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error('OpenRouter request failed on all candidates');
  }

  async chat(model: string, messages: ChatMessage[], temperature = 0.8): Promise<string> {
    const result = await this.runChatRequest({
      model,
      messages,
      temperature,
      timeoutMs: this.resolveTaskTimeoutMs('generic'),
      maxTokens: this.resolveTaskMaxTokens('generic'),
      providerSortByPrice: false
    });
    return result.content;
  }

  async chatWithModel(
    model: string,
    messages: ChatMessage[],
    options: RoutedChatOptions & { routingTier?: RoutingTier } = {}
  ): Promise<RoutedChatResult> {
    const taskType = options.taskType ?? 'generic';
    const timeoutMs = options.timeoutMs ?? this.resolveTaskTimeoutMs(taskType);
    const maxTokens = options.maxTokens ?? this.resolveTaskMaxTokens(taskType);
    const routingTier = options.routingTier ?? (options.forceHighTier ? 'quality_fallback' : 'floor');
    let attemptMaxTokens = maxTokens;
    let result: {
      content: string;
      model: string;
      usage: { promptTokens: number; completionTokens: number; costUsd: number };
    } | null = null;

    for (let tokenAttempt = 0; tokenAttempt < 4; tokenAttempt += 1) {
      try {
        result = await this.runChatRequest({
          model,
          messages,
          temperature: options.temperature ?? 0.7,
          timeoutMs,
          maxTokens: attemptMaxTokens,
          maxPrice: options.maxPrice,
          providerSortByPrice: routingTier === 'free_first' || routingTier === 'floor'
        });
        break;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const reducedMaxTokens = this.resolveReducedMaxTokensAfter402(error, attemptMaxTokens);
        if (!reducedMaxTokens) throw error;
        attemptMaxTokens = reducedMaxTokens;
      }
    }

    if (!result) throw new Error(`OpenRouter request failed after token-budget retries (${model})`);

    return {
      content: result.content,
      modelUsed: result.model,
      routingTier,
      fallbackDepth: 0,
      inputTokens: result.usage.promptTokens,
      outputTokens: result.usage.completionTokens,
      costUsd: result.usage.costUsd,
      provider: 'openrouter'
    };
  }

  async *chatStream(
    model: string,
    messages: ChatMessage[],
    temperature = 0.8
  ): AsyncGenerator<StreamChunk> {
    if (this.mockMode) {
      const content = this.detectMockPayload(messages);
      yield { content, done: false, model: 'mock/openrouter-local' };
      yield { content: '', done: true, model: 'mock/openrouter-local' };
      return;
    }

    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Title': 'DraftOrbit'
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: this.resolveTaskMaxTokens('generic'), stream: true })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          yield { content: '', done: true };
          return;
        }
        try {
          const json = JSON.parse(payload) as any;
          const delta = json.choices?.[0]?.delta?.content ?? '';
          const finish = json.choices?.[0]?.finish_reason;
          yield {
            content: delta,
            done: finish === 'stop',
            model: json.model,
            usage: json.usage
          };
        } catch {
          // ignore malformed chunk
        }
      }
    }
  }
}
