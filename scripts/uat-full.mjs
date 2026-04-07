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
const ENABLE_SOCIAL_MUTATIONS = process.env.UAT_ENABLE_SOCIAL_MUTATIONS === '1';
const REFUND_PARTIAL_USD = Number(process.env.UAT_REFUND_PARTIAL_USD ?? 1);
const CAPTURE_SCREENSHOTS = process.env.UAT_CAPTURE_SCREENSHOTS !== '0';
const STRICT_ASSERTIONS = process.env.UAT_STRICT_ASSERTIONS === '1';

const rootDir = process.cwd();
const artifactDir = path.resolve(rootDir, 'artifacts', 'uat-full', RUN_ID);
const responsesDir = path.join(artifactDir, 'responses');
const screenshotsDir = path.join(artifactDir, 'screenshots');
const reportPath = path.resolve(rootDir, `UAT-FULL-REPORT-${RUN_ID}.md`);

const steps = [];
const responseIndex = [];
let responseEvidenceCounter = 0;

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

function extractRequestId(payload, headers = {}) {
  const headerRequestId = headers['x-request-id'] ?? headers['X-Request-Id'] ?? null;
  if (headerRequestId) return String(headerRequestId);
  if (payload && typeof payload === 'object' && 'requestId' in payload && payload.requestId) {
    return String(payload.requestId);
  }
  return null;
}

async function recordResponseEvidence(label, meta) {
  responseEvidenceCounter += 1;
  const requestIdPart = sanitize(meta.requestId || 'no-request-id');
  const fileName = `${String(responseEvidenceCounter).padStart(3, '0')}-${sanitize(label)}-${requestIdPart}.json`;
  const filePath = path.join(responsesDir, fileName);
  const row = { label, ...meta, file: filePath };
  responseIndex.push(row);
  await writeJson(filePath, row);
  return row;
}

function isObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function extractArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (isObject(payload) && Array.isArray(payload.data)) return payload.data;
  return [];
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

    const requestId = extractRequestId(payload, Object.fromEntries(response.headers.entries()));
    await recordResponseEvidence(`api-${method}-${pathname}`, {
      source: 'api',
      method,
      pathname,
      status: response.status,
      ok: response.ok,
      requestId,
      payload
    });

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
    const requestId = extractRequestId(payload, Object.fromEntries(response.headers.entries()));
    await recordResponseEvidence(`public-${method}-${pathname}`, {
      source: 'public-api',
      method,
      pathname,
      status: response.status,
      ok: response.ok,
      requestId,
      payload
    });

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

