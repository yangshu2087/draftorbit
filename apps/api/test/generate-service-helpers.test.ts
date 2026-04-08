import test from 'node:test';
import assert from 'node:assert/strict';
import { formatXArticleText, extractIntentFocus } from '../src/modules/generate/generate.service';

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
