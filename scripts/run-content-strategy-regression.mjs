import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const apiUrl = process.env.API_URL?.trim() || 'http://127.0.0.1:4100';
const browserEvidence =
  process.env.BROWSER_EVIDENCE?.trim() ||
  path.join(repoRoot, 'output', 'playwright', 'content-strategy-2026-04-09', 'app-generation-pass.png');

const prompts = {
  tweet: {
    intent:
      '写一条关于 AI 产品冷启动的中文观点短推，重点说清“第一句先给判断，再补一个真实例子”为什么更容易让读者停下来。语气像真人，不要套话。',
    format: 'tweet',
    withImage: false,
    safeMode: true
  },
  thread: {
    intent:
      '围绕 AI 产品冷启动，写一个中文 thread，重点讲为什么“先下判断，再补例子，再抛问题”比堆信息更容易获得原生互动。不要解释腔。',
    format: 'thread',
    withImage: false,
    safeMode: true
  },
  article: {
    intent:
      '写一篇关于 AI 产品冷启动的中文 X 文章，重点讲为什么“先下判断，再给例子，再给动作”更容易被读完和回复。每节都要有具体场景或例子。',
    format: 'article',
    withImage: false,
    safeMode: true
  }
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function createStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(
    date.getMinutes()
  )}-${pad(date.getSeconds())}`;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }
  return payload;
}

function parseStreamEvents(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .split(/\n\n+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const id = chunk.match(/^id:\s*(.+)$/m)?.[1] ?? null;
      const event = chunk.match(/^event:\s*(.+)$/m)?.[1] ?? 'message';
      const dataText = chunk
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n');
      let data = dataText;
      try {
        data = dataText ? JSON.parse(dataText) : null;
      } catch {
        data = dataText;
      }
      return { id, event, data };
    });
}

function countThreadPosts(text) {
  const matches = text.match(/\n\d+\/\d+\n/gu);
  return matches ? matches.length : 0;
}

function countArticleSections(text) {
  const matches = text.match(/\n(?:一|二|三|四|五|六|七|八|九|十)、/gu);
  return matches ? matches.length : 0;
}

function summarizeResult(format, finalPayload) {
  const result = finalPayload.result ?? {};
  const text = String(result.text ?? '');
  const routing = result.routing ?? {};
  const usageEntries = Array.isArray(result.usage) ? result.usage : [];
  const modelUsed = usageEntries
    .map((entry) => String(entry?.modelUsed ?? '').trim())
    .filter(Boolean);
  return {
    format,
    runId: finalPayload.runId,
    status: finalPayload.status,
    qualityScore: Number(result.qualityScore ?? result.quality?.total ?? 0),
    routingProfile: String(routing.profile ?? ''),
    primaryModel: String(routing.primaryModel ?? ''),
    routingTier: String(routing.routingTier ?? ''),
    modelUsed,
    charCount: [...text].length,
    postCount: format === 'thread' ? countThreadPosts(text) : null,
    sectionCount: format === 'article' ? countArticleSections(text) : null,
    textPreview: text.slice(0, 1200)
  };
}

async function consumeRunStream(apiToken, runId, artifactDir) {
  const timeoutMs = 10 * 60 * 1000;
  const response = await fetch(`${apiUrl}/v3/chat/runs/${runId}/stream`, {
    method: 'GET',
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${apiToken}`
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE failed for ${runId}: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        raw += decoder.decode();
        break;
      }

      raw += decoder.decode(value, { stream: true });

      const events = parseStreamEvents(raw);
      const lastData = [...events]
        .reverse()
        .find((event) => event && typeof event.data === 'object' && event.data)?.data;
      const stage = String(lastData?.stage ?? '').toLowerCase();
      const status = String(lastData?.status ?? '').toLowerCase();

      if ((stage === 'publish_prep' || stage === 'done' || stage === 'completed') && status === 'done') {
        await reader.cancel();
        break;
      }
    }
  } finally {
    raw += decoder.decode();
  }

  const streamTxt = path.join(artifactDir, 'stream.txt');
  const streamJson = path.join(artifactDir, 'stream.json');
  fs.writeFileSync(streamTxt, raw);
  fs.writeFileSync(streamJson, JSON.stringify(parseStreamEvents(raw), null, 2));
}

