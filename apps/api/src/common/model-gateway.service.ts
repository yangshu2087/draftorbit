import { Injectable } from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  OpenRouterService,
  type ChatMessage,
  type RoutingContentFormat,
  type RoutedChatOptions,
  type RoutedChatResult,
  type RouterTaskType,
  type RoutingTier,
  resolveOpenRouterRoutingProfile
} from './openrouter.service';
import { CodexLocalService } from './codex-local.service';

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
  contentFormat?: RoutingContentFormat;
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
const DEPTH_CRITICAL_FORMATS = new Set<RoutingContentFormat>(['article', 'diagram']);

export type ProviderHealthSample = {
  atMs: number;
  ok: boolean;
  durationMs: number;
  errorCode?: string;
};

export type ProviderHealthState = {
  provider: ModelProviderKey;
  events: ProviderHealthSample[];
  cooldownUntilMs?: number | null;
};

export type ProviderHealthConfig = {
  enabled: boolean;
  windowMs: number;
  minSamples: number;
  failureRateThreshold: number;
  consecutiveFailureThreshold: number;
  cooldownMs: number;
};

export type ProviderHealthSummary = {
  provider: ModelProviderKey;
  sampleSize: number;
  failureRate: number;
  consecutiveFailures: number;
  healthy: boolean;
  coolingDown: boolean;
  cooldownUntilMs: number | null;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
};

export type ModelGatewayHealthFilterInput = {
  candidates: ModelGatewayCandidate[];
  healthStates: Partial<Record<ModelProviderKey, ProviderHealthState | undefined>>;
  nowMs?: number;
  config: ProviderHealthConfig;
};

