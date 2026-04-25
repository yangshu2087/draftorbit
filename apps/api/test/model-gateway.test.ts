import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyModelGatewayHealthFallback,
  buildModelGatewayCandidatePool,
  isInvalidTestHighEvidenceModel,
  ModelGatewayService,
  type ProviderHealthState,
  resolveModelRoutingProfile
} from '../src/common/model-gateway.service';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('resolveModelRoutingProfile prefers MODEL_ROUTING_PROFILE and maps local/test/prod values', () => {
  assert.equal(resolveModelRoutingProfile('local_free'), 'local_free');
  assert.equal(resolveModelRoutingProfile('local_quality'), 'local_quality');
  assert.equal(resolveModelRoutingProfile('test_high'), 'test_high');
  assert.equal(resolveModelRoutingProfile('prod_balanced'), 'prod_balanced');
  assert.equal(resolveModelRoutingProfile(undefined, 'test_high'), 'test_high');
  assert.equal(resolveModelRoutingProfile(undefined, 'local'), 'local_free');
  assert.equal(resolveModelRoutingProfile(undefined, 'prod_balanced'), 'prod_balanced');
});

test('test_high candidate pool prefers OpenAI high then OpenRouter high and excludes free/local models', () => {
  const candidates = buildModelGatewayCandidatePool({
    profile: 'test_high',
    taskType: 'draft',
    openaiAvailable: true,
    openaiHighModels: ['gpt-5.5'],
    openaiFloorModels: ['gpt-5.4-mini'],
    openrouterHighModels: ['anthropic/claude-sonnet-4.6', 'qwen/qwen3-max'],
    openrouterFloorModels: ['deepseek/deepseek-v3.2'],
    openrouterFreeModels: ['openrouter/free'],
    ollamaEnabled: false,
    ollamaModels: ['qwen3.5:9b-fast'],
    codexLocalEnabled: true
  });

  assert.deepEqual(
    candidates.map((item) => `${item.provider}:${item.model}:${item.tier}`).slice(0, 5),
    [
      'openai:gpt-5.5:quality_fallback',
      'openrouter:anthropic/claude-sonnet-4.6:quality_fallback',
      'openrouter:qwen/qwen3-max:quality_fallback',
      'openai:gpt-5.4-mini:floor',
      'openrouter:deepseek/deepseek-v3.2:floor'
    ]
  );
  assert.equal(candidates.some((item) => item.provider === 'ollama'), false);
  assert.equal(candidates.some((item) => item.model === 'openrouter/free'), false);
  assert.equal(candidates.some((item) => item.provider === 'codex-local'), false);
});

test('local_free candidate pool prefers codex-local and keeps ollama disabled by default', () => {
  const candidates = buildModelGatewayCandidatePool({
    profile: 'local_free',
    taskType: 'research',
    openaiAvailable: true,
    openaiHighModels: ['gpt-5.5'],
    openaiFloorModels: ['gpt-5.4-mini'],
    openrouterHighModels: ['anthropic/claude-sonnet-4.6'],
    openrouterFloorModels: ['deepseek/deepseek-v3.2'],
    openrouterFreeModels: ['openrouter/free'],
    ollamaEnabled: false,
    ollamaModels: ['qwen3.5:9b-fast'],
    codexLocalEnabled: true
  });

  assert.deepEqual(
    candidates.map((item) => `${item.provider}:${item.model}:${item.tier}`).slice(0, 4),
    [
      'codex-local:codex-local:quality_fallback',
      'openrouter:openrouter/free:free_first',
      'openrouter:deepseek/deepseek-v3.2:floor',
      'openai:gpt-5.4-mini:floor'
    ]
  );
  assert.equal(candidates.some((item) => item.provider === 'ollama'), false);
});

test('local_free candidate pool uses small-footprint ollama only when explicitly enabled', () => {
  const candidates = buildModelGatewayCandidatePool({
    profile: 'local_free',
    taskType: 'research',
    openaiAvailable: true,
    openaiHighModels: ['gpt-5.5'],
    openaiFloorModels: ['gpt-5.4-mini'],
    openrouterHighModels: ['anthropic/claude-sonnet-4.6'],
    openrouterFloorModels: ['deepseek/deepseek-v3.2'],
    openrouterFreeModels: ['openrouter/free'],
    ollamaEnabled: true,
    ollamaModels: ['qwen2.5:0.5b'],
    codexLocalEnabled: true
  });

  assert.deepEqual(
    candidates.map((item) => `${item.provider}:${item.model}:${item.tier}`).slice(0, 4),
    [
      'codex-local:codex-local:quality_fallback',
      'ollama:qwen2.5:0.5b:free_first',
      'openrouter:openrouter/free:free_first',
      'openrouter:deepseek/deepseek-v3.2:floor'
    ]
  );
});


