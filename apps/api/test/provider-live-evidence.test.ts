import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderLiveEvidenceReport,
  classifyProviderKeyState,
  isAcceptedLiveQualityEvidence,
  redactProviderError,
  summarizeProviderEvidence
} from '../../../scripts/provider-live-evidence';

test('live provider evidence skips missing keys without counting local or mock evidence', () => {
  assert.equal(classifyProviderKeyState('OPENAI_API_KEY', {}), 'skipped_missing_key');
  assert.equal(classifyProviderKeyState('OPENROUTER_API_KEY', { OPENROUTER_API_KEY: '  ' }), 'skipped_missing_key');
  assert.equal(classifyProviderKeyState('TAVILY_API_KEY', { TAVILY_API_KEY: 'tvly-test' }), 'configured');

  assert.equal(isAcceptedLiveQualityEvidence({ provider: 'openai', modelUsed: 'gpt-5.4-mini', content: 'DraftOrbit live OpenAI evidence OK.' }, 'openai'), true);
  assert.equal(isAcceptedLiveQualityEvidence({ provider: 'codex-local', modelUsed: 'codex-local/quick', content: 'local evidence' }, 'openai'), false);
  assert.equal(isAcceptedLiveQualityEvidence({ provider: 'openrouter', modelUsed: 'mock/openrouter-local', content: 'mock evidence' }, 'openrouter'), false);
  assert.equal(isAcceptedLiveQualityEvidence({ provider: 'openrouter', modelUsed: 'openrouter/free', content: 'free evidence' }, 'openrouter'), false);
});

test('provider live evidence report records skip/pass/fail without leaking secrets', () => {
  const secret = 'sk-live-secret-1234567890';
  const redacted = redactProviderError(new Error(`OpenAI error 401: bad key ${secret}`), [secret]);
  assert.doesNotMatch(redacted, /sk-live-secret/u);
  assert.match(redacted, /\[REDACTED_SECRET\]/u);

  const results = [
    summarizeProviderEvidence({
      provider: 'openai',
      status: 'skipped_missing_key',
      keyEnv: 'OPENAI_API_KEY',
      startedAt: '2026-04-17T00:00:00.000Z',
      endedAt: '2026-04-17T00:00:00.001Z'
    }),
    summarizeProviderEvidence({
      provider: 'openrouter',
      status: 'live_pass',
      keyEnv: 'OPENROUTER_API_KEY',
      modelUsed: 'anthropic/claude-sonnet-4.6',
      contentExcerpt: 'DraftOrbit live OpenRouter evidence OK.',
      startedAt: '2026-04-17T00:00:00.000Z',
      endedAt: '2026-04-17T00:00:01.000Z',
      usage: { inputTokens: 12, outputTokens: 8, costUsd: 0.001 }
    }),
    summarizeProviderEvidence({
      provider: 'tavily',
      status: 'fail_closed',
      keyEnv: 'TAVILY_API_KEY',
      error: redacted,
      startedAt: '2026-04-17T00:00:00.000Z',
      endedAt: '2026-04-17T00:00:01.000Z'
    })
  ];

  const report = buildProviderLiveEvidenceReport({
    stamp: '2026-04-17_00-00-00',
    evidenceRoot: '/tmp/provider-live-evidence',
    results
  });

  assert.match(report, /OpenAI[\s\S]*skipped_missing_key/u);
  assert.match(report, /OpenRouter[\s\S]*live_pass/u);
  assert.match(report, /Tavily[\s\S]*fail_closed/u);
  assert.match(report, /local default remains independent/u);
  assert.doesNotMatch(report, /sk-live-secret/u);
});