export type ModelGatewayHealthFilterResult = {
  candidates: ModelGatewayCandidate[];
  skippedProviders: ModelProviderKey[];
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

function parsePositiveIntOr(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : fallback;
}

function parseRatio(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return 0;
  if (parsed >= 1) return 1;
  return parsed;
}

function trimErrorMessage(value: string): string {
  return value.replace(/\s+/gu, ' ').trim().slice(0, 320);
}

function nowIsoFromMs(value: number | null | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null;
  return new Date(value).toISOString();
}

function sortHealthSamples(samples: ProviderHealthSample[]): ProviderHealthSample[] {
  return [...samples].sort((a, b) => a.atMs - b.atMs);
}

function keepRecentHealthSamples(samples: ProviderHealthSample[], nowMs: number, windowMs: number): ProviderHealthSample[] {
  const minAt = nowMs - windowMs;
  return sortHealthSamples(samples).filter((sample) => sample.atMs >= minAt);
}

function countTrailingFailures(samples: ProviderHealthSample[]): number {
  let count = 0;
  for (let index = samples.length - 1; index >= 0; index -= 1) {
    if (!samples[index]?.ok) {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

function createProviderHealthConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ProviderHealthConfig {
  return {
    enabled: env.MODEL_GATEWAY_HEALTH_PROBE_ENABLED !== '0',
    windowMs: parsePositiveIntOr(env.MODEL_GATEWAY_HEALTH_WINDOW_MS, 300_000),
    minSamples: parsePositiveIntOr(env.MODEL_GATEWAY_HEALTH_MIN_SAMPLES, 3),
    failureRateThreshold: parseRatio(env.MODEL_GATEWAY_HEALTH_FAILURE_RATE_THRESHOLD, 0.6),
    consecutiveFailureThreshold: parsePositiveIntOr(env.MODEL_GATEWAY_HEALTH_CONSECUTIVE_FAILURES, 2),
    cooldownMs: parsePositiveIntOr(env.MODEL_GATEWAY_HEALTH_COOLDOWN_MS, 45_000)
  };
}

function createRoutingHints(taskType: RouterTaskType, contentFormat: RoutingContentFormat): {
  prefersQuality: boolean;
  prefersContext: boolean;
  prefersLowLatency: boolean;
  prefersDepthByFormat: boolean;
} {
  const prefersQuality = QUALITY_CRITICAL_TASKS.has(taskType);
  const prefersContext = CONTEXT_BUILDING_TASKS.has(taskType);
  const prefersDepthByFormat = DEPTH_CRITICAL_FORMATS.has(contentFormat);
  const prefersLowLatency =
    contentFormat === 'tweet' && (taskType === 'research' || taskType === 'hook' || taskType === 'outline' || taskType === 'media');
  return { prefersQuality, prefersContext, prefersLowLatency, prefersDepthByFormat };
}

function toProviderHealthSummary(
  provider: ModelProviderKey,
  state: ProviderHealthState | undefined,
  config: ProviderHealthConfig,
  nowMs: number
): ProviderHealthSummary {
  const recent = keepRecentHealthSamples(state?.events ?? [], nowMs, config.windowMs);
  const failures = recent.filter((sample) => !sample.ok).length;
  const sampleSize = recent.length;
  const failureRate = sampleSize > 0 ? failures / sampleSize : 0;
  const consecutiveFailures = countTrailingFailures(recent);
  const coolingDown = Boolean(state?.cooldownUntilMs && state.cooldownUntilMs > nowMs);
  const healthyByRate = sampleSize < config.minSamples || failureRate < config.failureRateThreshold;
  const healthyByStreak = consecutiveFailures < config.consecutiveFailureThreshold;
  const healthy = !coolingDown && healthyByRate && healthyByStreak;
  const lastFailure = [...recent].reverse().find((sample) => !sample.ok);
  const lastSuccess = [...recent].reverse().find((sample) => sample.ok);
  return {
    provider,
    sampleSize,
    failureRate,
    consecutiveFailures,
    healthy,
    coolingDown,
    cooldownUntilMs: state?.cooldownUntilMs ?? null,
    lastFailureAt: nowIsoFromMs(lastFailure?.atMs),
    lastSuccessAt: nowIsoFromMs(lastSuccess?.atMs)
  };
}

function isProviderCoolingDown(
  provider: ModelProviderKey,
  healthStates: Partial<Record<ModelProviderKey, ProviderHealthState | undefined>>,
  nowMs: number
): boolean {
  const until = healthStates[provider]?.cooldownUntilMs;
  return Boolean(until && until > nowMs);
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

export function applyModelGatewayHealthFallback(input: ModelGatewayHealthFilterInput): ModelGatewayHealthFilterResult {
  if (!input.config.enabled) {
    return { candidates: input.candidates, skippedProviders: [] };
  }

  const nowMs = input.nowMs ?? Date.now();
  const skippedProviders = new Set<ModelProviderKey>();
  const healthyFirst = input.candidates.filter((candidate) => {
    if (isProviderCoolingDown(candidate.provider, input.healthStates, nowMs)) {
      skippedProviders.add(candidate.provider);
      return false;
    }
    return true;
  });

  if (healthyFirst.length === 0) {
    return { candidates: input.candidates, skippedProviders: [...skippedProviders] };
  }
  return { candidates: healthyFirst, skippedProviders: [...skippedProviders] };
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
  const contentFormat = input.contentFormat ?? 'generic';
  const highTier: RoutingTier = 'quality_fallback';
  const candidates: ModelGatewayCandidate[] = [];
  const hints = createRoutingHints(taskType, contentFormat);
  const prefersQualityOrDepth = hints.prefersQuality || hints.prefersDepthByFormat;

  if (input.profile === 'test_high') {
    addModels(candidates, 'openai', input.openaiHighModels, highTier, input.openaiAvailable);
    addModels(candidates, 'openrouter', input.openrouterHighModels, highTier);
    addModels(candidates, 'openai', input.openaiFloorModels, 'floor', input.openaiAvailable);
    addModels(candidates, 'openrouter', input.openrouterFloorModels, 'floor');
    return dedupeCandidates(candidates);
  }

  if (input.profile === 'prod_balanced') {
    if (prefersQualityOrDepth) {
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
    addModels(candidates, 'codex-local', ['codex-local'], highTier, input.codexLocalEnabled);
    if (hints.prefersLowLatency && !hints.prefersDepthByFormat) {
      addModels(candidates, 'openai', input.openaiFloorModels, 'floor', input.openaiAvailable);
      addModels(candidates, 'openrouter', input.openrouterFloorModels, 'floor');
      addModels(candidates, 'openai', input.openaiHighModels, highTier, input.openaiAvailable);
      addModels(candidates, 'openrouter', input.openrouterHighModels, highTier);
    } else if (prefersQualityOrDepth) {
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
  addModels(candidates, 'codex-local', ['codex-local'], highTier, input.codexLocalEnabled && !hints.prefersContext);
  return dedupeCandidates(candidates);
}

export function isInvalidTestHighEvidenceModel(input: { modelUsed?: string | null; provider?: string | null }): boolean {
  const model = String(input.modelUsed ?? '').trim();
  const provider = String(input.provider ?? '').trim().toLowerCase();
  if (!model) return true;
  if (provider === 'ollama') return true;
  if (provider === 'codex-local') return process.env.CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE !== '1';
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
  private readonly healthConfig: ProviderHealthConfig;
  private readonly providerHealthStates: Partial<Record<ModelProviderKey, ProviderHealthState>> = {};
  private readonly observabilityEnabled: boolean;
  private readonly observabilityLogPath: string | null;

  constructor(
    private readonly openRouter: OpenRouterService,
    private readonly codexLocal: CodexLocalService = new CodexLocalService()
  ) {
    this.healthConfig = createProviderHealthConfigFromEnv();
    this.observabilityEnabled = process.env.MODEL_GATEWAY_OBSERVABILITY_ENABLED === '1';
    const configuredLogPath = process.env.MODEL_GATEWAY_OBSERVABILITY_LOG_PATH?.trim();
    this.observabilityLogPath = this.observabilityEnabled
      ? configuredLogPath || path.join(process.cwd(), 'artifacts', 'model-gateway', 'model-gateway-events.ndjson')
      : null;
  }

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

  private candidatePool(taskType: RouterTaskType, contentFormat: RoutingContentFormat): ModelGatewayCandidate[] {
    return buildModelGatewayCandidatePool({
      profile: this.profile,
      taskType,
      contentFormat,
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

  private resolveMaxCandidates(
    options: RoutedChatOptions,
    candidateCount: number,
    taskType: RouterTaskType,
    contentFormat: RoutingContentFormat
  ): number {
    const explicit = options.maxCandidates ?? parsePositiveInt(process.env.MODEL_GATEWAY_MAX_CANDIDATES);
    if (explicit) return Math.max(1, Math.min(candidateCount, explicit));
    if (this.profile === 'test_high') return Math.max(1, candidateCount);
    if (this.profile === 'local_quality') {
      const deepLane = contentFormat === 'article' || contentFormat === 'diagram' || taskType === 'package' || taskType === 'draft';
      return Math.max(1, Math.min(candidateCount, deepLane ? 8 : 6));
    }
    if (this.profile === 'prod_balanced') {
      const deepLane = contentFormat === 'article' || contentFormat === 'diagram' || taskType === 'package';
      return Math.max(1, Math.min(candidateCount, deepLane ? 5 : 4));
    }
    return Math.max(1, Math.min(candidateCount, 3));
  }

  private providerHealthSummary(nowMs = Date.now()): ProviderHealthSummary[] {
    const providers: ModelProviderKey[] = ['codex-local', 'openai', 'openrouter', 'ollama'];
    return providers.map((provider) => toProviderHealthSummary(provider, this.providerHealthStates[provider], this.healthConfig, nowMs));
  }

  private updateProviderHealth(
    provider: ModelProviderKey,
    input: { ok: boolean; durationMs: number; errorCode?: string },
    nowMs = Date.now()
  ) {
    if (!this.healthConfig.enabled) return;
    const previous = this.providerHealthStates[provider] ?? { provider, events: [], cooldownUntilMs: null };
    const recentEvents = keepRecentHealthSamples(previous.events, nowMs, this.healthConfig.windowMs);
    const nextEvents = [...recentEvents, { atMs: nowMs, ok: input.ok, durationMs: input.durationMs, errorCode: input.errorCode }];
    let cooldownUntilMs = previous.cooldownUntilMs ?? null;

    if (input.ok) {
      cooldownUntilMs = null;
    } else {
      const summary = toProviderHealthSummary(provider, { provider, events: nextEvents, cooldownUntilMs }, this.healthConfig, nowMs);
      if (
        summary.sampleSize >= this.healthConfig.minSamples &&
        (summary.failureRate >= this.healthConfig.failureRateThreshold || summary.consecutiveFailures >= this.healthConfig.consecutiveFailureThreshold)
      ) {
        cooldownUntilMs = nowMs + this.healthConfig.cooldownMs;
      }
    }

    this.providerHealthStates[provider] = {
      provider,
      events: nextEvents,
      cooldownUntilMs
    };
  }

  private extractErrorCode(error: unknown): string | undefined {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = String((error as { code?: unknown }).code ?? '').trim();
      if (code) return code;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|timed out/iu.test(message)) return 'TIMEOUT';
    if (/busy/iu.test(message)) return 'BUSY';
    if (/unavailable|not configured|failed/iu.test(message)) return 'UNAVAILABLE';
    return undefined;
  }

  private async writeObservabilityEvent(event: Record<string, unknown>): Promise<void> {
    if (!this.observabilityLogPath) return;
    try {
      await fs.mkdir(path.dirname(this.observabilityLogPath), { recursive: true });
      await fs.appendFile(this.observabilityLogPath, `${JSON.stringify(event)}\n`, 'utf8');
    } catch {
      // observability should never block generation routing
    }
  }

  async chatWithRouting(messages: ChatMessage[], options: RoutedChatOptions = {}): Promise<ModelGatewayChatResult> {
    const startedAtMs = Date.now();
    const taskType = options.taskType ?? 'generic';
    const contentFormat = options.contentFormat ?? 'generic';
    const rawPool = this.candidatePool(taskType, contentFormat);
    const filteredByHealth = applyModelGatewayHealthFallback({
      candidates: rawPool,
      healthStates: this.providerHealthStates,
      nowMs: startedAtMs,
      config: this.healthConfig
    });
    const healthCandidatePool = filteredByHealth.candidates.length > 0 ? filteredByHealth.candidates : rawPool;
    const maxCandidates = this.resolveMaxCandidates(options, healthCandidatePool.length, taskType, contentFormat);
    const candidates = healthCandidatePool.slice(0, maxCandidates);
    if (candidates.length === 0) {
      throw new Error('No model gateway candidates configured');
    }

    const attempts: Array<Record<string, unknown>> = [];
    let lastError: Error | null = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const attemptStartedMs = Date.now();
      try {
        const routed = await this.chatWithCandidate(candidate, messages, options);
        const durationMs = Date.now() - attemptStartedMs;
        this.updateProviderHealth(candidate.provider, { ok: true, durationMs }, Date.now());
        attempts.push({
          attempt: index + 1,
          provider: candidate.provider,
          model: candidate.model,
          tier: candidate.tier,
          status: 'ok',
          durationMs
        });

        const result: ModelGatewayChatResult = {
          ...routed,
          provider: candidate.provider,
          profile: this.profile,
          fallbackDepth: index
        };
        void this.writeObservabilityEvent({
          at: new Date().toISOString(),
          status: 'ok',
          profile: this.profile,
          taskType,
          contentFormat,
          candidatePoolSize: rawPool.length,
          maxCandidates,
          skippedProvidersByHealth: filteredByHealth.skippedProviders,
          requestDurationMs: Date.now() - startedAtMs,
          selected: {
            provider: candidate.provider,
            model: candidate.model,
            tier: candidate.tier,
            modelUsed: result.modelUsed,
            routingTier: result.routingTier,
            fallbackDepth: result.fallbackDepth
          },
          attempts,
          providerHealth: this.providerHealthSummary(Date.now())
        });
        return {
          ...result
        };
      } catch (err) {
        const durationMs = Date.now() - attemptStartedMs;
        const errorCode = this.extractErrorCode(err);
        this.updateProviderHealth(candidate.provider, { ok: false, durationMs, errorCode }, Date.now());
        attempts.push({
          attempt: index + 1,
          provider: candidate.provider,
          model: candidate.model,
          tier: candidate.tier,
          status: 'error',
          durationMs,
          errorCode,
          error: trimErrorMessage(err instanceof Error ? err.message : String(err))
        });
        lastError = err instanceof Error ? err : new Error(String(err));
        if (process.env.MODEL_GATEWAY_DEBUG === '1') {
          // eslint-disable-next-line no-console
          console.warn(
            `[ModelGateway] candidate failed ${candidate.provider}:${candidate.model}:${candidate.tier} ${lastError.message.slice(0, 240)}`
          );
        }
      }
    }

    void this.writeObservabilityEvent({
      at: new Date().toISOString(),
      status: 'failed',
      profile: this.profile,
      taskType,
      contentFormat,
      candidatePoolSize: rawPool.length,
      maxCandidates,
      skippedProvidersByHealth: filteredByHealth.skippedProviders,
      requestDurationMs: Date.now() - startedAtMs,
      attempts,
      providerHealth: this.providerHealthSummary(Date.now()),
      error: trimErrorMessage(lastError?.message ?? 'Model gateway request failed on all candidates')
    });

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

    if (candidate.provider === 'codex-local') {
      return await this.codexLocal.chatWithRouting(messages, options);
    }

    throw new Error(`Unsupported model provider: ${candidate.provider}`);
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
