import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateBenchmarkCase } from '../apps/api/src/modules/generate/benchmark-evaluation';
import { BAOYU_ADVERSARIAL_PROMPT_SUITE } from '../apps/api/src/modules/generate/benchmarks/baoyu-adversarial-prompt-suite';
import { BAOYU_FIXED_PROMPT_SUITE } from '../apps/api/src/modules/generate/benchmarks/baoyu-fixed-prompt-suite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiUrl = process.env.API_URL?.trim() || 'http://127.0.0.1:4000';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function createStamp(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(
    date.getMinutes()
  )}-${pad(date.getSeconds())}`;
}

async function requestJson(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }
  return payload as Record<string, any>;
}

function parseStreamEvents(raw: string) {
  return raw
    .replace(/\r\n/g, '\n')
    .split(/\n\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const dataText = chunk
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      try {
        return dataText ? JSON.parse(dataText) : null;
      } catch {
        return dataText;
      }
    })
    .filter(Boolean);
}

async function consumeRunStream(token: string, runId: string, artifactDir: string, signal?: AbortSignal) {
  let raw = '';
  let recoverableStreamError: string | null = null;
  try {
    const response = await fetch(`${apiUrl}/v3/chat/runs/${runId}/stream`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
      signal
    });
    if (!response.ok || !response.body) throw new Error(`SSE failed for ${runId}: ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        raw += decoder.decode();
        break;
      }
      raw += decoder.decode(value, { stream: true });
      const events = parseStreamEvents(raw);
      const last = [...events].reverse().find((event) => event && typeof event === 'object') as Record<string, any> | undefined;
      if (String(last?.stage ?? '').toLowerCase() === 'publish_prep' && String(last?.status ?? '').toLowerCase() === 'done') {
        await reader.cancel();
        break;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error && typeof error === 'object' && 'cause' in error ? (error as { cause?: unknown }).cause : null;
    const causeCode = cause && typeof cause === 'object' && 'code' in cause ? String((cause as { code?: unknown }).code) : '';
    const recoverable =
      signal?.aborted ||
      /terminated|body timeout|aborted/iu.test(message) ||
      causeCode === 'UND_ERR_BODY_TIMEOUT' ||
      causeCode === 'UND_ERR_ABORTED';
    if (!recoverable) throw error;
    recoverableStreamError = `${message}${causeCode ? ` (${causeCode})` : ''}`;
  }
  fs.writeFileSync(path.join(artifactDir, 'stream.txt'), raw);
  fs.writeFileSync(
    path.join(artifactDir, 'stream.json'),
    JSON.stringify({ events: parseStreamEvents(raw), recoverableStreamError }, null, 2)
  );
}

