import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildArticlePreview,
  buildPrimaryResultHighlights,
  buildQualityFailureView,
  buildRunProgressLabel,
  buildRunAssetsZipUrl,
  buildSourceFailureView,
  buildThreadPreview,
  buildVisualAnchorTags,
  buildVisualAssetCards,
  formatVisualAssetLabel
} from '../lib/v3-result-preview';

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = join(testDir, '..');
const expectedApiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test('buildThreadPreview turns a publish-ready thread into card-like posts with roles', () => {
  const posts = buildThreadPreview(
    [
      '1/4\nAI 产品冷启动最容易写废的，就是第一句还在铺介绍，没有先下判断。\n\n只改开头这一处，读者继续读下去的概率就会明显不一样。',
      '2/4\n比如第一条同时讲定位、功能和愿景，读者读完还是不知道你到底想证明什么。',
      '3/4\n先删掉背景介绍，只证明一个判断，再补一个读者一看就懂的真实场景。',
      '4/4\n你现在最卡的是开头、例子，还是结尾？'
    ].join('\n\n')
  );

  assert.equal(posts.length, 4);
  assert.equal(posts[0]?.label, '1/4');
  assert.match(posts[1]?.role ?? '', /具体场景|动作/u);
  assert.match(posts[3]?.text ?? '', /你现在最卡的是开头、例子，?还是结尾/u);
});

test('buildArticlePreview parses title, lead, sections and ending for structured reading', () => {
  const preview = buildArticlePreview(
    [
      'AI 产品冷启动，读者为什么会在第一行滑走？',
      '导语',
      '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
      '一、为什么第一段就失去读者',
      '第一段就把赛道、定位、功能和愿景一起端上来，读者还没看到判断就已经滑走了。',
      '二、先给判断，再补具体例子',
      '比如把“互动低”改成“第一条同时讲定位、功能和故事”，读者就能马上看懂问题出在哪。',
      '结尾',
      '读完以后，你最想先改哪一步？'
    ].join('\n\n')
  );

  assert.equal(preview.title, 'AI 产品冷启动，读者为什么会在第一行滑走？');
  assert.match(preview.lead ?? '', /第一句没有给读者停下来的理由/u);
  assert.equal(preview.sections.length, 2);
  assert.match(preview.sections[1]?.body ?? '', /第一条同时讲定位/u);
  assert.equal(preview.ending, '读完以后，你最想先改哪一步？');
});

test('buildPrimaryResultHighlights surfaces the strongest quality signals for the sidebar', () => {
  const highlights = buildPrimaryResultHighlights({
    text: 'demo',
    variants: [],
    imageKeywords: [],
    qualityScore: 81,
    riskFlags: [],
    requestCostUsd: null,
    whySummary: [],
    evidenceSummary: [],
    qualitySignals: {
      hookStrength: 92,
      specificity: 86,
      evidenceDensity: 88,
      humanLikeness: 79,
      conversationalFlow: 74,
      visualizability: 84,
      ctaNaturalness: 78
    }
  });

  assert.equal(highlights.length, 3);
  assert.match(highlights[0] ?? '', /(开头有抓手|证据更清楚|场景更具体)/u);
  assert.ok(highlights.every((item) => !/\d/u.test(item)), 'ordinary users should not see raw quality scores');
});

test('visual asset helpers prefer human-readable visual anchors over noisy keyword piles', () => {
  const tags = buildVisualAnchorTags({
    primaryAsset: 'illustration',
    visualizablePoints: ['第一条同时讲定位、功能和故事', '把判断改成一句能停下来的话'],
    keywords: ['AI 产品冷启动', '第一条同时讲定位、功能和故事', '多数人把内容写得没反应']
  });

  assert.equal(formatVisualAssetLabel('illustration'), '章节插图');
  assert.deepEqual(tags.slice(0, 3), ['章节插图', '第一条同时讲定位、功能和故事', '把判断改成一句能停下来的话']);
});

test('buildVisualAssetCards keeps ready/generated assets separate from failed image artifacts', () => {
  const cards = buildVisualAssetCards([
    {
      kind: 'cover',
      status: 'ready',
      assetUrl: '/v3/chat/runs/run_123/assets/cover',
      promptPath: '/artifacts/prompts/01-cover.md',
      cue: '周一谁都在等灵感，周三还没发。',
      reason: '真实团队节奏摩擦'
    },
    {
      kind: 'cards',
      status: 'failed',
      cue: '改成固定的“判断→例子→问题”节奏。',
      error: 'provider unavailable'
    }
  ]);

  assert.equal(cards.length, 2);
  assert.equal(cards[0]?.label, '封面图');
  assert.equal(cards[0]?.canPreview, true);
  assert.equal(cards[0]?.assetUrl, `${expectedApiBaseUrl}/v3/chat/runs/run_123/assets/cover`);
  assert.equal(cards[1]?.label, '卡片组');
  assert.equal(cards[1]?.canPreview, false);
  assert.match(cards[1]?.statusLabel ?? '', /生成失败/u);
});

test('buildVisualAssetCards does not preview placeholder or prompt-leaked ready assets', () => {
  const cards = buildVisualAssetCards([
    {
      kind: 'cover',
      status: 'ready',
      assetUrl: '/placeholder/cover.png',
      promptPath: '/artifacts/prompts/placeholder-cover.md',
      cue: '周一谁都在等灵感，周三还没发。'
    },
    {
      kind: 'cover',
      status: 'ready',
      assetUrl: '/v3/chat/runs/run_123/assets/cover',
      promptPath: '/artifacts/prompts/cover.md',
      cue: '给我一条更像真人的冷启动判断句。'
    }
  ]);

  assert.equal(cards.length, 2);
  assert.equal(cards[0]?.canPreview, false);
  assert.equal(cards[1]?.canPreview, false);
  assert.match(cards.map((item) => item.statusLabel).join('\n'), /未达标/u);
});

