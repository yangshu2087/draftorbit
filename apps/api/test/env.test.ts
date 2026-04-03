import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAuthModeSafety, getAuthMode } from '../src/common/env';

test('getAuthMode defaults to required', () => {
  delete process.env.AUTH_MODE;
  assert.equal(getAuthMode(), 'required');
});

test('assertAuthModeSafety allows self_host_no_login in non-production', () => {
  process.env.AUTH_MODE = 'self_host_no_login';
  process.env.NODE_ENV = 'development';
  assert.doesNotThrow(() => assertAuthModeSafety());
});

test('assertAuthModeSafety blocks self_host_no_login in production', () => {
  process.env.AUTH_MODE = 'self_host_no_login';
  process.env.NODE_ENV = 'production';
  assert.throws(() => assertAuthModeSafety(), /forbidden in production/);
});
