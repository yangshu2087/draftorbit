import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class VoiceProfilesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async list(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    return this.prisma.db.voiceProfile.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      include: {
        xAccount: {
          select: {
            id: true,
            handle: true,
            status: true
          }
        }
      }
    });
  }

  async create(
    userId: string,
    input: {
      name: string;
      xAccountId?: string;
      profile?: Record<string, unknown>;
    }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const profile = await this.prisma.db.voiceProfile.create({
      data: {
        workspaceId,
        xAccountId: input.xAccountId ?? null,
        name: input.name,
        profile: (input.profile ?? {
          style: 'balanced',
          language: 'zh',
          toneHints: ['自然', '简洁', '有观点']
        }) as any
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'voice_profile',
        resourceId: profile.id,
        payload: { name: profile.name }
      }
    });

    return profile;
  }

  async update(
    userId: string,
    id: string,
    input: {
      name?: string;
      profile?: Record<string, unknown>;
      sampleCount?: number;
    }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const existing = await this.prisma.db.voiceProfile.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Voice Profile 不存在');

    const updated = await this.prisma.db.voiceProfile.update({
      where: { id },
      data: {
        name: input.name,
        profile: input.profile as any,
        sampleCount: typeof input.sampleCount === 'number' ? input.sampleCount : undefined,
        lastLearnedAt: typeof input.sampleCount === 'number' ? new Date() : undefined
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'voice_profile',
        resourceId: id
      }
    });

    return updated;
  }

  async rebuildStub(userId: string, id: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const existing = await this.prisma.db.voiceProfile.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Voice Profile 不存在');

    const updated = await this.prisma.db.voiceProfile.update({
      where: { id },
      data: {
        sampleCount: existing.sampleCount + 5,
        lastLearnedAt: new Date()
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'SYNC',
        resourceType: 'voice_profile',
        resourceId: id,
        payload: {
          message: 'Voice profile rebuild stub done'
        }
      }
    });

    return updated;
  }
}
