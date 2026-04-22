import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoutingFallbackHotspots } from '../src/modules/usage/usage.service';

test('buildRoutingFallbackHotspots returns top fallback lanes sorted by hits then rate', () => {
  const hotspots = buildRoutingFallbackHotspots([
    { eventType: 'GENERATION', modelUsed: 'gpt-5.4', fallbackDepth: 0 },
    { eventType: 'GENERATION', modelUsed: 'gpt-5.4', fallbackDepth: 2 },
    { eventType: 'GENERATION', modelUsed: 'gpt-5.4', fallbackDepth: 1 },
    { eventType: 'GENERATION', modelUsed: 'anthropic/claude-sonnet-4.6', fallbackDepth: 1 },
    { eventType: 'GENERATION', modelUsed: 'anthropic/claude-sonnet-4.6', fallbackDepth: 0 },
    { eventType: 'IMAGE', modelUsed: 'ollama/qwen3.5:9b', fallbackDepth: 3 },
    { eventType: 'IMAGE', modelUsed: 'ollama/qwen3.5:9b', fallbackDepth: 0 },
    { eventType: 'IMAGE', modelUsed: 'codex-local/quick', fallbackDepth: 0 }
  ]);

  assert.deepEqual(
    hotspots.map((item) => ({
      lane: item.lane,
      fallbackHits: item.fallbackHits,
      totalCalls: item.totalCalls
    })),
    [
      { lane: 'generation:openai', fallbackHits: 2, totalCalls: 3 },
      { lane: 'generation:openrouter', fallbackHits: 1, totalCalls: 2 },
      { lane: 'image:ollama', fallbackHits: 1, totalCalls: 2 }
    ]
  );
});

test('buildRoutingFallbackHotspots limits result size and omits lanes without fallback', () => {
  const hotspots = buildRoutingFallbackHotspots(
    [
      { eventType: 'GENERATION', modelUsed: 'gpt-5.4', fallbackDepth: 1 },
      { eventType: 'REPLY', modelUsed: 'gpt-5.4-mini', fallbackDepth: 1 },
      { eventType: 'IMAGE', modelUsed: 'codex-local/quick', fallbackDepth: 0 },
      { eventType: 'PUBLISH', modelUsed: 'ollama/qwen3.5:9b', fallbackDepth: 0 }
    ],
    1
  );

  assert.equal(hotspots.length, 1);
  assert.equal(hotspots[0]?.lane, 'generation:openai');
  assert.equal(hotspots[0]?.fallbackRate, 1);
});
