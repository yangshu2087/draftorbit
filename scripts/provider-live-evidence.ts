import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ModelGatewayService } from '../apps/api/src/common/model-gateway.service';
import { OpenRouterService, type ChatMessage } from '../apps/api/src/common/openrouter.service';
import { SourceCaptureService, TavilySearchProvider } from '../apps/api/src/modules/generate/source-capture.service';

export type LiveProvider = 'openai' | 'openrouter' | 'tavily';
export type LiveProviderEvidenceStatus = 'live_pass' | 'skipped_missing_key' | 'fail_closed';
export type ProviderKeyState = 'configured' | 'skipped_missing_key';

export type ProviderLiveEvidenceResult = {
  provider: LiveProvider;
  status: LiveProviderEvidenceStatus;
  keyEnv: 'OPENAI_API_KEY' | 'OPENROUTER_API_KEY' | 'TAVILY_API_KEY';
  startedAt: string;
  endedAt: string;
  durationMs?: number;
  modelUsed?: string;
  routingTier?: string;
  fallbackDepth?: number;
  contentExcerpt?: string;
  resultCount?: number;
  sourceStatus?: string;
  sourceArtifactPaths?: string[];
  firstResultUrl?: string;
  firstResultTitle?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
  evidencePath?: string;
  error?: string;
};

type ProviderLiveEvidenceSummary = ProviderLiveEvidenceResult & {
  durationMs: number;
};

type EnvLike = Record<string, string | undefined>;

const PROVIDER_DISPLAY: Record<LiveProvider, string> = {
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  tavily: 'Tavily'
};

const PROVIDER_KEY_ENV: Record<LiveProvider, ProviderLiveEvidenceResult['keyEnv']> = {
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  tavily: 'TAVILY_API_KEY'
};

const DEFAULT_OPENAI_LIVE_MODEL = 'gpt-5.4-mini';
const DEFAULT_OPENROUTER_LIVE_MODEL = 'openai/gpt-5.4-mini';
const DEFAULT_TAVILY_QUERY = '生成关于最新 OpenAI Codex 官方文档的文章';

