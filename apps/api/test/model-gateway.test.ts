import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildModelGatewayCandidatePool,
  isInvalidTestHighEvidenceModel,
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
    openaiHighModels: ['gpt-5.4'],
    openaiFloorModels: ['gpt-5.4-mini'],
    openrouterHighModels: ['anthropic/claude-sonnet-4.6', 'qwen/qwen3-max'],
    openrouterFloorModels: ['deepseek/deepseek-v3.2'],
    openrouterFreeModels: ['openrouter/free'],
    ollamaModels: ['qwen3.5:9b-fast'],
    codexLocalEnabled: true
  });

  assert.deepEqual(
    candidates.map((item) => `${item.provider}:${item.model}:${item.tier}`).slice(0, 5),
    [
      'openai:gpt-5.4:quality_fallback',
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

test('local_free candidate pool can use Ollama and OpenRouter free before paid models', () => {
  const candidates = buildModelGatewayCandidatePool({
    profile: 'local_free',
    taskType: 'research',
    openaiAvailable: true,
    openaiHighModels: ['gpt-5.4'],
    openaiFloorModels: ['gpt-5.4-mini'],
    openrouterHighModels: ['anthropic/claude-sonnet-4.6'],
    openrouterFloorModels: ['deepseek/deepseek-v3.2'],
    openrouterFreeModels: ['openrouter/free'],
    ollamaModels: ['qwen3.5:9b-fast'],
    codexLocalEnabled: false
  });

  assert.deepEqual(
    candidates.map((item) => `${item.provider}:${item.model}:${item.tier}`).slice(0, 3),
    [
      'ollama:qwen3.5:9b-fast:free_first',
      'openrouter:openrouter/free:free_first',
      'openrouter:deepseek/deepseek-v3.2:floor'
    ]
  );
});

test('test_high evidence rejects free, local, mock and heuristic models', () => {
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'openrouter/free', provider: 'openrouter' }), true);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'ollama/qwen3.5:9b', provider: 'ollama' }), true);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'mock/openrouter-local', provider: 'openrouter' }), true);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'draftorbit/heuristic', provider: 'openrouter' }), true);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'gpt-5.4', provider: 'openai' }), false);
  assert.equal(isInvalidTestHighEvidenceModel({ modelUsed: 'anthropic/claude-sonnet-4.6', provider: 'openrouter' }), false);
});

test('CoreModule wires ModelGatewayService through an explicit factory for tsx runtime metadata', () => {
  const source = readFileSync(join(repoRoot, 'apps/api/src/core.module.ts'), 'utf8');
  assert.match(source, /provide:\s*ModelGatewayService/u);
  assert.match(source, /useFactory:\s*\(openRouter:\s*OpenRouterService\)\s*=>\s*new ModelGatewayService\(openRouter\)/u);
  assert.match(source, /inject:\s*\[\s*OpenRouterService\s*\]/u);
});