test('local_quality candidate pool prefers OpenAI GPT high before Codex and keeps Ollama last', () => {
  const candidates = buildModelGatewayCandidatePool({
    profile: 'local_quality',
    taskType: 'draft',
    openaiAvailable: true,
    openaiHighModels: ['gpt-5.5'],
    openaiFloorModels: ['gpt-5.4-mini'],
    openrouterHighModels: ['anthropic/claude-sonnet-4.6'],
    openrouterFloorModels: ['deepseek/deepseek-v3.2'],
    openrouterFreeModels: ['openrouter/free'],
    ollamaEnabled: true,
    ollamaModels: ['qwen3.5:9b'],
    codexLocalEnabled: true
  });

  assert.deepEqual(
    candidates.map((item) => `${item.provider}:${item.model}:${item.tier}`).slice(0, 5),
    [
      'openai:gpt-5.5:quality_fallback',
      'codex-local:codex-local:quality_fallback',
      'openrouter:anthropic/claude-sonnet-4.6:quality_fallback',
      'openai:gpt-5.4-mini:floor',
      'openrouter:deepseek/deepseek-v3.2:floor'
    ]
  );
  assert.equal(candidates.at(-2)?.provider, 'ollama');
});

test('local_quality route layering keeps GPT high first for tweet hook quality lane', () => {
  const candidates = buildModelGatewayCandidatePool({
    profile: 'local_quality',
    taskType: 'hook',
    contentFormat: 'tweet',
    openaiAvailable: true,
    openaiHighModels: ['gpt-5.5'],
    openaiFloorModels: ['gpt-5.4-mini'],
    openrouterHighModels: ['anthropic/claude-sonnet-4.6'],
    openrouterFloorModels: ['deepseek/deepseek-v3.2'],
    openrouterFreeModels: ['openrouter/free'],
    ollamaEnabled: true,
    ollamaModels: ['qwen3.5:9b'],
    codexLocalEnabled: true
  });

  assert.deepEqual(
    candidates.map((item) => `${item.provider}:${item.model}:${item.tier}`).slice(0, 5),
    [
      'openai:gpt-5.5:quality_fallback',
      'codex-local:codex-local:quality_fallback',
      'openrouter:anthropic/claude-sonnet-4.6:quality_fallback',
      'openai:gpt-5.4-mini:floor',
      'openrouter:deepseek/deepseek-v3.2:floor'
    ]
  );
});

test('local_quality route layering keeps high-tier first for article package lane', () => {
  const candidates = buildModelGatewayCandidatePool({
    profile: 'local_quality',
    taskType: 'package',
    contentFormat: 'article',
    openaiAvailable: true,
    openaiHighModels: ['gpt-5.5'],
    openaiFloorModels: ['gpt-5.4-mini'],
    openrouterHighModels: ['anthropic/claude-sonnet-4.6'],
    openrouterFloorModels: ['deepseek/deepseek-v3.2'],
    openrouterFreeModels: ['openrouter/free'],
    ollamaEnabled: true,
    ollamaModels: ['qwen3.5:9b'],
    codexLocalEnabled: true
  });

  assert.deepEqual(
    candidates.map((item) => `${item.provider}:${item.model}:${item.tier}`).slice(0, 5),
    [
      'openai:gpt-5.5:quality_fallback',
      'codex-local:codex-local:quality_fallback',
      'openrouter:anthropic/claude-sonnet-4.6:quality_fallback',
      'openai:gpt-5.4-mini:floor',
      'openrouter:deepseek/deepseek-v3.2:floor'
    ]
  );
});

test('local_quality falls back to Codex local first when no OpenAI key is configured', () => {
  const candidates = buildModelGatewayCandidatePool({
    profile: 'local_quality',
    taskType: 'draft',
    contentFormat: 'article',
    openaiAvailable: false,
    openaiHighModels: ['gpt-5.5'],
    openaiFloorModels: ['gpt-5.4-mini'],
    openrouterHighModels: ['anthropic/claude-sonnet-4.6'],
    openrouterFloorModels: ['deepseek/deepseek-v3.2'],
    openrouterFreeModels: ['openrouter/free'],
    ollamaEnabled: true,
    ollamaModels: ['qwen2.5:0.5b'],
    codexLocalEnabled: true
  });

  assert.deepEqual(
    candidates.map((item) => `${item.provider}:${item.model}:${item.tier}`).slice(0, 4),
    [
      'codex-local:codex-local:quality_fallback',
      'openrouter:anthropic/claude-sonnet-4.6:quality_fallback',
      'openrouter:deepseek/deepseek-v3.2:floor',
      'ollama:qwen2.5:0.5b:free_first'
    ]
  );
});

