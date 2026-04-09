import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { ManualXWebArticlePublisher } from '../src/modules/publish/manual-x-web-article.publisher';

test('manual provider exposes export capability metadata', async () => {
  const provider = new ManualXWebArticlePublisher({} as never);
  const capability = await provider.getCapability('user_123');

  assert.equal(capability.mode, 'manual_x_web');
  assert.equal(capability.nextAction, 'export_article');
  assert.equal(capability.reasonCode, 'NO_PUBLIC_API');
});

test('manual provider rejects invalid article urls before persistence', async () => {
  const provider = new ManualXWebArticlePublisher({} as never);
  await assert.rejects(
    provider.recordManualCompletion('run_123', 'user_123', 'not-a-url'),
    (error: unknown) => error instanceof BadRequestException
  );
});
