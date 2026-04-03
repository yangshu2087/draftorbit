import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { decryptSecret, encryptSecret } from '@draftorbit/shared';
import { TwitterApi } from 'twitter-api-v2';
import { PrismaService } from './prisma.service';

function isPlaceholderSecret(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.startsWith('your-') ||
    normalized.startsWith('stub-') ||
    normalized.includes('replace-with') ||
    normalized.includes('example')
  );
}

@Injectable()
export class TwitterService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  getAuthClient(): TwitterApi {
    const clientId = process.env.X_CLIENT_ID?.trim();
    const clientSecret = process.env.X_CLIENT_SECRET?.trim();

    if (isPlaceholderSecret(clientId) || isPlaceholderSecret(clientSecret)) {
      throw new BadRequestException({
        code: 'X_OAUTH_CONFIG_INVALID',
        message: 'X OAuth 未配置完成：请在 .env 填写真实 X_CLIENT_ID / X_CLIENT_SECRET 并重启 API',
        details: {
          required: ['X_CLIENT_ID', 'X_CLIENT_SECRET', 'X_CALLBACK_URL'],
          recommendedCallback: 'http://localhost:3000/auth/callback'
        }
      });
    }

    return new TwitterApi({ clientId: clientId as string, clientSecret: clientSecret as string });
  }

  generateAuthLink(callbackUrl: string) {
    const client = this.getAuthClient();
    return client.generateOAuth2AuthLink(callbackUrl, {
      scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access']
    });
  }

  async handleCallback(code: string, codeVerifier: string, callbackUrl: string) {
    const client = this.getAuthClient();
    const { accessToken, refreshToken, expiresIn } = await client.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri: callbackUrl
    });

    const loggedClient = new TwitterApi(accessToken);
    const me = await loggedClient.v2.me({
      'user.fields': ['profile_image_url', 'name', 'username']
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: me.data.id,
        username: me.data.username,
        name: me.data.name,
        profileImageUrl: me.data.profile_image_url
      }
    };
  }

  async getClientForUser(userId: string): Promise<TwitterApi> {
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.accessTokenEnc) throw new Error('No access token');

    if (user.tokenExpiresAt && user.tokenExpiresAt < new Date() && user.refreshTokenEnc) {
      return this.refreshToken(userId, user.refreshTokenEnc);
    }

    return new TwitterApi(decryptSecret(user.accessTokenEnc));
  }

  private async refreshToken(userId: string, encryptedRefreshToken: string): Promise<TwitterApi> {
    const refreshToken = decryptSecret(encryptedRefreshToken);
    const authClient = this.getAuthClient();
    const result = await authClient.refreshOAuth2Token(refreshToken);
    const expiresAt = new Date(Date.now() + (result.expiresIn ?? 7200) * 1000);

    await this.prisma.db.user.update({
      where: { id: userId },
      data: {
        accessTokenEnc: encryptSecret(result.accessToken),
        refreshTokenEnc: result.refreshToken ? encryptSecret(result.refreshToken) : null,
        tokenExpiresAt: expiresAt
      }
    });

    return new TwitterApi(result.accessToken);
  }

  async getUserTimeline(userId: string, maxResults = 100) {
    const client = await this.getClientForUser(userId);
    const user = await this.prisma.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.twitterId) {
      throw new Error('No Twitter account bound for this user');
    }

    const timeline = await client.v2.userTimeline(user.twitterId, {
      max_results: Math.min(maxResults, 100),
      'tweet.fields': ['created_at', 'public_metrics', 'entities']
    });

    return timeline.data?.data ?? [];
  }

  async postTweet(userId: string, text: string) {
    const client = await this.getClientForUser(userId);
    return client.v2.tweet(text);
  }

  async postThread(userId: string, texts: string[]) {
    const client = await this.getClientForUser(userId);
    return client.v2.tweetThread(texts.map((text) => ({ text })));
  }
}
