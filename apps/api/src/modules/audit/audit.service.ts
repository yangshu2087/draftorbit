import { Inject, Injectable } from '@nestjs/common';
import { AuditActionType } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class AuditService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async list(
    userId: string,
    filters: {
      action?: AuditActionType;
      resourceType?: string;
      limit?: number;
    }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    return this.prisma.db.auditLog.findMany({
      where: {
        workspaceId,
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.resourceType ? { resourceType: filters.resourceType } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(filters.limit ?? 100, 1), 500)
    });
  }

  async summary(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const [total, last24h] = await Promise.all([
      this.prisma.db.auditLog.count({ where: { workspaceId } }),
      this.prisma.db.auditLog.count({
        where: {
          workspaceId,
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    return {
      workspaceId,
      total,
      last24h
    };
  }
}
