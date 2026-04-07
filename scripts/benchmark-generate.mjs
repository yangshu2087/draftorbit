#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const API_URL = (process.env.API_URL ?? 'http://127.0.0.1:4100').replace(/\/$/, '');
const ITERATIONS = Math.max(1, Number(process.env.ITERATIONS ?? 3));
const TIMEOUT_MS = Math.max(30000, Number(process.env.TIMEOUT_MS ?? 240000));
const RUN_ID =
  process.env.RUN_ID ??
  `bench-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}`;
const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts', 'perf-generate', RUN_ID);

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  const weight = rank - low;
  return Math.round(sorted[low] * (1 - weight) + sorted[high] * weight);
}

async function ensureDir() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
}

async function request(pathname, { method = 'GET', token = '', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await res.text();
    const payload = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new Error(`${method} ${pathname} failed: ${res.status} ${text.slice(0, 300)}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveToken() {
  const fromEnv = (process.env.UAT_TOKEN ?? '').trim();
  if (fromEnv) return fromEnv;
  const session = await request('/auth/local/session', { method: 'POST' });
  const token = String(session?.token ?? '').trim();
  if (!token) throw new Error('Failed to obtain local session token');
  return token;
}

function extractTweet(detail) {
  const steps = Array.isArray(detail?.steps) ? detail.steps : [];
  const packageStep = steps.find((row) => row?.step === 'PACKAGE');
  if (typeof packageStep?.content !== 'string') return '';
  try {
    const parsed = JSON.parse(packageStep.content);
    return String(parsed?.tweet ?? '').trim();
  } catch {
    return '';
  }
}

async function consumeSse(generationId, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const events = [];

  try {
    const res = await fetch(`${API_URL}/v2/generate/${generationId}/stream`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream'
      },
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`SSE failed: ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) return events;
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';

      for (const chunk of parts) {
        const line = chunk
          .split('\n')
          .map((row) => row.trim())
          .find((row) => row.startsWith('data:'));
        if (!line) continue;
        const payload = line.replace(/^data:\s*/, '');
        if (payload === '[DONE]') return events;
        try {
          const parsed = JSON.parse(payload);
          events.push(parsed);
          if (parsed?.status === 'done' && parsed?.step === 'PACKAGE') {
            return events;
          }
          if (parsed?.status === 'failed' || parsed?.step === 'error') {
            return events;
          }
        } catch {
          // noop
        }
      }
    }

    return events;
  } finally {
    clearTimeout(timer);
  }
}

async function runOnce(index, token) {
  const startedAt = Date.now();
  const run = {
    index,
    ok: false,
    durationMs: null,
    generationId: null,
    status: 'UNKNOWN',
    tweetChars: 0,
    hasPackageDoneEvent: false
  };

  try {
    const start = await request('/v2/generate/run', {
      method: 'POST',
      token,
      body: {
        mode: 'brief',
        brief: {
          objective: '互动',
          audience: '中文创作者',
          tone: '专业清晰',
          postType: '观点短推',
          cta: '欢迎留言讨论',
          topicPreset: `P0 性能压测 ${RUN_ID} #${index}`
        },
        type: 'TWEET',
        language: 'zh',
        useStyle: true
      }
    });

    const generationId = String(start?.generationId ?? '').trim();
    if (!generationId) throw new Error('generationId missing');
    run.generationId = generationId;

    const events = await consumeSse(generationId, token);
    run.hasPackageDoneEvent = events.some((evt) => evt?.step === 'PACKAGE' && evt?.status === 'done');

    const detail = await request(`/v2/generate/${generationId}`, {
      method: 'GET',
      token
    });

    const tweet = extractTweet(detail);
    run.status = String(detail?.status ?? 'UNKNOWN');
    run.tweetChars = [...tweet].length;
    run.ok = Boolean(tweet) && run.status === 'DONE';
  } catch (error) {
    run.status = error instanceof Error ? error.message : String(error);
    run.ok = false;
  } finally {
    run.durationMs = Date.now() - startedAt;
  }

  return run;
}

async function main() {
  await ensureDir();
  const token = await resolveToken();
  const runs = [];

  for (let i = 1; i <= ITERATIONS; i += 1) {
    const row = await runOnce(i, token);
    runs.push(row);
    process.stdout.write(`[bench] #${i} ok=${row.ok} duration=${row.durationMs}ms status=${row.status}\n`);
  }

  const durationAll = runs.map((row) => row.durationMs).filter((v) => Number.isFinite(v));
  const durationPass = runs.filter((row) => row.ok).map((row) => row.durationMs);
  const passRate = runs.length > 0 ? runs.filter((row) => row.ok).length / runs.length : 0;

  const summary = {
    runId: RUN_ID,
    apiUrl: API_URL,
    iterations: ITERATIONS,
    timeoutMs: TIMEOUT_MS,
    passRate,
    p50Ms: percentile(durationAll, 50),
    p90Ms: percentile(durationAll, 90),
    p50PassOnlyMs: percentile(durationPass, 50),
    p90PassOnlyMs: percentile(durationPass, 90),
    runs
  };

  const summaryPath = path.join(ARTIFACT_DIR, 'summary.json');
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  process.stdout.write(`[bench] summary: ${summaryPath}\n`);
  if (passRate < 1) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`[bench] fatal: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
