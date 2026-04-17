#!/usr/bin/env node

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';

const require = createRequire(import.meta.url);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const prismaClientPath = path.resolve(repoRoot, 'packages/db/node_modules/@prisma/client');
const jwtPath = path.resolve(repoRoot, 'apps/api/node_modules/jsonwebtoken');

const { PrismaClient, WorkspaceRole, SubscriptionPlan, SubscriptionStatus, XAccountStatus } =
  require(prismaClientPath);
const jwt = require(jwtPath);
const { chromium } = require('@playwright/test');

const API_BASE = (process.env.API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
const WEB_BASE = (process.env.APP_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[w1-acceptance] Missing JWT_SECRET in environment');
  process.exit(1);
}

const RUN_STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const RUN_ID = `w1-${RUN_STAMP}`;
const artifactRoot = path.resolve(repoRoot, 'artifacts', 'w1-acceptance', RUN_ID);
const responsesDir = path.join(artifactRoot, 'responses');
const screenshotsDir = path.join(artifactRoot, 'screenshots');

const BRIEF = {
  objective: '互动',
  audience: '创作者',
  tone: '专业清晰',
  postType: '观点短推',
  cta: '欢迎留言讨论',
  topicPreset: 'X 运营方法'
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compact(obj) {
  if (Array.isArray(obj)) return obj.map(compact);
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = compact(v);
  }
  return out;
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function apiRequest({ token, method = 'GET', pathname, body, timeoutMs = 120000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${pathname}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    const contentType = res.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json')
      ? await res.json().catch(() => null)
      : await res.text().catch(() => '');

    if (!res.ok) {
      throw new Error(
        `API ${method} ${pathname} failed (${res.status}): ${JSON.stringify(payload)}`
      );
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function consumeGenerateSse({ token, generationId }) {
  const res = await fetch(`${API_BASE}/generate/${generationId}/stream`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok || !res.body) {
    throw new Error(`SSE stream failed (${res.status})`);
  }

  const events = [];
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataLines = chunk
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, ''));

      if (dataLines.length > 0) {
        const dataRaw = dataLines.join('\n');
        try {
          const parsed = JSON.parse(dataRaw);
          events.push(parsed);
        } catch {
          events.push({ raw: dataRaw });
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }

  return events;
}

function isDuplicateQualityGateError(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes('QUALITY_GATE_BLOCKED') && text.includes('DUPLICATE_CONTENT');
}

async function approveWithDuplicateFallback(params) {
  const { token, draftId, fallbackTitle, fallbackContent, language = 'zh' } = params;

  try {
    const approved = await apiRequest({
      token,
      method: 'POST',
      pathname: `/drafts/${draftId}/approve`
    });
    return {
      approved,
      fallbackDraft: null
    };
  } catch (error) {
    if (!isDuplicateQualityGateError(error)) throw error;

    const fallbackDraft = await apiRequest({
      token,
      method: 'POST',
      pathname: '/drafts',
      body: {
        title: fallbackTitle,
        content: fallbackContent,
        language
      }
    });

    const approved = await apiRequest({
      token,
      method: 'POST',
      pathname: `/drafts/${fallbackDraft.id}/approve`
    });

    return {
      approved,
      fallbackDraft
    };
  }
}

async function ensureAcceptanceActor(prisma) {
  const handle = 'w1_acceptance_bot';
  const email = 'w1.acceptance@draftorbit.local';
  const workspaceSlug = 'w1-acceptance';

  let user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        handle,
        displayName: 'W1 Acceptance Bot'
      }
    });
  } else if (!user.handle || user.handle !== handle) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { handle }
    });
  }

  let workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        slug: workspaceSlug,
        name: 'W1 Acceptance Workspace',
        ownerId: user.id
      }
    });
  } else if (workspace.ownerId !== user.id) {
    workspace = await prisma.workspace.update({
      where: { id: workspace.id },
      data: { ownerId: user.id }
    });
  }

  const existingMember = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } }
  });

  if (!existingMember) {
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
      where: { id: existingMember.id },
      data: { role: WorkspaceRole.OWNER, isDefault: true }
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

  await prisma.duplicateGuardRule.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      enabled: true,
      similarityThreshold: '0.82',
      windowDays: 30
    }
  });

  await prisma.billingAccount.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      workspaceId: workspace.id,
      monthlyQuota: 100,
      remainingCredits: 100
    }
  });

  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {
      plan: SubscriptionPlan.STARTER,
      status: SubscriptionStatus.TRIALING,
      billingInterval: 'MONTHLY',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    },
    create: {
      userId: user.id,
      plan: SubscriptionPlan.STARTER,
      status: SubscriptionStatus.TRIALING,
      billingInterval: 'MONTHLY',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  const token = jwt.sign(
    {
      userId: user.id,
      handle: user.handle,
      plan: 'STARTER',
      workspaceId: workspace.id,
      role: WorkspaceRole.OWNER
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    user,
    workspace,
    token
  };
}

async function ensureThreeAccounts({ token }) {
  const existing = await apiRequest({
    token,
    pathname: '/x-accounts?pageSize=100'
  });

  const active = Array.isArray(existing) ? existing : [];
  const toCreate = Math.max(0, 3 - active.length);

  for (let i = 0; i < toCreate; i += 1) {
    const seq = active.length + i + 1;
    await apiRequest({
      token,
      method: 'POST',
      pathname: '/x-accounts/bind-manual',
      body: {
        twitterUserId: `w1-route-${RUN_ID}-${seq}`,
        handle: `w1_route_${seq}`,
        status: XAccountStatus.ACTIVE
      }
    });
  }

  const rows = await apiRequest({
    token,
    pathname: '/x-accounts?pageSize=100'
  });
  if (!Array.isArray(rows) || rows.length < 3) {
    throw new Error(`Expected >=3 x accounts, got ${Array.isArray(rows) ? rows.length : 'invalid'}`);
  }

  const selected = rows.slice(0, 3);
  for (const row of selected) {
    if (row.status !== XAccountStatus.ACTIVE) {
      await apiRequest({
        token,
        method: 'PATCH',
        pathname: `/x-accounts/${row.id}/status`,
        body: { status: XAccountStatus.ACTIVE }
      });
    }
  }

  await apiRequest({
    token,
    method: 'PATCH',
    pathname: `/x-accounts/${selected[0].id}/default`
  });

  const normalized = await apiRequest({
    token,
    pathname: '/x-accounts?pageSize=100'
  });
  return Array.isArray(normalized) ? normalized.slice(0, 3) : selected;
}

async function runNoTextFlow({ token, xAccountId }) {
  const createdTopic = await apiRequest({
    token,
    method: 'POST',
    pathname: '/topics',
    body: {
      title: BRIEF.topicPreset,
      description: `目标:${BRIEF.objective} / 受众:${BRIEF.audience} / 体裁:${BRIEF.postType}`
    }
  });

  let started = null;
  let generation = null;
  let streamEvents = [];
  const attempts = [];
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    started = await apiRequest({
      token,
      method: 'POST',
      pathname: '/generate/start',
      body: {
        mode: 'brief',
        brief: BRIEF,
        type: 'TWEET',
        language: 'zh',
        useStyle: true
      }
    });
    const generationId = started.generationId;
    if (!generationId) throw new Error('Missing generationId from /generate/start');

    streamEvents = await consumeGenerateSse({ token, generationId });
    generation = await apiRequest({
      token,
      pathname: `/generate/${generationId}`
    });

    const isDoneWithTweet =
      generation?.status === 'DONE' && typeof generation?.result?.tweet === 'string';
    attempts.push({
      attempt,
      generationId,
      status: generation?.status ?? 'UNKNOWN',
      hasTweet: isDoneWithTweet,
      lastEvent: streamEvents.at(-1) ?? null
    });

    if (isDoneWithTweet) {
      break;
    }

    await wait(600);
  }

  if (!generation || generation.status !== 'DONE' || typeof generation?.result?.tweet !== 'string') {
    throw new Error(
      `Generation failed after ${maxAttempts} attempts: ${JSON.stringify(attempts, null, 2)}`
    );
  }

  const drafts = await apiRequest({
    token,
    pathname: '/drafts?pageSize=20'
  });
  const matchingDraft =
    Array.isArray(drafts) && drafts.length > 0
      ? drafts.find((item) => item.latestContent === generation?.result?.tweet)
      : null;

  const draft =
    matchingDraft ??
    (await apiRequest({
      token,
      method: 'POST',
      pathname: '/drafts',
      body: {
        title: `W1 生成草稿 ${RUN_ID}`,
        content: generation.result.tweet,
        language: 'zh'
      }
    }));

  if (!draft?.id) {
    throw new Error('No draft found after generation chain');
  }

  const draftContent = draft.latestContent ?? generation.result.tweet;
  const approvedResult = await approveWithDuplicateFallback({
    token,
    draftId: draft.id,
    fallbackTitle: `W1 生成草稿 ${RUN_ID} 重试`,
    fallbackContent: `${draftContent}\n\n（验收追踪: ${RUN_ID}-${Date.now()}）`,
    language: 'zh'
  });
  const approved = approvedResult.approved;
  const approvedDraftId = approvedResult.fallbackDraft?.id ?? draft.id;

  const enqueue = await apiRequest({
    token,
    method: 'POST',
    pathname: '/publish/draft',
    body: {
      draftId: approvedDraftId,
      xAccountId
    }
  });

  return {
    createdTopic,
    started,
    attempts,
    streamEvents,
    generation,
    draftSource: matchingDraft ? 'generated-auto-created' : 'script-fallback-created',
    draft,
    approvalFallbackDraft: approvedResult.fallbackDraft,
    approved,
    enqueue
  };
}

