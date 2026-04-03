import { Inject, Injectable } from '@nestjs/common';
import { CreditDirection } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class UsageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async summary(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      billing,
      usageLogs,
      publishCount,
      replyCount,
      generationCount,
      tokenCost,
      latestLedgers
    ] = await Promise.all([
      this.prisma.db.billingAccount.findUnique({ where: { workspaceId } }),
      this.prisma.db.usageLog.count({ where: { workspaceId, createdAt: { gte: monthStart } } }),
      this.prisma.db.publishJob.count({ where: { workspaceId, createdAt: { gte: monthStart } } }),
      this.prisma.db.replyJob.count({ where: { workspaceId, createdAt: { gte: monthStart } } }),
      this.prisma.db.generation.count({ where: { workspaceId, createdAt: { gte: monthStart } } }),
      this.prisma.db.tokenCostLog.aggregate({
        where: { workspaceId, createdAt: { gte: monthStart } },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true }
      }),
      this.prisma.db.creditLedger.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ]);

    return {
      workspaceId,
      periodStart: monthStart.toISOString(),
      billing,
      counters: {
        usageEvents: usageLogs,
        generations: generationCount,
        publishJobs: publishCount,
        replyJobs: replyCount
      },
      tokenCost: {
        inputTokens: tokenCost._sum.inputTokens ?? 0,
        outputTokens: tokenCost._sum.outputTokens ?? 0,
        costUsd: tokenCost._sum.costUsd ?? 0
      },
      latestLedgers
    };
  }

  async listEvents(userId: string, limit = 100) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    return this.prisma.db.usageLog.findMany({
      where: { workspaceId },
      include: {
        tokenCosts: true
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500)
    });
  }

  async trends(userId: string, days = 14) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const safeDays = Math.min(Math.max(days, 3), 90);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (safeDays - 1));

    const [usageLogs, publishJobs, replyJobs] = await Promise.all([
      this.prisma.db.usageLog.findMany({
        where: {
          workspaceId,
          createdAt: { gte: start }
        },
        select: {
          eventType: true,
          costUsd: true,
          createdAt: true
        }
      }),
      this.prisma.db.publishJob.findMany({
        where: {
          workspaceId,
          createdAt: { gte: start }
        },
        select: {
          createdAt: true
        }
      }),
      this.prisma.db.replyJob.findMany({
        where: {
          workspaceId,
          createdAt: { gte: start }
        },
        select: {
          createdAt: true
        }
      })
    ]);

    const buckets = new Map<
      string,
      {
        date: string;
        generation: number;
        naturalization: number;
        image: number;
        reply: number;
        publish: number;
        totalEvents: number;
        costUsd: number;
      }
    >();

    for (let i = 0; i < safeDays; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      buckets.set(key, {
        date: key,
        generation: 0,
        naturalization: 0,
        image: 0,
        reply: 0,
        publish: 0,
        totalEvents: 0,
        costUsd: 0
      });
    }

    for (const log of usageLogs) {
      const key = log.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;

      const event = log.eventType;
      if (event === 'GENERATION') bucket.generation += 1;
      if (event === 'NATURALIZATION') bucket.naturalization += 1;
      if (event === 'IMAGE') bucket.image += 1;
      if (event === 'REPLY') bucket.reply += 1;
      if (event === 'PUBLISH') bucket.publish += 1;

      bucket.totalEvents += 1;
      bucket.costUsd += Number(log.costUsd ?? 0);
    }

    for (const job of publishJobs) {
      const key = job.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.publish += 1;
    }

    for (const job of replyJobs) {
      const key = job.createdAt.toISOString().slice(0, 10);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.reply += 1;
    }

    return {
      workspaceId,
      days: safeDays,
      from: start.toISOString(),
      points: [...buckets.values()]
    };
  }

  async addCredits(userId: string, amount: number, reason: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const account = await this.prisma.db.billingAccount.upsert({
      where: { workspaceId },
      update: {
        remainingCredits: { increment: amount }
      },
      create: {
        workspaceId,
        monthlyQuota: 100,
        remainingCredits: 100 + amount
      }
    });

    const ledger = await this.prisma.db.creditLedger.create({
      data: {
        workspaceId,
        billingAccountId: account.id,
        direction: CreditDirection.CREDIT,
        amount,
        balanceAfter: account.remainingCredits,
        reason,
        metadata: {
          actorUserId: userId
        }
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'billing_account',
        resourceId: account.id,
        payload: {
          amount,
          reason,
          balanceAfter: account.remainingCredits
        }
      }
    });

    return {
      account,
      ledger
    };
  }
}
