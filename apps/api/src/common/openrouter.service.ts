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

function parseModelList(value: string | undefined, fallback: readonly string[]): string[] {
  const raw = (value ?? '').trim();
  if (!raw) return [...fallback];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
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
      joined.includes('输出最终 tweet')
    ) {
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

  private buildCandidates(options: RoutedChatOptions): Array<{ model: string; tier: RoutingTier }> {
    const task = options.taskType ?? 'generic';
    const trialMode = options.trialMode === true;
    const shouldPreferHighTier =
      options.forceHighTier === true ||
      (trialMode && ['draft', 'humanize', 'package', 'hook'].includes(task));

    if (shouldPreferHighTier) {
      return [
        ...this.highModels.map((model) => ({ model, tier: trialMode ? 'trial_high' : 'quality_fallback' as RoutingTier })),
        ...this.floorModels.map((model) => ({ model, tier: 'floor' as RoutingTier }))
      ];
    }

    return [
      ...this.freeModels.map((model) => ({ model, tier: 'free_first' as RoutingTier })),
      ...this.floorModels.map((model) => ({ model, tier: 'floor' as RoutingTier })),
      ...this.highModels.map((model) => ({ model, tier: 'quality_fallback' as RoutingTier }))
    ];
  }

  private async runChatRequest(input: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    maxPrice?: RoutedChatOptions['maxPrice'];
    providerSortByPrice?: boolean;
  }) {
    if (this.mockMode) {
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

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Title': 'DraftOrbit'
      },
      body: JSON.stringify(body)
    });

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
    const candidates = this.buildCandidates(options);
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
