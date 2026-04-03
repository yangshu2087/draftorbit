import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LearningSourceType } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class LearningSourcesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async list(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    return this.prisma.db.learningSource.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async create(
    userId: string,
    input: {
      sourceType: LearningSourceType;
      sourceRef: string;
      metadata?: Record<string, unknown>;
      xAccountId?: string;
    }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const source = await this.prisma.db.learningSource.create({
      data: {
        workspaceId,
        xAccountId: input.xAccountId ?? null,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef,
        metadata: (input.metadata ?? {}) as any,
        isEnabled: true
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'learning_source',
        resourceId: source.id,
        payload: {
          sourceType: source.sourceType,
          sourceRef: source.sourceRef
        }
      }
    });

    return source;
  }

  async toggle(userId: string, id: string, isEnabled: boolean) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const existing = await this.prisma.db.learningSource.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('学习源不存在');

    const updated = await this.prisma.db.learningSource.update({
      where: { id },
      data: { isEnabled }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'learning_source',
        resourceId: id,
        payload: { isEnabled }
      }
    });

    return updated;
  }

  async runLearning(userId: string, id: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const source = await this.prisma.db.learningSource.findFirst({ where: { id, workspaceId } });
    if (!source) throw new NotFoundException('学习源不存在');

    await this.queue.enqueueLearning({
      learningSourceId: source.id,
      workspaceId,
      userId
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'SYNC',
        resourceType: 'learning_source',
        resourceId: source.id,
        payload: {
          message: 'Learning job enqueued'
        }
      }
    });

    return {
      learningSourceId: source.id,
      enqueued: true
    };
  }
}
