import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUsageVisibility,
  sanitizeUsageBilling,
  sanitizeUsageEvent,
  sanitizeUsageTrendPoint
} from '../src/modules/usage/usage-visibility';

test('owner has full usage visibility and credit management', () => {
  const visibility = buildUsageVisibility('OWNER');

  assert.equal(visibility.accessTier, 'FULL');
  assert.equal(visibility.canViewCosts, true);
  assert.equal(visibility.canManageCredits, true);
});

test('editor billing snapshot hides stripe customer id', () => {
  const visibility = buildUsageVisibility('EDITOR');
  const billing = sanitizeUsageBilling(
    {
      plan: 'PRO',
      status: 'ACTIVE',
      monthlyQuota: 100,
      remainingCredits: 42,
      cycleStart: new Date('2026-04-01T00:00:00.000Z'),
      cycleEnd: new Date('2026-05-01T00:00:00.000Z'),
      stripeCustomerId: 'cus_secret'
    },
    visibility
  );

  assert.equal(visibility.accessTier, 'LIMITED');
  assert.equal(billing?.remainingCredits, 42);
  assert.equal('stripeCustomerId' in (billing ?? {}), false);
});

test('viewer usage events and trends redact cost-sensitive details', () => {
  const visibility = buildUsageVisibility('VIEWER');
  const event = sanitizeUsageEvent(
    {
      id: 'evt_1',
      eventType: 'GENERATION',
      model: 'gpt-5.4',
      inputTokens: 123,
      outputTokens: 456,
      costUsd: '0.0135',
      createdAt: new Date('2026-04-08T00:00:00.000Z')
    },
    visibility
  );
  const point = sanitizeUsageTrendPoint(
    {
      date: '2026-04-08',
      generation: 1,
      naturalization: 0,
      image: 0,
      reply: 0,
      publish: 0,
      totalEvents: 1,
      costUsd: 0.25
    },
    visibility
  );

  assert.equal(event.detailsRedacted, true);
  assert.equal(event.model, null);
  assert.equal(event.costUsd, null);
  assert.equal(point.costUsd, null);
});