function repoRootFromScript(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function stampForNow(now = new Date()): string {
  return now.toISOString().replace(/[:.]/gu, '-').replace('T', '_').slice(0, 19);
}

function firstConfiguredModel(value: string | undefined): string | null {
  const first = value?.split(',').map((item) => item.trim()).filter(Boolean)[0];
  return first || null;
}

function truncate(value: string, max = 800): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function durationMs(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

export function classifyProviderKeyState(keyEnv: string, env: EnvLike = process.env): ProviderKeyState {
  return env[keyEnv]?.trim() ? 'configured' : 'skipped_missing_key';
}

export function redactProviderError(error: unknown, secretValues: Array<string | undefined> = []): string {
  const raw = error instanceof Error ? error.message : String(error);
  let message = raw || 'provider_failed';
  for (const secret of secretValues) {
    const trimmed = secret?.trim();
    if (!trimmed || trimmed.length < 4) continue;
    message = message.split(trimmed).join('[REDACTED_SECRET]');
  }
  message = message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [REDACTED_SECRET]')
    .replace(/sk-(?:or-v1-)?[A-Za-z0-9_-]{8,}/giu, '[REDACTED_SECRET]')
    .replace(/tvly-[A-Za-z0-9_-]{8,}/giu, '[REDACTED_SECRET]');
  return truncate(message, 1000);
}

export function isAcceptedLiveQualityEvidence(
  input: { provider?: string | null; modelUsed?: string | null; content?: string | null },
  expectedProvider: 'openai' | 'openrouter'
): boolean {
  const provider = String(input.provider ?? '').trim().toLowerCase();
  const modelUsed = String(input.modelUsed ?? '').trim();
  const content = String(input.content ?? '').trim();
  if (provider !== expectedProvider) return false;
  if (!modelUsed || content.length < 8) return false;
  if (/mock\/|draftorbit\/heuristic|openrouter\/free|^ollama\/|^codex-local\//iu.test(modelUsed)) return false;
  if (/placeholder|mock evidence|local evidence/iu.test(content)) return false;
  return true;
}

export function summarizeProviderEvidence(result: ProviderLiveEvidenceResult): ProviderLiveEvidenceSummary {
  return {
    ...result,
    durationMs: result.durationMs ?? durationMs(result.startedAt, result.endedAt)
  };
}

export function buildProviderLiveEvidenceReport(input: {
  stamp: string;
  evidenceRoot: string;
  results: ProviderLiveEvidenceSummary[];
}): string {
  const lines: string[] = [];
  lines.push(`# DraftOrbit provider live evidence (${input.stamp})`);
  lines.push('');
  lines.push(`- Evidence root: \`${input.evidenceRoot}\``);
  lines.push('- Policy: local default remains independent; missing provider keys are recorded as `skipped_missing_key` and do not break default Codex/Ollama/baoyu UAT.');
  lines.push('- Policy: configured provider keys must either produce `live_pass` evidence from that provider or fail closed as `fail_closed`; mock/free/local fallback is never counted as live provider quality evidence.');
  lines.push('- Secrets: key values are never written; provider errors are redacted and truncated.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Provider | Status | Model/source | Duration | Evidence | Error |');
  lines.push('| --- | --- | --- | ---: | --- | --- |');
  for (const result of input.results) {
    const provider = PROVIDER_DISPLAY[result.provider];
    const modelOrSource = result.modelUsed ?? result.firstResultTitle ?? result.sourceStatus ?? 'n/a';
    const evidence = result.evidencePath ?? (result.sourceArtifactPaths?.length ? result.sourceArtifactPaths.join('<br>') : 'n/a');
    lines.push(
      `| ${provider} | \`${result.status}\` | ${modelOrSource.replace(/\|/gu, '\\|')} | ${result.durationMs}ms | ${evidence.replace(/\|/gu, '\\|')} | ${(result.error ?? '').replace(/\|/gu, '\\|') || 'n/a'} |`
    );
  }
  lines.push('');
  lines.push('## Details');
  for (const result of input.results) {
    lines.push('');
    lines.push(`### ${PROVIDER_DISPLAY[result.provider]}`);
    lines.push('');
    lines.push(`- status: \`${result.status}\``);
    lines.push(`- keyEnv: \`${result.keyEnv}\` (${result.status === 'skipped_missing_key' ? 'missing' : 'present; value not logged'})`);
    lines.push(`- durationMs: \`${result.durationMs}\``);
    if (result.modelUsed) lines.push(`- modelUsed: \`${result.modelUsed}\``);
    if (result.routingTier) lines.push(`- routingTier: \`${result.routingTier}\``);
    if (result.fallbackDepth !== undefined) lines.push(`- fallbackDepth: \`${result.fallbackDepth}\``);
    if (result.usage) {
      lines.push(`- usage: input=${result.usage.inputTokens ?? 0}, output=${result.usage.outputTokens ?? 0}, costUsd=${result.usage.costUsd ?? 0}`);
    }
    if (result.resultCount !== undefined) lines.push(`- resultCount: \`${result.resultCount}\``);
    if (result.sourceStatus) lines.push(`- sourceStatus: \`${result.sourceStatus}\``);
    if (result.firstResultTitle) lines.push(`- firstResultTitle: ${result.firstResultTitle}`);
    if (result.firstResultUrl) lines.push(`- firstResultUrl: ${result.firstResultUrl}`);
    if (result.evidencePath) lines.push(`- evidencePath: \`${result.evidencePath}\``);
    if (result.sourceArtifactPaths?.length) lines.push(`- sourceArtifactPaths: ${result.sourceArtifactPaths.map((item) => `\`${item}\``).join(', ')}`);
    if (result.contentExcerpt) lines.push(`- contentExcerpt: ${result.contentExcerpt}`);
    if (result.error) lines.push(`- error: ${result.error}`);
  }
  lines.push('');
  lines.push('## Run guidance');
  lines.push('');
  lines.push('```bash');
  lines.push('OPENAI_API_KEY=... OPENROUTER_API_KEY=... TAVILY_API_KEY=... npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 --filter @draftorbit/api exec tsx ../../scripts/provider-live-evidence.ts');
  lines.push('```');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function writeProviderEvidenceFile(root: string, provider: LiveProvider, payload: unknown): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  const evidencePath = path.join(root, `${provider}.json`);
  await fs.writeFile(evidencePath, JSON.stringify(payload, null, 2), 'utf8');
  return evidencePath;
}

async function withTemporaryEnv<T>(updates: EnvLike, fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(updates)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function smokeMessages(provider: 'OpenAI' | 'OpenRouter'): ChatMessage[] {
  return [
    {
      role: 'system',
      content: 'You are running a production provider smoke test for DraftOrbit. Reply in one short sentence, no markdown.'
    },
    {
      role: 'user',
      content: `Return a concise confirmation that DraftOrbit live ${provider} evidence is OK.`
    }
  ];
}

async function runOpenAiEvidence(input: { evidenceRoot: string; env?: EnvLike }): Promise<ProviderLiveEvidenceSummary> {
  const env = input.env ?? process.env;
  const keyEnv = PROVIDER_KEY_ENV.openai;
  const startedAt = new Date().toISOString();
  const keyState = classifyProviderKeyState(keyEnv, env);
  if (keyState === 'skipped_missing_key') {
    return summarizeProviderEvidence({ provider: 'openai', status: 'skipped_missing_key', keyEnv, startedAt, endedAt: new Date().toISOString() });
  }

  const model = env.LIVE_OPENAI_MODEL ?? env.OPENAI_LIVE_SMOKE_MODEL ?? firstConfiguredModel(env.OPENAI_TEXT_FLOOR_MODELS) ?? DEFAULT_OPENAI_LIVE_MODEL;
  try {
    const result = await withTemporaryEnv(
      {
        MODEL_ROUTING_PROFILE: 'prod_balanced',
        MODEL_GATEWAY_MAX_CANDIDATES: '1',
        MODEL_ROUTER_ENABLE_CODEX_LOCAL: '0',
        OPENAI_TEXT_FLOOR_MODELS: model,
        OPENAI_TEXT_HIGH_MODELS: model
      },
      async () => {
        const gateway = new ModelGatewayService(new OpenRouterService());
        return await gateway.chatWithRouting(smokeMessages('OpenAI'), {
          taskType: 'outline',
          maxCandidates: 1,
          maxTokens: 64,
          temperature: 0,
          timeoutMs: Number(env.LIVE_PROVIDER_TIMEOUT_MS ?? 45_000)
        });
      }
    );
    if (!isAcceptedLiveQualityEvidence({ provider: result.provider, modelUsed: result.modelUsed, content: result.content }, 'openai')) {
      throw new Error(`openai_live_evidence_invalid:${result.provider}:${result.modelUsed}`);
    }
    const endedAt = new Date().toISOString();
    const evidencePath = await writeProviderEvidenceFile(input.evidenceRoot, 'openai', {
      provider: result.provider,
      modelUsed: result.modelUsed,
      routingTier: result.routingTier,
      fallbackDepth: result.fallbackDepth,
      contentExcerpt: truncate(result.content, 500),
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd }
    });
    return summarizeProviderEvidence({
      provider: 'openai',
      status: 'live_pass',
      keyEnv,
      startedAt,
      endedAt,
      modelUsed: result.modelUsed,
      routingTier: result.routingTier,
      fallbackDepth: result.fallbackDepth,
      contentExcerpt: truncate(result.content, 240),
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd },
      evidencePath
    });
  } catch (error) {
    return summarizeProviderEvidence({
      provider: 'openai',
      status: 'fail_closed',
      keyEnv,
      startedAt,
      endedAt: new Date().toISOString(),
      modelUsed: model,
      error: redactProviderError(error, [env.OPENAI_API_KEY])
    });
  }
}

async function runOpenRouterEvidence(input: { evidenceRoot: string; env?: EnvLike }): Promise<ProviderLiveEvidenceSummary> {
  const env = input.env ?? process.env;
  const keyEnv = PROVIDER_KEY_ENV.openrouter;
  const startedAt = new Date().toISOString();
  const keyState = classifyProviderKeyState(keyEnv, env);
  if (keyState === 'skipped_missing_key') {
    return summarizeProviderEvidence({ provider: 'openrouter', status: 'skipped_missing_key', keyEnv, startedAt, endedAt: new Date().toISOString() });
  }

  const model = env.LIVE_OPENROUTER_MODEL ?? env.OPENROUTER_LIVE_SMOKE_MODEL ?? firstConfiguredModel(env.OPENROUTER_FLOOR_MODELS) ?? DEFAULT_OPENROUTER_LIVE_MODEL;
  try {
    const result = await withTemporaryEnv({ OPENROUTER_MOCK_MODE: '0' }, async () => {
      const service = new OpenRouterService();
      return await service.chatWithModel(model, smokeMessages('OpenRouter'), {
        taskType: 'outline',
        maxTokens: 64,
        temperature: 0,
        timeoutMs: Number(env.LIVE_PROVIDER_TIMEOUT_MS ?? 45_000),
        routingTier: 'quality_fallback'
      });
    });
    if (!isAcceptedLiveQualityEvidence({ provider: result.provider, modelUsed: result.modelUsed, content: result.content }, 'openrouter')) {
      throw new Error(`openrouter_live_evidence_invalid:${result.provider}:${result.modelUsed}`);
    }
    const endedAt = new Date().toISOString();
    const evidencePath = await writeProviderEvidenceFile(input.evidenceRoot, 'openrouter', {
      provider: result.provider,
      modelUsed: result.modelUsed,
      routingTier: result.routingTier,
      fallbackDepth: result.fallbackDepth,
      contentExcerpt: truncate(result.content, 500),
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd }
    });
    return summarizeProviderEvidence({
      provider: 'openrouter',
      status: 'live_pass',
      keyEnv,
      startedAt,
      endedAt,
      modelUsed: result.modelUsed,
      routingTier: result.routingTier,
      fallbackDepth: result.fallbackDepth,
      contentExcerpt: truncate(result.content, 240),
      usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd },
      evidencePath
    });
  } catch (error) {
    return summarizeProviderEvidence({
      provider: 'openrouter',
      status: 'fail_closed',
      keyEnv,
      startedAt,
      endedAt: new Date().toISOString(),
      modelUsed: model,
      error: redactProviderError(error, [env.OPENROUTER_API_KEY])
    });
  }
}

