import { Inject, Injectable } from '@nestjs/common';
import { CreditDirection, PublishJobStatus } from '@draftorbit/db';
import { ModelGatewayService } from '../../common/model-gateway.service';
import { PrismaService } from '../../common/prisma.service';
import { toSegmentError } from '../../common/segment-error';
import { WorkspaceContextService } from '../../common/workspace-context.service';
import { deriveUsageOverviewGuidance } from './usage-overview-guidance';

function decimalToNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const parsed = Number(String(value));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export type RoutingHotspotMetric = {
  eventType?: string | null;
  modelUsed?: string | null;
  fallbackDepth?: number | null;
};

export type RoutingFallbackHotspot = {
  lane: string;
  eventType: string;
  provider: string;
  totalCalls: number;
  fallbackHits: number;
  fallbackRate: number;
};

function normalizeRoutingProvider(modelUsed: string | null | undefined): string {
  const normalized = String(modelUsed ?? '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.startsWith('codex-local')) return 'codex-local';
  if (normalized.startsWith('ollama/')) return 'ollama';
  if (normalized.startsWith('gpt-')) return 'openai';
  if (normalized.includes('/')) return 'openrouter';
  return 'unknown';
}

function normalizeUsageEventType(eventType: string | null | undefined): string {
  const raw = String(eventType ?? 'GENERATION').trim().toUpperCase();
  if (!raw) return 'GENERATION';
  return raw;
}

export function buildRoutingFallbackHotspots(
  usageMetrics: RoutingHotspotMetric[],
  limit = 5
): RoutingFallbackHotspot[] {
  const bucketMap = new Map<
    string,
    {
      lane: string;
      eventType: string;
      provider: string;
      totalCalls: number;
      fallbackHits: number;
    }
  >();

  for (const item of usageMetrics) {
    const eventType = normalizeUsageEventType(item.eventType);
    const provider = normalizeRoutingProvider(item.modelUsed);
    const lane = `${eventType.toLowerCase()}:${provider}`;
    const bucket = bucketMap.get(lane) ?? {
      lane,
      eventType,
      provider,
      totalCalls: 0,
      fallbackHits: 0
    };
    bucket.totalCalls += 1;
    if (Number(item.fallbackDepth ?? 0) > 0) bucket.fallbackHits += 1;
    bucketMap.set(lane, bucket);
  }

  return [...bucketMap.values()]
    .filter((bucket) => bucket.fallbackHits > 0)
    .sort((a, b) => {
      if (b.fallbackHits !== a.fallbackHits) return b.fallbackHits - a.fallbackHits;
      const aRate = a.totalCalls > 0 ? a.fallbackHits / a.totalCalls : 0;
      const bRate = b.totalCalls > 0 ? b.fallbackHits / b.totalCalls : 0;
      if (bRate !== aRate) return bRate - aRate;
      return a.lane.localeCompare(b.lane);
    })
    .slice(0, Math.max(1, limit))
    .map((bucket) => ({
      lane: bucket.lane,
      eventType: bucket.eventType,
      provider: bucket.provider,
      totalCalls: bucket.totalCalls,
      fallbackHits: bucket.fallbackHits,
      fallbackRate: bucket.totalCalls > 0 ? bucket.fallbackHits / bucket.totalCalls : 0
    }));
}

@Injectable()
export class UsageService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService,
    @Inject(ModelGatewayService) private readonly modelGateway: ModelGatewayService
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
      latestLedgers,
      usageMetrics,
      draftStatusCounts,
      publishSuccessCount
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
      }),
      this.prisma.db.usageLog.findMany({
        where: { workspaceId, createdAt: { gte: monthStart } },
        select: {
          eventType: true,
          modelUsed: true,
          routingTier: true,
          fallbackDepth: true,
          requestCostUsd: true,
          qualityScore: true,
          trialMode: true
        }
      }),
      this.prisma.db.draft.groupBy({
        by: ['status'],
        where: { workspaceId, createdAt: { gte: monthStart } },
        _count: { _all: true }
      }),
      this.prisma.db.publishJob.count({
        where: {
          workspaceId,
          createdAt: { gte: monthStart },
          status: PublishJobStatus.SUCCEEDED
        }
      })
    ]);

    const totalModelCalls = usageMetrics.length;
    const freeHits = usageMetrics.filter((item) => item.routingTier === 'free_first').length;
    const fallbackHits = usageMetrics.filter((item) => (item.fallbackDepth ?? 0) > 0).length;
    const qualityFallbackHits = usageMetrics.filter(
      (item) => item.routingTier === 'quality_fallback'
    ).length;
    const totalRequestCostUsd = usageMetrics.reduce((sum, item) => sum + decimalToNumber(item.requestCostUsd), 0);
    const avgRequestCostUsd = totalModelCalls > 0 ? totalRequestCostUsd / totalModelCalls : 0;
    const qualitySamples = usageMetrics
      .map((item) => decimalToNumber(item.qualityScore))
      .filter((value) => value > 0);
    const avgQualityScore = qualitySamples.length > 0
      ? qualitySamples.reduce((sum, value) => sum + value, 0) / qualitySamples.length
      : 0;
    const fallbackHotspots = buildRoutingFallbackHotspots(usageMetrics, 5);
    const routingHealth = this.modelGateway.getRoutingHealthSnapshot();

    const draftMap = new Map(draftStatusCounts.map((row) => [row.status, row._count._all]));

    const guidance = deriveUsageOverviewGuidance({
      degraded: false,
      summary: {
        counters: {
          usageEvents: usageLogs,
          generations: generationCount,
          publishJobs: publishCount,
          replyJobs: replyCount
        },
        billing,
        funnel: {
          drafts: [...draftMap.values()].reduce((sum, value) => sum + value, 0),
          pendingApproval: draftMap.get('PENDING_APPROVAL') ?? 0,
          approved: draftMap.get('APPROVED') ?? 0,
          queued: draftMap.get('QUEUED') ?? 0,
          published: draftMap.get('PUBLISHED') ?? 0,
          publishSucceeded: publishSuccessCount,
          replies: replyCount
        },
        modelRouting: {
          totalCalls: totalModelCalls,
          freeHitRate: totalModelCalls > 0 ? freeHits / totalModelCalls : 0,
          fallbackRate: totalModelCalls > 0 ? fallbackHits / totalModelCalls : 0,
          qualityFallbackRate: totalModelCalls > 0 ? qualityFallbackHits / totalModelCalls : 0,
          avgRequestCostUsd,
          totalRequestCostUsd,
          avgQualityScore,
          profile: routingHealth.profile,
          healthProbe: routingHealth.healthProbe,
          providerHealth: routingHealth.providers,
          fallbackHotspots
        } as any
      } as any
    });

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
      funnel: {
        drafts: [...draftMap.values()].reduce((sum, value) => sum + value, 0),
        pendingApproval: draftMap.get('PENDING_APPROVAL') ?? 0,
        approved: draftMap.get('APPROVED') ?? 0,
        queued: draftMap.get('QUEUED') ?? 0,
        published: draftMap.get('PUBLISHED') ?? 0,
        publishSucceeded: publishSuccessCount,
        replies: replyCount
      },
      modelRouting: {
        totalCalls: totalModelCalls,
        freeHitRate: totalModelCalls > 0 ? freeHits / totalModelCalls : 0,
        fallbackRate: totalModelCalls > 0 ? fallbackHits / totalModelCalls : 0,
        qualityFallbackRate: totalModelCalls > 0 ? qualityFallbackHits / totalModelCalls : 0,
        avgRequestCostUsd,
        totalRequestCostUsd,
        avgQualityScore,
        profile: routingHealth.profile,
        healthProbe: routingHealth.healthProbe,
        providerHealth: routingHealth.providers,
        fallbackHotspots
      },
      latestLedgers,
      nextAction: guidance.nextAction,
      blockingReason: guidance.blockingReason
    };
  }

  async overview(
    userId: string,
    options: {
      eventsLimit?: number;
      trendDays?: number;
    } = {}
  ) {
    const eventsLimit = Math.min(Math.max(options.eventsLimit ?? 50, 1), 500);
    const trendDays = Math.min(Math.max(options.trendDays ?? 14, 3), 90);

    const [summaryResult, eventsResult, trendsResult] = await Promise.allSettled([
      this.summary(userId),
      this.listEvents(userId, eventsLimit),
      this.trends(userId, trendDays)
    ]);

    const errors = [
      ...(summaryResult.status === 'rejected' ? [toSegmentError('summary', summaryResult.reason)] : []),
      ...(eventsResult.status === 'rejected' ? [toSegmentError('events', eventsResult.reason)] : []),
      ...(trendsResult.status === 'rejected' ? [toSegmentError('trends', trendsResult.reason)] : [])
    ];

    const summaryValue = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
    const guidance = deriveUsageOverviewGuidance({
      degraded: errors.length > 0,
      summary: summaryValue
    });

    return {
      ok: errors.length === 0,
      degraded: errors.length > 0,
      segments: {
        summary: summaryResult.status === 'fulfilled' ? { ok: true } : { ok: false },
        events: eventsResult.status === 'fulfilled' ? { ok: true } : { ok: false },
        trends: trendsResult.status === 'fulfilled' ? { ok: true } : { ok: false }
      },
      errors,
      data: {
        summary: summaryValue,
        events: eventsResult.status === 'fulfilled' ? eventsResult.value : [],
        trends: trendsResult.status === 'fulfilled' ? trendsResult.value : null
      },
      nextAction: guidance.nextAction,
      blockingReason: guidance.blockingReason,
      now: new Date().toISOString()
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
          requestCostUsd: true,
          routingTier: true,
          fallbackDepth: true,
          qualityScore: true,
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
        requestCostUsd: number;
        freeHits: number;
        fallbackHits: number;
        qualityFallbackHits: number;
        qualitySampleCount: number;
        qualityScoreSum: number;
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
        costUsd: 0,
        requestCostUsd: 0,
        freeHits: 0,
        fallbackHits: 0,
        qualityFallbackHits: 0,
        qualitySampleCount: 0,
        qualityScoreSum: 0
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
      bucket.requestCostUsd += decimalToNumber((log as any).requestCostUsd);
      if ((log as any).routingTier === 'free_first') bucket.freeHits += 1;
      if (Number((log as any).fallbackDepth ?? 0) > 0) bucket.fallbackHits += 1;
      if ((log as any).routingTier === 'quality_fallback') bucket.qualityFallbackHits += 1;
      const quality = decimalToNumber((log as any).qualityScore);
      if (quality > 0) {
        bucket.qualitySampleCount += 1;
        bucket.qualityScoreSum += quality;
      }
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
      points: [...buckets.values()].map((bucket) => ({
        ...bucket,
        avgQualityScore:
          bucket.qualitySampleCount > 0 ? bucket.qualityScoreSum / bucket.qualitySampleCount : 0
      }))
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
