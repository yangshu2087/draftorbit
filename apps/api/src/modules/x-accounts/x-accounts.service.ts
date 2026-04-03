import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { XAccountStatus } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class XAccountsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async list(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      status?: XAccountStatus;
    } = {}
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const pageSize = options.pageSize ? Math.min(Math.max(options.pageSize, 1), 200) : 100;
    const page = options.page && options.page > 0 ? options.page : 1;
    const skip = (page - 1) * pageSize;

    return this.prisma.db.xAccount.findMany({
      where: {
        workspaceId,
        ...(options.status ? { status: options.status } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip
    });
  }

  async bindManual(userId: string, input: {
    twitterUserId: string;
    handle: string;
    status?: XAccountStatus;
    profile?: Record<string, unknown>;
  }) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const account = await this.prisma.db.xAccount.upsert({
      where: {
        workspaceId_twitterUserId: {
          workspaceId,
          twitterUserId: input.twitterUserId
        }
      },
      update: {
        userId,
        handle: input.handle,
        status: input.status ?? XAccountStatus.ACTIVE,
        profile: (input.profile ?? {}) as any
      },
      create: {
        workspaceId,
        userId,
        twitterUserId: input.twitterUserId,
        handle: input.handle,
        status: input.status ?? XAccountStatus.ACTIVE,
        profile: (input.profile ?? {}) as any
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'BIND',
        resourceType: 'x_account',
        resourceId: account.id,
        payload: {
          handle: account.handle,
          status: account.status
        }
      }
    });

    return account;
  }

  async updateStatus(userId: string, id: string, status: XAccountStatus) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const existing = await this.prisma.db.xAccount.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('X 账号不存在');

    const updated = await this.prisma.db.xAccount.update({
      where: { id },
      data: { status }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'x_account',
        resourceId: id,
        payload: {
          status
        }
      }
    });

    return updated;
  }

  async refreshTokenStub(userId: string, id: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const existing = await this.prisma.db.xAccount.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('X 账号不存在');

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'SYNC',
        resourceType: 'x_account',
        resourceId: id,
        payload: {
          message: 'Token refresh stub executed'
        }
      }
    });

    return {
      ok: true,
      message: 'X token refresh stub 已执行（待接入真实 OAuth 刷新）'
    };
  }
}
