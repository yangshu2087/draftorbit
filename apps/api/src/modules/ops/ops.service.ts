import { Inject, Injectable } from '@nestjs/common';
import type { OpsQueuesResponse } from '@draftorbit/shared';
import { QueueService } from '../../common/queue.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';
import { buildOpsVisibility, sanitizeOpsQueues } from './ops-visibility';

@Injectable()
export class OpsService {
  constructor(
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async queues(userId: string): Promise<OpsQueuesResponse & { ok: true; now: string }> {
    const membership = await this.workspaceContext.getDefaultMembership(userId);
    const visibility = buildOpsVisibility(membership.role);
    const queues = await this.queue.getQueueStats();

    return {
      ok: true,
      now: new Date().toISOString(),
      ...sanitizeOpsQueues(queues, visibility)
    };
  }
}