async function runTavilyEvidence(input: { evidenceRoot: string; env?: EnvLike }): Promise<ProviderLiveEvidenceSummary> {
  const env = input.env ?? process.env;
  const keyEnv = PROVIDER_KEY_ENV.tavily;
  const startedAt = new Date().toISOString();
  const keyState = classifyProviderKeyState(keyEnv, env);
  if (keyState === 'skipped_missing_key') {
    return summarizeProviderEvidence({ provider: 'tavily', status: 'skipped_missing_key', keyEnv, startedAt, endedAt: new Date().toISOString() });
  }

  const query = env.LIVE_TAVILY_QUERY ?? DEFAULT_TAVILY_QUERY;
  try {
    const provider = new TavilySearchProvider({ apiKey: env.TAVILY_API_KEY?.trim() ?? '' });
    const service = new SourceCaptureService({ searchProvider: provider, maxSearchResults: 1 });
    const result = await service.captureFromIntent({ runId: `provider-live-${stampForNow()}`, intent: query });
    const firstResult = result.searchResults?.[0];
    const readyArtifacts = result.artifacts.filter((artifact) => artifact.status === 'ready');
    if (result.sourceStatus !== 'ready' || readyArtifacts.length === 0) {
      throw new Error(`tavily_source_capture_not_ready:${result.sourceStatus}:${result.hardFails.join(',') || 'no_ready_artifact'}`);
    }
    const endedAt = new Date().toISOString();
    const evidencePath = await writeProviderEvidenceFile(input.evidenceRoot, 'tavily', {
      query,
      sourceStatus: result.sourceStatus,
      hardFails: result.hardFails,
      resultCount: result.searchResults?.length ?? 0,
      firstResult,
      artifacts: result.artifacts.map((artifact) => ({
        kind: artifact.kind,
        title: artifact.title,
        url: artifact.url,
        status: artifact.status,
        markdownPath: artifact.markdownPath,
        error: artifact.error ? redactProviderError(artifact.error, [env.TAVILY_API_KEY]) : undefined
      }))
    });
    return summarizeProviderEvidence({
      provider: 'tavily',
      status: 'live_pass',
      keyEnv,
      startedAt,
      endedAt,
      resultCount: result.searchResults?.length ?? 0,
      sourceStatus: result.sourceStatus,
      firstResultTitle: firstResult?.title,
      firstResultUrl: firstResult?.url,
      sourceArtifactPaths: readyArtifacts.map((artifact) => artifact.markdownPath),
      contentExcerpt: truncate(result.sourceContext, 240),
      evidencePath
    });
  } catch (error) {
    return summarizeProviderEvidence({
      provider: 'tavily',
      status: 'fail_closed',
      keyEnv,
      startedAt,
      endedAt: new Date().toISOString(),
      error: redactProviderError(error, [env.TAVILY_API_KEY])
    });
  }
}

