import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpsVisibility, sanitizeOpsQueues } from '../src/modules/ops/ops-visibility';

const queues = {
  publish: { waiting: 2, active: 1, completed: 10, failed: 1, delayed: 0, paused: 0 },
  reply: { waiting: 1, active: 0, completed: 8, failed: 2, delayed: 1, paused: 0 }
};

test('owner sees full per-queue ops metrics', () => {
  const visibility = buildOpsVisibility('OWNER');
  const result = sanitizeOpsQueues(queues, visibility);

  assert.equal(result.visibility.accessTier, 'FULL');
  assert.equal(result.queues?.publish.failed, 1);
  assert.equal(result.summary.failed, 3);
});

test('editor keeps per-queue view but loses failure details', () => {
  const visibility = buildOpsVisibility('EDITOR');
  const result = sanitizeOpsQueues(queues, visibility);

  assert.equal(result.visibility.accessTier, 'LIMITED');
  assert.equal(result.queues?.publish.failed, null);
  assert.equal(result.summary.failed, null);
});

test('viewer only gets summary overview', () => {
  const visibility = buildOpsVisibility('VIEWER');
  const result = sanitizeOpsQueues(queues, visibility);

  assert.equal(result.visibility.accessTier, 'OVERVIEW');
  assert.equal(result.queues, null);
  assert.equal(result.hiddenQueueCount, 2);
  assert.equal(result.summary.waiting, 3);
});
