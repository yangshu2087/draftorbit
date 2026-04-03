import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async getMyWorkspace(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    return this.prisma.db.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                handle: true,
                displayName: true
              }
            }
          }
        }
      }
    });
  }

  async bootstrapDefaultWorkspace(userId: string) {
    const result = await this.workspaceContext.bootstrapDefaultWorkspace(userId);
    const workspace = await this.prisma.db.workspace.findUnique({
      where: { id: result.workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                handle: true,
                displayName: true
              }
            }
          }
        }
      }
    });

    return {
      ...result,
      workspace
    };
  }
}