async function main() {
  const stamp = createStamp();
  const artifactRoot = path.join(repoRoot, 'artifacts', 'content-strategy-regression-2026-04-09', stamp);
  const reportPath = path.join(repoRoot, 'output', 'reports', 'uat-full', `REAL-MODEL-CONTENT-REGRESSION-${stamp}.md`);
  const indexPath = path.join(repoRoot, 'output', 'reports', 'uat-full', `REAL-MODEL-CONTENT-EVIDENCE-INDEX-${stamp}.md`);

  fs.mkdirSync(artifactRoot, { recursive: true });

  const session = await requestJson(`${apiUrl}/auth/local/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}'
  });
  const token = session.token;
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  const runs = {};
  for (const [format, payload] of Object.entries(prompts)) {
    const artifactDir = path.join(artifactRoot, format);
    fs.mkdirSync(artifactDir, { recursive: true });

    const start = await requestJson(`${apiUrl}/v3/chat/run`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(payload)
    });
    fs.writeFileSync(path.join(artifactDir, 'start.json'), JSON.stringify(start, null, 2));

    await consumeRunStream(token, start.runId, artifactDir);

    const finalPayload = await requestJson(`${apiUrl}/v3/chat/runs/${start.runId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    fs.writeFileSync(path.join(artifactDir, 'final.json'), JSON.stringify(finalPayload, null, 2));

    const summary = summarizeResult(format, finalPayload);
    fs.writeFileSync(path.join(artifactDir, 'summary.json'), JSON.stringify(summary, null, 2));
    runs[format] = { start, finalPayload, summary };
  }

  const report = `# Real Model Content Regression (${stamp})

## Summary
- API: \`${apiUrl}\`
- Evidence root: \`${artifactRoot}\`
- Mode: real model regression (local API runtime, not mock fixture)
- Root-cause note: \`/v3/chat/run\` 只负责创建 run；真正推进 reasoning chain 的是 \`GET /v3/chat/runs/:id/stream\`。之前只 start+poll 的回归方式会让 run 长时间停留在 queued/running，看起来像 draft 卡死。

${Object.entries(runs)
  .map(([format, value]) => {
    const summary = value.summary;
    return `## ${format.toUpperCase()}
- runId: \`${summary.runId}\`
- status: \`${summary.status}\`
- qualityScore: \`${summary.qualityScore}\`
- routingProfile: \`${summary.routingProfile}\`
- primaryModel: \`${summary.primaryModel}\`
- routingTier: \`${summary.routingTier}\`
- modelUsed: \`${summary.modelUsed.join(', ') || 'n/a'}\`
- charCount: \`${summary.charCount}\`${summary.postCount !== null ? `\n- postCount: \`${summary.postCount}\`` : ''}${
      summary.sectionCount !== null ? `\n- sectionCount: \`${summary.sectionCount}\`` : ''
    }
- preview:
\`\`\`text
${summary.textPreview}
\`\`\``;
  })
  .join('\n\n')}
`;
  fs.writeFileSync(reportPath, report);

  const index = `# Real Model Content Regression Evidence Index (${stamp.replace('_', ' ')})

## Summary
- Scope: content-strategy regression with real model routing after quality tuning
- Formats covered: tweet, thread, article
- Artifact root: \`${artifactRoot}\`
- Browser evidence: \`${browserEvidence}\`

## Reports
- \`${reportPath}\`

${Object.entries(runs)
  .map(([format, value]) => {
    const base = path.join(artifactRoot, format);
    return `## ${format[0].toUpperCase()}${format.slice(1)}
- runId: \`${value.start.runId}\`
- start: \`${path.join(base, 'start.json')}\`
- stream: \`${path.join(base, 'stream.json')}\`
- final: \`${path.join(base, 'final.json')}\`
- summary: \`${path.join(base, 'summary.json')}\``;
  })
  .join('\n\n')}
`;
  fs.writeFileSync(indexPath, index);

  console.log(
    JSON.stringify(
      {
        artifactRoot,
        reportPath,
        indexPath,
        runs: Object.fromEntries(Object.entries(runs).map(([format, value]) => [format, value.summary]))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
