import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveBriefFromIntent, normalizeKnowledgePaths } from '../src/modules/v2/v2.service';

test('deriveBriefFromIntent infers conversion objective and tutorial post type', () => {
  const brief = deriveBriefFromIntent('请写一条帮助 AI 工具获客转化的教程推文，目标用户是开发者');
  assert.equal(brief.objective, '转化');
  assert.equal(brief.postType, '教程清单');
  assert.equal(brief.audience, '独立开发者');
  assert.equal(brief.cta, '欢迎留言讨论');
});

test('deriveBriefFromIntent defaults to engagement for generic intent', () => {
  const brief = deriveBriefFromIntent('分享一下我今天的内容想法');
  assert.equal(brief.objective, '互动');
  assert.equal(brief.topicPreset.includes('分享一下我今天的内容想法'), true);
});

test('normalizeKnowledgePaths deduplicates and trims input paths', () => {
  const paths = normalizeKnowledgePaths([' /tmp/a.md ', '/tmp/a.md', '', '  ', '/tmp/b.md']);
  assert.deepEqual(paths, ['/tmp/a.md', '/tmp/b.md']);
});
