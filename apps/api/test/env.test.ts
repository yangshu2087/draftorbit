import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAuthModeSafety,
  assertBillingEnvSafety,
  getAuthMode
} from '../src/common/env';

const SNAPSHOT_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...SNAPSHOT_ENV };
});

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

test('assertBillingEnvSafety is noop in development without Stripe', () => {
  process.env.NODE_ENV = 'development';
  delete process.env.STRIPE_SECRET_KEY;
  assert.doesNotThrow(() => assertBillingEnvSafety());
});

test('assertBillingEnvSafety requires live Stripe envs in production', () => {
  process.env.NODE_ENV = 'production';
  process.env.STRIPE_SECRET_KEY = 'sk_live_mock';
  delete process.env.STRIPE_WEBHOOK_SECRET;

  assert.throws(() => assertBillingEnvSafety(), /STRIPE_WEBHOOK_SECRET/);
});

test('assertBillingEnvSafety passes when all required live envs exist', () => {
  process.env.NODE_ENV = 'production';
  process.env.STRIPE_SECRET_KEY = 'sk_live_mock';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock';
  process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter_monthly';
  process.env.STRIPE_STARTER_YEARLY_PRICE_ID = 'price_starter_yearly';
  process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_growth_monthly';
  process.env.STRIPE_PRO_YEARLY_PRICE_ID = 'price_growth_yearly';
  process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID = 'price_max_monthly';
  process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID = 'price_max_yearly';

  assert.doesNotThrow(() => assertBillingEnvSafety());
});