async function waitForFinal(token: string, runId: string) {
  const attempts = Number(process.env.BENCHMARK_FINAL_WAIT_ATTEMPTS ?? 240);
  for (let index = 0; index < attempts; index += 1) {
    const finalPayload = await requestJson(`${apiUrl}/v3/chat/runs/${runId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (finalPayload.status === 'DONE' || finalPayload.status === 'FAILED') return finalPayload;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for final payload for ${runId}`);
}

function runtimeCases() {
  const baseSuite = (
    process.env.BAOYU_RUNTIME_BENCHMARK_FULL === '1'
      ? [...BAOYU_FIXED_PROMPT_SUITE, ...BAOYU_ADVERSARIAL_PROMPT_SUITE]
      : [
          BAOYU_ADVERSARIAL_PROMPT_SUITE.find((item) => item.id === 'adversarial-tweet-cold-start-real-regression'),
          BAOYU_FIXED_PROMPT_SUITE.find((item) => item.id === 'thread-team-workflow') ??
            BAOYU_FIXED_PROMPT_SUITE.find((item) => item.format === 'thread'),
          BAOYU_FIXED_PROMPT_SUITE.find((item) => item.id === 'article-ai-cold-start') ??
            BAOYU_FIXED_PROMPT_SUITE.find((item) => item.format === 'article')
        ]
  ).filter((item): item is NonNullable<typeof item> => Boolean(item));

  const requestedIds = String(process.env.BAOYU_RUNTIME_BENCHMARK_FILTER ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!requestedIds.length) return baseSuite;

  const requested = new Set(requestedIds);
  const filtered = baseSuite.filter((item) => requested.has(item.id));
  const missing = requestedIds.filter((id) => !filtered.some((item) => item.id === id));
  if (missing.length) {
    throw new Error(`Unknown BAOYU_RUNTIME_BENCHMARK_FILTER case id(s): ${missing.join(', ')}`);
  }
  return filtered;
}

async function main() {
  const stamp = createStamp();
  const artifactRoot = path.join(repoRoot, 'artifacts', 'baoyu-runtime-benchmark', stamp);
  const reportPath = path.join(repoRoot, 'output', 'reports', 'uat-full', `BAOYU-RUNTIME-BENCHMARK-${stamp}.md`);
  fs.mkdirSync(artifactRoot, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const session = await requestJson(`${apiUrl}/auth/local/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}'
  });
  const token = String(session.token);
  const suite = runtimeCases();
  const results = [];

  for (const benchmarkCase of suite) {
    console.log(`[baoyu-runtime] start ${benchmarkCase.id} (${benchmarkCase.format})`);
    const artifactDir = path.join(artifactRoot, benchmarkCase.id);
    fs.mkdirSync(artifactDir, { recursive: true });
    const withImage = true;
    const start = await requestJson(`${apiUrl}/v3/chat/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ intent: benchmarkCase.prompt, format: benchmarkCase.format, withImage, safeMode: true })
    });
    fs.writeFileSync(path.join(artifactDir, 'start.json'), JSON.stringify(start, null, 2));

    const streamAbort = new AbortController();
    const streamPromise = consumeRunStream(token, String(start.runId), artifactDir, streamAbort.signal);
    let finalPayload: Record<string, any>;
    try {
      finalPayload = await waitForFinal(token, String(start.runId));
    } finally {
      streamAbort.abort();
    }
    await streamPromise.catch((error) => {
      if (!streamAbort.signal.aborted) throw error;
    });
    fs.writeFileSync(path.join(artifactDir, 'final.json'), JSON.stringify(finalPayload, null, 2));

    const visualAssets = Array.isArray(finalPayload.result?.visualAssets) ? finalPayload.result.visualAssets : [];
    const runtimeValid = finalPayload.result?.runtime?.engine === 'baoyu-skills';
    const imageEvidenceValid =
      visualAssets.length > 0 &&
      visualAssets.every((asset: any) => asset.status === 'ready' || asset.status === 'failed') &&
      visualAssets.some((asset: any) => asset.status === 'ready' && asset.assetUrl);
    const noPlaceholder = visualAssets.every((asset: any) => !/placeholder|mock/iu.test(String(asset.assetUrl ?? asset.error ?? '')));
    const noVisualHardFails = (finalPayload.result?.qualityGate?.visualHardFails ?? []).length === 0;
    const evaluation = evaluateBenchmarkCase({
      benchmarkCase,
      text: String(finalPayload.result?.text ?? ''),
      qualitySignals: {
        hookStrength: Number(finalPayload.result?.qualitySignals?.hookStrength ?? 0),
        specificity: Number(finalPayload.result?.qualitySignals?.specificity ?? 0),
        evidence: Number(finalPayload.result?.qualitySignals?.evidenceDensity ?? 0),
        conversationality: Number(finalPayload.result?.qualitySignals?.conversationalFlow ?? 0),
        ctaNaturalness: Number(finalPayload.result?.qualitySignals?.ctaNaturalness ?? 0),
        antiPatternPenalty: 0,
        humanLikeness: Number(finalPayload.result?.qualitySignals?.humanLikeness ?? 0),
        structuralReadability: 0,
        visualizability: Number(finalPayload.result?.qualitySignals?.visualizability ?? 0),
        derivativeReadiness: 0
      },
      routing: {
        primaryModel: String(finalPayload.result?.routing?.primaryModel ?? ''),
        routingTier: String(finalPayload.result?.routing?.routingTier ?? '')
      },
      requireRealModel: true
    });
    const runtimePass =
      evaluation.pass &&
      runtimeValid &&
      imageEvidenceValid &&
      noPlaceholder &&
      noVisualHardFails &&
      finalPayload.result?.qualityGate?.safeToDisplay !== false;
    const runtimeHardFails = [
      ...(runtimeValid ? [] : ['runtime.engine 不是 baoyu-skills']),
      ...(imageEvidenceValid ? [] : ['visualAssets 缺少真实状态证据']),
      ...(noPlaceholder ? [] : ['visualAssets 使用了 placeholder/mock']),
      ...(noVisualHardFails ? [] : [`visualHardFails:${finalPayload.result?.qualityGate?.visualHardFails?.join(',')}`])
    ];
    fs.writeFileSync(path.join(artifactDir, 'evaluation.json'), JSON.stringify({ evaluation, runtimeHardFails, runtimePass }, null, 2));
    results.push({ benchmarkCase, finalPayload, evaluation, runtimeHardFails, runtimePass });
    console.log(`[baoyu-runtime] ${runtimePass ? 'PASS' : 'FAIL'} ${benchmarkCase.id}`);
  }

  const passCount = results.filter((item) => item.runtimePass).length;
  const report = [
    `# Baoyu Runtime Benchmark (${stamp})`,
    '',
    `- API: \`${apiUrl}\``,
    `- Evidence root: \`${artifactRoot}\``,
    `- Cases: \`${results.length}\``,
    `- Pass count: \`${passCount}/${results.length}\``,
    `- Full suite: \`${process.env.BAOYU_RUNTIME_BENCHMARK_FULL === '1'}\``,
    '',
    ...results.flatMap(({ benchmarkCase, finalPayload, evaluation, runtimeHardFails, runtimePass }) => [
      `## ${benchmarkCase.id} · ${benchmarkCase.format.toUpperCase()}`,
      '',
      `- runtimePass: \`${runtimePass}\``,
      `- primaryModel: \`${String(finalPayload.result?.routing?.primaryModel ?? '')}\``,
      `- routingTier: \`${String(finalPayload.result?.routing?.routingTier ?? '')}\``,
      `- runtime: \`${JSON.stringify(finalPayload.result?.runtime ?? null)}\``,
      `- visualAssets: \`${Array.isArray(finalPayload.result?.visualAssets) ? finalPayload.result.visualAssets.length : 0}\``,
      `- qualityGate: \`${JSON.stringify(finalPayload.result?.qualityGate ?? null)}\``,
      `- average: \`${evaluation.average}\``,
      `- benchmarkPass: \`${evaluation.pass}\``,
      '',
      '**Runtime hard fails**',
      '',
      ...(runtimeHardFails.length ? runtimeHardFails.map((item) => `- ${item}`) : ['- none']),
      '',
      '**Output**',
      '',
      '```text',
      String(finalPayload.result?.text ?? ''),
      '```',
      ''
    ])
  ].join('\n');
  fs.writeFileSync(reportPath, report);
  console.log(JSON.stringify({ artifactRoot, reportPath, passCount, total: results.length }, null, 2));
  if (passCount !== results.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