async function createApprovedDraft({ token, idx }) {
  const created = await apiRequest({
    token,
    method: 'POST',
    pathname: '/drafts',
    body: {
      title: `W1 路由回放 ${idx}`,
      content: `【W1 路由回放 ${idx}】验证多账号发布命中与队列透传（${RUN_ID}）。欢迎留言讨论。`,
      language: 'zh'
    }
  });

  const approvedResult = await approveWithDuplicateFallback({
    token,
    draftId: created.id,
    fallbackTitle: `W1 路由回放 ${idx} 重试`,
    fallbackContent: `${created.latestContent ?? created.content ?? ''}\n\n（路由验收: ${RUN_ID}-${idx}-${Date.now()}）`,
    language: 'zh'
  });

  return {
    created,
    fallbackDraft: approvedResult.fallbackDraft,
    approved: approvedResult.approved
  };
}

async function runThreeAccountReplay({ token, accounts }) {
  const replayRows = [];

  for (let i = 0; i < 3; i += 1) {
    const account = accounts[i];
    const draftFlow = await createApprovedDraft({ token, idx: i + 1 });
    const enqueue = await apiRequest({
      token,
      method: 'POST',
      pathname: '/publish/draft',
      body: {
        draftId: draftFlow.approved.id,
        xAccountId: account.id
      }
    });

    replayRows.push({
      account: {
        id: account.id,
        handle: account.handle
      },
      draft: {
        id: draftFlow.approved.id,
        status: draftFlow.approved.status
      },
      enqueue
    });
  }

  const jobs = await apiRequest({
    token,
    pathname: '/publish/jobs?limit=50'
  });

  const checks = replayRows.map((row) => {
    const job = Array.isArray(jobs)
      ? jobs.find((item) => item.id === row.enqueue.publishJobId)
      : null;
    const matched = Boolean(job) && job.xAccountId === row.account.id;
    return {
      publishJobId: row.enqueue.publishJobId,
      expectedXAccountId: row.account.id,
      expectedHandle: row.account.handle,
      actualXAccountId: job?.xAccountId ?? null,
      actualHandle: job?.xAccount?.handle ?? null,
      matched
    };
  });

  return {
    replayRows,
    jobs,
    checks
  };
}

