import { PrismaClient, WorkspaceRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_OWNER_EMAIL?.trim() || 'owner@draftorbit.local';
  const handle = process.env.SEED_OWNER_HANDLE?.trim() || 'draftorbit_owner';

  const user = await prisma.user.upsert({
    where: { email },
    update: { handle, displayName: 'DraftOrbit Owner' },
    create: {
      email,
      handle,
      displayName: 'DraftOrbit Owner'
    }
  });

  const workspace = await prisma.workspace.upsert({
    where: { slug: 'default' },
    update: { ownerId: user.id, name: 'DraftOrbit Default Workspace' },
    create: {
      slug: 'default',
      name: 'DraftOrbit Default Workspace',
      ownerId: user.id
    }
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id
      }
    },
    update: {
      role: WorkspaceRole.OWNER,
      isDefault: true
    },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.OWNER,
      isDefault: true
    }
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

  console.log(`Seed complete: user=${user.email} workspace=${workspace.slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
