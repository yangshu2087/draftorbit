import test from 'node:test';
import assert from 'node:assert/strict';

import { OpenRouterService, type ChatMessage } from '../src/common/openrouter.service';

test('OpenRouterService times out if the response body stalls after headers arrive', async () => {
  const service = new OpenRouterService();
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalMock = process.env.OPENROUTER_MOCK_MODE;

  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_MOCK_MODE = '0';

  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return JSON.stringify({
          model: 'mock/openrouter-body-stall',
          choices: [{ message: { content: 'hello' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 }
        });
      }
    } as Response;
  }) as typeof fetch;

  const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

  try {
    await assert.rejects(
      service.chatWithRouting(messages, {
        taskType: 'humanize',
        timeoutMs: 50,
        maxCandidates: 1
      }),
      /OpenRouter timeout after \d+ms/u
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalApiKey;
    if (originalMock == null) delete process.env.OPENROUTER_MOCK_MODE;
    else process.env.OPENROUTER_MOCK_MODE = originalMock;
  }
});

test('OpenRouterService times out even if fetch never settles', async () => {
  const service = new OpenRouterService();
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalMock = process.env.OPENROUTER_MOCK_MODE;

  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_MOCK_MODE = '0';

  globalThis.fetch = (() => new Promise(() => undefined)) as typeof fetch;

  const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

  try {
    await assert.rejects(
      Promise.race([
        service.chatWithRouting(messages, {
          taskType: 'humanize',
          timeoutMs: 50,
          maxCandidates: 1
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('did not time out')), 200))
      ]),
      /OpenRouter timeout after 50ms/u
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalApiKey;
    if (originalMock == null) delete process.env.OPENROUTER_MOCK_MODE;
    else process.env.OPENROUTER_MOCK_MODE = originalMock;
  }
});

test('OpenRouterService routes local profile by task shape', () => {
  const service = new OpenRouterService();
  const originalProfile = process.env.OPENROUTER_ROUTING_PROFILE;
  const originalFree = process.env.OPENROUTER_FREE_MODELS;
  const originalFloor = process.env.OPENROUTER_FLOOR_MODELS;
  const originalHigh = process.env.OPENROUTER_HIGH_MODELS;

  process.env.OPENROUTER_ROUTING_PROFILE = 'local';
  process.env.OPENROUTER_FREE_MODELS = 'free-a';
  process.env.OPENROUTER_FLOOR_MODELS = 'floor-a,floor-b';
  process.env.OPENROUTER_HIGH_MODELS = 'high-a,high-b';

  try {
    const researchCandidates = (service as any).buildCandidates({ taskType: 'research' }) as Array<{ model: string }>;
    const draftCandidates = (service as any).buildCandidates({ taskType: 'draft' }) as Array<{ model: string }>;

    assert.deepEqual(
      researchCandidates.map((candidate) => candidate.model),
      ['free-a', 'floor-a', 'floor-b', 'high-a', 'high-b']
    );
    assert.deepEqual(
      draftCandidates.map((candidate) => candidate.model),
      ['floor-a', 'floor-b', 'high-a', 'high-b']
    );
  } finally {
    if (originalProfile == null) delete process.env.OPENROUTER_ROUTING_PROFILE;
    else process.env.OPENROUTER_ROUTING_PROFILE = originalProfile;
    if (originalFree == null) delete process.env.OPENROUTER_FREE_MODELS;
    else process.env.OPENROUTER_FREE_MODELS = originalFree;
    if (originalFloor == null) delete process.env.OPENROUTER_FLOOR_MODELS;
    else process.env.OPENROUTER_FLOOR_MODELS = originalFloor;
    if (originalHigh == null) delete process.env.OPENROUTER_HIGH_MODELS;
    else process.env.OPENROUTER_HIGH_MODELS = originalHigh;
  }
});

test('OpenRouterService routes test_high profile to high -> floor without free', () => {
  const service = new OpenRouterService();
  const originalProfile = process.env.OPENROUTER_ROUTING_PROFILE;
  const originalFree = process.env.OPENROUTER_FREE_MODELS;
  const originalFloor = process.env.OPENROUTER_FLOOR_MODELS;
  const originalHigh = process.env.OPENROUTER_HIGH_MODELS;

  process.env.OPENROUTER_ROUTING_PROFILE = 'test_high';
  process.env.OPENROUTER_FREE_MODELS = 'free-a';
  process.env.OPENROUTER_FLOOR_MODELS = 'floor-a,floor-b';
  process.env.OPENROUTER_HIGH_MODELS = 'high-a,high-b';

  try {
    const candidates = (service as any).buildCandidates({ taskType: 'research' }) as Array<{ model: string }>;
    assert.deepEqual(
      candidates.map((candidate) => candidate.model),
      ['high-a', 'high-b', 'floor-a', 'floor-b']
    );
    assert.ok(!candidates.some((candidate) => candidate.model === 'free-a'));
  } finally {
    if (originalProfile == null) delete process.env.OPENROUTER_ROUTING_PROFILE;
    else process.env.OPENROUTER_ROUTING_PROFILE = originalProfile;
    if (originalFree == null) delete process.env.OPENROUTER_FREE_MODELS;
    else process.env.OPENROUTER_FREE_MODELS = originalFree;
    if (originalFloor == null) delete process.env.OPENROUTER_FLOOR_MODELS;
    else process.env.OPENROUTER_FLOOR_MODELS = originalFloor;
    if (originalHigh == null) delete process.env.OPENROUTER_HIGH_MODELS;
    else process.env.OPENROUTER_HIGH_MODELS = originalHigh;
  }
});

