import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import slugify from 'slugify';
import type { AuthUser } from '@draftorbit/shared';
import { AuthProvider, Prisma, SubscriptionPlan, SubscriptionStatus, WorkspaceRole, XAccountStatus } from '@draftorbit/db';
import { encryptSecret } from '@draftorbit/shared';
import { PrismaService } from '../../common/prisma.service';
import { TwitterService } from '../../common/twitter.service';
import { OAuthStateService } from '../../common/oauth-state.service';
import { GoogleClientService } from '../../common/google-client.service';
import { SelfHostAuthService } from '../../common/self-host-auth.service';
import { getAuthMode, requireEnv } from '../../common/env';
import { getBillingTrialDays } from '../billing/plan-catalog';

export type AuthMeDto = {
  id: string;
  email: string | null;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  subscription: {
    plan: 'FREE' | 'STARTER' | 'PRO' | 'PREMIUM';
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  };
  defaultWorkspace: {
    id: string;
    slug: string;
    name: string;
    role: string;
  } | null;
};

type WorkspaceContext = {
  workspaceId: string;
  role: WorkspaceRole;
  slug: string;
  name: string;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TwitterService) private readonly twitter: TwitterService,
    @Inject(OAuthStateService) private readonly oauthState: OAuthStateService,
    @Inject(GoogleClientService) private readonly google: GoogleClientService,
    @Inject(SelfHostAuthService) private readonly selfHostAuth: SelfHostAuthService
  ) {}

  private normalizeSlug(input: string): string {
    const normalized = slugify(input, {
      lower: true,
      strict: true,
      trim: true
    }).slice(0, 48);

    return normalized || `workspace-${Math.random().toString(36).slice(2, 8)}`;
  }

  private logAuthTiming(flow: 'x' | 'google', startAt: number, step: string) {
    if (process.env.AUTH_DEBUG_TIMING !== 'true') return;
    const cost = Date.now() - startAt;
    // eslint-disable-next-line no-console
    console.log(`[auth:${flow}] ${step} +${cost}ms`);
  }

  private async createWorkspaceWithUniqueSlug(userId: string, base: string) {
    const baseSlug = this.normalizeSlug(base);
    const name = `${base || 'DraftOrbit'} Workspace`;

    for (let i = 0; i < 5; i += 1) {
      const slug = i === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        return await this.prisma.db.workspace.create({
          data: {
            slug,
            name,
            ownerId: userId
          }
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new Error('Unable to create workspace slug after retries');
  }

  private async ensureDefaultWorkspace(userId: string, base: string): Promise<WorkspaceContext> {
    const existing = await this.prisma.db.workspaceMember.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { workspace: true }
    });

    if (existing) {
      if (!existing.isDefault) {
        await this.prisma.db.workspaceMember.update({
          where: { id: existing.id },
          data: { isDefault: true }
        });
      }
      return {
        workspaceId: existing.workspaceId,
        role: existing.role,
        slug: existing.workspace.slug,
        name: existing.workspace.name
      };
    }

    const workspace = await this.createWorkspaceWithUniqueSlug(userId, base);

    await Promise.all([
      this.prisma.db.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId,
          role: WorkspaceRole.OWNER,
          isDefault: true
        }
      }),
      this.prisma.db.user.update({
        where: { id: userId },
        data: { defaultWorkspaceId: workspace.id }
      }),
      this.prisma.db.duplicateGuardRule.upsert({
        where: { workspaceId: workspace.id },
        update: {},
        create: {
          workspaceId: workspace.id,
          enabled: true,
          similarityThreshold: '0.82',
          windowDays: 30
        }
      }),
      this.prisma.db.billingAccount.upsert({
        where: { workspaceId: workspace.id },
        update: {},
        create: {
          workspaceId: workspace.id,
          remainingCredits: 100,
          monthlyQuota: 100
        }
      })
    ]);

    return {
      workspaceId: workspace.id,
      role: WorkspaceRole.OWNER,
      slug: workspace.slug,
      name: workspace.name
    };
  }

  private async ensureSubscription(userId: string) {
    const now = new Date();
    const trialDays = getBillingTrialDays();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const sub = await this.prisma.db.subscription.findUnique({
      where: { userId },
      select: {
        id: true,
        plan: true,
        status: true,
        trialEndsAt: true,
        currentPeriodEnd: true
      }
    });
    if (!sub) {
      return this.prisma.db.subscription.create({
        data: {
          userId,
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.TRIALING,
          trialEndsAt,
          currentPeriodEnd: trialEndsAt
        },
        select: {
          plan: true,
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true
        }
      });
    }

    if (sub.plan === SubscriptionPlan.FREE) {
      return this.prisma.db.subscription.update({
        where: { id: sub.id },
        data: {
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.TRIALING,
          trialEndsAt: sub.trialEndsAt ?? trialEndsAt,
          currentPeriodEnd: sub.currentPeriodEnd ?? trialEndsAt
        },
        select: {
          plan: true,
          status: true,
          trialEndsAt: true,
          currentPeriodEnd: true
        }
      });
    }

    return sub;
  }

  private buildAuthMe(
    user: {
      id: string;
      email: string | null;
      handle: string;
      displayName: string | null;
      avatarUrl: string | null;
    },
    workspace: WorkspaceContext,
    subscription: {
      plan: SubscriptionPlan;
      status: SubscriptionStatus;
      trialEndsAt: Date | null;
      currentPeriodEnd: Date | null;
    }
  ): AuthMeDto {
    return {
      id: user.id,
      email: user.email,
      handle: user.handle,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null
      },
      defaultWorkspace: {
        id: workspace.workspaceId,
        slug: workspace.slug,
        name: workspace.name,
        role: workspace.role
      }
    };
  }

  private signAuthToken(user: AuthMeDto, twitterId?: string): string {
    const authPayload: AuthUser = {
      userId: user.id,
      twitterId: twitterId ?? undefined,
      handle: user.handle,
      plan: user.subscription.plan,
      workspaceId: user.defaultWorkspace?.id,
      role: user.defaultWorkspace?.role
    };
    return jwt.sign(authPayload, requireEnv('JWT_SECRET'), { expiresIn: '30d' });
  }

  async generateAuthLink(): Promise<{ url: string; state: string }> {
    return this.generateXAuthLink();
  }

  async generateXAuthLink(): Promise<{ url: string; state: string }> {
    const redirectUri = requireEnv('X_CALLBACK_URL');
    const { url, codeVerifier, state } = this.twitter.generateAuthLink(redirectUri);

    await this.oauthState.saveSocialLoginState(state, {
      provider: 'X',
      codeVerifier
    });

    return { url, state };
  }

  async generateGoogleAuthLink(): Promise<{ url: string; state: string }> {
    const redirectUri = requireEnv('GOOGLE_CALLBACK_URL');
    const { url, state } = this.google.generateAuthLink(redirectUri);

    await this.oauthState.saveSocialLoginState(state, {
      provider: 'GOOGLE'
    });

    return { url, state };
  }

  async createLocalSession(): Promise<{ token: string; user: AuthMeDto }> {
    if (getAuthMode() !== 'self_host_no_login') {
      // 仅在自托管模式开放本地登录，线上/常规部署直接隐藏该入口
      throw new NotFoundException('Not Found');
    }

    const local = await this.selfHostAuth.ensureLocalSession();
    await this.ensureSubscription(local.userId);
    const user = await this.getMe(local.userId);
    if (!user) {
      throw new UnauthorizedException('Local session user missing');
    }
    const token = this.signAuthToken(user);
    return { token, user };
  }

  async handleCallback(
    state: string,
    code: string
  ): Promise<{ token: string; user: AuthMeDto }> {
    const startedAt = Date.now();
    const payload = await this.oauthState.consumeSocialLoginState(state);
    if (!payload || payload.provider !== 'X' || !payload.codeVerifier) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
    this.logAuthTiming('x', startedAt, 'oauth-state-ok');

    const redirectUri = requireEnv('X_CALLBACK_URL');
    const { accessToken, refreshToken, expiresIn, user: xUser } = await this.twitter.handleCallback(
      code,
      payload.codeVerifier,
      redirectUri
    );
    this.logAuthTiming('x', startedAt, 'x-token-exchanged');

    const expiresAt = typeof expiresIn === 'number' ? new Date(Date.now() + expiresIn * 1000) : null;
    const encryptedAccessToken = encryptSecret(accessToken);
    const encryptedRefreshToken = refreshToken ? encryptSecret(refreshToken) : null;

    const dbUser = await this.prisma.db.user.upsert({
      where: { twitterId: xUser.id },
      create: {
        twitterId: xUser.id,
        email: null,
        handle: xUser.username,
        displayName: xUser.name ?? null,
        avatarUrl: xUser.profileImageUrl ?? null,
        accessTokenEnc: encryptedAccessToken,
        refreshTokenEnc: encryptedRefreshToken,
        tokenExpiresAt: expiresAt
      },
      update: {
        handle: xUser.username,
        displayName: xUser.name ?? null,
        avatarUrl: xUser.profileImageUrl ?? null,
        accessTokenEnc: encryptedAccessToken,
        refreshTokenEnc: encryptedRefreshToken,
        tokenExpiresAt: expiresAt
      }
    });
    this.logAuthTiming('x', startedAt, 'user-upserted');

    const workspace = await this.ensureDefaultWorkspace(dbUser.id, dbUser.handle || dbUser.displayName || 'draftorbit');
    this.logAuthTiming('x', startedAt, 'workspace-ready');

    const [, , subscription] = await Promise.all([
      this.prisma.db.authIdentity.upsert({
        where: {
          provider_providerUserId: {
            provider: AuthProvider.X,
            providerUserId: xUser.id
          }
        },
        update: {
          userId: dbUser.id,
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          metadata: {
            username: xUser.username,
            name: xUser.name ?? null
          }
        },
        create: {
          userId: dbUser.id,
          provider: AuthProvider.X,
          providerUserId: xUser.id,
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          metadata: {
            username: xUser.username,
            name: xUser.name ?? null
          }
        }
      }),
      this.prisma.db.xAccount.upsert({
        where: {
          workspaceId_twitterUserId: {
            workspaceId: workspace.workspaceId,
            twitterUserId: xUser.id
          }
        },
        update: {
          userId: dbUser.id,
          handle: xUser.username,
          status: XAccountStatus.ACTIVE,
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          profile: {
            name: xUser.name ?? null,
            profileImageUrl: xUser.profileImageUrl ?? null
          }
        },
        create: {
          workspaceId: workspace.workspaceId,
          userId: dbUser.id,
          twitterUserId: xUser.id,
          handle: xUser.username,
          status: XAccountStatus.ACTIVE,
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          profile: {
            name: xUser.name ?? null,
            profileImageUrl: xUser.profileImageUrl ?? null
          }
        }
      }),
      this.ensureSubscription(dbUser.id)
    ]);
    this.logAuthTiming('x', startedAt, 'identity-and-subscription-ready');

    const full = this.buildAuthMe(
      {
        id: dbUser.id,
        email: dbUser.email,
        handle: dbUser.handle,
        displayName: dbUser.displayName,
        avatarUrl: dbUser.avatarUrl
      },
      workspace,
      subscription
    );

    const token = this.signAuthToken(full, dbUser.twitterId ?? undefined);
    this.logAuthTiming('x', startedAt, 'done');
    return { token, user: full };
  }

  async handleGoogleCallback(
    state: string,
    code: string
  ): Promise<{ token: string; user: AuthMeDto }> {
    const startedAt = Date.now();
    const payload = await this.oauthState.consumeSocialLoginState(state);
    if (!payload || payload.provider !== 'GOOGLE') {
      throw new UnauthorizedException('Invalid or expired Google OAuth state');
    }
    this.logAuthTiming('google', startedAt, 'oauth-state-ok');

    const redirectUri = requireEnv('GOOGLE_CALLBACK_URL');
    const { accessToken, refreshToken, expiresIn, user: googleUser } = await this.google.handleCallback(
      code,
      redirectUri
    );
    this.logAuthTiming('google', startedAt, 'google-token-exchanged');

    const expiresAt = typeof expiresIn === 'number' ? new Date(Date.now() + expiresIn * 1000) : null;
    const encryptedAccessToken = encryptSecret(accessToken);
    const encryptedRefreshToken = refreshToken ? encryptSecret(refreshToken) : null;
    const handle = this.normalizeSlug(googleUser.email.split('@')[0]);

    const dbUser = await this.prisma.db.user.upsert({
      where: { email: googleUser.email.toLowerCase() },
      create: {
        email: googleUser.email.toLowerCase(),
        handle,
        displayName: googleUser.name ?? handle,
        avatarUrl: googleUser.avatarUrl ?? null
      },
      update: {
        handle,
        displayName: googleUser.name ?? undefined,
        avatarUrl: googleUser.avatarUrl ?? undefined
      }
    });
    this.logAuthTiming('google', startedAt, 'user-upserted');

    const workspace = await this.ensureDefaultWorkspace(
      dbUser.id,
      dbUser.handle || dbUser.displayName || googleUser.email.split('@')[0]
    );
    this.logAuthTiming('google', startedAt, 'workspace-ready');

    const [, subscription] = await Promise.all([
      this.prisma.db.authIdentity.upsert({
        where: {
          provider_providerUserId: {
            provider: AuthProvider.GOOGLE,
            providerUserId: googleUser.id
          }
        },
        update: {
          userId: dbUser.id,
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          metadata: {
            email: googleUser.email,
            emailVerified: googleUser.emailVerified ?? false
          }
        },
        create: {
          userId: dbUser.id,
          provider: AuthProvider.GOOGLE,
          providerUserId: googleUser.id,
          accessTokenEnc: encryptedAccessToken,
          refreshTokenEnc: encryptedRefreshToken,
          tokenExpiresAt: expiresAt,
          metadata: {
            email: googleUser.email,
            emailVerified: googleUser.emailVerified ?? false
          }
        }
      }),
      this.ensureSubscription(dbUser.id)
    ]);
    this.logAuthTiming('google', startedAt, 'identity-and-subscription-ready');

    const full = this.buildAuthMe(
      {
        id: dbUser.id,
        email: dbUser.email,
        handle: dbUser.handle,
        displayName: dbUser.displayName,
        avatarUrl: dbUser.avatarUrl
      },
      workspace,
      subscription
    );

    const token = this.signAuthToken(full, dbUser.twitterId ?? undefined);
    this.logAuthTiming('google', startedAt, 'done');
    return { token, user: full };
  }

  async getMe(userId: string): Promise<AuthMeDto | null> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        handle: true,
        displayName: true,
        avatarUrl: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true
          }
        },
        workspaceMembers: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          take: 1,
          select: {
            role: true,
            workspace: {
              select: {
                id: true,
                slug: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!user || !user.subscription) return null;

    const defaultMember = user.workspaceMembers[0];

    return {
      id: user.id,
      email: user.email,
      handle: user.handle,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      subscription: {
        plan: user.subscription.plan,
        status: user.subscription.status,
        trialEndsAt: user.subscription.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: user.subscription.currentPeriodEnd?.toISOString() ?? null
      },
      defaultWorkspace: defaultMember
        ? {
            id: defaultMember.workspace.id,
            slug: defaultMember.workspace.slug,
            name: defaultMember.workspace.name,
            role: defaultMember.role
          }
        : null
    };
  }
}
