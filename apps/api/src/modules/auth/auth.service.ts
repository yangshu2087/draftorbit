import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import slugify from 'slugify';
import type { AuthUser } from '@draftorbit/shared';
import { AuthProvider, WorkspaceRole, XAccountStatus } from '@draftorbit/db';
import { encryptSecret } from '@draftorbit/shared';
import { PrismaService } from '../../common/prisma.service';
import { TwitterService } from '../../common/twitter.service';
import { OAuthStateService } from '../../common/oauth-state.service';
import { GoogleClientService } from '../../common/google-client.service';
import { SelfHostAuthService } from '../../common/self-host-auth.service';
import { requireEnv } from '../../common/env';

export type AuthMeDto = {
  id: string;
  email: string | null;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  subscription: {
    plan: 'FREE' | 'PRO' | 'PREMIUM';
    status: string;
    currentPeriodEnd: string | null;
  };
  defaultWorkspace: {
    id: string;
    slug: string;
    name: string;
    role: string;
  } | null;
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

  private async ensureDefaultWorkspace(userId: string, base: string): Promise<{ workspaceId: string; role: WorkspaceRole }> {
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
      return { workspaceId: existing.workspaceId, role: existing.role };
    }

    const baseSlug = this.normalizeSlug(base);
    let slug = baseSlug;
    for (let i = 0; i < 5; i += 1) {
      const found = await this.prisma.db.workspace.findUnique({ where: { slug } });
      if (!found) break;
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const workspace = await this.prisma.db.workspace.create({
      data: {
        slug,
        name: `${base || 'DraftOrbit'} Workspace`,
        ownerId: userId
      }
    });

    await this.prisma.db.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        role: WorkspaceRole.OWNER,
        isDefault: true
      }
    });

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { defaultWorkspaceId: workspace.id }
    });

    await this.prisma.db.duplicateGuardRule.upsert({
      where: { workspaceId: workspace.id },
      update: {},
      create: {
        workspaceId: workspace.id,
        enabled: true,
        similarityThreshold: '0.82',
        windowDays: 30
      }
    });

    await this.prisma.db.billingAccount.upsert({
      where: { workspaceId: workspace.id },
      update: {},
      create: {
        workspaceId: workspace.id,
        remainingCredits: 100,
        monthlyQuota: 100
      }
    });

    return { workspaceId: workspace.id, role: WorkspaceRole.OWNER };
  }

  private async ensureSubscription(userId: string) {
    await this.prisma.db.subscription.upsert({
      where: { userId },
      create: { userId, plan: 'FREE', status: 'ACTIVE' },
      update: {}
    });
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
    const payload = await this.oauthState.consumeSocialLoginState(state);
    if (!payload || payload.provider !== 'X' || !payload.codeVerifier) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }

    const redirectUri = requireEnv('X_CALLBACK_URL');
    const { accessToken, refreshToken, expiresIn, user: xUser } = await this.twitter.handleCallback(
      code,
      payload.codeVerifier,
      redirectUri
    );

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

    const workspace = await this.ensureDefaultWorkspace(dbUser.id, dbUser.handle || dbUser.displayName || 'draftorbit');

    await this.prisma.db.authIdentity.upsert({
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
    });

    await this.prisma.db.xAccount.upsert({
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
    });

    await this.ensureSubscription(dbUser.id);

    const full = await this.getMe(dbUser.id);
    if (!full?.subscription) throw new Error('Subscription missing after upsert');
    const token = this.signAuthToken(full, dbUser.twitterId ?? undefined);
    return { token, user: full };
  }

  async handleGoogleCallback(
    state: string,
    code: string
  ): Promise<{ token: string; user: AuthMeDto }> {
    const payload = await this.oauthState.consumeSocialLoginState(state);
    if (!payload || payload.provider !== 'GOOGLE') {
      throw new UnauthorizedException('Invalid or expired Google OAuth state');
    }

    const redirectUri = requireEnv('GOOGLE_CALLBACK_URL');
    const { accessToken, refreshToken, expiresIn, user: googleUser } = await this.google.handleCallback(
      code,
      redirectUri
    );

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

    await this.prisma.db.authIdentity.upsert({
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
    });

    await this.ensureDefaultWorkspace(
      dbUser.id,
      dbUser.handle || dbUser.displayName || googleUser.email.split('@')[0]
    );
    await this.ensureSubscription(dbUser.id);

    const full = await this.getMe(dbUser.id);
    if (!full) {
      throw new UnauthorizedException('Unable to load user after Google login');
    }

    const token = this.signAuthToken(full, dbUser.twitterId ?? undefined);
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
