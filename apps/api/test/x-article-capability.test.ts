import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeXArticleUrl,
  resolveXArticlePublishCapability
} from '@draftorbit/shared';

test('resolveXArticlePublishCapability returns manual-web fallback metadata', () => {
  assert.deepEqual(resolveXArticlePublishCapability(), {
    mode: 'manual_x_web',
    nativeApiAvailable: false,
    nextAction: 'export_article',
    openUrl: 'https://x.com',
    description: '当前公开的 X Developer API 没有提供 Articles 发布端点，长文需要先在 X 网页端完成发布。'
  });
});

test('normalizeXArticleUrl accepts x.com and twitter.com article urls', () => {
  assert.equal(
    normalizeXArticleUrl(' https://x.com/i/articles/1888888888888888888 '),
    'https://x.com/i/articles/1888888888888888888'
  );
  assert.equal(
    normalizeXArticleUrl('https://twitter.com/someone/articles/1234567890#draftorbit'),
    'https://twitter.com/someone/articles/1234567890'
  );
});

test('normalizeXArticleUrl rejects non-x hosts and non-https links', () => {
  assert.equal(normalizeXArticleUrl('https://example.com/article/123'), null);
  assert.equal(normalizeXArticleUrl('http://x.com/i/articles/123'), null);
  assert.equal(normalizeXArticleUrl('not-a-url'), null);
});