test('OpenRouterService routes prod_balanced profile by task priority', () => {
  const service = new OpenRouterService();
  const originalProfile = process.env.OPENROUTER_ROUTING_PROFILE;
  const originalFree = process.env.OPENROUTER_FREE_MODELS;
  const originalFloor = process.env.OPENROUTER_FLOOR_MODELS;
  const originalHigh = process.env.OPENROUTER_HIGH_MODELS;

  process.env.OPENROUTER_ROUTING_PROFILE = 'prod_balanced';
  process.env.OPENROUTER_FREE_MODELS = 'free-a';
  process.env.OPENROUTER_FLOOR_MODELS = 'floor-a,floor-b';
  process.env.OPENROUTER_HIGH_MODELS = 'high-a,high-b';

  try {
    const researchCandidates = (service as any).buildCandidates({ taskType: 'research' }) as Array<{ model: string }>;
    const draftCandidates = (service as any).buildCandidates({ taskType: 'draft' }) as Array<{ model: string }>;

    assert.deepEqual(
      researchCandidates.map((candidate) => candidate.model),
      ['floor-a', 'floor-b', 'high-a', 'high-b']
    );
    assert.deepEqual(
      draftCandidates.map((candidate) => candidate.model),
      ['high-a', 'high-b', 'floor-a', 'floor-b']
    );
    assert.ok(!researchCandidates.some((candidate) => candidate.model === 'free-a'));
    assert.ok(!draftCandidates.some((candidate) => candidate.model === 'free-a'));
  } finally {
    if (originalProfile == null) delete process.env.OPENROUTER_ROUTING_PROFILE;
    else process.env.OPENROUTER_ROUTING_PROFILE = originalProfile;
    if (originalFree == null) delete process.env.OPENROUTER_FREE_MODELS;
    else process.env.OPENROUTER_FREE_MODELS = originalFree;
    if (originalFloor == null) delete process.env.OPENROUTER_FLOOR_MODELS;
    else process.env.OPENROUTER_FLOOR_MODELS = originalFloor;
    if (originalHigh == null) delete process.env.OPENROUTER_HIGH_MODELS;
    else process.env.OPENROUTER_HIGH_MODELS = originalHigh;
  }
});

test('OpenRouterService widens default candidate count enough to preserve profile fallback chains', () => {
  const service = new OpenRouterService();
  const originalProfile = process.env.OPENROUTER_ROUTING_PROFILE;
  const originalFree = process.env.OPENROUTER_FREE_MODELS;
  const originalFloor = process.env.OPENROUTER_FLOOR_MODELS;
  const originalHigh = process.env.OPENROUTER_HIGH_MODELS;
  const originalMax = process.env.OPENROUTER_MAX_CANDIDATES;

  process.env.OPENROUTER_FLOOR_MODELS = 'floor-a,floor-b';
  process.env.OPENROUTER_HIGH_MODELS = 'high-a,high-b,high-c';
  process.env.OPENROUTER_FREE_MODELS = 'free-a';
  delete process.env.OPENROUTER_MAX_CANDIDATES;

  try {
    process.env.OPENROUTER_ROUTING_PROFILE = 'test_high';
    assert.equal((service as any).resolveProfileCandidateFloor('research', false), 5);

    process.env.OPENROUTER_ROUTING_PROFILE = 'prod_balanced';
    assert.equal((service as any).resolveProfileCandidateFloor('draft', false), 5);
    assert.equal((service as any).resolveProfileCandidateFloor('research', false), 5);

    process.env.OPENROUTER_ROUTING_PROFILE = 'local';
    assert.equal((service as any).resolveProfileCandidateFloor('research', false), 3);
  } finally {
    if (originalProfile == null) delete process.env.OPENROUTER_ROUTING_PROFILE;
    else process.env.OPENROUTER_ROUTING_PROFILE = originalProfile;
    if (originalFree == null) delete process.env.OPENROUTER_FREE_MODELS;
    else process.env.OPENROUTER_FREE_MODELS = originalFree;
    if (originalFloor == null) delete process.env.OPENROUTER_FLOOR_MODELS;
    else process.env.OPENROUTER_FLOOR_MODELS = originalFloor;
    if (originalHigh == null) delete process.env.OPENROUTER_HIGH_MODELS;
    else process.env.OPENROUTER_HIGH_MODELS = originalHigh;
    if (originalMax == null) delete process.env.OPENROUTER_MAX_CANDIDATES;
    else process.env.OPENROUTER_MAX_CANDIDATES = originalMax;
  }
});

