#!/usr/bin/env node

import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const API_URL = (process.env.API_URL ?? 'https://api.draftorbit.ai').replace(/\/$/, '');
const APP_URL = (process.env.APP_URL ?? 'https://draftorbit.ai').replace(/\/$/, '');
let runtimeToken = (process.env.UAT_TOKEN ?? process.env.DRAFTORBIT_TOKEN ?? '').trim();
const RUN_ID =
  process.env.UAT_RUN_ID ??
  `uat-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}`;
const ENABLE_BILLING_MUTATIONS = process.env.UAT_ENABLE_BILLING_MUTATIONS === '1';
const REFUND_PARTIAL_USD = Number(process.env.UAT_REFUND_PARTIAL_USD ?? 1);
const CAPTURE_SCREENSHOTS = process.env.UAT_CAPTURE_SCREENSHOTS !== '0';

const rootDir = process.cwd();
const artifactDir = path.resolve(rootDir, 'artifacts', 'uat-full', RUN_ID);
const responsesDir = path.join(artifactDir, 'responses');
const screenshotsDir = path.join(artifactDir, 'screenshots');
const reportPath = path.resolve(rootDir, `UAT-FULL-REPORT-${RUN_ID}.md`);

const steps = [];

function nowIso() {
  return new Date().toISOString();
}

