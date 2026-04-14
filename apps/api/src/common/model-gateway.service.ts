import { Injectable } from '@nestjs/common';
import {
  OpenRouterService,
  type ChatMessage,
  type RoutedChatOptions,
  type RoutedChatResult,
  type RouterTaskType,
  type RoutingTier,
  resolveOpenRouterRoutingProfile
} from './openrouter.service';

export type ModelProviderKey = 'openai' | 'openrouter' | 'ollama' | 'codex-local';
export type ModelRoutingProfile = 'local_free' | 'local_quality' | 'test_high' | 'prod_balanced';

export type ModelGatewayCandidate = {
  provider: ModelProviderKey;
  model: string;
  tier: RoutingTier;
};

export type ModelGatewayChatResult = Omit<RoutedChatResult, 'provider'> & {
  provider: ModelProviderKey;
  profile: ModelRoutingProfile;
};

export type ModelGatewayCandidatePoolInput = {
  profile: ModelRoutingProfile;
  taskType?: RouterTaskType;
  openaiAvailable: boolean;
  openaiHighModels: string[];
  openaiFloorModels: string[];
  openrouterHighModels: string[];
  openrouterFloorModels: string[];
  openrouterFreeModels: string[];
  ollamaModels: string[];
  codexLocalEnabled: boolean;
};

const DEFAULT_OPENAI_HIGH_MODELS = ['gpt-5.4'] as const;
const DEFAULT_OPENAI_FLOOR_MODELS = ['gpt-5.4-mini'] as const;
const DEFAULT_OPENROUTER_HIGH_MODELS = [
  'anthropic/claude-sonnet-4.6',
  'google/gemini-3.1-pro-preview',
  'qwen/qwen3-max',
  'z-ai/glm-4.6',
  'deepseek/deepseek-v3.2'
] as const;
const DEFAULT_OPENROUTER_FLOOR_MODELS = [
  'google/gemini-3-flash-preview',
  'openai/gpt-5.4-mini',
  'deepseek/deepseek-v3.2'
] as const;
const DEFAULT_OPENROUTER_FREE_MODELS = ['openrouter/free'] as const;
const DEFAULT_OLLAMA_TEXT_MODELS = ['qwen3.5:9b-fast', 'qwen3.5:9b'] as const;
const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';

const QUALITY_CRITICAL_TASKS = new Set<RouterTaskType>(['hook', 'draft', 'humanize', 'package', 'generic']);
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

