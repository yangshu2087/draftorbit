import test from 'node:test';
import assert from 'node:assert/strict';
import { OAuthStateService } from '../src/common/oauth-state.service';

const SNAPSHOT_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...SNAPSHOT_ENV };
});

function createBrokenRedisService() {
  const service = new OAuthStateService() as OAuthStateService & { redis?: { disconnect?: () => void } };
  service.redis?.disconnect?.();
  (service as OAuthStateService & { redis: unknown }).redis = {
    set: async () => {
      throw new Error('redis unavailable');
    },
    multi: () => ({
      get() {
        return this;
      },
      del() {
        return this;
      },
      exec: async () => {
        throw new Error('redis unavailable');
      }
    }),
    quit: async () => undefined,
    disconnect: () => undefined
  };
  return service;
}

test('falls back to in-memory state storage in self_host_no_login when redis write/read fails', async () => {
  process.env.NODE_ENV = 'development';
  process.env.AUTH_MODE = 'self_host_no_login';

  const service = createBrokenRedisService();
  const payload = { provider: 'X' as const, codeVerifier: 'verifier_123' };

  await assert.doesNotReject(() => service.saveSocialLoginState('state_123', payload));
  await assert.doesNotReject(async () => {
    const restored = await service.consumeSocialLoginState('state_123');
    assert.deepEqual(restored, payload);
  });
  assert.equal(await service.consumeSocialLoginState('state_123'), null);

  await service.onModuleDestroy();
});

test('still throws when redis fails in production mode', async () => {
  process.env.NODE_ENV = 'production';
  process.env.AUTH_MODE = 'required';

  const service = createBrokenRedisService();

  await assert.rejects(
    service.saveSocialLoginState('state_456', { provider: 'X', codeVerifier: 'verifier_456' }),
    /redis unavailable/
  );

  await service.onModuleDestroy();
});
