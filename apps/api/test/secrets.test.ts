import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptSecret, encryptSecret, maskSecret } from '@draftorbit/shared';

const PREV_JWT = process.env.JWT_SECRET;

test.before(() => {
  process.env.JWT_SECRET = 'draftorbit-test-secret';
});

test.after(() => {
  if (PREV_JWT === undefined) {
    delete process.env.JWT_SECRET;
    return;
  }
  process.env.JWT_SECRET = PREV_JWT;
});

test('encryptSecret/decryptSecret roundtrip', () => {
  const source = 'x-access-token-1234567890';
  const encrypted = encryptSecret(source);
  const decrypted = decryptSecret(encrypted);

  assert.notEqual(encrypted, source);
  assert.equal(decrypted, source);
});

test('maskSecret hides middle characters', () => {
  assert.equal(maskSecret('abcdefghijklmno'), 'abcd***lmno');
  assert.equal(maskSecret('short'), '***');
  assert.equal(maskSecret(null), null);
});