function dedupeCandidates(candidates: ModelGatewayCandidate[]): ModelGatewayCandidate[] {
  const seen = new Set<string>();
  const deduped: ModelGatewayCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.provider}:${candidate.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function addModels(
  candidates: ModelGatewayCandidate[],
  provider: ModelProviderKey,
  models: string[],
  tier: RoutingTier,
  enabled = true
) {
  if (!enabled) return;
  for (const model of models) {
    candidates.push({ provider, model, tier });
  }
}

export function resolveModelRoutingProfile(
  rawProfile = process.env.MODEL_ROUTING_PROFILE,
  fallbackProfile = process.env.OPENROUTER_ROUTING_PROFILE,
  nodeEnv = process.env.NODE_ENV
): ModelRoutingProfile {
  const normalized = rawProfile?.trim().toLowerCase();
  if (
    normalized === 'local_free' ||
    normalized === 'local_quality' ||
    normalized === 'test_high' ||
    normalized === 'prod_balanced'
  ) {
    return normalized;
  }

  const openRouterProfile = resolveOpenRouterRoutingProfile(fallbackProfile, nodeEnv);
  if (openRouterProfile === 'test_high') return 'test_high';
  if (openRouterProfile === 'prod_balanced') return 'prod_balanced';
  return nodeEnv === 'production' ? 'prod_balanced' : 'local_free';
}

export function buildModelGatewayCandidatePool(input: ModelGatewayCandidatePoolInput): ModelGatewayCandidate[] {
  const taskType = input.taskType ?? 'generic';
  const highTier: RoutingTier = 'quality_fallback';
  const candidates: ModelGatewayCandidate[] = [];
  const prefersQuality = QUALITY_CRITICAL_TASKS.has(taskType);
  const prefersContext = CONTEXT_BUILDING_TASKS.has(taskType);

  if (input.profile === 'test_high') {
    addModels(candidates, 'openai', input.openaiHighModels, highTier, input.openaiAvailable);
    addModels(candidates, 'openrouter', input.openrouterHighModels, highTier);
    addModels(candidates, 'openai', input.openaiFloorModels, 'floor', input.openaiAvailable);
    addModels(candidates, 'openrouter', input.openrouterFloorModels, 'floor');
    return dedupeCandidates(candidates);
  }

  if (input.profile === 'prod_balanced') {
    if (prefersQuality) {
      addModels(candidates, 'openai', input.openaiHighModels, highTier, input.openaiAvailable);
      addModels(candidates, 'openrouter', input.openrouterHighModels, highTier);
      addModels(candidates, 'openai', input.openaiFloorModels, 'floor', input.openaiAvailable);
      addModels(candidates, 'openrouter', input.openrouterFloorModels, 'floor');
    } else {
      addModels(candidates, 'openai', input.openaiFloorModels, 'floor', input.openaiAvailable);
      addModels(candidates, 'openrouter', input.openrouterFloorModels, 'floor');
      addModels(candidates, 'openai', input.openaiHighModels, highTier, input.openaiAvailable);
      addModels(candidates, 'openrouter', input.openrouterHighModels, highTier);
    }
    return dedupeCandidates(candidates);
  }

  if (input.profile === 'local_quality') {
    addModels(candidates, 'openai', input.openaiHighModels, highTier, input.openaiAvailable);
    addModels(candidates, 'openrouter', input.openrouterHighModels, highTier);
    addModels(candidates, 'openai', input.openaiFloorModels, 'floor', input.openaiAvailable);
    addModels(candidates, 'openrouter', input.openrouterFloorModels, 'floor');
    addModels(candidates, 'codex-local', ['codex-local'], highTier, input.codexLocalEnabled);
    addModels(candidates, 'ollama', input.ollamaModels, 'free_first');
    addModels(candidates, 'openrouter', input.openrouterFreeModels, 'free_first');
    return dedupeCandidates(candidates);
  }

  addModels(candidates, 'ollama', input.ollamaModels, 'free_first');
  addModels(candidates, 'openrouter', input.openrouterFreeModels, 'free_first');
  addModels(candidates, 'openrouter', input.openrouterFloorModels, 'floor');
  addModels(candidates, 'openai', input.openaiFloorModels, 'floor', input.openaiAvailable);
  addModels(candidates, 'openrouter', input.openrouterHighModels, highTier);
  addModels(candidates, 'openai', input.openaiHighModels, highTier, input.openaiAvailable);
  addModels(candidates, 'codex-local', ['codex-local'], highTier, input.codexLocalEnabled && !prefersContext);
  return dedupeCandidates(candidates);
}

export function isInvalidTestHighEvidenceModel(input: { modelUsed?: string | null; provider?: string | null }): boolean {
  const model = String(input.modelUsed ?? '').trim();
  const provider = String(input.provider ?? '').trim().toLowerCase();
  if (!model) return true;
  if (provider === 'ollama' || provider === 'codex-local') return true;
  if (/draftorbit\/heuristic|openrouter\/free|mock\/|^ollama\//iu.test(model)) return true;
  return false;
}

function parsePositiveInt(value: string | undefined): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : null;
}

function parseOpenAiTextResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  if (typeof record.output_text === 'string') return record.output_text;

  const parts: string[] = [];
  const output = Array.isArray(record.output) ? record.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === 'string') parts.push(partRecord.text);
    }
  }
  return parts.join('\n').trim();
}