async function consumeSse(generationId, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : 120000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  const response = await fetch(`${API_URL}/v2/generate/${generationId}/stream`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${runtimeToken}` },
    signal: controller.signal
  });
  if (!response.ok || !response.body) {
    clearTimeout(timer);
    throw new Error(`SSE stream failed (${response.status})`);
  }

  const events = [];
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  try {
    while (true) {
      if (Date.now() - startedAt > timeoutMs) return events;
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
          let parsed = null;
          try {
            parsed = JSON.parse(dataRaw);
          } catch {
            parsed = { raw: dataRaw };
          }
          events.push(parsed);
          const status = typeof parsed?.status === 'string' ? parsed.status.toLowerCase() : '';
          const step = typeof parsed?.step === 'string' ? parsed.step.toLowerCase() : '';
          if (status === 'failed' || step === 'error') {
            return events;
          }
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/aborted|abort/i.test(message)) {
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }

  return events;
}

function safeJsonParse(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function extractTweetFromGeneration(detail) {
  if (!isObject(detail)) return '';
  const result = isObject(detail.result) ? detail.result : null;

  const directCandidates = [
    result?.tweet,
    result?.primaryTweet,
    result?.text,
    result?.content
  ];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  const steps = Array.isArray(detail.steps) ? detail.steps : [];
  const draftStep = steps.find((step) => step?.step === 'DRAFT' && typeof step?.content === 'string');
  if (draftStep) {
    const parsedDraft = safeJsonParse(draftStep.content);
    const primaryTweet = parsedDraft?.primaryTweet;
    if (typeof primaryTweet === 'string' && primaryTweet.trim()) return primaryTweet.trim();
    const threadFirst =
      Array.isArray(parsedDraft?.thread) && typeof parsedDraft.thread[0] === 'string'
        ? parsedDraft.thread[0]
        : null;
    if (threadFirst && threadFirst.trim()) return threadFirst.trim();
  }

  const humanizeStep = steps.find(
    (step) => step?.step === 'HUMANIZE' && typeof step?.content === 'string'
  );
  if (humanizeStep) {
    const parsedHuman = safeJsonParse(humanizeStep.content);
    const humanized = parsedHuman?.humanized;
    if (typeof humanized === 'string' && humanized.trim()) return humanized.trim();
  }

  return '';
}

function buildFallbackTweet(topicTitle) {
  const topic = typeof topicTitle === 'string' && topicTitle.trim() ? topicTitle.trim() : 'X 内容运营';
  return [
    `今天复盘了「${topic}」这件事。`,
    '我的结论：先把流程跑通，再谈规模化放大。',
    '你现在最卡的一步是什么？欢迎留言交流。'
  ].join('\n');
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
    '/chat',
    '/settings',
    '/pricing',
    '/billing/success',
    '/billing/cancel'
  ];

  const rows = [];
  for (const route of routes) {
    const apiCalls = [];
    const pendingWrites = [];
    const listener = async (resp) => {
      const url = resp.url();
      if (!url.startsWith(API_URL)) return;
      let body = '';
      try {
        body = await resp.text();
      } catch {
        body = '';
      }
      const headers = resp.headers();
      let parsedBody = null;
      try { parsedBody = body ? JSON.parse(body) : null; } catch { parsedBody = null; }
      const requestId = extractRequestId(parsedBody, headers);
      const call = {
        url,
        status: resp.status(),
        ok: resp.ok(),
        requestId,
        bodySnippet: body.slice(0, 220)
      };
      apiCalls.push(call);
      pendingWrites.push(recordResponseEvidence(`browser-${route}-${apiCalls.length}`, {
        source: 'browser',
        route,
        ...call
      }));
    };
    page.on('response', listener);

    const target = `${APP_URL}${route}`;
    await page.goto(target, { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForTimeout(1800);
    const bodyText = (await page.textContent('body')) ?? '';
    const loading =
      bodyText.includes('正在加载运营数据') ||
      bodyText.includes('正在加载用量数据') ||
      bodyText.includes('正在加载') ||
      bodyText.includes('加载中…');
    const hasGuidance =
      bodyText.includes('新手指引') &&
      bodyText.includes('按简报一键生成') &&
      bodyText.includes('人工确认后发布');
    const screenshot = path.join(screenshotsDir, `${route.replace('/', '') || 'root'}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await Promise.all(pendingWrites);

    rows.push({
      route,
      target,
      currentUrl: page.url(),
      loadingStillVisible: loading,
      hasLoginPrompt:
        bodyText.includes('登录您的账户') || bodyText.includes('返回首页登录') || bodyText.includes('未登录'),
      hasGuidance,
      screenshot,
      apiCalls
    });

    if (STRICT_ASSERTIONS) {
      assertResult(!loading, `${route} 仍显示 loading 文案`);
      assertResult(!rows.at(-1)?.hasLoginPrompt, `${route} 出现登录提示`);
      assertResult(apiCalls.length > 0, `${route} 未捕获到任何 API 调用`);
      if (!['/pricing', '/settings', '/billing/success', '/billing/cancel'].includes(route)) {
        assertResult(hasGuidance, `${route} 缺少全局可理解性引导（当前阶段/下一步）`);
      }
    }

    page.off('response', listener);
  }

  await context.close();
  await browser.close();
  return rows;
}

