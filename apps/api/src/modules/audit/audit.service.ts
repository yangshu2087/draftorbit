import { Inject, Injectable } from '@nestjs/common';
import { AuditActionType } from '@draftorbit/db';
import type { AuditLogsResponse, AuditSummaryEntity } from '@draftorbit/shared';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';
import { buildAuditVisibility, getVisibleAuditResourceTypes, sanitizeAuditLog } from './audit-visibility';

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
  ): Promise<AuditLogsResponse> {
    const membership = await this.workspaceContext.getDefaultMembership(userId);
    const visibility = buildAuditVisibility(membership.role);
    const visibleResourceTypes = getVisibleAuditResourceTypes(membership.role);
    const safeLimit = Math.min(Math.max(filters.limit ?? 100, 1), 500);

    const baseWhere = {
      workspaceId: membership.workspaceId,
      ...(filters.action ? { action: filters.action } : {})
    };

    const visibleResourceTypeFilter = filters.resourceType
      ? visibleResourceTypes && !visibleResourceTypes.includes(filters.resourceType)
        ? { in: [] as string[] }
        : filters.resourceType
      : visibleResourceTypes
        ? { in: visibleResourceTypes }
        : undefined;

    const visibleWhere = {
      ...baseWhere,
      ...(visibleResourceTypeFilter ? { resourceType: visibleResourceTypeFilter } : {})
    };

    const [workspaceMatchingCount, visibleMatchingCount, logs] = await Promise.all([
      this.prisma.db.auditLog.count({
        where: {
          ...baseWhere,
          ...(filters.resourceType ? { resourceType: filters.resourceType } : {})
        }
      }),
      this.prisma.db.auditLog.count({ where: visibleWhere }),
      this.prisma.db.auditLog.findMany({
        where: visibleWhere,
        orderBy: { createdAt: 'desc' },
        take: safeLimit
      })
    ]);

    return {
      items: logs.map((log) => sanitizeAuditLog(log, visibility.payloadAccess)),
      hiddenCount: Math.max(workspaceMatchingCount - visibleMatchingCount, 0),
      visibility,
      limit: safeLimit
    };
  }

  async summary(userId: string): Promise<AuditSummaryEntity> {
    const membership = await this.workspaceContext.getDefaultMembership(userId);
    const visibility = buildAuditVisibility(membership.role);
    const visibleResourceTypes = getVisibleAuditResourceTypes(membership.role);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const visibleFilter = visibleResourceTypes ? { resourceType: { in: visibleResourceTypes } } : {};

    const [workspaceTotal, workspaceLast24h, visibleTotal, visibleLast24h] = await Promise.all([
      this.prisma.db.auditLog.count({ where: { workspaceId: membership.workspaceId } }),
      this.prisma.db.auditLog.count({
        where: {
          workspaceId: membership.workspaceId,
          createdAt: {
            gte: last24h
          }
        }
      }),
      this.prisma.db.auditLog.count({
        where: {
          workspaceId: membership.workspaceId,
          ...visibleFilter
        }
      }),
      this.prisma.db.auditLog.count({
        where: {
          workspaceId: membership.workspaceId,
          createdAt: {
            gte: last24h
          },
          ...visibleFilter
        }
      })
    ]);

    return {
      workspaceId: membership.workspaceId,
      total: visibleTotal,
      last24h: visibleLast24h,
      workspaceTotal,
      workspaceLast24h,
      hiddenTotal: Math.max(workspaceTotal - visibleTotal, 0),
      hiddenLast24h: Math.max(workspaceLast24h - visibleLast24h, 0),
      visibility
    };
  }
}
