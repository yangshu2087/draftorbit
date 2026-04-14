import test from 'node:test';
import assert from 'node:assert/strict';
import { formatXArticleText, extractIntentFocus } from '../src/modules/generate/content-strategy';

test('extractIntentFocus ignores v3 prompt envelope metadata and keeps the user topic', () => {
  const prompt = [
    '你是 DraftOrbit 的 X AI Operator。',
    '用户意图：帮我发一条关于 AI 产品冷启动的观点短推',
    '输出形式：tweet',
    '需要配图：yes',
    '自动完成：意图理解、结构规划、文风适配、X 平台合规检查。',
    '请你自动判断目标受众、表达角度、hook、thread 结构、CTA 与风险控制。',
    '用户风格摘要：语气偏冷静、结论先行',
    '已连接证据：已学习你的 X 历史内容'
  ].join('\n');

  assert.equal(extractIntentFocus(prompt), 'AI 产品冷启动');
});

test('extractIntentFocus keeps direct user topics instead of stripping them blindly', () => {
  assert.equal(extractIntentFocus('什么是skills'), '什么是skills');
  assert.equal(extractIntentFocus('把今天的产品更新整理成一条适合 X 的发布文案'), '今天的产品更新');
});

test('extractIntentFocus keeps only the real theme when thread prompts mention 主题是', () => {
  assert.equal(
    extractIntentFocus('参考我最近的风格，写一条更容易引发讨论的 thread，主题是 AI 产品冷启动'),
    'AI 产品冷启动'
  );
});

test('extractIntentFocus removes article scaffolding and keeps the real topic', () => {
  assert.equal(
    extractIntentFocus('围绕 AI 产品冷启动，写一篇适合 X 平台文章格式的长文，重点说明为什么流程比灵感更重要。'),
    'AI 产品冷启动'
  );
});

test('extractIntentFocus strips 中文 X article scaffolding from the topic', () => {
  assert.equal(
    extractIntentFocus('写一篇关于 AI 产品冷启动的中文 X 文章，重点讲为什么第一句先给判断更容易被读完。'),
    'AI 产品冷启动'
  );
});

test('extractIntentFocus strips source URL scaffolding from source-grounded article prompts', () => {
  assert.equal(
    extractIntentFocus('根据这篇来源写一篇关于最新 Hermes Agent 的 X 长文：https://tech.ifeng.com/c/8sDHJq3vKxM'),
    '最新 Hermes Agent'
  );
});



test('formatXArticleText normalizes model-style article scaffolding without leaking labels or escaped newlines', () => {
  const article = formatXArticleText({
    title: 'AI 产品冷启动：先把判断讲清楚，再让读者继续读下去',
    hook: '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
    body: ['先把判断讲清楚', '立刻补一个具体例子', '最后把下一步动作讲明白'],
    cta: '读完以后，你最想先改哪一步？',
    humanized:
      '标题：AI 产品冷启动：别等灵感了，先去建你的“流水线”\n导语：大多数 AI 创业者在冷启动阶段都会陷入一种“灵感陷阱”：每天都在想下一个更酷的功能，或者等一个完美的 Prompt。\n1. 灵感无法规模化，但流程可以\n- 例子：与其研究如何做一个完美的写作助手，不如建立一个“每 48 小时上线一个微功能并观察留存”的强制节奏。\n2. 先验证一个动作，再讲完整故事\n如果第一批用户还没愿意留下来，就不要急着写完整品牌叙事。'
  });

  assert.match(article, /^AI 产品冷启动：别等灵感了，先去建你的“流水线”$/m);
  assert.match(article, /\n\n导语\n大多数 AI 创业者/);
  assert.match(article, /\n\n一、灵感无法规模化，但流程可以\n/);
  assert.doesNotMatch(article, /标题：/);
  assert.doesNotMatch(article, /导语：/);
  assert.doesNotMatch(article, /\\n/);
});
test('formatXArticleText returns an x-article style longform body', () => {
  const article = formatXArticleText({
    title: 'AI 产品冷启动，不要从写文案开始',
    hook: '冷启动最难的不是没人看见，而是你还没把增长动作排成稳定节奏。',
    body: ['先把目标收紧到一个动作', '把内容生产做成固定流程', '用复盘把下一轮迭代接上'],
    cta: '如果你愿意，我也可以把这篇再拆成 thread 版本。',
    humanized:
      '很多团队一开始就把精力放在“写出一条爆款内容”上，但真正拖慢增长的，往往是选题、出稿、审批、发布、复盘彼此割裂。先把动作连起来，再追求频率和规模，内容质量才会稳定上升。'
  });

  assert.match(article, /^AI 产品冷启动，不要从写文案开始/m);
  assert.match(article, /\n\n导语\n/);
  assert.match(article, /\n\n一、先把目标收紧到一个动作\n/);
  assert.match(article, /\n\n二、把内容生产做成固定流程\n/);
  assert.match(article, /\n\n三、用复盘把下一轮迭代接上\n/);
  assert.match(article, /\n\n结尾\n/);
  assert.doesNotMatch(article, /#/);
});
