import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { toSegmentError } from '../../common/segment-error';
import { WorkspaceContextService } from '../../common/workspace-context.service';
import { AuditService } from '../audit/audit.service';
import { UsageService } from '../usage/usage.service';

@Injectable()
export class OpsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService,
    @Inject(UsageService) private readonly usageService: UsageService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async dashboardOverview(userId: string) {
    const workspaceResult = await Promise.allSettled([
      this.workspaceContext.getDefaultWorkspaceId(userId)
    ]);

    if (workspaceResult[0].status === 'rejected') {
      const error = toSegmentError('workspace', workspaceResult[0].reason);
      return {
        ok: false,
        degraded: true,
        segments: {
          workspace: { ok: false },
          topics: { ok: false },
          drafts: { ok: false },
          publishJobs: { ok: false },
          replyJobs: { ok: false },
          usage: { ok: false },
          audit: { ok: false },
          queues: { ok: false }
        },
        errors: [error],
        data: null,
        now: new Date().toISOString()
      };
    }

    const workspaceId = workspaceResult[0].value;

    const [
      workspaceDetailResult,
      topicsCountResult,
      draftsCountResult,
      publishCountResult,
      replyCountResult,
      usageResult,
      auditResult,
      queueResult
    ] = await Promise.allSettled([
      this.prisma.db.workspace.findUnique({
        where: { id: workspaceId },
        select: { id: true, slug: true, name: true, ownerId: true }
      }),
      this.prisma.db.topic.count({ where: { workspaceId } }),
      this.prisma.db.draft.count({ where: { workspaceId } }),
      this.prisma.db.publishJob.count({ where: { workspaceId } }),
      this.prisma.db.replyJob.count({ where: { workspaceId } }),
      this.usageService.summary(userId),
      this.auditService.summary(userId),
      this.queue.getQueueStats()
    ]);

    const errors = [
      ...(workspaceDetailResult.status === 'rejected'
        ? [toSegmentError('workspace', workspaceDetailResult.reason)]
        : []),
      ...(topicsCountResult.status === 'rejected'
        ? [toSegmentError('topics', topicsCountResult.reason)]
        : []),
      ...(draftsCountResult.status === 'rejected'
        ? [toSegmentError('drafts', draftsCountResult.reason)]
        : []),
      ...(publishCountResult.status === 'rejected'
        ? [toSegmentError('publishJobs', publishCountResult.reason)]
        : []),
      ...(replyCountResult.status === 'rejected'
        ? [toSegmentError('replyJobs', replyCountResult.reason)]
        : []),
      ...(usageResult.status === 'rejected' ? [toSegmentError('usage', usageResult.reason)] : []),
      ...(auditResult.status === 'rejected' ? [toSegmentError('audit', auditResult.reason)] : []),
      ...(queueResult.status === 'rejected' ? [toSegmentError('queues', queueResult.reason)] : [])
    ];

    return {
      ok: errors.length === 0,
      degraded: errors.length > 0,
      segments: {
        workspace: { ok: workspaceDetailResult.status === 'fulfilled' },
        topics: { ok: topicsCountResult.status === 'fulfilled' },
        drafts: { ok: draftsCountResult.status === 'fulfilled' },
        publishJobs: { ok: publishCountResult.status === 'fulfilled' },
        replyJobs: { ok: replyCountResult.status === 'fulfilled' },
        usage: { ok: usageResult.status === 'fulfilled' },
        audit: { ok: auditResult.status === 'fulfilled' },
        queues: { ok: queueResult.status === 'fulfilled' }
      },
      errors,
      data: {
        workspaceId,
        workspace: workspaceDetailResult.status === 'fulfilled' ? workspaceDetailResult.value : null,
        counters: {
          topics: topicsCountResult.status === 'fulfilled' ? topicsCountResult.value : 0,
          drafts: draftsCountResult.status === 'fulfilled' ? draftsCountResult.value : 0,
          publishJobs: publishCountResult.status === 'fulfilled' ? publishCountResult.value : 0,
          replyJobs: replyCountResult.status === 'fulfilled' ? replyCountResult.value : 0
        },
        usage: usageResult.status === 'fulfilled' ? usageResult.value : null,
        audit: auditResult.status === 'fulfilled' ? auditResult.value : null,
        queues: queueResult.status === 'fulfilled' ? queueResult.value : {}
      },
      now: new Date().toISOString()
    };
  }
}

