import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveOpsDashboardGuidance } from '../src/modules/ops/ops-dashboard-guidance';
import { deriveUsageOverviewGuidance } from '../src/modules/usage/usage-overview-guidance';

test('ops dashboard guidance blocks on missing active X account before publish actions', () => {
  const result = deriveOpsDashboardGuidance({
    degraded: false,
    counters: {
      topics: 2,
      drafts: 5,
      publishJobs: 1,
      replyJobs: 0,
      activeXAccounts: 0
    },
    usage: {
      billing: {
        remainingCredits: 12
      }
    },
    workspace: { id: 'ws_123' }
  });

  assert.deepEqual(result, {
    nextAction: 'bind_x_account',
    blockingReason: 'NO_ACTIVE_X_ACCOUNT'
  });
});

test('ops dashboard guidance prioritizes first content setup when workspace is healthy', () => {
  const result = deriveOpsDashboardGuidance({
    degraded: false,
    counters: {
      topics: 0,
      drafts: 0,
      publishJobs: 0,
      replyJobs: 0,
      activeXAccounts: 2
    },
    usage: {
      billing: {
        remainingCredits: 20
      }
    },
    workspace: { id: 'ws_456' }
  });

  assert.equal(result.nextAction, 'create_topic');
  assert.equal(result.blockingReason, null);
});

test('usage overview guidance blocks when credits are exhausted', () => {
  const result = deriveUsageOverviewGuidance({
    degraded: false,
    summary: {
      counters: {
        generations: 4,
        publishJobs: 2,
        replyJobs: 1,
        usageEvents: 9
      },
      billing: {
        remainingCredits: 0
      },
      funnel: {
        drafts: 4,
        pendingApproval: 0,
        approved: 2,
        queued: 1,
        published: 1,
        publishSucceeded: 1,
        replies: 1
      },
      modelRouting: {
        fallbackRate: 0.1,
        avgQualityScore: 82
      }
    }
  });

  assert.deepEqual(result, {
    nextAction: 'top_up_credits',
    blockingReason: 'NO_USAGE_CREDITS'
  });
});

test('usage overview guidance points to publishing approved drafts before optimization work', () => {
  const result = deriveUsageOverviewGuidance({
    degraded: false,
    summary: {
      counters: {
        generations: 6,
        publishJobs: 1,
        replyJobs: 0,
        usageEvents: 12
      },
      billing: {
        remainingCredits: 25
      },
      funnel: {
        drafts: 6,
        pendingApproval: 0,
        approved: 3,
        queued: 0,
        published: 1,
        publishSucceeded: 1,
        replies: 0
      },
      modelRouting: {
        fallbackRate: 0.55,
        avgQualityScore: 61
      }
    }
  });

  assert.equal(result.nextAction, 'queue_approved_drafts');
  assert.equal(result.blockingReason, null);
});
