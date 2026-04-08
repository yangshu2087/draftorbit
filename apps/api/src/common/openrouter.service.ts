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

export type RoutingTier = 'trial_high' | 'free_first' | 'floor' | 'quality_fallback';

export type RoutedChatOptions = {
  taskType?: RouterTaskType;
  temperature?: number;
  trialMode?: boolean;
  forceHighTier?: boolean;
  timeoutMs?: number;
  maxCandidates?: number;
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
};

// 默认使用 OpenRouter 免费路由，保证“开箱即跑”与成本可控。
// 生产环境可通过 OPENROUTER_*_MODELS 覆盖为更激进的分层模型组合。
const DEFAULT_FREE_MODELS = ['openrouter/free'] as const;
const DEFAULT_FLOOR_MODELS = ['openrouter/free'] as const;
const DEFAULT_HIGH_MODELS = ['openrouter/free'] as const;
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
        researchPoints: ['痛点识别：账号增长慢', '策略拆解：高表现主题结构'],
        hookCandidates: ['一个月从 0 到 1 万粉，做对了什么？', '别再盲发了，这 3 步让互动翻倍'],
        angleSummary: '聚焦“可复制方法 + 真实运营节奏”'
      });
    }

    if (
      joined.includes('title/hook/body/cta') ||
      (joined.includes('"title"') && joined.includes('"hook"') && joined.includes('"cta"'))
    ) {
      return JSON.stringify({
        title: '用运营节奏替代灵感写作',
        hook: '多数账号不缺想法，缺的是可执行节奏。',
        body: ['先确定目标场景', '再用固定模板快速出稿', '最后用复盘数据迭代下一轮'],
        cta: '你现在卡在哪一步？留言我给你建议。'
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
          `多数 X 账号增长慢，不是内容差，而是流程断裂：选题靠灵感、发布靠随机、复盘靠感觉。建议固定“选题→草稿→审批→发布→复盘”节奏，连续两周就能看到互动质量提升。#${marker}`,
        thread: [
          '① 先定目标：涨粉 / 互动 / 转化，只选一个。',
          '② 用模板出稿：减少空白页焦虑。',
          '③ 发布后 24h 复盘：保留有效结构，淘汰低效写法。'
        ]
      });
    }

    if (joined.includes('humanized') || joined.includes('aitracerisk')) {
      return JSON.stringify({
        humanized:
          `很多账号发不起来，不是因为你不会写，而是流程太散。把动作固定成“选题—起稿—审批—发布—复盘”，连续执行两周，互动质量通常会明显改善。(${marker})`,
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
          `别把增长寄托在“灵感爆发”。把 X 运营改成固定流水线：选题→草稿→审批→发布→复盘。流程稳定后，质量和效率会一起上升。#${marker}`,
        variants: [
          {
            tone: '专业',
            text: 'X 运营真正的杠杆是流程，而不是偶然爆款。先把生产和复盘节奏固定，再谈规模增长。'
          },
          {
            tone: '简洁',
            text: '流程稳定，增长才可复制。今天就把你的内容动作排成一条线。'
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

  private buildCandidates(options: RoutedChatOptions): Array<{ model: string; tier: RoutingTier }> {
    const task = options.taskType ?? 'generic';
    const trialMode = options.trialMode === true;
    const shouldPreferHighTier =
      options.forceHighTier === true ||
      (trialMode && ['draft', 'humanize', 'package', 'hook'].includes(task));

    const candidates = shouldPreferHighTier
      ? [
        ...this.highModels.map((model) => ({ model, tier: trialMode ? 'trial_high' : 'quality_fallback' as RoutingTier })),
        ...this.floorModels.map((model) => ({ model, tier: 'floor' as RoutingTier }))
      ]
      : [
        ...this.freeModels.map((model) => ({ model, tier: 'free_first' as RoutingTier })),
        ...this.floorModels.map((model) => ({ model, tier: 'floor' as RoutingTier })),
        ...this.highModels.map((model) => ({ model, tier: 'quality_fallback' as RoutingTier }))
      ];

    const seen = new Set<string>();
    const deduped: Array<{ model: string; tier: RoutingTier }> = [];
    for (const candidate of candidates) {
      if (seen.has(candidate.model)) continue;
      seen.add(candidate.model);
      deduped.push(candidate);
    }
    return deduped;
  }

  private async runChatRequest(input: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    timeoutMs: number;
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
      stream: false
    };

    if (input.providerSortByPrice) {
      body.provider = { sort: 'price' };
    }

    if (input.maxPrice) {
      body.max_price = input.maxPrice;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Title': 'DraftOrbit'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenRouter timeout after ${input.timeoutMs}ms (${input.model})`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
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

  async chatWithRouting(messages: ChatMessage[], options: RoutedChatOptions = {}): Promise<RoutedChatResult> {
    const timeoutMs = options.timeoutMs ?? this.resolveTaskTimeoutMs(options.taskType);
    const candidatePool = this.buildCandidates(options);
    const maxCandidates = Math.max(
      1,
      Math.min(candidatePool.length, options.maxCandidates ?? this.resolveTaskMaxCandidates(options.taskType))
    );
    const candidates = candidatePool.slice(0, maxCandidates);
    if (candidates.length === 0) {
      throw new Error('No OpenRouter model candidates configured');
    }

    let lastError: Error | null = null;

    for (let i = 0; i < candidates.length; i += 1) {
      const candidate = candidates[i];
      try {
        const result = await this.runChatRequest({
          model: candidate.model,
          messages,
          temperature: options.temperature ?? 0.7,
          timeoutMs,
          maxPrice: options.maxPrice,
          providerSortByPrice: candidate.tier === 'free_first' || candidate.tier === 'floor'
        });

        return {
          content: result.content,
          modelUsed: result.model,
          routingTier: candidate.tier,
          fallbackDepth: i,
          inputTokens: result.usage.promptTokens,
          outputTokens: result.usage.completionTokens,
          costUsd: result.usage.costUsd
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
      providerSortByPrice: false
    });
    return result.content;
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
      body: JSON.stringify({ model, messages, temperature, stream: true })
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
