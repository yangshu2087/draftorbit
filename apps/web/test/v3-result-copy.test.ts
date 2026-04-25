import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeResultText,
  normalizeStageSummary,
  normalizeWhySummary,
  summarizeWhySummary
} from '../lib/v3-result-copy';

test('normalizes backend english whySummary items into user-facing chinese copy', () => {
  assert.deepEqual(
    normalizeWhySummary([
      'Expanded the outline into a draft suitable for the requested channel.',
      'Fast path：按文案关键词生成素材建议与检索词，保证可发布素材包。',
      'Packaged the final publish-ready result with variants and quality metadata.'
    ]),
    [
      '先把结构扩成一版可发草稿。',
      '已按文案内容补上配图建议和检索词。',
      '已整理成可直接检查的结果。'
    ]
  );
});

test('summarizeWhySummary removes duplicates and empty items after normalization', () => {
  assert.deepEqual(
    summarizeWhySummary([
      'Fast path：由研究结果直接生成结构化大纲，减少一次模型往返。',
      'Structured the post into a publishable outline with a hook and CTA.',
      '',
      'Structured the post into a publishable outline with a hook and CTA.'
    ]),
    ['已根据研究结果直接整理出内容结构。', '先把内容结构整理成可发版本。']
  );
});

test('normalizeStageSummary rewrites technical stage text into plainer language', () => {
  assert.equal(normalizeStageSummary('结果包已就绪 · 质量 77.03'), '结果已准备好');
  assert.equal(normalizeStageSummary('Fast path：本地拼装发布包并做质量门控，必要时才触发模型重写。'), '已整理结果，并完成基础质量检查。');
  assert.equal(normalizeStageSummary('配图关键词：ai / operator / x'), '配图方向：ai / operator / x');
  assert.equal(normalizeStageSummary('已确定 hook：别再靠灵感写 ai，把流程跑顺才是增长关键。'), '开头切入点：别再靠灵感写 AI，把流程跑顺才是增长关键。');
  assert.equal(normalizeStageSummary('以“ai”为主线，强调流程化执行与可复盘增长。'), '以“AI”为主线，强调流程化执行与可复盘增长。');
  assert.equal(normalizeStageSummary('[object Object]'), '正在整理内容');
});

test('normalizeResultText fixes branding, casing, spacing and duplicate blank lines', () => {
  assert.equal(
    normalizeResultText('别再靠灵感写ai，把流程跑顺才是增长关键。\\n\\nDraftorbit 能帮你把 ai 内容链路跑顺。\\n\\n#ai'),
    '别再靠灵感写 AI，把流程跑顺才是增长关键。\\n\\nDraftOrbit 能帮你把 AI 内容链路跑顺。\\n\\n#AI'
  );
});

test('normalizeResultText removes leaked run ids, echoed hashtags and repairs missing sentence breaks', () => {
  assert.equal(
    normalizeResultText(
      '别再靠灵感写 ai，把流程跑顺才是增长关键 很多账号发不起来，不是因为你不会写，而是流程太散。把动作固定成“选题—起稿—审批—发布—复盘”，连续执行两周，互动质量通常会明显改善。(yf9g42) #很多账号发不起来'
    ),
    '别再靠灵感写 AI，把流程跑顺才是增长关键。很多账号发不起来，不是因为你不会写，而是流程太散。把动作固定成“选题—起稿—审批—发布—复盘”，连续执行两周，互动质量通常会明显改善。'
  );
});

test('normalizeResultText removes meaningless generated hashtags but keeps meaningful ones intact', () => {
  assert.equal(
    normalizeResultText('别把增长寄托在“灵感爆发”。把 X 运营改成固定流水线：选题→草稿→审批→发布→复盘。流程稳定后，质量和效率会一起上升。#gib2ne'),
    '别把增长寄托在“灵感爆发”。把 X 运营改成固定流水线：选题→草稿→审批→发布→复盘。流程稳定后，质量和效率会一起上升。'
  );
  assert.equal(normalizeResultText('把流程跑顺，比追灵感更重要。#AI增长'), '把流程跑顺，比追灵感更重要。#AI增长');
});