function sanitize(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureDirs() {
  await fs.mkdir(responsesDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function isObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function isLocalApiTarget(url) {
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function tryCreateLocalSessionToken() {
  try {
    const response = await fetch(`${API_URL}/auth/local/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!isObject(payload)) return null;
    const token = (payload.token ?? payload.accessToken ?? '').toString().trim();
    return token || null;
  } catch {
    return null;
  }
}

async function loadLocalEnvFallback() {
  const envPath = path.resolve(process.cwd(), '.env');
  const exists = await fs
    .access(envPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) return;

  const content = await fs.readFile(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#') || !raw.includes('=')) continue;
    const idx = raw.indexOf('=');
    const key = raw.slice(0, idx).trim();
    let value = raw.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function tryCreateLocalBootstrapToken() {
  try {
    await loadLocalEnvFallback();
    const jwtSecret = process.env.JWT_SECRET?.trim();
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (!jwtSecret || !dbUrl) return null;

    const prismaClientPath = path.resolve(process.cwd(), 'packages/db/node_modules/@prisma/client');
    const jwtPath = path.resolve(process.cwd(), 'apps/api/node_modules/jsonwebtoken');
    const { PrismaClient, WorkspaceRole } = require(prismaClientPath);
    const jwt = require(jwtPath);

    const prisma = new PrismaClient();
    try {
      const email = 'uat.full.local@draftorbit.local';
      const handle = 'uat_full_local';
      let user = await prisma.user.findFirst({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            handle,
            displayName: 'UAT Full Local'
          }
        });
      } else if (!user.handle || user.handle !== handle) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { handle }
        });
      }

      let workspace = await prisma.workspace.findUnique({ where: { slug: 'uat-full-local' } });
      if (!workspace) {
        workspace = await prisma.workspace.create({
          data: {
            slug: 'uat-full-local',
            name: 'UAT Full Local Workspace',
            ownerId: user.id
          }
        });
      } else if (workspace.ownerId !== user.id) {
        workspace = await prisma.workspace.update({
          where: { id: workspace.id },
          data: { ownerId: user.id }
        });
      }

      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } }
      });
      if (!member) {
        await prisma.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: user.id,
            role: WorkspaceRole.OWNER,
            isDefault: true
          }
        });
      } else {
        await prisma.workspaceMember.update({
          where: { id: member.id },
          data: {
            role: WorkspaceRole.OWNER,
            isDefault: true
          }
        });
      }

      await prisma.workspaceMember.updateMany({
        where: { userId: user.id, workspaceId: { not: workspace.id }, isDefault: true },
        data: { isDefault: false }
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { defaultWorkspaceId: workspace.id }
      });

      const token = jwt.sign(
        {
          userId: user.id,
          handle: user.handle,
          plan: 'STARTER',
          workspaceId: workspace.id,
          role: WorkspaceRole.OWNER
        },
        jwtSecret,
        { expiresIn: '7d' }
      );

      return token;
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    return null;
  }
}

async function resolveRuntimeToken() {
  if (runtimeToken) return runtimeToken;

  const localSessionToken = await tryCreateLocalSessionToken();
  if (localSessionToken) {
    runtimeToken = localSessionToken;
    return runtimeToken;
  }

  if (isLocalApiTarget(API_URL)) {
    const localBootstrapToken = await tryCreateLocalBootstrapToken();
    if (localBootstrapToken) {
      runtimeToken = localBootstrapToken;
      return runtimeToken;
    }
  }

  return '';
}

async function apiRequest(pathname, { method = 'GET', body, timeoutMs = 120000 } = {}) {
  if (!runtimeToken) throw new Error('UAT_TOKEN 未设置，无法执行真实用户链路验收。');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${runtimeToken}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');

    if (!response.ok) {
      throw new Error(
        `API ${method} ${pathname} failed (${response.status}): ${JSON.stringify(payload)}`
      );
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function publicApiRequest(pathname, { method = 'GET', body, timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}${pathname}`, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(
        `Public API ${method} ${pathname} failed (${response.status}): ${JSON.stringify(payload)}`
      );
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function consumeSse(generationId) {
  const response = await fetch(`${API_URL}/generate/${generationId}/stream`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${runtimeToken}` }
  });
  if (!response.ok || !response.body) {
    throw new Error(`SSE stream failed (${response.status})`);
  }

  const events = [];
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataRaw = chunk
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''))
        .join('\n');

      if (dataRaw) {
        if (dataRaw === '[DONE]') return events;
        try {
          events.push(JSON.parse(dataRaw));
        } catch {
          events.push({ raw: dataRaw });
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }

  return events;
}

async function recordStep(name, fn, { required = true } = {}) {
  const startedAt = Date.now();
  const safeName = sanitize(name);
  try {
    const result = await fn();
    const durationMs = Date.now() - startedAt;
    await writeJson(path.join(responsesDir, `${safeName}.json`), {
      ok: true,
      name,
      required,
      durationMs,
      result
    });
    steps.push({ name, required, ok: true, durationMs, detail: null });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const detail = error instanceof Error ? error.message : String(error);
    await writeJson(path.join(responsesDir, `${safeName}.json`), {
      ok: false,
      name,
      required,
      durationMs,
      error: detail
    });
    steps.push({ name, required, ok: false, durationMs, detail });
    return null;
  }
}

async function captureScreenshots() {
  if (!CAPTURE_SCREENSHOTS) return [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 } });

  await context.addInitScript((token) => {
    window.localStorage.setItem('draftorbit_token', token);
  }, runtimeToken);

  const page = await context.newPage();
  const routes = [
    '/dashboard',
    '/usage',
    '/x-accounts',
    '/topics',
    '/learning',
    '/voice-profiles',
    '/playbooks',
    '/drafts',
    '/naturalization',
    '/media',
    '/publish-queue',
    '/workflow',
    '/reply-queue',
    '/audit',
    '/providers',
    '/settings'
  ];

  const rows = [];
  for (const route of routes) {
    const apiCalls = [];
    const listener = async (resp) => {
      const url = resp.url();
      if (!url.startsWith(API_URL)) return;
      let body = '';
      try {
        body = await resp.text();
      } catch {
        body = '';
      }
      apiCalls.push({
        url,
        status: resp.status(),
        ok: resp.ok(),
        bodySnippet: body.slice(0, 220)
      });
    };
    page.on('response', listener);

    const target = `${APP_URL}${route}`;
    await page.goto(target, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1800);
    const bodyText = (await page.textContent('body')) ?? '';
    const loading = bodyText.includes('正在加载运营数据') || bodyText.includes('正在加载用量数据');
    const screenshot = path.join(screenshotsDir, `${route.replace('/', '') || 'root'}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    rows.push({
      route,
      target,
      currentUrl: page.url(),
      loadingStillVisible: loading,
      hasLoginPrompt:
        bodyText.includes('登录您的账户') || bodyText.includes('返回首页登录') || bodyText.includes('未登录'),
      screenshot,
      apiCalls
    });

    page.off('response', listener);
  }

  await context.close();
  await browser.close();
  return rows;
}

function assertResult(condition, message) {
  if (!condition) throw new Error(message);
}

function isDuplicateQualityGateError(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes('QUALITY_GATE_BLOCKED') && text.includes('DUPLICATE_CONTENT');
}

async function approveDraftWithDuplicateFallback({
  draftId,
  title,
  content,
  language = 'zh'
}) {
  try {
    return {
      approved: await apiRequest(`/drafts/${draftId}/approve`, { method: 'POST' }),
      fallbackDraft: null
    };
  } catch (error) {
    if (!isDuplicateQualityGateError(error)) throw error;

    const fallbackDraft = await apiRequest('/drafts', {
      method: 'POST',
      body: {
        title,
        content,
        language
      }
    });
    const approved = await apiRequest(`/drafts/${fallbackDraft.id}/approve`, { method: 'POST' });
    return { approved, fallbackDraft };
  }
}

async function main() {
  await ensureDirs();
  runtimeToken = await resolveRuntimeToken();
  if (!runtimeToken) {
    throw new Error(
      'UAT_TOKEN 未设置，且无法自动获取本地会话 token。请提供生产测试租户 token（UAT_TOKEN）。'
    );
  }
  const billingRequired =
    process.env.UAT_REQUIRE_BILLING === '1' || !isLocalApiTarget(API_URL);

  const authMe = await recordStep('auth.me', async () => apiRequest('/auth/me'));
  const workspace = await recordStep('workspace.me', async () => apiRequest('/workspaces/me'));

  await recordStep(
    'auth.oauth.links',
    async () => {
      const [xAuth, googleAuth] = await Promise.allSettled([
        publicApiRequest('/auth/x/authorize'),
        publicApiRequest('/auth/google/authorize')
      ]);
      return { xAuth, googleAuth };
    },
    { required: false }
  );

  const xAccounts = await recordStep('x-accounts.ensure-3', async () => {
    const rows = await apiRequest('/x-accounts?pageSize=100');
    if (!Array.isArray(rows)) throw new Error('x-accounts 返回格式异常');

    const activeRows = rows.filter((row) => row?.status === 'ACTIVE');
    const needCreate = Math.max(0, 3 - activeRows.length);
    for (let i = 0; i < needCreate; i += 1) {
      await apiRequest('/x-accounts/bind-manual', {
        method: 'POST',
        body: {
          twitterUserId: `uat-route-${RUN_ID}-${i + 1}`,
          handle: `uat_route_${i + 1}`,
          status: 'ACTIVE'
        }
      });
    }

    const refreshed = await apiRequest('/x-accounts?pageSize=100');
    const actives = Array.isArray(refreshed)
      ? refreshed.filter((item) => item?.status === 'ACTIVE').slice(0, 3)
      : [];
    assertResult(actives.length >= 3, '可用 X 账号不足 3 个');

    await apiRequest(`/x-accounts/${actives[0].id}/default`, { method: 'PATCH' });
    await apiRequest(`/x-accounts/${actives[2].id}/status`, {
      method: 'PATCH',
      body: { status: 'REVOKED' }
    });
    await apiRequest(`/x-accounts/${actives[2].id}/status`, {
      method: 'PATCH',
      body: { status: 'ACTIVE' }
    });

    const finalRows = await apiRequest('/x-accounts?pageSize=100');
    return {
      all: finalRows,
      activeTop3: actives
    };
  });

  const selectedXAccountId = xAccounts?.activeTop3?.[0]?.id ?? null;

  const topic = await recordStep('topics.create', async () =>
    apiRequest('/topics', {
      method: 'POST',
      body: {
        title: `UAT 方向 ${RUN_ID}`,
        description: '真实链路全流程验收方向'
      }
    })
  );

  const generation = await recordStep('generate.brief-chain', async () => {
    const start = await apiRequest('/generate/start', {
      method: 'POST',
      body: {
        mode: 'brief',
        brief: {
          objective: '互动',
          audience: '中文创作者',
          tone: '专业清晰',
          postType: '观点短推',
          cta: '欢迎留言讨论',
          topicPreset: topic?.title ?? 'X 运营方法'
        },
        type: 'TWEET',
        language: 'zh',
        useStyle: true
      }
    });
    const generationId = start?.generationId;
    assertResult(Boolean(generationId), 'generate/start 未返回 generationId');
    const streamEvents = await consumeSse(generationId);
    const detail = await apiRequest(`/generate/${generationId}`);
    return { start, streamTail: streamEvents.slice(-8), detail };
  });

  const draftAndPublish = await recordStep('draft.approve.enqueue', async () => {
    const tweet = generation?.detail?.result?.tweet;
    assertResult(typeof tweet === 'string' && tweet.trim().length > 0, '生成结果缺少 tweet');

    const draft = await apiRequest('/drafts', {
      method: 'POST',
      body: {
        title: `UAT 草稿 ${RUN_ID}`,
        content: tweet,
        language: 'zh'
      }
    });
    const quality = await apiRequest(`/drafts/${draft.id}/quality-check`, { method: 'POST' });
    const approvedResult = await approveDraftWithDuplicateFallback({
      draftId: draft.id,
      title: `UAT 草稿 ${RUN_ID} 重试`,
      content: `${tweet}\n\n（UAT 追踪: ${RUN_ID}-${Date.now()}）`,
      language: 'zh'
    });
    const approved = approvedResult.approved;
    const enqueue = await apiRequest('/publish/draft', {
      method: 'POST',
      body: {
        draftId: approved.id,
        xAccountId: selectedXAccountId
      }
    });
    return { draft, quality, approved, enqueue, approvalFallbackDraft: approvedResult.fallbackDraft };
  });

  await recordStep('naturalization.preview', async () =>
    apiRequest('/naturalization/preview', {
      method: 'POST',
      body: {
        text: draftAndPublish?.draft?.latestContent ?? '默认内容',
        tone: 'professional',
        strictness: 'medium'
      }
    })
  );

  await recordStep('media.placeholder', async () => {
    const generated = await apiRequest('/media/generate-placeholder', {
      method: 'POST',
      body: {
        prompt: `UAT 配图 ${RUN_ID}`,
        draftId: draftAndPublish?.draft?.id
      }
    });
    const uploaded = await apiRequest('/media/upload-placeholder', {
      method: 'POST',
      body: {
        sourceUrl: `https://picsum.photos/seed/${encodeURIComponent(RUN_ID)}/1200/675`,
        name: `uat-${RUN_ID}.jpg`,
        draftId: draftAndPublish?.draft?.id
      }
    });
    const list = await apiRequest('/media');
    return { generated, uploaded, listCount: Array.isArray(list) ? list.length : 0 };
  });

  const publishReplay = await recordStep('publish.route-replay-3', async () => {
    const list = await apiRequest('/x-accounts?pageSize=100');
    const top3 = Array.isArray(list) ? list.filter((row) => row.status === 'ACTIVE').slice(0, 3) : [];
    assertResult(top3.length >= 3, '路由回放前可用账号不足 3 个');

    const replay = [];
    for (let i = 0; i < 3; i += 1) {
      const account = top3[i];
      const draft = await apiRequest('/drafts', {
        method: 'POST',
        body: {
          title: `UAT 路由回放 ${i + 1}`,
          content: `UAT 多账号路由回放 ${i + 1}（${RUN_ID}-${Date.now()}）`,
          language: 'zh'
        }
      });
      const approvedResult = await approveDraftWithDuplicateFallback({
        draftId: draft.id,
        title: `UAT 路由回放 ${i + 1} 重试`,
        content: `${draft.latestContent ?? ''}\n\n（路由重试: ${RUN_ID}-${i + 1}-${Date.now()}）`,
        language: 'zh'
      });
      const approved = approvedResult.approved;
      const enqueue = await apiRequest('/publish/draft', {
        method: 'POST',
        body: { draftId: approved.id, xAccountId: account.id }
      });
      replay.push({
        account: { id: account.id, handle: account.handle },
        publishJobId: enqueue.publishJobId,
        approvalFallbackDraftId: approvedResult.fallbackDraft?.id ?? null
      });
    }

    const jobs = await apiRequest('/publish/jobs?limit=50');
    const checks = replay.map((row) => {
      const job = Array.isArray(jobs) ? jobs.find((item) => item.id === row.publishJobId) : null;
      return {
        publishJobId: row.publishJobId,
        expectedXAccountId: row.account.id,
        actualXAccountId: job?.xAccountId ?? null,
        matched: row.account.id === job?.xAccountId
      };
    });
    assertResult(checks.every((c) => c.matched), '3 账号发布路由回放存在未命中');
    return { replay, checks };
  });

  await recordStep('reply-chain', async () => {
    assertResult(Boolean(selectedXAccountId), 'reply 链路缺少可用 xAccountId');
    const sync = await apiRequest('/reply-jobs/sync-mentions', {
      method: 'POST',
      body: { xAccountId: selectedXAccountId }
    });
    const candidate = await apiRequest(`/reply-jobs/${sync.id}/candidates`, {
      method: 'POST',
      body: {
        content: `感谢反馈，我们会继续优化（${RUN_ID}）。`,
        riskLevel: 'LOW',
        riskScore: 0.1
      }
    });
    const approved = await apiRequest(`/reply-jobs/${sync.id}/candidates/${candidate.id}/approve`, {
      method: 'POST'
    });
    const sent = await apiRequest(`/reply-jobs/${sync.id}/send`, {
      method: 'POST',
      body: { candidateId: candidate.id }
    });
    return { sync, candidate, approved, sent };
  });

  await recordStep('system.overview', async () => {
    const [dashboard, usageOverview, auditLogs, providers, byok] = await Promise.all([
      apiRequest('/ops/dashboard'),
      apiRequest('/usage/overview?eventsLimit=30&days=14'),
      apiRequest('/audit/logs?limit=30'),
      apiRequest('/providers'),
      apiRequest('/providers/byok-status')
    ]);
    return {
      dashboardDegraded: dashboard?.degraded ?? null,
      usageDegraded: usageOverview?.degraded ?? null,
      auditCount: Array.isArray(auditLogs) ? auditLogs.length : null,
      providersCount: Array.isArray(providers) ? providers.length : null,
      byok
    };
  });

  const billing = await recordStep('billing.checkout-and-status', async () => {
    const [plans, subscription, usage, checkout] = await Promise.all([
      apiRequest('/billing/plans'),
      apiRequest('/billing/subscription'),
      apiRequest('/billing/usage'),
      apiRequest('/billing/checkout', {
        method: 'POST',
        body: {
          plan: 'STARTER',
          cycle: 'MONTHLY'
        }
      })
    ]);
    return { plans, subscription, usage, checkout };
  }, { required: billingRequired });

  await recordStep(
    'billing.cancel-and-refund',
    async () => {
      const cancel = await apiRequest('/billing/subscription/cancel', {
        method: 'POST',
        body: { mode: 'AT_PERIOD_END' }
      });
      const partial = await apiRequest('/billing/refund', {
        method: 'POST',
        body: { mode: 'PARTIAL', amountUsd: REFUND_PARTIAL_USD, reason: 'requested_by_customer' }
      });
      const full = await apiRequest('/billing/refund', {
        method: 'POST',
        body: { mode: 'FULL', reason: 'requested_by_customer' }
      });
      return { cancel, partial, full };
    },
    { required: ENABLE_BILLING_MUTATIONS }
  );

  const screenshotRows = await recordStep(
    'ui.screenshots',
    async () => captureScreenshots(),
    { required: false }
  );

  const requiredFailures = steps.filter((step) => step.required && !step.ok);
  const markdown = [
    '# DraftOrbit 全流程 UAT 报告',
    '',
    `- Run ID: \`${RUN_ID}\``,
    `- 生成时间: ${nowIso()}`,
    `- API: \`${API_URL}\``,
    `- APP: \`${APP_URL}\``,
    `- 真实账务动作: ${ENABLE_BILLING_MUTATIONS ? '开启' : '关闭（仅校验 checkout）'}`,
    '',
    '## 步骤结果',
    '',
    '| # | 步骤 | 必须 | 结果 | 耗时(ms) | 备注 |',
    '|---|---|---|---|---:|---|',
    ...steps.map(
      (step, index) =>
        `| ${index + 1} | ${step.name} | ${step.required ? '是' : '否'} | ${
          step.ok ? '✅' : step.required ? '❌' : '⚠️'
        } | ${step.durationMs} | ${step.detail ? step.detail.replace(/\|/g, '\\|') : '-'} |`
    ),
    '',
    '## 关键摘要',
    '',
    `- auth.me: ${authMe ? '通过' : '失败'}`,
    `- workspace.me: ${workspace ? '通过' : '失败'}`,
    `- billing.checkout: ${billing ? '通过' : '失败'}`,
    `- 截图数量: ${Array.isArray(screenshotRows) ? screenshotRows.length : 0}`,
    '',
    '## 产物目录',
    '',
    `- 响应证据：\`${responsesDir}\``,
    `- 页面截图：\`${screenshotsDir}\``,
    `- 报告文件：\`${reportPath}\``
  ].join('\n');

  await fs.writeFile(reportPath, `${markdown}\n`, 'utf8');
  await writeJson(path.join(artifactDir, 'summary.json'), {
    runId: RUN_ID,
    createdAt: nowIso(),
    apiUrl: API_URL,
    appUrl: APP_URL,
    enableBillingMutations: ENABLE_BILLING_MUTATIONS,
    requiredFailures,
    steps
  });

  if (requiredFailures.length > 0) {
    console.error(`[uat-full] ❌ required steps failed: ${requiredFailures.length}`);
    console.error(`[uat-full] report: ${reportPath}`);
    process.exit(1);
  }

  console.log('[uat-full] ✅ completed');
  console.log(`[uat-full] report: ${reportPath}`);
  console.log(`[uat-full] artifacts: ${artifactDir}`);
}

main().catch(async (error) => {
  await ensureDirs().catch(() => {});
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  await fs
    .writeFile(
      path.join(artifactDir, 'fatal-error.log'),
      `[${nowIso()}] ${detail}\n`,
      'utf8'
    )
    .catch(() => {});
  console.error('[uat-full] fatal error');
  console.error(detail);
  process.exit(1);
});
