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

type MemoryEntry = {
  raw: string;
  expiresAt: number;
};

@Injectable()
export class OAuthStateService implements OnModuleDestroy {
  constructor() {
    this.redis.on('error', () => undefined);
  }

  private readonly redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 1000,
    commandTimeout: 1000,
    retryStrategy: () => null
  });

  private readonly memoryFallback = new Map<string, MemoryEntry>();
  private warnedMemoryFallback = false;

  private key(kind: string, state: string): string {
    return `oauth:${kind}:${state}`;
  }

  private canUseMemoryFallback(): boolean {
    return (process.env.NODE_ENV ?? 'development') !== 'production' || process.env.AUTH_MODE === 'self_host_no_login';
  }

  private warnMemoryFallback(kind: string, error: unknown) {
    if (this.warnedMemoryFallback) return;
    this.warnedMemoryFallback = true;
    const reason = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.warn(`[oauth-state] Redis unavailable, falling back to in-memory store for ${kind}: ${reason}`);
  }

  private purgeExpiredMemoryEntries() {
    const now = Date.now();
    for (const [key, entry] of this.memoryFallback.entries()) {
      if (entry.expiresAt <= now) this.memoryFallback.delete(key);
    }
  }

  private saveToMemory(key: string, raw: string, ttlSeconds: number): void {
    this.purgeExpiredMemoryEntries();
    this.memoryFallback.set(key, {
      raw,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  private consumeFromMemory<T>(key: string): T | null {
    this.purgeExpiredMemoryEntries();
    const entry = this.memoryFallback.get(key);
    if (!entry) return null;
    this.memoryFallback.delete(key);
    try {
      return JSON.parse(entry.raw) as T;
    } catch {
      return null;
    }
  }

  private async saveWithRedis(key: string, raw: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, raw, 'EX', ttlSeconds);
  }

  private async consumeWithRedis<T>(key: string): Promise<T | null> {
    const tx = await this.redis.multi().get(key).del(key).exec();
    const raw = tx?.[0]?.[1];
    if (typeof raw !== 'string' || !raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async save<T>(kind: string, state: string, payload: T, ttlSeconds: number): Promise<void> {
    const key = this.key(kind, state);
    const raw = JSON.stringify(payload);
    try {
      await this.saveWithRedis(key, raw, ttlSeconds);
    } catch (error) {
      if (!this.canUseMemoryFallback()) throw error;
      this.warnMemoryFallback(kind, error);
      this.saveToMemory(key, raw, ttlSeconds);
    }
  }

  private async consume<T>(kind: string, state: string): Promise<T | null> {
    const key = this.key(kind, state);
    try {
      return await this.consumeWithRedis<T>(key);
    } catch (error) {
      if (!this.canUseMemoryFallback()) throw error;
      this.warnMemoryFallback(kind, error);
      return this.consumeFromMemory<T>(key);
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
    this.memoryFallback.clear();
    this.redis.disconnect();
  }
}
