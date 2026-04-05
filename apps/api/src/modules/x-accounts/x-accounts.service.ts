import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { XAccountStatus } from '@draftorbit/db';
import { encryptSecret } from '@draftorbit/shared';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';
import { TwitterService } from '../../common/twitter.service';
import { OAuthStateService } from '../../common/oauth-state.service';

@Injectable()
export class XAccountsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService,
    @Inject(TwitterService) private readonly twitter: TwitterService,
    @Inject(OAuthStateService) private readonly oauthState: OAuthStateService
  ) {}

  private resolveBindCallbackUrl(): string {
    const explicit = (process.env.X_BIND_CALLBACK_URL ?? '').trim();
    if (explicit) return explicit;

    const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').trim().replace(/\/$/, '');
    return `${appUrl}/x-accounts/oauth/callback`;
  }

  private async ensureDefaultXAccount(workspaceId: string) {
    const [currentDefault, firstActive] = await Promise.all([
      this.prisma.db.xAccount.findFirst({ where: { workspaceId, isDefault: true } }),
      this.prisma.db.xAccount.findFirst({ where: { workspaceId, status: XAccountStatus.ACTIVE }, orderBy: { createdAt: 'asc' } })
    ]);

    if (currentDefault || !firstActive) return;

    await this.prisma.db.xAccount.update({
      where: { id: firstActive.id },
      data: { isDefault: true }
    });
  }

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

    await this.ensureDefaultXAccount(workspaceId);

    return this.prisma.db.xAccount.findMany({
      where: {
        workspaceId,
        ...(options.status ? { status: options.status } : {})
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      take: pageSize,
      skip
    });
  }

  async startOAuthBind(userId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const redirectUri = this.resolveBindCallbackUrl();
    const { url, codeVerifier, state } = this.twitter.generateAuthLink(redirectUri);

    await this.oauthState.saveXState(state, {
      codeVerifier,
      workspaceId,
      userId
    });

    return {
      url,
      state,
      redirectUri
    };
  }

  async handleOAuthCallback(state: string, code: string) {
    const payload = await this.oauthState.consumeXState(state);
    if (!payload?.codeVerifier || !payload.workspaceId || !payload.userId) {
      throw new UnauthorizedException('Invalid or expired X bind OAuth state');
    }

    const redirectUri = this.resolveBindCallbackUrl();
    const { accessToken, refreshToken, expiresIn, user } = await this.twitter.handleCallback(
      code,
      payload.codeVerifier,
      redirectUri
    );

    const expiresAt = typeof expiresIn === 'number' ? new Date(Date.now() + expiresIn * 1000) : null;
    const encryptedAccessToken = encryptSecret(accessToken);
    const encryptedRefreshToken = refreshToken ? encryptSecret(refreshToken) : null;

    const account = await this.prisma.db.$transaction(async (tx) => {
      const defaultExists = await tx.xAccount.findFirst({ where: { workspaceId: payload.workspaceId, isDefault: true } });

      const upserted = await tx.xAccount.upsert({
        where: {
          workspaceId_twitterUserId: {
            workspaceId: payload.workspaceId,
            twitterUserId: user.id
          }
        },
        update: {
          userId: payload.userId,
          handle: user.username,
          status: XAccountStatus.ACTIVE,
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          profile: {
            name: user.name ?? null,
            profileImageUrl: user.profileImageUrl ?? null
          }
        },
        create: {
          workspaceId: payload.workspaceId,
          userId: payload.userId,
          twitterUserId: user.id,
          handle: user.username,
          status: XAccountStatus.ACTIVE,
          isDefault: !defaultExists,
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          profile: {
            name: user.name ?? null,
            profileImageUrl: user.profileImageUrl ?? null
          }
        }
      });

      if (!defaultExists && !upserted.isDefault) {
        await tx.xAccount.update({ where: { id: upserted.id }, data: { isDefault: true } });
        return {
          ...upserted,
          isDefault: true
        };
      }

      return upserted;
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId: payload.workspaceId,
        userId: payload.userId,
        action: 'BIND',
        resourceType: 'x_account',
        resourceId: account.id,
        payload: {
          oauth: true,
          handle: account.handle,
          status: account.status,
          isDefault: account.isDefault
        }
      }
    });

    return {
      ok: true,
      account
    };
  }

  async bindManual(
    userId: string,
    input: {
      twitterUserId: string;
      handle: string;
      status?: XAccountStatus;
      profile?: Record<string, unknown>;
    }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const defaultExists = await this.prisma.db.xAccount.findFirst({ where: { workspaceId, isDefault: true } });

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
        isDefault: !defaultExists,
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
          status: account.status,
          isDefault: account.isDefault
        }
      }
    });

    return account;
  }

  async updateStatus(userId: string, id: string, status: XAccountStatus) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const existing = await this.prisma.db.xAccount.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('X 账号不存在');

    const updated = await this.prisma.db.$transaction(async (tx) => {
      const next = await tx.xAccount.update({
        where: { id },
        data: { status }
      });

      if (next.isDefault && status !== XAccountStatus.ACTIVE) {
        const fallback = await tx.xAccount.findFirst({
          where: {
            workspaceId,
            id: { not: id },
            status: XAccountStatus.ACTIVE
          },
          orderBy: { createdAt: 'asc' }
        });

        if (fallback) {
          await tx.xAccount.update({ where: { id: fallback.id }, data: { isDefault: true } });
          await tx.xAccount.update({ where: { id }, data: { isDefault: false } });
          return {
            ...next,
            isDefault: false
          };
        }
      }

      return next;
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'x_account',
        resourceId: id,
        payload: {
          status,
          isDefault: updated.isDefault
        }
      }
    });

    return updated;
  }

  async setDefault(userId: string, id: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const existing = await this.prisma.db.xAccount.findFirst({
      where: { id, workspaceId }
    });
    if (!existing) throw new NotFoundException('X 账号不存在');

    const updated = await this.prisma.db.$transaction(async (tx) => {
      await tx.xAccount.updateMany({
        where: { workspaceId, isDefault: true },
        data: { isDefault: false }
      });

      return tx.xAccount.update({
        where: { id },
        data: { isDefault: true, status: XAccountStatus.ACTIVE }
      });
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'x_account',
        resourceId: id,
        payload: {
          operation: 'set_default'
        }
      }
    });

    return updated;
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const existing = await this.prisma.db.xAccount.findFirst({ where: { id, workspaceId } });
    if (!existing) throw new NotFoundException('X 账号不存在');

    const result = await this.prisma.db.$transaction(async (tx) => {
      await tx.xAccount.delete({ where: { id } });

      let nextDefaultId: string | null = null;
      if (existing.isDefault) {
        const fallback = await tx.xAccount.findFirst({
          where: { workspaceId, status: XAccountStatus.ACTIVE },
          orderBy: { createdAt: 'asc' }
        });

        if (fallback) {
          await tx.xAccount.update({ where: { id: fallback.id }, data: { isDefault: true } });
          nextDefaultId = fallback.id;
        }
      }

      return { nextDefaultId };
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'DELETE',
        resourceType: 'x_account',
        resourceId: id,
        payload: {
          operation: 'unbind',
          nextDefaultId: result.nextDefaultId
        }
      }
    });

    return {
      ok: true,
      deletedId: id,
      nextDefaultId: result.nextDefaultId
    };
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
