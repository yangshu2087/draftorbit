import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4311';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const REPORT_DIR = process.env.REPORT_DIR
  ? path.resolve(REPO_ROOT, process.env.REPORT_DIR)
  : path.join(REPO_ROOT, 'output/reports/uat-full');
const startedAt = new Date();

type RunDetail = {
  runId: string;
  contentProjectId?: string | null;
  status: string;
  format: string;
  result?: {
    text?: string;
    qualityScore?: number | null;
    qualityGate?: { status?: string; hardFails?: string[]; visualHardFails?: string[]; userMessage?: string } | null;
    visualAssets?: Array<{ id?: string; status?: string; exportFormat?: string; provider?: string; signedAssetUrl?: string }>;
    visualAssetsBundleUrl?: string | null;
    usage?: Array<{ modelUsed?: string; routingTier?: string | null }>;
    riskFlags?: string[];
  } | null;
};

type Scenario = {
  id: string;
  title: string;
  intent: string;
};

const scenarios: Scenario[] = [
  {
    id: 'audit-demo',
    title: '审计演示：安装前先看边界',
    intent: '写一组 #SkillTrust审计第1期 thread：提醒用户安装任何 Codex/Claude skill 前，先看来源、安装命令、文件读写、联网和 token 风险。不要造数字，不做安全担保。'
  },
  {
    id: 'risk-education',
    title: '风险教育：Skill 不是 prompt 文案',
    intent: '写一组风险教育 thread：AI skill 不是 prompt 文案，它可能是可执行工作流入口。给安装前 5 问，语气锋利但不恐吓。'
  },
  {
    id: 'workflow-method',
    title: '工作流方法：从发现到人工决定',
    intent: '写一组工作流方法 thread：从“看到一个很香的 skill”到“用 SkillTrust 搜索、比较、看证据、人工决定”的完整流程。结尾引导评论区丢 Skill 链接或描述。'
  }
];

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${url}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${options.method ?? 'GET'} ${url} failed ${res.status}: ${text}`);
  }
  return await res.json() as T;
}

async function createToken() {
  const res = await api<{ token: string }>('/auth/local/session', { method: 'POST' });
  return res.token;
}

async function createProject(token: string) {
  const res = await api<{ project: { id: string; name: string } }>('/v3/projects', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      name: `SkillTrust 质量 UAT ${startedAt.toISOString().slice(0, 10)}`,
      description: '3 组 SkillTrust X 运营 thread + 图文资产质量验收。',
      preset: 'skilltrust_x_ops'
    })
  });
  return res.project;
}

async function consumeStream(token: string, runId: string) {
  const res = await fetch(`${API_URL}/v3/chat/runs/${encodeURIComponent(runId)}/stream`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }
  });
  if (!res.ok) throw new Error(`stream ${runId} failed ${res.status}: ${await res.text()}`);
  const reader = res.body?.getReader();
  if (!reader) throw new Error('missing stream reader');
  const decoder = new TextDecoder();
  const events: Array<{ stage?: string; label?: string; status?: string; summary?: string }> = [];
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let sep = buffer.indexOf('\n\n');
    while (sep >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of block.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          events.push(parsed);
          if (parsed.status === 'failed') return events;
        } catch {
          // ignore malformed SSE lines
        }
      }
      sep = buffer.indexOf('\n\n');
    }
  }
  return events;
}

async function generateScenario(token: string, projectId: string, scenario: Scenario) {
  const started = Date.now();
  const start = await api<{ runId: string }>('/v3/projects/' + encodeURIComponent(projectId) + '/generate', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      intent: scenario.intent,
      format: 'thread',
      withImage: true,
      safeMode: true,
      visualRequest: { mode: 'cards', style: 'blueprint', layout: 'flow', palette: 'draftorbit', aspect: '16:9', exportHtml: true }
    })
  });
  const events = await consumeStream(token, start.runId);
  const detail = await api<RunDetail>('/v3/chat/runs/' + encodeURIComponent(start.runId), { headers: authHeaders(token) });
  return { scenario, runId: start.runId, durationMs: Date.now() - started, events, detail };
}

function scoreRun(detail: RunDetail, scenario: Scenario) {
  const text = detail.result?.text ?? '';
  const posts = text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
  const assets = detail.result?.visualAssets ?? [];
  const readySvgAssets = assets.filter((asset) => asset.status === 'ready' && (asset.exportFormat ?? 'svg') === 'svg');
  const hardFails = detail.result?.qualityGate?.hardFails ?? [];
  const textWithoutSafeNegations = text
    .replace(/不是替你保证安全|不替你保证安全|不能保证安全|不做安全担保|不是安全担保|不承诺绝对安全/gu, '')
    .trim();
  const badClaims = /全网最大|最安全|保证安全|保证无风险|官方背书|自动发帖成功|已自动发布|\d+%/u.test(textWithoutSafeNegations);
  const promptLeak = /项目：|发布安全清单|SkillTrust 内容质量协议|系统提示|provider|fallback|Ollama|OpenAI|CODEX_LOCAL|userPrompt|V4 Creator Studio/iu.test(text);
  const scenarioFit =
    scenario.id === 'audit-demo'
      ? /Codex|Claude|安装命令|文件读写|token/u.test(text)
      : scenario.id === 'risk-education'
        ? /prompt|Prompt|工作流入口|执行边界|读文件|跑命令/u.test(text)
        : /搜索|比较|证据|人工决定|SkillTrust 的 5 步/u.test(text);
  const checks = {
    enoughPosts: posts.length >= 5,
    namesSkillTrust: /SkillTrust/i.test(text),
    concreteRisk: /来源|权限|命令|联网|token|凭据|文件|读写/u.test(text),
    manualBoundary: /人工|手动|别盲装|安装前|先问|先查|先看|再决定|证据不够|判断成本/u.test(text),
    noForbiddenClaim: !badClaims,
    noPromptLeak: !promptLeak,
    visualAssetsReady: readySvgAssets.length >= 4,
    bundleReady: Boolean(detail.result?.visualAssetsBundleUrl),
    qualityGatePassed: (detail.result?.qualityGate?.status ?? 'passed') === 'passed' && hardFails.length === 0,
    scenarioFit
  };
  const passed = Object.values(checks).every(Boolean);
  return { passed, checks, posts, readySvgAssets, hardFails };
}

function mdEscape(value: string) {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function redactLocalToken(value?: string | null) {
  if (!value) return 'missing';
  return value.replace(/([?&]token=)[^&\s)]+/u, '$1<redacted-local-token>');
}

async function main() {
  const token = await createToken();
  const project = await createProject(token);
  const results = [] as Array<Awaited<ReturnType<typeof generateScenario>> & { score: ReturnType<typeof scoreRun> }>;
  for (const scenario of scenarios) {
    const result = await generateScenario(token, project.id, scenario);
    results.push({ ...result, score: scoreRun(result.detail, scenario) });
  }

  const reportPath = path.join(REPORT_DIR, `SKILLTRUST-CONTENT-QUALITY-UAT-${startedAt.toISOString().slice(0, 10)}.md`);
  const passCount = results.filter((item) => item.score.passed).length;
  const lines = [
    `# SkillTrust 项目真实内容质量 UAT (${startedAt.toISOString()})`,
    '',
    `- API: ${API_URL}`,
    `- Project: ${project.name} (${project.id})`,
    `- Scenarios: ${results.length}`,
    `- Passed: ${passCount}/${results.length}`,
    '',
    '## Summary',
    '',
    '| Scenario | Run | Duration | Pass | Assets | Quality | Evidence |',
    '|---|---:|---:|---:|---:|---:|---|',
    ...results.map((item) => {
      const quality = item.detail.result?.qualityScore ?? 'n/a';
      const evidence = Object.entries(item.score.checks).filter(([, ok]) => !ok).map(([name]) => name).join(', ') || 'all checks';
      return `| ${mdEscape(item.scenario.title)} | ${item.runId} | ${(item.durationMs / 1000).toFixed(1)}s | ${item.score.passed ? 'PASS' : 'FAIL'} | ${item.score.readySvgAssets.length} | ${quality} | ${mdEscape(evidence)} |`;
    }),
    '',
    '## Generated threads',
    '',
    ...results.flatMap((item) => [
      `### ${item.scenario.title}`,
      '',
      `- runId: ${item.runId}`,
      `- visualAssetsReady: ${item.score.readySvgAssets.length}`,
      `- bundle: ${redactLocalToken(item.detail.result?.visualAssetsBundleUrl)}`,
      `- usage: ${(item.detail.result?.usage ?? []).map((u) => `${u.modelUsed ?? 'unknown'}:${u.routingTier ?? 'n/a'}`).join(', ') || 'n/a'}`,
      '',
      '```text',
      item.detail.result?.text ?? '(missing text)',
      '```',
      ''
    ]),
    '## Quality checks',
    '',
    ...results.flatMap((item) => [
      `### ${item.scenario.id}`,
      '',
      ...Object.entries(item.score.checks).map(([key, ok]) => `- ${ok ? '✅' : '❌'} ${key}`),
      ''
    ])
  ];
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(reportPath, lines.join('\n'), 'utf8');
  console.log(JSON.stringify({ reportPath, passCount, total: results.length, projectId: project.id }, null, 2));
  if (passCount !== results.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
