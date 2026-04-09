import test from 'node:test';
import assert from 'node:assert/strict';
import { getArticlePrimaryAction } from '../lib/article-publish-ui';

test('manual_x_web maps to export CTA copy', () => {
  assert.deepEqual(
    getArticlePrimaryAction({
      mode: 'manual_x_web',
      availability: 'available',
      nativeApiAvailable: false,
      nextAction: 'export_article',
      openUrl: 'https://x.com',
      reasonCode: 'NO_PUBLIC_API',
      description: 'manual export'
    }),
    {
      label: '复制并去 X 发布',
      secondaryLabel: '只复制长文'
    }
  );
});

test('native_x_api maps to direct publish CTA copy', () => {
  assert.equal(
    getArticlePrimaryAction({
      mode: 'native_x_api',
      availability: 'available',
      nativeApiAvailable: true,
      nextAction: 'publish_article',
      description: 'native publish'
    }).label,
    '直接发布到 X'
  );
});