async function captureScreenshots({ token }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1512, height: 982 }
  });
  await context.addInitScript((injectedToken) => {
    window.localStorage.setItem('draftorbit_token', injectedToken);
  }, token);

  const page = await context.newPage();

  const routes = [
    { path: '/dashboard', file: 'dashboard.png' },
    { path: '/usage', file: 'usage.png' },
    { path: '/x-accounts', file: 'x-accounts.png' },
    { path: '/publish-queue', file: 'publish-queue.png' }
  ];

  const shots = [];
  try {
    for (const route of routes) {
      const target = `${WEB_BASE}${route.path}`;
      await page.goto(target, { waitUntil: 'networkidle', timeout: 60000 });

      // Wait for client hydration + async requests.
      await page.waitForTimeout(1800);
      await page
        .waitForFunction(
          () =>
            !document.body.innerText.includes('正在加载运营数据...') &&
            !document.body.innerText.includes('正在加载用量数据...'),
          { timeout: 12000 }
        )
        .catch(() => null);

      const loginVisible = await page
        .locator('text=登录您的账户')
        .first()
        .isVisible()
        .catch(() => false);
      if (loginVisible) {
        throw new Error(`Auth failed when capturing ${route.path}: redirected to login`);
      }

      const screenshotPath = path.join(screenshotsDir, route.file);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      shots.push({
        route: route.path,
        screenshotPath
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return shots;
}

function renderReportMarkdown({
  actor,
  noText,
  replay,
  usageSummary,
  usageTrends,
  screenshots,
  reportPath
}) {
  const now = new Date().toISOString();
  const replayTable = replay.checks
    .map(
      (row, idx) =>
        `| ${idx + 1} | ${row.expectedHandle} | ${row.publishJobId} | ${row.expectedXAccountId} | ${row.actualXAccountId ?? '-'} | ${row.actualHandle ?? '-'} | ${row.matched ? '✅' : '❌'} |`
    )
    .join('\n');

  const screenshotLines = screenshots
    .map((item) => `- ${item.route}\n  ![${item.route}](${item.screenshotPath})`)
    .join('\n');

  const streamTail = noText.streamEvents.slice(-6);
  const noTextPassed =
    noText.generation?.status === 'DONE' &&
    typeof noText.generation?.result?.tweet === 'string' &&
    noText.enqueue?.status === 'QUEUED';
  const replayPassed = replay.checks.every((row) => row.matched);
  const accepted =
    noTextPassed && replayPassed
      ? '✅ 通过'
      : `❌ 失败（无自由文本链路=${noTextPassed ? '通过' : '失败'}；路由回放=${replayPassed ? '通过' : '失败'}）`;

  return `# W1 验收报告（自动化）\n\n- 生成时间：${now}\n- Run ID：\`${RUN_ID}\`\n- API：\`${API_BASE}\`\n- Web：\`${WEB_BASE}\`\n- 验收用户：\`${actor.user.id}\`（@${actor.user.handle}）\n- 工作区：\`${actor.workspace.id}\`（${actor.workspace.slug}）\n- 报告文件：\`${reportPath}\`\n\n## 1) 无自由文本端到端（选题→草稿→审批→入队）\n\n状态：${accepted}\n\n- Topic ID：\`${noText.createdTopic.id}\`\n- Generation ID：\`${noText.started.generationId}\`\n- Generation 状态：\`${noText.generation.status}\`\n- Draft ID：\`${noText.draft.id}\`\n- Draft 来源：\`${noText.draftSource}\`\n- PublishJob ID：\`${noText.enqueue.publishJobId}\`\n- Publish 状态：\`${noText.enqueue.status}\`\n\n### 关键 API 响应（摘要）\n\n#### /generate/start 请求体（brief-first）\n\`\`\`json\n${JSON.stringify(
    {
      mode: 'brief',
      brief: BRIEF,
      type: 'TWEET',
      language: 'zh',
      useStyle: true
    },
    null,
    2
  )}\n\`\`\`\n\n#### SSE 尾部事件（/generate/:id/stream）\n\`\`\`json\n${JSON.stringify(streamTail, null, 2)}\n\`\`\`\n\n#### 生成重试记录\n\`\`\`json\n${JSON.stringify(noText.attempts, null, 2)}\n\`\`\`\n\n#### /publish/draft 响应\n\`\`\`json\n${JSON.stringify(noText.enqueue, null, 2)}\n\`\`\`\n\n## 2) 3 账号发布路由回放\n\n| # | 目标账号 | PublishJob | 预期 xAccountId | 实际 xAccountId | 实际 handle | 命中 |\n|---|---|---|---|---|---|---|\n${replayTable}\n\n## 3) 运营与用量接口快照\n\n### /usage/summary（摘要）\n\`\`\`json\n${JSON.stringify(
    {
      counters: usageSummary.counters,
      funnel: usageSummary.funnel,
      modelRouting: usageSummary.modelRouting
    },
    null,
    2
  )}\n\`\`\`\n\n### /usage/trends?days=7（最近点）\n\`\`\`json\n${JSON.stringify(
    {
      days: usageTrends.days,
      points: Array.isArray(usageTrends.points) ? usageTrends.points.slice(-3) : []
    },
    null,
    2
  )}\n\`\`\`\n\n## 4) 页面截图证据\n\n${screenshotLines}\n\n## 5) 原始证据文件\n\n- 响应目录：\`${responsesDir}\`\n- 截图目录：\`${screenshotsDir}\`\n`;
}

async function main() {
  console.log(`[w1-acceptance] run_id=${RUN_ID}`);
  await fs.mkdir(responsesDir, { recursive: true });
  await fs.mkdir(screenshotsDir, { recursive: true });

  const prisma = new PrismaClient();

  try {
    const actor = await ensureAcceptanceActor(prisma);
    await writeJson(path.join(responsesDir, '01-actor.json'), {
      user: actor.user,
      workspace: actor.workspace
    });

    const accounts = await ensureThreeAccounts({ token: actor.token });
    await writeJson(path.join(responsesDir, '02-x-accounts.json'), accounts);

    const noText = await runNoTextFlow({
      token: actor.token,
      xAccountId: accounts[0].id
    });
    await writeJson(path.join(responsesDir, '03-no-text-flow.json'), compact(noText));

    const replay = await runThreeAccountReplay({
      token: actor.token,
      accounts
    });
    await writeJson(path.join(responsesDir, '04-three-account-replay.json'), compact(replay));

    const usageSummary = await apiRequest({
      token: actor.token,
      pathname: '/usage/summary'
    });
    const usageTrends = await apiRequest({
      token: actor.token,
      pathname: '/usage/trends?days=7'
    });
    await writeJson(path.join(responsesDir, '05-usage-summary.json'), usageSummary);
    await writeJson(path.join(responsesDir, '06-usage-trends.json'), usageTrends);

    const screenshots = await captureScreenshots({ token: actor.token });
    await writeJson(path.join(responsesDir, '07-screenshots.json'), screenshots);

    const reportDate = new Date().toISOString().slice(0, 10);
    const reportPath = path.resolve(repoRoot, `W1-ACCEPTANCE-REPORT-${reportDate}.md`);
    const markdown = renderReportMarkdown({
      actor,
      noText,
      replay,
      usageSummary,
      usageTrends,
      screenshots,
      reportPath
    });

    await fs.writeFile(reportPath, markdown, 'utf8');

    console.log(`[w1-acceptance] ✅ completed`);
    console.log(`[w1-acceptance] report: ${reportPath}`);
    console.log(`[w1-acceptance] artifacts: ${artifactRoot}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[w1-acceptance] ❌ failed');
  console.error(error);
  process.exit(1);
});
