#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const DEFAULT_RENDER_API_HOST = 'https://api.render.com/v1';
const DEFAULT_RENDER_SERVICE_ID = 'srv-d77s19ogjchc73d4ua60';
const DEFAULT_EMAIL = 'uat.prod.bot@draftorbit.ai';
const DEFAULT_HANDLE = 'uat_prod_bot';
const DEFAULT_WORKSPACE_SLUG = 'uat-prod-workspace';
const DEFAULT_WORKSPACE_NAME = 'UAT Prod Workspace';

function log(message) {
  process.stderr.write(`${message}\n`);
}

function loadRenderApiKey() {
  const fromEnv = (process.env.RENDER_API_KEY ?? '').trim();
  if (fromEnv) return fromEnv;

  const cliFile = path.join(os.homedir(), '.render', 'cli.yaml');
  if (!fs.existsSync(cliFile)) return '';
  const content = fs.readFileSync(cliFile, 'utf8');
  const matched = content.match(/^\s*key:\s*(\S+)\s*$/m);
  return matched?.[1]?.trim() ?? '';
}

async function fetchRenderEnvVars({ apiKey, serviceId, apiHost }) {
  const all = [];
  let cursor = '';

  for (let round = 0; round < 20; round += 1) {
    const url = new URL(`${apiHost.replace(/\/$/, '')}/services/${serviceId}/env-vars`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });

    if (!response.ok) {
      throw new Error(`Render env-vars 请求失败：${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) break;
    all.push(...payload);

    cursor = String(payload[payload.length - 1]?.cursor ?? '').trim();
    if (payload.length < 100 || !cursor) break;
  }

  return Object.fromEntries(
    all
      .map((row) => row?.envVar)
      .filter((envVar) => envVar && typeof envVar.key === 'string')
      .map((envVar) => [envVar.key, String(envVar.value ?? '')])
  );
}

function toPublicDatabaseUrl(rawDatabaseUrl) {
  const parsed = new URL(rawDatabaseUrl);
  if (!parsed.hostname.includes('.')) {
    parsed.hostname = `${parsed.hostname}.oregon-postgres.render.com`;
  }
  if (!parsed.port) parsed.port = '5432';
  if (!parsed.searchParams.has('sslmode')) parsed.searchParams.set('sslmode', 'require');
  return parsed.toString();
}

async function ensureUatIdentity({ databaseUrl, jwtSecret }) {
  const prismaClientPath = path.resolve(process.cwd(), 'packages/db/node_modules/@prisma/client');
  const jwtPath = path.resolve(process.cwd(), 'apps/api/node_modules/jsonwebtoken');

  const prismaPkg = require(prismaClientPath);
  const jwt = require(jwtPath);

  const {
    PrismaClient,
    WorkspaceRole,
    SubscriptionPlan,
    SubscriptionStatus,
    BillingInterval
  } = prismaPkg;

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    let user = await prisma.user.findFirst({ where: { email: DEFAULT_EMAIL } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: DEFAULT_EMAIL,
          handle: DEFAULT_HANDLE,
          displayName: 'UAT Prod Bot'
        }
      });
    } else if (!user.handle || user.handle !== DEFAULT_HANDLE) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          handle: DEFAULT_HANDLE,
          displayName: user.displayName || 'UAT Prod Bot'
        }
      });
    }

    let workspace = await prisma.workspace.findUnique({ where: { slug: DEFAULT_WORKSPACE_SLUG } });
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          slug: DEFAULT_WORKSPACE_SLUG,
          name: DEFAULT_WORKSPACE_NAME,
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
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id
        }
      }
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
      where: {
        userId: user.id,
        workspaceId: { not: workspace.id },
        isDefault: true
      },
      data: { isDefault: false }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { defaultWorkspaceId: workspace.id }
    });

    const existingSub = await prisma.subscription.findUnique({ where: { userId: user.id } });
    if (!existingSub) {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.ACTIVE,
          billingInterval: BillingInterval.MONTHLY
        }
      });
    } else {
      await prisma.subscription.update({
        where: { userId: user.id },
        data: {
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.ACTIVE,
          billingInterval: BillingInterval.MONTHLY
        }
      });
    }

    const billing = await prisma.billingAccount.findUnique({ where: { workspaceId: workspace.id } });
    if (!billing) {
      await prisma.billingAccount.create({
        data: {
          workspaceId: workspace.id,
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.ACTIVE,
          monthlyQuota: 500,
          remainingCredits: 500
        }
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        handle: user.handle || DEFAULT_HANDLE,
        plan: 'STARTER',
        workspaceId: workspace.id,
        role: WorkspaceRole.OWNER
      },
      jwtSecret,
      { expiresIn: '30d' }
    );

    return {
      token,
      userId: user.id,
      workspaceId: workspace.id
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function verifyToken(apiUrl, token) {
  const response = await fetch(`${apiUrl.replace(/\/$/, '')}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`UAT token 验证失败：${response.status} ${body.slice(0, 300)}`);
  }
}

async function main() {
  const directToken = (process.env.UAT_TOKEN ?? process.env.DRAFTORBIT_TOKEN ?? '').trim();
  if (directToken) {
    process.stdout.write(`${directToken}\n`);
    return;
  }

  const apiKey = loadRenderApiKey();
  if (!apiKey) {
    throw new Error('未找到 Render API key（RENDER_API_KEY 或 ~/.render/cli.yaml）。');
  }

  const serviceId = (process.env.RENDER_API_SERVICE_ID ?? DEFAULT_RENDER_SERVICE_ID).trim();
  const apiHost = (process.env.RENDER_API_HOST ?? DEFAULT_RENDER_API_HOST).trim();
  const appApiUrl = (process.env.UAT_FULL_API_URL ?? process.env.API_URL ?? 'https://api.draftorbit.ai').trim();

  log(`[resolve-uat-token] 拉取 Render 环境变量：${serviceId}`);
  const envVars = await fetchRenderEnvVars({ apiKey, serviceId, apiHost });

  const rawDatabaseUrl = (envVars.DATABASE_URL ?? '').trim();
  const jwtSecret = (envVars.JWT_SECRET ?? '').trim();
  if (!rawDatabaseUrl || !jwtSecret) {
    throw new Error('Render 服务环境变量缺失 DATABASE_URL/JWT_SECRET。');
  }

  const publicDatabaseUrl = toPublicDatabaseUrl(rawDatabaseUrl);
  log('[resolve-uat-token] 构建/复用生产 UAT 用户与工作区');
  const created = await ensureUatIdentity({ databaseUrl: publicDatabaseUrl, jwtSecret });

  await verifyToken(appApiUrl, created.token);
  log(
    `[resolve-uat-token] token ok (user=${created.userId}, workspace=${created.workspaceId}, api=${appApiUrl})`
  );

  process.stdout.write(`${created.token}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log(`[resolve-uat-token] ERROR: ${message}`);
  process.exit(1);
});
