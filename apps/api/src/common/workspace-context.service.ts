import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceRole } from '@draftorbit/db';
import slugify from 'slugify';
import { PrismaService } from './prisma.service';

@Injectable()
export class WorkspaceContextService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private normalizeSlug(base: string): string {
    const normalized = slugify(base, {
      lower: true,
      strict: true,
      trim: true
    }).slice(0, 48);

    return normalized || `workspace-${Math.random().toString(36).slice(2, 8)}`;
  }

  private async resolveMembership(userId: string) {
    return this.prisma.db.workspaceMember.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });
  }

  async bootstrapDefaultWorkspace(userId: string) {
    const existingMember = await this.resolveMembership(userId);
    if (existingMember) {
      if (!existingMember.isDefault) {
        await this.prisma.db.workspaceMember.update({
          where: { id: existingMember.id },
          data: { isDefault: true }
        });
      }
      return {
        workspaceId: existingMember.workspaceId,
        created: false
      };
    }

    const user = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '用户不存在，无法初始化工作区'
      });
    }

    const base =
      user.handle?.trim() ||
      user.displayName?.trim() ||
      user.email?.split('@')[0] ||
      `workspace-${user.id.slice(0, 8)}`;

    const baseSlug = this.normalizeSlug(base);
    let workspaceId: string | null = null;
    let attempts = 0;

    while (!workspaceId && attempts < 8) {
      attempts += 1;
      const candidateSlug =
        attempts === 1 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

      try {
        const workspace = await this.prisma.db.workspace.create({
          data: {
            slug: candidateSlug,
            name: `${base} 工作区`,
            ownerId: userId
          }
        });
        workspaceId = workspace.id;
      } catch {
        // retry with a different slug
      }
    }

    if (!workspaceId) {
      throw new NotFoundException({
        code: 'WORKSPACE_BOOTSTRAP_FAILED',
        message: '默认工作区初始化失败，请稍后重试'
      });
    }

    await this.prisma.db.workspaceMember.create({
      data: {
        workspaceId,
        userId,
        role: WorkspaceRole.OWNER,
        isDefault: true
      }
    });

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { defaultWorkspaceId: workspaceId }
    });

    await this.prisma.db.duplicateGuardRule.upsert({
      where: { workspaceId },
      update: {},
      create: {
        workspaceId,
        enabled: true,
        similarityThreshold: '0.82',
        windowDays: 30
      }
    });

    await this.prisma.db.billingAccount.upsert({
      where: { workspaceId },
      update: {},
      create: {
        workspaceId,
        monthlyQuota: 100,
        remainingCredits: 100
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'workspace',
        resourceId: workspaceId,
        payload: {
          source: 'workspace-bootstrap'
        }
      }
    });

    return {
      workspaceId,
      created: true
    };
  }

  async getDefaultWorkspaceId(userId: string, options?: { autoBootstrap?: boolean }): Promise<string> {
    const autoBootstrap = options?.autoBootstrap ?? true;
    const member = await this.resolveMembership(userId);
    if (!member) {
      if (!autoBootstrap) {
        throw new NotFoundException({
          code: 'WORKSPACE_NOT_FOUND',
          message: '当前用户未加入工作区',
          details: {
            canBootstrap: true
          }
        });
      }

      const bootstrapped = await this.bootstrapDefaultWorkspace(userId);
      return bootstrapped.workspaceId;
    }

    if (!member.isDefault) {
      await this.prisma.db.workspaceMember.update({
        where: { id: member.id },
        data: { isDefault: true }
      });
    }

    return member.workspaceId;
  }
}
