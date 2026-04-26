import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSourceBlockedPackageResult } from '../src/modules/generate/generate.service';

test('buildSourceBlockedPackageResult creates a final safe blocked package without draft or assets', () => {
  const result = buildSourceBlockedPackageResult({
    format: 'article',
    focus: '最新 Hermes',
    sourceCapture: {
      artifacts: [],
      hardFails: ['source_not_configured'],
      sourceRequired: true,
      sourceStatus: 'not_configured'
    },
    routingProfile: 'local_quality',
    trialMode: true,
    budgetRatio: 0,
    conservativeMode: true
  });

  assert.equal(result.tweet, '');
  assert.equal(result.charCount, 0);
  assert.deepEqual(result.imageKeywords, []);
  assert.deepEqual(result.visualAssets, []);
  assert.equal(result.visualPlan, null);
  assert.equal(result.derivativeReadiness, null);
  assert.equal(result.routing.primaryModel, 'source-blocked');
  assert.equal(result.routing.routingTier, 'source-blocked');
  assert.equal(result.qualityGate?.safeToDisplay, false);
  assert.equal(result.qualityGate?.sourceRequired, true);
  assert.equal(result.qualityGate?.sourceStatus, 'not_configured');
  assert.ok(result.qualityGate?.hardFails.includes('source_not_configured'));
  assert.match(result.qualityGate?.userMessage ?? '', /可靠来源|不能编造最新事实/u);
});