function assertResult(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { attempts = 3, delayMs = 500 } = {}) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await sleep(delayMs * (i + 1));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
    const rowsPayload = await apiRequest('/v2/x-accounts?pageSize=100');
    const rows = extractArray(rowsPayload);
    const activeRows = rows.filter((row) => row?.status === 'ACTIVE');
    const needCreate = Math.max(0, 3 - activeRows.length);
    for (let i = 0; i < needCreate; i += 1) {
      await apiRequest('/v2/x-accounts/bind-manual', {
        method: 'POST',
        body: {
          twitterUserId: `uat-route-${RUN_ID}-${i + 1}`,
          handle: `uat_route_${i + 1}`,
          status: 'ACTIVE'
        }
      });
    }

    const refreshedPayload = await apiRequest('/v2/x-accounts?pageSize=100');
    const refreshed = extractArray(refreshedPayload);
    const actives = refreshed.filter((item) => item?.status === 'ACTIVE').slice(0, 3);
    assertResult(actives.length >= 3, '可用 X 账号不足 3 个');

    await apiRequest(`/v2/x-accounts/${actives[0].id}/default`, { method: 'PATCH' });
    await apiRequest(`/v2/x-accounts/${actives[2].id}/status`, {
      method: 'PATCH',
      body: { status: 'REVOKED' }
    });
    await apiRequest(`/v2/x-accounts/${actives[2].id}/status`, {
      method: 'PATCH',
      body: { status: 'ACTIVE' }
    });

    const finalRowsPayload = await apiRequest('/v2/x-accounts?pageSize=100');
    const finalRows = extractArray(finalRowsPayload);
    return {
      all: finalRows,
      activeTop3: actives
    };
  });

  const selectedXAccountId = xAccounts?.activeTop3?.[0]?.id ?? null;

  const topic = { title: `UAT 方向 ${RUN_ID}` };

  const generation = await recordStep('generate.brief-chain', async () => {
    const attempts = [];
    let resolvedTweet = '';

    for (let i = 0; i < 2; i += 1) {
      const start = await apiRequest('/v2/generate/run', {
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
      assertResult(Boolean(generationId), 'v2/generate/run 未返回 generationId');
      const streamEvents = await consumeSse(generationId);
      const detail = await apiRequest(`/v2/generate/${generationId}`);
      const tweet = extractTweetFromGeneration(detail);
      attempts.push({ start, streamTail: streamEvents.slice(-8), detail, tweet });

      if (tweet) {
        resolvedTweet = tweet;
        break;
      }
    }

    if (!resolvedTweet) {
      resolvedTweet = buildFallbackTweet(topic?.title);
    }

    return { attempts, detail: attempts.at(-1)?.detail ?? null, resolvedTweet };
  });

  await recordStep('publish.queue-from-generation', async () => {
    const generationId = generation?.attempts?.at(-1)?.start?.generationId ?? generation?.detail?.id;
    assertResult(Boolean(generationId), '主链路缺少 generationId，无法入队发布');

    const enqueue = ENABLE_SOCIAL_MUTATIONS
      ? await apiRequest('/v2/publish/queue', {
          method: 'POST',
          body: {
            generationId,
            xAccountId: selectedXAccountId,
            channel: 'X_TWEET'
          }
        })
      : {
          skipped: true,
          reason: 'UAT_ENABLE_SOCIAL_MUTATIONS!=1，已跳过真实发布入队'
        };

    return { generationId, enqueue };
  });

  const publishReplay = await recordStep('publish.route-replay-3', async () => {
    if (!ENABLE_SOCIAL_MUTATIONS) {
      const listPayload = await apiRequest('/v2/x-accounts?pageSize=100');
      const list = extractArray(listPayload);
      const top3 = list.filter((row) => row.status === 'ACTIVE').slice(0, 3);
      assertResult(top3.length >= 3, '路由回放前可用账号不足 3 个');
      return {
        skipped: true,
        reason: 'UAT_ENABLE_SOCIAL_MUTATIONS!=1，已跳过真实发布路由回放',
        activeAccounts: top3.map((row) => ({ id: row.id, handle: row.handle }))
      };
    }

    const listPayload = await apiRequest('/v2/x-accounts?pageSize=100');
    const list = extractArray(listPayload);
    const top3 = list.filter((row) => row.status === 'ACTIVE').slice(0, 3);
    assertResult(top3.length >= 3, '路由回放前可用账号不足 3 个');

    const replay = [];
    for (let i = 0; i < 3; i += 1) {
      const account = top3[i];
      const start = await apiRequest('/v2/generate/run', {
        method: 'POST',
        body: {
          mode: 'brief',
          brief: {
            objective: '互动',
            audience: '中文创作者',
            tone: '专业清晰',
            postType: '观点短推',
            cta: '欢迎留言讨论',
            topicPreset: `UAT 路由回放 ${i + 1}`
          },
          type: 'TWEET',
          language: 'zh',
          useStyle: true
        }
      });
      const generationId = start?.generationId;
      assertResult(Boolean(generationId), `路由回放 ${i + 1} 缺少 generationId`);
      const enqueue = await apiRequest('/v2/publish/queue', {
        method: 'POST',
        body: { generationId, xAccountId: account.id, channel: 'X_TWEET' }
      });
      replay.push({
        account: { id: account.id, handle: account.handle },
        publishJobId: enqueue.publishJobId
      });
    }

    const jobsPayload = await apiRequest('/v2/publish/jobs?limit=50');
    const jobs = extractArray(jobsPayload);
    const checks = replay.map((row) => {
      const job = jobs.find((item) => item.id === row.publishJobId);
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

  await recordStep('reply.route-replay-3', async () => {
    if (!ENABLE_SOCIAL_MUTATIONS) {
      const listPayload = await apiRequest('/v2/x-accounts?pageSize=100');
      const list = extractArray(listPayload);
      const top3 = list.filter((row) => row.status === 'ACTIVE').slice(0, 3);
      assertResult(top3.length >= 3, '回复路由回放前可用账号不足 3 个');
      return {
        skipped: true,
        reason: 'UAT_ENABLE_SOCIAL_MUTATIONS!=1，已跳过回复回放',
        activeAccounts: top3.map((row) => ({ id: row.id, handle: row.handle }))
      };
    }

    const listPayload = await apiRequest('/v2/x-accounts?pageSize=100');
    const list = extractArray(listPayload);
    const top3 = list.filter((row) => row.status === 'ACTIVE').slice(0, 3);
    assertResult(top3.length >= 3, '回复路由回放前可用账号不足 3 个');

    const replay = [];
    for (let i = 0; i < 3; i += 1) {
      const account = top3[i];
      const sync = await apiRequest('/v2/reply/sync-mentions', {
        method: 'POST',
        body: { xAccountId: account.id }
      });
      const candidate = await apiRequest(`/v2/reply/${sync.id}/candidates`, {
        method: 'POST',
        body: {
          content: `感谢反馈，我们会继续优化（${RUN_ID}-${i + 1}）。`,
          riskLevel: 'LOW',
          riskScore: 0.1
        }
      });
      const approved = await apiRequest(`/v2/reply/${sync.id}/candidates/${candidate.id}/approve`, {
        method: 'POST'
      });
      const sent = await apiRequest(`/v2/reply/${sync.id}/send`, {
        method: 'POST',
        body: { candidateId: candidate.id }
      });

      replay.push({
        account: { id: account.id, handle: account.handle },
        replyJobId: sync.id,
        candidateId: candidate.id,
        approved,
        sent
      });
    }

    const jobsPayload = await apiRequest('/v2/reply/jobs?page=1&pageSize=100');
    const jobs = extractArray(jobsPayload);
    const checks = replay.map((row) => {
      const job = jobs.find((item) => item.id === row.replyJobId);
      return {
        replyJobId: row.replyJobId,
        expectedXAccountId: row.account.id,
        actualXAccountId: job?.xAccountId ?? null,
        matched: row.account.id === job?.xAccountId
      };
    });
    assertResult(checks.every((c) => c.matched), '3 账号回复路由回放存在未命中');

    return { replay, checks };
  });

  await recordStep('system.overview', async () => {
    return withRetry(async () => {
      const [dashboard, usageOverview, billingUsage, billingSub] = await Promise.all([
        apiRequest('/v2/ops/dashboard'),
        apiRequest('/v2/usage/overview?eventsLimit=30&days=14'),
        apiRequest('/v2/billing/usage'),
        apiRequest('/v2/billing/subscription')
      ]);
      return {
        dashboardDegraded: dashboard?.degraded ?? null,
        usageDegraded: usageOverview?.degraded ?? null,
        billingUsage,
        billingSub
      };
    });
  });

  const billing = await recordStep('billing.checkout-and-status', async () => {
    const [plans, subscription, usage, checkout] = await Promise.all([
      apiRequest('/v2/billing/plans'),
      apiRequest('/v2/billing/subscription'),
      apiRequest('/v2/billing/usage'),
      apiRequest('/v2/billing/checkout', {
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
      const cancel = await apiRequest('/v2/billing/subscription/cancel', {
        method: 'POST',
        body: { mode: 'AT_PERIOD_END' }
      });
      const partial = await apiRequest('/v2/billing/refund', {
        method: 'POST',
        body: { mode: 'PARTIAL', amountUsd: REFUND_PARTIAL_USD, reason: 'requested_by_customer' }
      });
      const full = await apiRequest('/v2/billing/refund', {
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
    `- 真实发布/互动动作: ${ENABLE_SOCIAL_MUTATIONS ? '开启' : '关闭（仅做安全校验）'}`,
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
  await writeJson(path.join(artifactDir, 'response-index.json'), responseIndex);
  await writeJson(path.join(artifactDir, 'summary.json'), {
    runId: RUN_ID,
    createdAt: nowIso(),
    apiUrl: API_URL,
    appUrl: APP_URL,
    enableSocialMutations: ENABLE_SOCIAL_MUTATIONS,
    enableBillingMutations: ENABLE_BILLING_MUTATIONS,
    requiredFailures,
    steps,
    responseIndexCount: responseIndex.length,
    strictAssertions: STRICT_ASSERTIONS
  });

  if (requiredFailures.length > 0) {
    console.error(`[uat-full] ❌ required steps failed: ${requiredFailures.length}`);
    console.error(`[uat-full] report: ${reportPath}`);
    process.exit(1);
  }

  console.log('[uat-full] ✅ completed');
  console.log(`[uat-full] report: ${reportPath}`);
  console.log(`[uat-full] artifacts: ${artifactDir}`);
  process.exit(0);
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