export async function runProviderLiveEvidence(input: { repoRoot?: string; env?: EnvLike; stamp?: string } = {}) {
  const repoRoot = input.repoRoot ?? repoRootFromScript();
  const stamp = input.stamp ?? stampForNow();
  const evidenceRoot = path.join(repoRoot, 'artifacts', 'provider-live-evidence', stamp);
  const trackedReportDir = path.join(repoRoot, 'output', 'reports', 'provider-live');
  const trackedReportPath = path.join(trackedReportDir, `PROVIDER-LIVE-EVIDENCE-${stamp}.md`);

  await fs.mkdir(evidenceRoot, { recursive: true });
  await fs.mkdir(trackedReportDir, { recursive: true });

  const results = [
    await runOpenAiEvidence({ evidenceRoot, env: input.env }),
    await runOpenRouterEvidence({ evidenceRoot, env: input.env }),
    await runTavilyEvidence({ evidenceRoot, env: input.env })
  ];
  const report = buildProviderLiveEvidenceReport({ stamp, evidenceRoot, results });
  await fs.writeFile(trackedReportPath, report, 'utf8');
  const summaryPath = path.join(evidenceRoot, 'summary.json');
  await fs.writeFile(summaryPath, JSON.stringify({ trackedReportPath, evidenceRoot, results }, null, 2), 'utf8');

  return { stamp, evidenceRoot, trackedReportPath, summaryPath, results };
}

async function main() {
  const summary = await runProviderLiveEvidence();
  console.log(
    JSON.stringify(
      {
        evidenceRoot: summary.evidenceRoot,
        trackedReportPath: summary.trackedReportPath,
        results: summary.results.map((result) => ({ provider: result.provider, status: result.status, modelUsed: result.modelUsed, sourceStatus: result.sourceStatus }))
      },
      null,
      2
    )
  );

  if (summary.results.some((result) => result.status === 'fail_closed')) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(redactProviderError(error, [process.env.OPENAI_API_KEY, process.env.OPENROUTER_API_KEY, process.env.TAVILY_API_KEY]));
    process.exit(1);
  });
}
