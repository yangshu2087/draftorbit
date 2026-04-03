import { Inject, Injectable } from '@nestjs/common';
import { AuthProvider, WorkspaceRole } from '@draftorbit/db';
import jwt from 'jsonwebtoken';
import { PrismaService } from './prisma.service';
import type { RequestUser } from './request-user';
import { requireEnv } from './env';

@Injectable()
export class SelfHostAuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private defaults() {
    const email = process.env.SELF_HOST_EMAIL?.trim() || 'selfhost@draftorbit.local';
    const displayName = process.env.SELF_HOST_DISPLAY_NAME?.trim() || 'Self-host Admin';
    const workspaceSlug = process.env.SELF_HOST_WORKSPACE_SLUG?.trim() || 'self-host';
    const workspaceName = process.env.SELF_HOST_WORKSPACE_NAME?.trim() || 'Self-host Workspace';
    return { email, displayName, workspaceSlug, workspaceName };
  }

  async ensureLocalSession(): Promise<RequestUser> {
    const defaults = this.defaults();
    const email = defaults.email.toLowerCase();

    const user = await this.prisma.db.user.upsert({
      where: { email },
      update: {
        displayName: defaults.displayName
      },
      create: {
        email,
        displayName: defaults.displayName
      }
    });

    await this.prisma.db.authIdentity.upsert({
      where: {
        provider_providerUserId: {
          provider: AuthProvider.LOCAL,
          providerUserId: email
        }
      },
      update: { userId: user.id },
      create: {
        userId: user.id,
        provider: AuthProvider.LOCAL,
        providerUserId: email
      }
    });

    const workspace = await this.prisma.db.workspace.upsert({
      where: { slug: defaults.workspaceSlug },
      update: {
        name: defaults.workspaceName,
        ownerId: user.id
      },
      create: {
        slug: defaults.workspaceSlug,
        name: defaults.workspaceName,
        ownerId: user.id
      }
    });

    await this.prisma.db.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: user.id
        }
      },
      update: {
        role: WorkspaceRole.OWNER,
        isDefault: true
      },
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        role: WorkspaceRole.OWNER,
        isDefault: true
      }
    });

    return {
      userId: user.id,
      workspaceId: workspace.id,
      email: user.email ?? email,
      role: WorkspaceRole.OWNER
    };
  }

  issueAccessToken(user: RequestUser): string {
    return jwt.sign(user, requireEnv('JWT_SECRET'), { expiresIn: '7d' });
  }
}
