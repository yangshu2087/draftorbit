import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProjectGeneratePayload,
  getProjectPresetCard,
  projectPresetCards,
  summarizeProjectMetadata
} from '../lib/project-ops';
import { getShellNavItems } from '../lib/v3-ui';

test('project preset cards expose generic and SkillTrust quick starts', () => {
  assert.deepEqual(projectPresetCards.map((card) => card.preset), ['generic_x_ops', 'skilltrust_x_ops']);
  assert.equal(getProjectPresetCard('skilltrust_x_ops')?.title, 'SkillTrust 推特/X 运营');
  assert.match(getProjectPresetCard('generic_x_ops')?.description ?? '', /通用/);
});

test('project metadata summary keeps the operating playbook user-facing', () => {
  const summary = summarizeProjectMetadata({
    objective: '持续产出可信的 X 内容',
    audience: '中文 AI 用户',
    contentPillars: ['审计演示', '风险教育'],
    sourceUrls: ['https://example.com/a'],
    visualDefaults: { mode: 'cards', style: 'blueprint' },
    publishChecklist: ['发布前人工确认', '不自动发帖']
  });

  assert.equal(summary.objective, '持续产出可信的 X 内容');
  assert.equal(summary.audience, '中文 AI 用户');
  assert.deepEqual(summary.pillars, ['审计演示', '风险教育']);
  assert.deepEqual(summary.sources, ['https://example.com/a']);
  assert.equal(summary.visualStyle, 'cards / blueprint');
  assert.deepEqual(summary.checklist, ['发布前人工确认', '不自动发帖']);
});

test('project generate payload links the project and hides model routing details', () => {
  const payload = buildProjectGeneratePayload({
    intent: '写一组审计 demo thread',
    format: 'thread',
    visualDefaults: { mode: 'cards', style: 'blueprint', layout: 'flow', palette: 'draftorbit', exportHtml: true },
    sourceUrls: ['https://example.com/a']
  });

  assert.equal(payload.intent, '写一组审计 demo thread');
  assert.equal(payload.format, 'thread');
  assert.equal(payload.withImage, true);
  assert.deepEqual(payload.sourceUrls, ['https://example.com/a']);
  assert.deepEqual(payload.visualRequest, { mode: 'cards', style: 'blueprint', layout: 'flow', palette: 'draftorbit', exportHtml: true });
  assert.doesNotMatch(JSON.stringify(payload), /Codex|Ollama|provider|fallback/i);
});

test('signed-in shell exposes project ops as a peer entry without changing public nav', () => {
  assert.deepEqual(getShellNavItems({ hasToken: true, publicMode: false }), [
    { href: '/app', label: '生成器' },
    { href: '/projects', label: '项目' }
  ]);
  assert.deepEqual(getShellNavItems({ hasToken: false, publicMode: true }), []);
});