function buildOpenAiInput(messages: ChatMessage[]): { instructions?: string; input: string } {
  const instructions = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');
  const input = messages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role.toUpperCase()}:\n${message.content}`)
    .join('\n\n');
  return { instructions: instructions || undefined, input: input || messages.map((message) => message.content).join('\n\n') };
}

@Injectable()
export class ModelGatewayService {
  constructor(private readonly openRouter: OpenRouterService) {}

  private get profile(): ModelRoutingProfile {
    return resolveModelRoutingProfile();
  }

  private get openaiApiKey(): string | null {
    const key = process.env.OPENAI_API_KEY?.trim();
    return key ? key : null;
  }

  private get openaiHighModels(): string[] {
    return parseModelList(process.env.OPENAI_TEXT_HIGH_MODELS, DEFAULT_OPENAI_HIGH_MODELS);
  }

  private get openaiFloorModels(): string[] {
    return parseModelList(process.env.OPENAI_TEXT_FLOOR_MODELS, DEFAULT_OPENAI_FLOOR_MODELS);
  }

  private get openrouterHighModels(): string[] {
    return parseModelList(process.env.OPENROUTER_HIGH_MODELS, DEFAULT_OPENROUTER_HIGH_MODELS);
  }

  private get openrouterFloorModels(): string[] {
    return parseModelList(process.env.OPENROUTER_FLOOR_MODELS, DEFAULT_OPENROUTER_FLOOR_MODELS);
  }

  private get openrouterFreeModels(): string[] {
    return parseModelList(process.env.OPENROUTER_FREE_MODELS, DEFAULT_OPENROUTER_FREE_MODELS);
  }

  private get ollamaModels(): string[] {
    return parseModelList(process.env.OLLAMA_TEXT_MODELS, DEFAULT_OLLAMA_TEXT_MODELS);
  }

  private get codexLocalEnabled(): boolean {
    return process.env.MODEL_ROUTER_ENABLE_CODEX_LOCAL === '1';
  }

  private get ollamaBaseUrl(): string {
    return process.env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL;
  }

  private candidatePool(taskType: RouterTaskType): ModelGatewayCandidate[] {
    return buildModelGatewayCandidatePool({
      profile: this.profile,
      taskType,
      openaiAvailable: Boolean(this.openaiApiKey),
      openaiHighModels: this.openaiHighModels,
      openaiFloorModels: this.openaiFloorModels,
      openrouterHighModels: this.openrouterHighModels,
      openrouterFloorModels: this.openrouterFloorModels,
      openrouterFreeModels: this.openrouterFreeModels,
      ollamaModels: this.ollamaModels,
      codexLocalEnabled: this.codexLocalEnabled
    });
  }

  private resolveMaxCandidates(options: RoutedChatOptions, candidateCount: number): number {
    const explicit = options.maxCandidates ?? parsePositiveInt(process.env.MODEL_GATEWAY_MAX_CANDIDATES);
    if (explicit) return Math.max(1, Math.min(candidateCount, explicit));
    if (this.profile === 'test_high') return Math.max(1, candidateCount);
    if (this.profile === 'prod_balanced') return Math.max(1, Math.min(candidateCount, 4));
    return Math.max(1, Math.min(candidateCount, 3));
  }

  async chatWithRouting(messages: ChatMessage[], options: RoutedChatOptions = {}): Promise<ModelGatewayChatResult> {
    const taskType = options.taskType ?? 'generic';
    const pool = this.candidatePool(taskType);
    const maxCandidates = this.resolveMaxCandidates(options, pool.length);
    const candidates = pool.slice(0, maxCandidates);
    if (candidates.length === 0) {
      throw new Error('No model gateway candidates configured');
    }

    let lastError: Error | null = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      try {
        const routed = await this.chatWithCandidate(candidate, messages, options);
        return {
          ...routed,
          provider: candidate.provider,
          profile: this.profile,
          fallbackDepth: index
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (process.env.MODEL_GATEWAY_DEBUG === '1') {
          // eslint-disable-next-line no-console
          console.warn(
            `[ModelGateway] candidate failed ${candidate.provider}:${candidate.model}:${candidate.tier} ${lastError.message.slice(0, 240)}`
          );
        }
      }
    }

    throw lastError ?? new Error('Model gateway request failed on all candidates');
  }

  private async chatWithCandidate(
    candidate: ModelGatewayCandidate,
    messages: ChatMessage[],
    options: RoutedChatOptions
  ): Promise<Omit<ModelGatewayChatResult, 'profile'>> {
    if (candidate.provider === 'openrouter') {
      const routed = await this.openRouter.chatWithModel(candidate.model, messages, {
        ...options,
        timeoutMs: options.timeoutMs ?? (this.profile === 'test_high' ? 60_000 : undefined),
        routingTier: candidate.tier,
        forceHighTier: candidate.tier === 'quality_fallback' || options.forceHighTier
      });
      return {
        ...routed,
        provider: 'openrouter'
      };
    }

    if (candidate.provider === 'openai') {
      return await this.chatWithOpenAi(candidate, messages, options);
    }

    if (candidate.provider === 'ollama') {
      return await this.chatWithOllama(candidate, messages, options);
    }

    throw new Error('codex-local model adapter is disabled for API runtime');
  }

  private async chatWithOpenAi(
    candidate: ModelGatewayCandidate,
    messages: ChatMessage[],
    options: RoutedChatOptions
  ): Promise<Omit<ModelGatewayChatResult, 'profile'>> {
    const apiKey = this.openaiApiKey;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? parsePositiveInt(process.env.MODEL_GATEWAY_OPENAI_TIMEOUT_MS) ?? 30000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const { instructions, input } = buildOpenAiInput(messages);

    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: candidate.model,
          instructions,
          input,
          temperature: options.temperature ?? 0.7,
          max_output_tokens: options.maxTokens ?? 3000,
          store: false
        }),
        signal: controller.signal
      });
      const bodyText = await res.text();
      if (!res.ok) throw new Error(`OpenAI Responses error ${res.status}: ${bodyText}`);
      const data = JSON.parse(bodyText) as {
        model?: string;
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      };
      return {
        content: parseOpenAiTextResponse(data),
        modelUsed: data.model ?? candidate.model,
        routingTier: candidate.tier,
        fallbackDepth: 0,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
        costUsd: 0,
        provider: 'openai'
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async chatWithOllama(
    candidate: ModelGatewayCandidate,
    messages: ChatMessage[],
    options: RoutedChatOptions
  ): Promise<Omit<ModelGatewayChatResult, 'profile'>> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? parsePositiveInt(process.env.MODEL_GATEWAY_OLLAMA_TIMEOUT_MS) ?? 30000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.ollamaBaseUrl.replace(/\/$/u, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: candidate.model,
          messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.7,
            num_predict: options.maxTokens ?? 3000
          }
        }),
        signal: controller.signal
      });
      const bodyText = await res.text();
      if (!res.ok) throw new Error(`Ollama error ${res.status}: ${bodyText}`);
      const data = JSON.parse(bodyText) as {
        model?: string;
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      return {
        content: data.message?.content ?? '',
        modelUsed: `ollama/${data.model ?? candidate.model}`,
        routingTier: candidate.tier,
        fallbackDepth: 0,
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        costUsd: 0,
        provider: 'ollama'
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
