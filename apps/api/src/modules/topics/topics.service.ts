import { Inject, Injectable } from '@nestjs/common';
import { TopicStatus } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class TopicsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async list(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      status?: TopicStatus;
    } = {}
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const pageSize = options.pageSize ? Math.min(Math.max(options.pageSize, 1), 200) : 100;
    const page = options.page && options.page > 0 ? options.page : 1;
    const skip = (page - 1) * pageSize;

    return this.prisma.db.topic.findMany({
      where: {
        workspaceId,
        ...(options.status ? { status: options.status } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip
    });
  }

  async create(userId: string, title: string, description?: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const topic = await this.prisma.db.topic.create({
      data: {
        workspaceId,
        createdById: userId,
        title,
        description: description ?? null
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'topic',
        resourceId: topic.id,
        payload: {
          title: topic.title
        }
      }
    });

    return topic;
  }
}
