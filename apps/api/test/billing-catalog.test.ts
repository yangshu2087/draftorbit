import test from 'node:test';
import assert from 'node:assert/strict';
import { BillingInterval, SubscriptionPlan } from '@draftorbit/db';
import {
  BILLING_PLAN_ORDER,
  getBillingTrialDays,
  getPlanCatalogView,
  getPlanLimits,
  parseBillingCycle,
  parseBillingPlan,
  planKeyFromSubscriptionPlan,
  PLAN_CATALOG,
  resolveStripePriceId,
  stripePriceEnvKey,
  subscriptionPlanFromPlanKey
} from '../src/modules/billing/plan-catalog';

const SNAPSHOT_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...SNAPSHOT_ENV };
});

test('plan catalog contains three plans in fixed order', () => {
  assert.deepEqual(BILLING_PLAN_ORDER, ['STARTER', 'PRO', 'PREMIUM']);
  assert.equal(getPlanCatalogView().length, 3);
});

test('plan cycle/parser helpers work', () => {
  assert.equal(parseBillingPlan('STARTER'), 'STARTER');
  assert.equal(parseBillingPlan('PREMIUM'), 'PREMIUM');
  assert.equal(parseBillingPlan('FREE'), null);

  assert.equal(parseBillingCycle('MONTHLY'), BillingInterval.MONTHLY);
  assert.equal(parseBillingCycle('YEARLY'), BillingInterval.YEARLY);
  assert.equal(parseBillingCycle('WEEKLY'), null);
});

test('subscription plan mapping keeps backward compatibility', () => {
  assert.equal(planKeyFromSubscriptionPlan(SubscriptionPlan.FREE), 'STARTER');
  assert.equal(planKeyFromSubscriptionPlan(SubscriptionPlan.STARTER), 'STARTER');
  assert.equal(planKeyFromSubscriptionPlan(SubscriptionPlan.PRO), 'PRO');
  assert.equal(planKeyFromSubscriptionPlan(SubscriptionPlan.PREMIUM), 'PREMIUM');

  assert.equal(subscriptionPlanFromPlanKey('STARTER'), SubscriptionPlan.STARTER);
  assert.equal(subscriptionPlanFromPlanKey('PRO'), SubscriptionPlan.PRO);
  assert.equal(subscriptionPlanFromPlanKey('PREMIUM'), SubscriptionPlan.PREMIUM);
});

test('limit matrix matches pricing model', () => {
  assert.deepEqual(getPlanLimits('STARTER'), { daily: 80, monthly: 500 });
  assert.deepEqual(getPlanLimits('PRO'), { daily: 300, monthly: 2000 });
  assert.deepEqual(getPlanLimits('PREMIUM'), { daily: 1000, monthly: 5000 });
});

test('trial days defaults to 3 and supports runtime override', () => {
  delete process.env.BILLING_TRIAL_DAYS;
  assert.equal(getBillingTrialDays(), 3);

  process.env.BILLING_TRIAL_DAYS = '0';
  assert.equal(getBillingTrialDays(), 0);

  process.env.BILLING_TRIAL_DAYS = '5';
  assert.equal(getBillingTrialDays(), 5);
});

test('catalog pricing is USD and yearly uses 8-discounted annual price', () => {
  const starter = PLAN_CATALOG.STARTER;
  const growth = PLAN_CATALOG.PRO;
  const max = PLAN_CATALOG.PREMIUM;

  assert.equal(starter.monthlyUsdCents, 1900);
  assert.equal(starter.yearlyUsdCents, 18240);
  assert.equal(growth.monthlyUsdCents, 4900);
  assert.equal(growth.yearlyUsdCents, 47040);
  assert.equal(max.monthlyUsdCents, 9900);
  assert.equal(max.yearlyUsdCents, 95040);
});

test('plan + cycle maps to configured Stripe price id', () => {
  const source = {
    [stripePriceEnvKey('STARTER', 'MONTHLY')]: 'price_starter_monthly',
    [stripePriceEnvKey('STARTER', 'YEARLY')]: 'price_starter_yearly',
    [stripePriceEnvKey('PRO', 'MONTHLY')]: 'price_growth_monthly',
    [stripePriceEnvKey('PRO', 'YEARLY')]: 'price_growth_yearly',
    [stripePriceEnvKey('PREMIUM', 'MONTHLY')]: 'price_max_monthly',
    [stripePriceEnvKey('PREMIUM', 'YEARLY')]: 'price_max_yearly'
  };

  assert.equal(resolveStripePriceId('STARTER', 'MONTHLY', source), 'price_starter_monthly');
  assert.equal(resolveStripePriceId('PRO', 'YEARLY', source), 'price_growth_yearly');
  assert.equal(resolveStripePriceId('PREMIUM', 'MONTHLY', source), 'price_max_monthly');
});

test('missing Stripe price id returns null', () => {
  const source = {
    [stripePriceEnvKey('STARTER', 'MONTHLY')]: 'price_starter_monthly'
  };

  assert.equal(resolveStripePriceId('PREMIUM', 'YEARLY', source), null);
});
