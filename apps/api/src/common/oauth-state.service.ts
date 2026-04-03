import { Injectable, OnModuleDestroy } from '@nestjs/common';
import IORedis from 'ioredis';

type XOAuthStatePayload = {
  codeVerifier: string;
  workspaceId: string;
  userId: string;
};

type SocialLoginStatePayload = {
  provider: 'X' | 'GOOGLE';
  codeVerifier?: string;
};

type LoginTicketPayload = {
  accessToken: string;
  email: string;
};

@Injectable()
export class OAuthStateService implements OnModuleDestroy {
  private readonly redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null
  });

  private key(kind: string, state: string): string {
    return `oauth:${kind}:${state}`;
  }

  private async save<T>(kind: string, state: string, payload: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.key(kind, state), JSON.stringify(payload), 'EX', ttlSeconds);
  }

  private async consume<T>(kind: string, state: string): Promise<T | null> {
    const key = this.key(kind, state);
    const tx = await this.redis.multi().get(key).del(key).exec();
    const raw = tx?.[0]?.[1];
    if (typeof raw !== 'string' || !raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async saveXState(state: string, payload: XOAuthStatePayload, ttlSeconds = 600): Promise<void> {
    await this.save('x-state', state, payload, ttlSeconds);
  }

  async consumeXState(state: string): Promise<XOAuthStatePayload | null> {
    return this.consume<XOAuthStatePayload>('x-state', state);
  }

  async saveSocialLoginState(
    state: string,
    payload: SocialLoginStatePayload,
    ttlSeconds = 600
  ): Promise<void> {
    await this.save('social-login-state', state, payload, ttlSeconds);
  }

  async consumeSocialLoginState(state: string): Promise<SocialLoginStatePayload | null> {
    return this.consume<SocialLoginStatePayload>('social-login-state', state);
  }

  async saveLoginTicket(
    ticketId: string,
    payload: LoginTicketPayload,
    ttlSeconds = 120
  ): Promise<void> {
    await this.save('login-ticket', ticketId, payload, ttlSeconds);
  }

  async consumeLoginTicket(ticketId: string): Promise<LoginTicketPayload | null> {
    return this.consume<LoginTicketPayload>('login-ticket', ticketId);
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
