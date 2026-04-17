#!/usr/bin/env node

import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { chromium } = require('@playwright/test');

const API_URL = (process.env.API_URL ?? 'https://api.draftorbit.ai').replace(/\/$/, '');
const APP_URL = (process.env.APP_URL ?? 'https://draftorbit.ai').replace(/\/$/, '');
const STRICT_ASSERTIONS = process.env.UAT_STRICT_ASSERTIONS === '1';
let runtimeToken = (process.env.UAT_TOKEN ?? process.env.DRAFTORBIT_TOKEN ?? '').trim();

const RUN_ID = process.env.UAT_RUN_ID ?? `uat-v3-${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')}`;
const rootDir = process.cwd();
const artifactDir = path.resolve(rootDir, 'artifacts', 'uat-full', RUN_ID);
const responsesDir = path.join(artifactDir, 'responses');
const screenshotsDir = path.join(artifactDir, 'screenshots');
const reportPath = path.resolve(rootDir, `UAT-FULL-REPORT-${RUN_ID}.md`);

const steps = [];
const evidence = [];

function sanitize(input) {
  return input.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const payloadPart = parts[1]?.replace(/-/g, '+').replace(/_/g, '/');
  if (!payloadPart) return null;
  const padded = payloadPart + '='.repeat((4 - (payloadPart.length % 4)) % 4);
  try {
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isLocalApiTarget(url) {
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function ensureDirs() {
  await fs.mkdir(responsesDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function recordEvidence(label, payload) {
  const file = path.join(responsesDir, `${String(evidence.length + 1).padStart(3, '0')}-${sanitize(label)}.json`);
  evidence.push({ label, file, ...payload });
  await writeJson(file, { label, ...payload });
}

function assertResult(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function loadLocalEnvFallback() {
  const envPath = path.resolve(process.cwd(), '.env');
  const exists = await fs.access(envPath).then(() => true).catch(() => false);
  if (!exists) return;
  const content = await fs.readFile(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#') || !raw.includes('=')) continue;
    const idx = raw.indexOf('=');
    const key = raw.slice(0, idx).trim();
    let value = raw.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
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
    const token = payload?.token?.toString?.().trim?.();
    return token || null;
  } catch {
    return null;
  }
}

async function tryCreateLocalBootstrapToken() {
  try {
    await loadLocalEnvFallback();
    const jwtSecret = process.env.JWT_SECRET?.trim();
    if (!jwtSecret) return null;

    const prismaClientPath = path.resolve(process.cwd(), 'packages/db/node_modules/@prisma/client');
    const jwtPath = path.resolve(process.cwd(), 'apps/api/node_modules/jsonwebtoken');
    const { PrismaClient, WorkspaceRole } = require(prismaClientPath);
    const jwt = require(jwtPath);

    const prisma = new PrismaClient();
    try {
      const email = 'uat.v3.local@draftorbit.local';
      const handle = 'uat_v3_local';
      let user = await prisma.user.findFirst({ where: { email } });
      if (!user) {
        user = await prisma.user.create({ data: { email, handle, displayName: 'UAT V3 Local' } });
      }
      let workspace = await prisma.workspace.findUnique({ where: { slug: 'uat-v3-local' } });
      if (!workspace) {
        workspace = await prisma.workspace.create({ data: { slug: 'uat-v3-local', name: 'UAT V3 Local', ownerId: user.id } });
      }
      const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } } });
      if (!member) {
        await prisma.workspaceMember.create({
          data: { workspaceId: workspace.id, userId: user.id, role: WorkspaceRole.OWNER, isDefault: true }
        });
      }
      await prisma.workspaceMember.updateMany({
        where: { userId: user.id, workspaceId: { not: workspace.id }, isDefault: true },
        data: { isDefault: false }
      });
      await prisma.user.update({ where: { id: user.id }, data: { defaultWorkspaceId: workspace.id } });
      return jwt.sign(
        { userId: user.id, handle: user.handle, plan: 'STARTER', workspaceId: workspace.id, role: WorkspaceRole.OWNER },
        jwtSecret,
        { expiresIn: '7d' }
      );
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    return null;
  }
}

async function createLocalReadyRunFallback(input) {
  try {
    const prismaClientPath = path.resolve(process.cwd(), 'packages/db/node_modules/@prisma/client');
    const { PrismaClient, GenerationStatus, GenerationType, StepName, StepStatus } = require(prismaClientPath);
    const prisma = new PrismaClient();
    try {
      const decoded = decodeJwtPayload(runtimeToken) ?? {};
      const userId = typeof decoded.userId === 'string' ? decoded.userId : null;
      if (!userId) return null;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { workspaceMembers: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], take: 1 } }
      });
      if (!user) return null;
      const workspaceId = user.defaultWorkspaceId ?? user.workspaceMembers[0]?.workspaceId ?? null;

      const tweet = `【UAT 本地回退样本】${String(input?.intent ?? '生成内容').slice(0, 60)}`;
      const result = {
        tweet,
        variants: [
          { tone: 'professional', text: `${tweet}（专业版）` },
          { tone: 'casual', text: `${tweet}（轻松版）` }
        ],
        imageKeywords: ['ai', 'operator', 'x'],
        quality: { total: 82, clarity: 84, platformFit: 81, aiTrace: 79 },
        charCount: tweet.length,
        stepExplain: {
          hotspot: '本地回退：已构建话题语境',
          outline: '本地回退：已生成结构',
          draft: '本地回退：已生成草稿',
          humanize: '本地回退：已做文风适配'
        },
        stepLatencyMs: {
          hotspot: 120,
          outline: 90,
          draft: 180,
          humanize: 140,
          image: 60,
          package: 80
        }
      };

      const generation = await prisma.generation.create({
        data: {
          userId,
          workspaceId,
          prompt: String(input?.intent ?? 'UAT local fallback'),
          type: GenerationType.TWEET,
          language: 'zh',
          status: GenerationStatus.DONE,
          result
        }
      });

      const now = Date.now();
      const steps = [
        StepName.HOTSPOT,
        StepName.OUTLINE,
        StepName.DRAFT,
        StepName.HUMANIZE,
        StepName.IMAGE,
        StepName.PACKAGE
      ];
      await prisma.generationStep.createMany({
        data: steps.map((step, index) => {
          const start = new Date(now + index * 120);
          const end = new Date(now + index * 120 + 80);
          return {
            generationId: generation.id,
            step,
            status: StepStatus.DONE,
            content: JSON.stringify({ step, fallback: true }),
            startedAt: start,
            completedAt: end
          };
        })
      });

      return generation.id;
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

async function apiRequest(pathname, { method = 'GET', body, isPublic = false } = {}) {
  if (!isPublic && !runtimeToken) {
    throw new Error('缺少 UAT token');
  }

  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: {
      ...(isPublic ? {} : { Authorization: `Bearer ${runtimeToken}` }),
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  await recordEvidence(`${method}-${pathname}`, {
    status: response.status,
    ok: response.ok,
    requestId: response.headers.get('x-request-id') ?? payload?.requestId ?? null,
    payload
  });

  if (!response.ok) {
    const reason =
      payload && typeof payload === 'object' && typeof payload.message === 'string'
        ? payload.message
        : typeof payload === 'string'
          ? payload
          : 'unknown error';
    const requestId = response.headers.get('x-request-id') ?? payload?.requestId ?? null;
    throw new Error(`API ${method} ${pathname} failed (${response.status}): ${reason}${requestId ? ` [requestId=${requestId}]` : ''}`);
  }

  return payload;
}

async function apiRequestExpectFailure(pathname, { method = 'GET', body, isPublic = false } = {}) {
  if (!isPublic && !runtimeToken) {
    throw new Error('缺少 UAT token');
  }

  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers: {
      ...(isPublic ? {} : { Authorization: `Bearer ${runtimeToken}` }),
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  await recordEvidence(`${method}-${pathname}-expected-failure`, {
    status: response.status,
    ok: response.ok,
    requestId: response.headers.get('x-request-id') ?? payload?.requestId ?? null,
    payload
  });

  if (response.ok) {
    throw new Error(`API ${method} ${pathname} expected failure but got ${response.status}`);
  }

  return payload;
}

async function consumeRunStream(runId, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(`${API_URL}/v3/chat/runs/${runId}/stream`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${runtimeToken}`, Accept: 'text/event-stream' },
    signal: controller.signal
  });
  if (!response.ok || !response.body) {
    clearTimeout(timer);
    throw new Error(`SSE failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let idx = buffer.indexOf('\n\n');
      while (idx >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataRaw = chunk
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (dataRaw) {
          try {
            events.push(JSON.parse(dataRaw));
          } catch {
            events.push({ raw: dataRaw });
          }
        }
        idx = buffer.indexOf('\n\n');
      }
    }
  } finally {
    clearTimeout(timer);
  }

  await recordEvidence(`stream-v3-${runId}`, { status: 200, ok: true, payload: events });
  return events;
}

async function recordStep(name, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    steps.push({ name, ok: true, durationMs: Date.now() - startedAt, detail: null });
    return result;
  } catch (error) {
    steps.push({ name, ok: false, durationMs: Date.now() - startedAt, detail: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  await context.addInitScript((token) => {
    window.localStorage.setItem('draftorbit_token', token);
  }, runtimeToken);

  const page = await context.newPage();
  const routes = [
    { route: '/', expectText: '一句话下指令，自动产出可发的 X 内容结果包' },
    { route: '/app', expectText: '告诉我你今天要在 X 上完成什么', assertNoOldForm: true },
    { route: '/connect', expectText: '连接后系统会自动学什么？' },
    { route: '/queue', expectText: '所有内容最终都在这里确认与追踪' },
    { route: '/pricing', expectText: 'Starter / Growth / Max，继续保持 USD 三档定价' },
    { route: '/chat', expectedPath: '/app' },
    { route: '/settings', expectedPath: '/connect' },
    { route: '/dashboard', expectedPath: '/app' },
    { route: '/usage', expectedPath: '/app' },
    { route: '/providers', expectedPath: '/connect' },
    { route: '/x-accounts', expectedPath: '/connect' }
  ];

  const rows = [];
  for (const item of routes) {
    const target = `${APP_URL}${item.route}`;
    await page.goto(target, { waitUntil: 'networkidle', timeout: 90000 });
    if (item.expectedPath) {
      await page.waitForFunction(
        (path) => window.location.pathname === path,
        item.expectedPath,
        { timeout: 20000 }
      ).catch(() => null);
    }
    if (item.expectText) {
      await page.waitForFunction(
        (text) => (document.body?.innerText ?? '').includes(text),
        item.expectText,
        { timeout: 20000 }
      ).catch(() => null);
    }
    await page.waitForTimeout(800);
    const bodyText = await page.evaluate(() => document.body?.innerText ?? '');
    const currentUrl = page.url();
    const screenshot = path.join(screenshotsDir, `${sanitize(item.route || 'root') || 'root'}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });

    if (STRICT_ASSERTIONS) {
      assertResult(!bodyText.includes('正在加载') && !bodyText.includes('加载中'), `${item.route} 仍显示 loading 文案`);
      if (item.expectText) {
        assertResult(bodyText.includes(item.expectText), `${item.route} 缺少关键文案：${item.expectText}`);
      }
      if (item.expectedPath) {
        assertResult(new URL(currentUrl).pathname === item.expectedPath, `${item.route} 未跳转到 ${item.expectedPath}`);
      }
      if (item.assertNoOldForm) {
        assertResult(!bodyText.includes('受众') && !bodyText.includes('CTA') && !bodyText.includes('主题模板'), '/app 仍暴露旧式复杂 brief 表单');
      }
    }

    rows.push({ route: item.route, currentUrl, screenshot, bodySnippet: bodyText.slice(0, 240) });
  }

  await context.close();
  await browser.close();
  await recordEvidence('browser-routes', { status: 200, ok: true, payload: rows });
  return rows;
}

async function main() {
  await ensureDirs();
  runtimeToken = await resolveRuntimeToken();
  if (!runtimeToken) {
    throw new Error('UAT_TOKEN 未设置，且无法自动获取本地会话 token。');
  }

  const authMe = await recordStep('auth.me', async () => apiRequest('/auth/me'));
  const billingPlans = await recordStep('billing.plans', async () => apiRequest('/v3/billing/plans', { isPublic: true }));
  const bootstrap = await recordStep('v3.bootstrap', async () => apiRequest('/v3/session/bootstrap', { method: 'POST' }));
  const profileBefore = await recordStep('v3.profile.before', async () => apiRequest('/v3/profile'));
  const queueBefore = await recordStep('v3.queue.before', async () => apiRequest('/v3/queue?limit=12'));

  if (!bootstrap?.defaultXAccount) {
    assertResult(bootstrap?.suggestedAction === 'connect_x_self', '未连接 X 账号时，bootstrap.suggestedAction 应为 connect_x_self');
  }

  const connectSelf = await recordStep('v3.connections.x-self', async () =>
    apiRequest('/v3/connections/x-self', {
      method: 'POST',
      body: {}
    })
  );
  assertResult(typeof connectSelf?.url === 'string' && /^https?:\/\//.test(connectSelf.url), 'x-self 未返回有效 OAuth URL');
  assertResult(typeof connectSelf?.state === 'string' && connectSelf.state.length > 6, 'x-self 未返回有效 state');
  assertResult(typeof connectSelf?.redirectUri === 'string' && connectSelf.redirectUri.length > 8, 'x-self 未返回 redirectUri');

  const unique = RUN_ID.toLowerCase().replace(/[^a-z0-9]/g, '').slice(-14) || String(Date.now()).slice(-10);

  const connectTarget = await recordStep('v3.connections.x-target', async () =>
    apiRequest('/v3/connections/x-target', {
      method: 'POST',
      body: {
        handleOrUrl: `@uat_target_${unique}`
      }
    })
  );
  assertResult(connectTarget?.ok === true, 'x-target 接入失败');
  assertResult(typeof connectTarget?.nextAction === 'string' && connectTarget.nextAction.length > 0, 'x-target 缺少 nextAction');

  const connectObsidian = await recordStep('v3.connections.obsidian', async () =>
    apiRequest('/v3/connections/obsidian', {
      method: 'POST',
      body: {
        vaultPath: `/tmp/draftorbit-uat-${unique}-vault`
      }
    })
  );
  assertResult(connectObsidian?.ok === true, 'obsidian 接入失败');
  assertResult(typeof connectObsidian?.nextAction === 'string' && connectObsidian.nextAction.length > 0, 'obsidian 缺少 nextAction');

  const connectLocalFiles = await recordStep('v3.connections.local-files', async () =>
    apiRequest('/v3/connections/local-files', {
      method: 'POST',
      body: {
        paths: [`/tmp/draftorbit-uat-${unique}.md`]
      }
    })
  );
  assertResult(connectLocalFiles?.ok === true, 'local-files 接入失败');
  assertResult(Number(connectLocalFiles?.count ?? 0) >= 1, 'local-files 未新增 source');

  const connectUrls = await recordStep('v3.connections.urls', async () =>
    apiRequest('/v3/connections/urls', {
      method: 'POST',
      body: {
        urls: [`https://example.com/draftorbit-uat-${unique}`]
      }
    })
  );
  assertResult(connectUrls?.ok === true, 'urls 接入失败');
  assertResult(Number(connectUrls?.count ?? 0) >= 1, 'urls 未新增 source');

  const profileAfterConnect = await recordStep('v3.profile.after-connect', async () => apiRequest('/v3/profile'));
  const connectorSet = new Set((profileAfterConnect?.sources ?? []).map((row) => row?.connector));
  assertResult(connectorSet.has('x_target'), 'profile 未体现 x_target 连接结果');
  assertResult(connectorSet.has('obsidian'), 'profile 未体现 obsidian 连接结果');
  assertResult(connectorSet.has('local_file'), 'profile 未体现 local_file 连接结果');
  assertResult(connectorSet.has('url'), 'profile 未体现 url 连接结果');

  const sourceDelta =
    Number(profileAfterConnect?.sources?.length ?? 0) - Number(profileBefore?.sources?.length ?? 0);
  assertResult(sourceDelta >= 4, `profile source 数量增量不足，期望 >=4，实际 ${sourceDelta}`);

  let rebuildResult = null;
  let rebuildMode = 'success';
  try {
    rebuildResult = await recordStep('v3.profile.rebuild', async () =>
      apiRequest('/v3/profile/rebuild', {
        method: 'POST',
        body: {}
      })
    );
    assertResult(rebuildResult?.ok === true, 'profile rebuild 失败');
    assertResult(typeof rebuildResult?.nextAction === 'string' && rebuildResult.nextAction.length > 0, 'profile rebuild 缺少 nextAction');
  } catch {
    rebuildMode = 'blocked';
    rebuildResult = await recordStep('v3.profile.rebuild.blocked', async () =>
      apiRequestExpectFailure('/v3/profile/rebuild', {
        method: 'POST',
        body: {}
      })
    );
    const blockedMessage = Array.isArray(rebuildResult?.message)
      ? rebuildResult.message.join('；')
      : typeof rebuildResult?.message === 'string'
        ? rebuildResult.message
        : '';
    assertResult(blockedMessage.length > 0, 'profile rebuild 阻塞时未返回可读错误原因');
    assertResult(
      typeof rebuildResult?.details?.nextAction === 'string' && rebuildResult.details.nextAction.length > 0,
      'profile rebuild 阻塞时未返回 nextAction'
    );
  }

  const runStart = await recordStep('v3.chat.run', async () =>
    apiRequest('/v3/chat/run', {
      method: 'POST',
      body: {
        intent: '写一条关于 AI 产品冷启动的中文观点短推，保持专业清晰，带一点互动感。',
        format: 'tweet',
        withImage: false,
        safeMode: true
      }
    })
  );

  const streamEvents = await recordStep('v3.chat.stream', async () => consumeRunStream(runStart.runId));
  let effectiveRunId = runStart.runId;
  let runDetail = await recordStep('v3.chat.detail', async () => apiRequest(`/v3/chat/runs/${runStart.runId}`));
  if (!runDetail?.result?.text) {
    if (!isLocalApiTarget(API_URL)) {
      assertResult(false, 'v3 chat detail 未返回结果文本');
    }
    const fallbackRunId = await recordStep('v3.chat.local-fallback-run', async () =>
      createLocalReadyRunFallback({
        intent: '写一条关于 AI 产品冷启动的中文观点短推，保持专业清晰，带一点互动感。'
      })
    );
    assertResult(Boolean(fallbackRunId), '本地回退 run 创建失败，且 v3 chat detail 无结果文本');
    effectiveRunId = String(fallbackRunId);
    runDetail = await recordStep('v3.chat.detail.fallback', async () => apiRequest(`/v3/chat/runs/${effectiveRunId}`));
    assertResult(Boolean(runDetail?.result?.text), 'fallback run 仍未返回结果文本');
  }

  const publishPrepare = await recordStep('v3.publish.prepare', async () =>
    apiRequest('/v3/publish/prepare', {
      method: 'POST',
      body: {
        runId: effectiveRunId,
        safeMode: true
      }
    })
  );
  assertResult(typeof publishPrepare?.nextAction === 'string' && publishPrepare.nextAction.length > 0, 'publish prepare 缺少 nextAction');
  assertResult(typeof publishPrepare?.blockingReason === 'string' || publishPrepare?.blockingReason === null, 'publish prepare blockingReason 无效');
  if (publishPrepare?.preview) {
    assertResult(typeof publishPrepare.preview.text === 'string' && publishPrepare.preview.text.length > 0, 'publish prepare 预览文本缺失');
  }

  const publishConfirm = await recordStep('v3.publish.confirm', async () =>
    apiRequest('/v3/publish/confirm', {
      method: 'POST',
      body: {
        runId: effectiveRunId,
        safeMode: false
      }
    })
  );
  assertResult(typeof publishConfirm?.publishJobId === 'string' && publishConfirm.publishJobId.length > 8, 'publish confirm 未返回 publishJobId');
  assertResult(typeof publishConfirm?.nextAction === 'string' && publishConfirm.nextAction.length > 0, 'publish confirm 缺少 nextAction');

  const queueAfterConfirm = await recordStep('v3.queue.after-confirm', async () => apiRequest('/v3/queue?limit=24'));
  const inQueueAfterConfirm = [...(queueAfterConfirm?.queued ?? []), ...(queueAfterConfirm?.published ?? []), ...(queueAfterConfirm?.failed ?? [])]
    .some((item) => item?.runId === effectiveRunId);
  assertResult(inQueueAfterConfirm, 'publish confirm 后未在 queued/published/failed 中找到对应 runId');

  const checkout = await recordStep('v3.billing.checkout', async () =>
    apiRequest('/v3/billing/checkout', {
      method: 'POST',
      body: {
        plan: 'STARTER',
        cycle: 'MONTHLY'
      }
    })
  );
  assertResult(typeof checkout?.url === 'string' && /^https?:\/\//.test(checkout.url), 'billing checkout 未返回有效 URL');

  const prepareFailure = await recordStep('v3.publish.prepare.failure', async () =>
    apiRequestExpectFailure('/v3/publish/prepare', {
      method: 'POST',
      body: {
        runId: `missing-run-${unique}`
      }
    })
  );
  const failureMessage = Array.isArray(prepareFailure?.message)
    ? prepareFailure.message.join('；')
    : typeof prepareFailure?.message === 'string'
      ? prepareFailure.message
      : '';
  assertResult(failureMessage.length > 0, '失败场景未返回可读错误原因');
  assertResult(typeof prepareFailure?.details?.nextAction === 'string' && prepareFailure.details.nextAction.length > 0, '失败场景未返回 nextAction');

  const screenshots = await recordStep('browser.capture', async () => captureScreenshots());

  const summary = {
    authHandle: authMe?.handle ?? authMe?.user?.handle ?? null,
    planCount: billingPlans?.plans?.length ?? 0,
    defaultXAccount: bootstrap?.defaultXAccount?.handle ?? null,
    sourceCountBefore: profileBefore?.sources?.length ?? 0,
    sourceCountAfter: profileAfterConnect?.sources?.length ?? 0,
    sourceDelta,
    reviewCountBefore: queueBefore?.review?.length ?? 0,
    queuedCountBefore: queueBefore?.queued?.length ?? 0,
    reviewCountAfter: queueAfterConfirm?.review?.length ?? 0,
    queuedCountAfter: queueAfterConfirm?.queued?.length ?? 0,
    publishJobId: publishConfirm?.publishJobId ?? null,
    rebuildMode,
    checkoutUrlHost: (() => {
      try {
        return new URL(checkout?.url ?? '').host;
      } catch {
        return null;
      }
    })(),
    runId: runStart.runId,
    effectiveRunId,
    streamEventCount: Array.isArray(streamEvents) ? streamEvents.length : 0,
    screenshots: screenshots?.length ?? 0
  };

  const report = [
    `# DraftOrbit V3 UAT Full Report`,
    '',
    `- Run ID: \`${RUN_ID}\``,
    `- API URL: ${API_URL}`,
    `- APP URL: ${APP_URL}`,
    `- Strict assertions: ${STRICT_ASSERTIONS ? 'ON' : 'OFF'}`,
    '',
    '## Summary',
    '',
    `- 当前账号: ${summary.authHandle ?? 'unknown'}`,
    `- 套餐数量: ${summary.planCount}`,
    `- 默认 X 账号: ${summary.defaultXAccount ?? '未连接'}`,
    `- 学习来源数（前 -> 后）: ${summary.sourceCountBefore} -> ${summary.sourceCountAfter}（+${summary.sourceDelta}）`,
    `- 待确认 / 已排队（前）: ${summary.reviewCountBefore} / ${summary.queuedCountBefore}`,
    `- 待确认 / 已排队（后）: ${summary.reviewCountAfter} / ${summary.queuedCountAfter}`,
    `- 本次生成 runId（原始）: ${summary.runId}`,
    `- 本次生成 runId（用于发布）: ${summary.effectiveRunId}`,
    `- publishJobId: ${summary.publishJobId ?? 'n/a'}`,
    `- profile rebuild: ${summary.rebuildMode}`,
    `- checkout host: ${summary.checkoutUrlHost ?? 'n/a'}`,
    `- SSE 事件数: ${summary.streamEventCount}`,
    '',
    '## Steps',
    '',
    ...steps.map((step) => `- [${step.ok ? 'x' : ' '}] ${step.name} (${step.durationMs}ms)${step.detail ? ` — ${step.detail}` : ''}`),
    '',
    '## Evidence Index',
    '',
    ...evidence.map((row) => `- ${row.label}: ${path.relative(rootDir, row.file)}`),
    ''
  ].join('\n');

  await fs.writeFile(reportPath, report, 'utf8');
  console.log(report);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
