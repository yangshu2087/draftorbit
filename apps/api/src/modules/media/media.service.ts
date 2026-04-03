import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MediaSourceType } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class MediaService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async list(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    return this.prisma.db.mediaAsset.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        draft: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });
  }

  async uploadPlaceholder(
    userId: string,
    input: { name?: string; sourceUrl: string; draftId?: string; metadata?: Record<string, unknown> }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const asset = await this.prisma.db.mediaAsset.create({
      data: {
        workspaceId,
        userId,
        draftId: input.draftId ?? null,
        sourceType: MediaSourceType.UPLOAD,
        status: 'READY',
        name: input.name ?? 'uploaded-asset',
        sourceUrl: input.sourceUrl,
        outputUrl: input.sourceUrl,
        metadata: (input.metadata ?? {}) as any
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'media_asset',
        resourceId: asset.id,
        payload: {
          sourceType: asset.sourceType,
          name: asset.name
        }
      }
    });

    return asset;
  }

  async generatePlaceholder(
    userId: string,
    input: { prompt: string; draftId?: string; metadata?: Record<string, unknown> }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const asset = await this.prisma.db.mediaAsset.create({
      data: {
        workspaceId,
        userId,
        draftId: input.draftId ?? null,
        sourceType: MediaSourceType.GENERATED,
        status: 'PROCESSING',
        name: 'generated-image',
        prompt: input.prompt,
        metadata: (input.metadata ?? {}) as any
      }
    });

    await this.queue.enqueueImageGeneration(asset.id);

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'media_asset',
        resourceId: asset.id,
        payload: {
          sourceType: asset.sourceType,
          prompt: input.prompt
        }
      }
    });

    return asset;
  }

  async linkDraft(userId: string, id: string, draftId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const existing = await this.prisma.db.mediaAsset.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('媒体资产不存在');

    const linked = await this.prisma.db.mediaAsset.update({
      where: { id },
      data: {
        draftId
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'media_asset',
        resourceId: id,
        payload: { draftId }
      }
    });

    return linked;
  }
}
