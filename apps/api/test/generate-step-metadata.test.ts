import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPackageStepMetadata } from '../src/modules/generate/package-step-metadata';

test('package step metadata maps generation steps into stable aliases and durations', () => {
  const now = new Date('2026-04-05T12:00:00.000Z');
  const result = buildPackageStepMetadata([
    {
      step: 'HOTSPOT',
      startedAt: new Date(now.getTime() + 0),
      completedAt: new Date(now.getTime() + 1200)
    },
    {
      step: 'OUTLINE',
      startedAt: new Date(now.getTime() + 1200),
      completedAt: new Date(now.getTime() + 2400)
    },
    {
      step: 'DRAFT',
      startedAt: new Date(now.getTime() + 2400),
      completedAt: new Date(now.getTime() + 5100)
    },
    {
      step: 'HUMANIZE',
      startedAt: new Date(now.getTime() + 5100),
      completedAt: new Date(now.getTime() + 5900)
    },
    {
      step: 'IMAGE',
      startedAt: new Date(now.getTime() + 5900),
      completedAt: new Date(now.getTime() + 7300)
    },
    {
      step: 'PACKAGE',
      startedAt: new Date(now.getTime() + 7300),
      completedAt: new Date(now.getTime() + 8800)
    }
  ]);

  assert.deepEqual(result.stepLatencyMs, {
    research: 1200,
    outline: 1200,
    draft: 2700,
    humanize: 800,
    media: 1400,
    package: 1500
  });
  assert.equal(result.stepExplain.research, 'Researched angles, hooks, and supporting points for the topic.');
  assert.equal(result.stepExplain.media, 'Prepared media concepts and search keywords to support publishing.');
});

test('package step metadata tolerates missing timestamps and keeps aliases present', () => {
  const result = buildPackageStepMetadata([
    { step: 'HOTSPOT', startedAt: null, completedAt: null },
    { step: 'PACKAGE', startedAt: new Date('2026-04-05T12:00:00.000Z'), completedAt: null }
  ]);

  assert.deepEqual(result.stepLatencyMs, {
    research: null,
    outline: null,
    draft: null,
    humanize: null,
    media: null,
    package: null
  });
  assert.ok(Object.keys(result.stepExplain).includes('package'));
});