test('OpenRouterService sends a bounded max_tokens value for package calls', async () => {
  const service = new OpenRouterService();
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalMock = process.env.OPENROUTER_MOCK_MODE;
  const originalProfile = process.env.OPENROUTER_ROUTING_PROFILE;
  const originalHigh = process.env.OPENROUTER_HIGH_MODELS;
  let requestBody: Record<string, unknown> | null = null;

  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_MOCK_MODE = '0';
  process.env.OPENROUTER_ROUTING_PROFILE = 'test_high';
  process.env.OPENROUTER_HIGH_MODELS = 'high-a';

  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          model: 'high-a',
          choices: [{ message: { content: '{"tweet":"ok","variants":[]}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0 }
        })
    } as Response;
  }) as typeof fetch;

  try {
    await service.chatWithRouting([{ role: 'user', content: 'hello' }], {
      taskType: 'package',
      timeoutMs: 1000,
      maxCandidates: 1
    });

    assert.equal(requestBody?.max_tokens, 3000);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalApiKey;
    if (originalMock == null) delete process.env.OPENROUTER_MOCK_MODE;
    else process.env.OPENROUTER_MOCK_MODE = originalMock;
    if (originalProfile == null) delete process.env.OPENROUTER_ROUTING_PROFILE;
    else process.env.OPENROUTER_ROUTING_PROFILE = originalProfile;
    if (originalHigh == null) delete process.env.OPENROUTER_HIGH_MODELS;
    else process.env.OPENROUTER_HIGH_MODELS = originalHigh;
  }
});

test('OpenRouterService retries repeated 402 token-budget failures with progressively smaller max_tokens budgets', async () => {
  const service = new OpenRouterService();
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalMock = process.env.OPENROUTER_MOCK_MODE;
  const originalProfile = process.env.OPENROUTER_ROUTING_PROFILE;
  const originalHigh = process.env.OPENROUTER_HIGH_MODELS;
  const requestBodies: Array<Record<string, unknown>> = [];

  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_MOCK_MODE = '0';
  process.env.OPENROUTER_ROUTING_PROFILE = 'test_high';
  process.env.OPENROUTER_HIGH_MODELS = 'high-a';

  globalThis.fetch = (async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    if (requestBodies.length === 1) {
      return {
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        text: async () =>
          'OpenRouter error: This request requires more credits. Your account can only afford 1700 tokens.'
      } as Response;
    }
    if (requestBodies.length === 2) {
      return {
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        text: async () =>
          'OpenRouter error: This request requires more credits. Your account can only afford 700 tokens.'
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () =>
        JSON.stringify({
          model: 'high-a',
          choices: [{ message: { content: '{"tweet":"ok","variants":[]}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0 }
        })
    } as Response;
  }) as typeof fetch;

  try {
    const result = await service.chatWithRouting([{ role: 'user', content: 'hello' }], {
      taskType: 'package',
      timeoutMs: 1000,
      maxCandidates: 1
    });

    assert.equal(result.modelUsed, 'high-a');
    assert.equal(requestBodies.length, 3);
    assert.equal(requestBodies[0]?.max_tokens, 3000);
    assert.ok(Number(requestBodies[1]?.max_tokens) <= 1530);
    assert.ok(Number(requestBodies[1]?.max_tokens) >= 1200);
    assert.ok(Number(requestBodies[2]?.max_tokens) <= 630);
    assert.ok(Number(requestBodies[2]?.max_tokens) >= 512);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey == null) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalApiKey;
    if (originalMock == null) delete process.env.OPENROUTER_MOCK_MODE;
    else process.env.OPENROUTER_MOCK_MODE = originalMock;
    if (originalProfile == null) delete process.env.OPENROUTER_ROUTING_PROFILE;
    else process.env.OPENROUTER_ROUTING_PROFILE = originalProfile;
    if (originalHigh == null) delete process.env.OPENROUTER_HIGH_MODELS;
    else process.env.OPENROUTER_HIGH_MODELS = originalHigh;
  }
});

test('OpenRouterService can reduce low max_tokens budgets after 402 responses', () => {
  const service = new OpenRouterService();
  const error = new Error(
    'OpenRouter error 402: {"error":{"message":"This request requires more credits. You requested up to 128 tokens, but can only afford 88."}}'
  );

  assert.equal((service as any).resolveReducedMaxTokensAfter402(error, 128), 79);
  assert.equal(
    (service as any).resolveReducedMaxTokensAfter402(
      new Error('OpenRouter error 402: {"error":{"message":"can only afford 25"}}'),
      128
    ),
    22
  );
});