test('health fallback skips providers that are in cooldown when alternatives exist', () => {
  const candidates = [
    { provider: 'codex-local' as const, model: 'codex-local', tier: 'quality_fallback' as const },
    { provider: 'openai' as const, model: 'gpt-5.5', tier: 'quality_fallback' as const },
    { provider: 'openrouter' as const, model: 'anthropic/claude-sonnet-4.6', tier: 'quality_fallback' as const }
  ];
  const now = Date.now();
  const healthStates: Partial<Record<'openai' | 'openrouter' | 'ollama' | 'codex-local', ProviderHealthState | undefined>> = {
    'codex-local': {
      provider: 'codex-local',
      events: [{ atMs: now - 1_000, ok: false, durationMs: 1200, errorCode: 'CODEX_LOCAL_TIMEOUT' }],
      cooldownUntilMs: now + 15_000
    }
  };
  const result = applyModelGatewayHealthFallback({
    candidates,
    healthStates,
    nowMs: now,
    config: {
      enabled: true,
      windowMs: 300_000,
      minSamples: 3,
      failureRateThreshold: 0.6,
      consecutiveFailureThreshold: 2,
      cooldownMs: 45_000
    }
  });

  assert.equal(result.candidates[0]?.provider, 'openai');
  assert.equal(result.candidates.some((item) => item.provider === 'codex-local'), false);
  assert.deepEqual(result.skippedProviders, ['codex-local']);
});

test('health fallback keeps original pool when every candidate is cooling down', () => {
  const now = Date.now();
  const candidates = [
    { provider: 'codex-local' as const, model: 'codex-local', tier: 'quality_fallback' as const }
  ];
  const healthStates: Partial<Record<'openai' | 'openrouter' | 'ollama' | 'codex-local', ProviderHealthState | undefined>> = {
    'codex-local': {
      provider: 'codex-local',
      events: [{ atMs: now - 500, ok: false, durationMs: 800, errorCode: 'CODEX_LOCAL_BUSY' }],
      cooldownUntilMs: now + 10_000
    }
  };

  const result = applyModelGatewayHealthFallback({
    candidates,
    healthStates,
    nowMs: now,
    config: {
      enabled: true,
      windowMs: 300_000,
      minSamples: 3,
      failureRateThreshold: 0.6,
      consecutiveFailureThreshold: 2,
      cooldownMs: 45_000
    }
  });

  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.provider, 'codex-local');
  assert.deepEqual(result.skippedProviders, ['codex-local']);
});

test('model gateway health snapshot exposes provider summaries for ops/usage panels', () => {
  const gateway = new ModelGatewayService({} as any, {} as any);
  const snapshot = gateway.getRoutingHealthSnapshot(1_760_000_000_000);
  assert.equal(snapshot.at, new Date(1_760_000_000_000).toISOString());
  assert.equal(snapshot.profile, resolveModelRoutingProfile());
  assert.equal(snapshot.providers.length, 4);
  assert.deepEqual(
    snapshot.providers.map((item) => item.provider),
    ['codex-local', 'openai', 'openrouter', 'ollama']
  );
  assert.equal(snapshot.healthProbe.windowMs > 0, true);
});

test('test_high evidence rejects free, mock and local models except explicitly allowed Codex local', () => {
  const previous = process.env.CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE;
  delete process.env.CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE;
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'openrouter/free', provider: 'openrouter' }), true);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'ollama/qwen3.5:9b', provider: 'ollama' }), true);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'codex-local/quick', provider: 'codex-local' }), true);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'mock/openrouter-local', provider: 'openrouter' }), true);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'draftorbit/heuristic', provider: 'openrouter' }), true);
  process.env.CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE = '1';
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'codex-local/quick', provider: 'codex-local' }), false);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'gpt-5.5', provider: 'openai' }), false);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'anthropic/claude-sonnet-4.6', provider: 'openrouter' }), false);
  if (previous === undefined) delete process.env.CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE;
  else process.env.CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE = previous;
});

test('CoreModule wires ModelGatewayService through an explicit factory with CodexLocalService', () => {
  const source = readFileSync(join(repoRoot, 'apps/api/src/core.module.ts'), 'utf8');
  assert.match(source, /CodexLocalService/u);
  assert.match(source, /provide:\s*ModelGatewayService/u);
  assert.match(source, /useFactory:\s*\(\s*openRouter:\s*OpenRouterService,\s*codexLocal:\s*CodexLocalService\s*\)\s*=>\s*new ModelGatewayService\(openRouter,\s*codexLocal\)/u);
  assert.match(source, /inject:\s*\[\s*OpenRouterService,\s*CodexLocalService\s*\]/u);
});
