import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildV3PromptEnvelope,
  buildV3SourceEvidence,
  mapGenerationStepToV3Stage,
  resolveV3PublishGuard
} from '../src/modules/v3/v3.service';

test('buildV3PromptEnvelope turns a one-line intent into an agent-first generation brief', () => {
  const prompt = buildV3PromptEnvelope({
    intent: '帮我发一条关于 AI 产品冷启动的观点短推',
    format: 'tweet',
    withImage: true,
    styleSummary: '语气偏冷静、结论先行',
    sourceEvidence: ['用户历史 X 内容', '目标账号：@competitor_ai']
  });

  assert.match(prompt, /用户意图：帮我发一条关于 AI 产品冷启动的观点短推/);
  assert.match(prompt, /输出形式：tweet/);
  assert.match(prompt, /需要配图：yes/);
  assert.match(prompt, /自动完成：意图理解、结构规划、文风适配、X 平台合规检查/);
  assert.doesNotMatch(prompt, /CTA：/);
  assert.doesNotMatch(prompt, /受众：/);
});

test('buildV3PromptEnvelope adds explicit x-article requirements for article mode', () => {
  const prompt = buildV3PromptEnvelope({
    intent: '把 AI 产品冷启动的方法论整理成长文',
    format: 'article',
    withImage: false,
    styleSummary: null,
    sourceEvidence: []
  });

  assert.match(prompt, /输出形式：article/);
  assert.match(prompt, /如果输出 article，请按 X 文章格式组织：标题、导语、3-5 个小节、结尾行动句/);
  assert.match(prompt, /不要写成 tweet\/thread 的短格式/);
});

test('resolveV3PublishGuard blocks direct publishing for article format', () => {
  assert.equal(resolveV3PublishGuard('tweet'), null);
  assert.equal(resolveV3PublishGuard('thread'), null);
  assert.deepEqual(resolveV3PublishGuard('article'), {
    blockingReason: 'ARTICLE_PUBLISH_NOT_SUPPORTED',
    nextAction: 'export_article',
    message: '当前长文暂不支持直接发布，请先复制到 X 文章编辑器。'
  });
});

test('mapGenerationStepToV3Stage converts legacy steps into user-facing V3 stages', () => {
  assert.deepEqual(mapGenerationStepToV3Stage('HOTSPOT'), {
    stage: 'research',
    label: '正在研究话题'
  });
  assert.deepEqual(mapGenerationStepToV3Stage('OUTLINE'), {
    stage: 'strategy',
    label: '正在规划结构'
  });
  assert.deepEqual(mapGenerationStepToV3Stage('HUMANIZE'), {
    stage: 'voice',
    label: '正在匹配你的文风'
  });
  assert.deepEqual(mapGenerationStepToV3Stage('PACKAGE'), {
    stage: 'publish_prep',
    label: '正在准备可发布结果'
  });
});

test('buildV3SourceEvidence summarizes connected sources for the app and connect pages', () => {
  const summary = buildV3SourceEvidence([
    {
      sourceType: 'X_TIMELINE',
      sourceRef: 'self:@yangshu_ai',
      metadata: { connector: 'x_self' }
    },
    {
      sourceType: 'URL',
      sourceRef: 'https://x.com/competitor/status/123',
      metadata: { connector: 'x_target' }
    },
    {
      sourceType: 'IMPORT_CSV',
      sourceRef: '/Users/demo/Obsidian',
      metadata: { connector: 'obsidian' }
    }
  ]);

  assert.deepEqual(summary, [
    '已学习你的 X 历史内容',
    '已学习目标账号 / 推文链接',
    '已接入 Obsidian / 本地知识库'
  ]);
});