test('buildRunAssetsZipUrl points to the read-only visual asset bundle route', () => {
  assert.equal(
    buildRunAssetsZipUrl('run_123'),
    `${expectedApiBaseUrl}/v3/chat/runs/run_123/assets.zip`
  );
  assert.equal(buildRunAssetsZipUrl(null), undefined);
});

test('buildSourceFailureView turns source gate tags into recoverable user-facing copy', () => {
  const view = buildSourceFailureView({
    text: '',
    variants: [],
    imageKeywords: [],
    qualityScore: null,
    riskFlags: [],
    requestCostUsd: null,
    whySummary: [],
    evidenceSummary: [],
    qualityGate: {
      status: 'failed',
      safeToDisplay: false,
      hardFails: ['source_ambiguous'],
      sourceRequired: true,
      sourceStatus: 'ambiguous',
      judgeNotes: []
    }
  });

  assert.equal(view?.active, true);
  assert.equal(view?.title, '需要可靠来源，不能编造最新事实');
  assert.match(view?.description ?? '', /多个可能实体|不能替你猜/u);
  assert.equal(view?.primaryAction, '粘贴来源 URL 再生成');
  assert.equal(view?.secondaryAction, '改成非最新主题再生成');
});

test('buildRunProgressLabel does not call a source-blocked run generated', () => {
  const sourceFailureView = buildSourceFailureView({
    text: '',
    variants: [],
    imageKeywords: [],
    qualityScore: null,
    riskFlags: [],
    requestCostUsd: null,
    whySummary: [],
    evidenceSummary: [],
    qualityGate: {
      status: 'failed',
      safeToDisplay: false,
      hardFails: ['source_not_configured'],
      sourceRequired: true,
      sourceStatus: 'not_configured',
      judgeNotes: []
    }
  });

  assert.equal(
    buildRunProgressLabel({
      hasResult: true,
      runLoading: false,
      sourceFailureView
    }),
    '需要可靠来源后再生成'
  );
  assert.notEqual(
    buildRunProgressLabel({
      hasResult: true,
      runLoading: false,
      sourceFailureView
    }),
    '结果已生成'
  );
});

test('buildRunProgressLabel uses repair copy for generic quality-blocked runs', () => {
  const qualityFailureView = buildQualityFailureView({
    text: '',
    variants: [],
    imageKeywords: [],
    qualityScore: 41,
    riskFlags: [],
    requestCostUsd: null,
    whySummary: [],
    evidenceSummary: [],
    qualityGate: {
      status: 'failed',
      safeToDisplay: false,
      hardFails: ['article_generic_scaffold'],
      judgeNotes: []
    }
  });

  assert.equal(
    buildRunProgressLabel({
      hasResult: true,
      runLoading: false,
      qualityFailureView
    }),
    '需要处理后再交付'
  );
});

test('buildQualityFailureView hides raw hard fail tags from the primary user copy', () => {
  const view = buildQualityFailureView({
    text: '',
    variants: [],
    imageKeywords: [],
    qualityScore: 41,
    riskFlags: [],
    requestCostUsd: null,
    whySummary: [],
    evidenceSummary: [],
    qualityGate: {
      status: 'failed',
      safeToDisplay: false,
      hardFails: ['article_generic_scaffold'],
      judgeNotes: ['article_generic_scaffold']
    }
  });

  assert.equal(view?.active, true);
  assert.equal(view?.title, '这版还没达到可发布标准');
  assert.match(view?.description ?? '', /坏稿|再来一版|更具体/u);
  assert.equal(view?.primaryAction, '再来一版');
  assert.equal(view?.secondaryAction, '回到输入框调整');
  assert.doesNotMatch(`${view?.title}\n${view?.description}`, /article_generic_scaffold/u);
});

test('sourceReadyStageSummary stays module-scoped to avoid stale useMemo dependencies', () => {
  const source = readFileSync(join(webRoot, 'components/v3/operator-app.tsx'), 'utf8');
  const summaryIndex = source.indexOf('const sourceReadyStageSummary');
  const componentIndex = source.indexOf('export default function OperatorApp');

  assert.ok(summaryIndex > 0, 'sourceReadyStageSummary must exist');
  assert.ok(componentIndex > 0, 'OperatorApp component must exist');
  assert.ok(summaryIndex < componentIndex, 'sourceReadyStageSummary should stay outside OperatorApp render scope');
});

test('HomePage ordinary auth CTAs expose X and local testing but not Google login', () => {
  const source = readFileSync(join(webRoot, 'components/v3/home-page.tsx'), 'utf8');

  assert.match(source, /startXOAuth/u);
  assert.match(source, /createLocalSession/u);
  assert.match(source, /登录您的账户/u);
  assert.match(source, /使用 X 登录，免费试用/u);
  assert.match(source, /新用户可直接免费试用/u);
  assert.match(source, /风格学习/u);
  assert.match(source, /推理生成/u);
  assert.match(source, /发布执行/u);
  assert.doesNotMatch(source, /startGoogleOAuth/u);
  assert.doesNotMatch(source, /Google 登录/u);
  assert.doesNotMatch(source, /google-login/u);
});
