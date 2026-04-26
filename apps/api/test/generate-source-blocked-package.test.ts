import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourceBlockedPackageResult,
  buildSourceGroundedThreadFallback,
  buildSourceGroundedTweetFallback
} from '../src/modules/generate/generate.service';
import { buildContentQualityGate } from '../src/modules/generate/content-quality-gate';
import { buildQualitySignalReport } from '../src/modules/generate/content-strategy';

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

const exampleSourceContext = [
  '# Source: Example Domain',
  '',
  'This domain is for use in illustrative examples in documents.',
  'You may use this domain in literature without prior coordination or asking for permission.'
].join('\n');

test('buildSourceGroundedTweetFallback produces displayable source-ready copy without source metadata', () => {
  const tweet = buildSourceGroundedTweetFallback({
    focus: '最新 Example Domain',
    sourceContext: exampleSourceContext
  });

  assert.match(tweet, /Example Domain/u);
  assert.match(tweet, /比如/u);
  assert.doesNotMatch(tweet, /(?:URL|Captured|markdownPath|requestedUrl):/iu);

  const gate = buildContentQualityGate({
    format: 'tweet',
    focus: '最新 Example Domain',
    text: tweet,
    qualitySignals: buildQualitySignalReport(tweet, 'tweet'),
    sourceRequired: true,
    sourceStatus: 'ready'
  });

  assert.equal(gate.status, 'passed');
  assert.equal(gate.safeToDisplay, true);
  assert.deepEqual(gate.hardFails, []);
});

test('buildSourceGroundedThreadFallback produces a publishable four-card source thread', () => {
  const thread = buildSourceGroundedThreadFallback({
    focus: '最新 Example Domain',
    sourceContext: exampleSourceContext
  });
  const text = thread.join('\n\n');

  assert.equal(thread.length, 4);
  assert.match(text, /1\/4/u);
  assert.match(text, /3\/4[\s\S]*先/u);
  assert.doesNotMatch(text, /(?:URL|Captured|markdownPath|requestedUrl):/iu);

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: '最新 Example Domain',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread'),
    sourceRequired: true,
    sourceStatus: 'ready'
  });

  assert.equal(gate.status, 'passed');
  assert.equal(gate.safeToDisplay, true);
  assert.deepEqual(gate.hardFails, []);
});
