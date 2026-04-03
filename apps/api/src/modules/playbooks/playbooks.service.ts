import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class PlaybooksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async list(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    return this.prisma.db.accountPlaybook.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async create(
    userId: string,
    input: {
      name: string;
      xAccountId?: string;
      rules?: Record<string, unknown>;
    }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const playbook = await this.prisma.db.accountPlaybook.create({
      data: {
        workspaceId,
        xAccountId: input.xAccountId ?? null,
        name: input.name,
        rules: (input.rules ?? {
          ctaStyle: 'soft',
          hashtags: ['#DraftOrbit'],
          avoidWords: ['100% guaranteed']
        }) as any
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'playbook',
        resourceId: playbook.id,
        payload: {
          name: playbook.name
        }
      }
    });

    return playbook;
  }

  async update(
    userId: string,
    id: string,
    input: {
      name?: string;
      rules?: Record<string, unknown>;
    }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const existing = await this.prisma.db.accountPlaybook.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('Playbook 不存在');

    const updated = await this.prisma.db.accountPlaybook.update({
      where: { id },
      data: {
        name: input.name,
        rules: input.rules as any
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'playbook',
        resourceId: id
      }
    });

    return updated;
  }
}
