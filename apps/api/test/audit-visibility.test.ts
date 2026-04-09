import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuditVisibility,
  getVisibleAuditResourceTypes,
  sanitizeAuditLog
} from '../src/modules/audit/audit-visibility';

test('owner sees full workspace audit domains', () => {
  const visibility = buildAuditVisibility('OWNER');

  assert.equal(visibility.scope, 'FULL_WORKSPACE');
  assert.equal(visibility.payloadAccess, 'FULL');
  assert.equal(visibility.hiddenDomains.length, 0);
});

test('editor audit visibility hides billing and integration domains', () => {
  const visibility = buildAuditVisibility('EDITOR');
  const resourceTypes = getVisibleAuditResourceTypes('EDITOR') ?? [];

  assert.equal(visibility.scope, 'OPERATIONS_ONLY');
  assert.equal(visibility.payloadAccess, 'FULL');
  assert.ok(resourceTypes.includes('draft'));
  assert.ok(!resourceTypes.includes('billing_account'));
  assert.ok(!resourceTypes.includes('provider_connection'));
});

test('viewer audit payload is redacted even for visible domains', () => {
  const log = sanitizeAuditLog(
    {
      id: 'audit_1',
      action: 'UPDATE',
      resourceType: 'draft',
      resourceId: 'draft_1',
      payload: { title: 'Hello' },
      createdAt: new Date('2026-04-08T00:00:00.000Z')
    },
    'NONE'
  );

  assert.equal(log.visibilityDomain, 'CONTENT');
  assert.equal(log.payload, null);
  assert.equal(log.payloadRedacted, true);
});
