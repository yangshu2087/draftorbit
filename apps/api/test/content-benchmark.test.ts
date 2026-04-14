import test from 'node:test';
import assert from 'node:assert/strict';
import { ContentBenchmarkService } from '../src/modules/generate/content-benchmark.service';
import { BAOYU_ADVERSARIAL_PROMPT_SUITE } from '../src/modules/generate/benchmarks/baoyu-adversarial-prompt-suite';
import { BAOYU_FIXED_PROMPT_SUITE } from '../src/modules/generate/benchmarks/baoyu-fixed-prompt-suite';
import { evaluateBenchmarkCase } from '../src/modules/generate/benchmark-evaluation';
import { buildQualitySignalReport } from '../src/modules/generate/content-strategy';

test('ContentBenchmarkService enriches style analysis with benchmark-derived patterns and source refs', () => {
  const service = new ContentBenchmarkService();

  const enriched = service.enrichStyleAnalysis(
    { voice_summary: '结论先行，句子偏短。' },
    [
      {
        text: '如果第一条内容同时讲定位、功能和愿景，读者大概率会直接滑走。',
        public_metrics: { like_count: 88, reply_count: 12, retweet_count: 16, quote_count: 5 }
      }
    ]
  ) as Record<string, unknown>;

  assert.ok(Array.isArray(enriched.opening_patterns));
  assert.ok(Array.isArray(enriched.evidence_patterns));
  assert.ok(Array.isArray(enriched.format_preferences));
  assert.ok(Array.isArray(enriched.source_corpus_refs));
  assert.ok((enriched.opening_patterns as string[]).some((item) => item.includes('先给判断')));
  assert.ok((enriched.evidence_patterns as string[]).some((item) => item.includes('真实例子')));
  assert.ok((enriched.source_corpus_refs as string[]).includes('baoyu-danger-x-to-markdown'));
});

test('ContentBenchmarkService builds format-specific prompt context with few-shot guidance', () => {
  const service = new ContentBenchmarkService();

  const context = service.buildPromptContext({
    format: 'thread',
    focus: 'AI 产品冷启动'
  });

  assert.match(context, /Benchmark 结构规则/u);
  assert.match(context, /首条先给判断/u);
  assert.match(context, /Few-shot 学习样本/u);
  assert.match(context, /不要写“下面我只拆/u);
});

test('baoyu fixed prompt suite keeps a balanced 12-case benchmark across tweet thread and article', () => {
  assert.equal(BAOYU_FIXED_PROMPT_SUITE.length, 12);
  assert.equal(BAOYU_FIXED_PROMPT_SUITE.filter((item) => item.format === 'tweet').length, 4);
  assert.equal(BAOYU_FIXED_PROMPT_SUITE.filter((item) => item.format === 'thread').length, 4);
  assert.equal(BAOYU_FIXED_PROMPT_SUITE.filter((item) => item.format === 'article').length, 4);
  assert.ok(BAOYU_FIXED_PROMPT_SUITE.every((item) => item.baoyuBaselineNotes.length >= 2));
  assert.ok(BAOYU_FIXED_PROMPT_SUITE.every((item) => item.expectedStrengths.length >= 2));
});

test('baoyu adversarial prompt suite covers real prompt-leak and format-regression cases', () => {
  assert.equal(BAOYU_ADVERSARIAL_PROMPT_SUITE.length, 11);
  assert.ok(BAOYU_ADVERSARIAL_PROMPT_SUITE.some((item) => item.id === 'adversarial-tweet-cold-start-real-regression'));
  assert.ok(BAOYU_ADVERSARIAL_PROMPT_SUITE.some((item) => item.format === 'thread' && /第 3 条/u.test(item.prompt)));
  assert.ok(BAOYU_ADVERSARIAL_PROMPT_SUITE.some((item) => item.format === 'article' && /方法论标题/u.test(item.prompt)));
});

test('evaluateBenchmarkCase hard-fails weak tweet closes that still miss a concrete scene', () => {
  const benchmarkCase = BAOYU_FIXED_PROMPT_SUITE.find((item) => item.format === 'tweet');
  assert.ok(benchmarkCase);

  const evaluation = evaluateBenchmarkCase({
    benchmarkCase,
    text: 'AI 产品冷启动最容易写废的，就是第一句没有先下判断。你怎么看？',
    qualitySignals: {
      hookStrength: 74,
      specificity: 48,
      evidence: 20,
      conversationality: 62,
      ctaNaturalness: 38,
      antiPatternPenalty: 0,
      humanLikeness: 68,
      structuralReadability: 70,
      visualizability: 44,
      derivativeReadiness: 40
    }
  });

  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.hardFails.includes('tweet 缺少具体场景或例子'));
});

test('evaluateBenchmarkCase invalidates heuristic evidence in real-model benchmark mode', () => {
  const benchmarkCase = BAOYU_FIXED_PROMPT_SUITE.find((item) => item.id === 'tweet-ai-cold-start');
  assert.ok(benchmarkCase);
  const text =
    'AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。 做周报助手，别先写“AI 写作平台”，直接写“贴一段口语，我帮你改成能发给老板的周报”，用户才知道第一步该怎么用。 如果现在只改第一句，你会先写哪个用户场景？';

  const evaluation = evaluateBenchmarkCase({
    benchmarkCase,
    text,
    qualitySignals: buildQualitySignalReport(text, 'tweet'),
    routing: {
      primaryModel: 'draftorbit/heuristic',
      routingTier: 'free_first'
    },
    requireRealModel: true
  });

  assert.equal(evaluation.pass, false);
  assert.equal(evaluation.evidenceValid, false);
  assert.ok(evaluation.hardFails.includes('real-model evidence 使用了 heuristic/free_first 路径'));
});

test('evaluateBenchmarkCase rewards a properly split thread with scene density and natural close', () => {
  const benchmarkCase = BAOYU_FIXED_PROMPT_SUITE.find((item) => item.format === 'thread');
  assert.ok(benchmarkCase);

  const evaluation = evaluateBenchmarkCase({
    benchmarkCase,
    text: [
      '1/4\nAI 产品冷启动没人停下来，通常不是没信息，而是第一句还没下判断。',
      '2/4\n比如第一条同时讲定位、功能和故事，读者读完还是不知道你到底想证明什么。',
      '3/4\n先删掉背景介绍，只证明一个判断，再补一个真实场景，读者才更容易继续看。',
      '4/4\n如果只能先改一个动作，你会先改第一句，还是先补例子？'
    ].join('\n\n'),
    qualitySignals: {
      hookStrength: 82,
      specificity: 78,
      evidence: 80,
      conversationality: 76,
      ctaNaturalness: 84,
      antiPatternPenalty: 0,
      humanLikeness: 79,
      structuralReadability: 85,
      visualizability: 81,
      derivativeReadiness: 74
    }
  });

  assert.equal(evaluation.pass, true);
  assert.equal(evaluation.threadPostCount, 4);
  assert.equal(evaluation.hardFails.length, 0);
  assert.ok(evaluation.average >= 78);
});

test('evaluateBenchmarkCase hard-fails repeated thread cards that pass the basic count check', () => {
  const benchmarkCase = BAOYU_FIXED_PROMPT_SUITE.find((item) => item.id === 'thread-team-workflow');
  assert.ok(benchmarkCase);

  const repeatedScene =
    '周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。';
  const evaluation = evaluateBenchmarkCase({
    benchmarkCase,
    text: [
      '1/4\nAI 内容团队最怕的，不是没灵感，而是每次都从空白页开始。',
      `2/4\n${repeatedScene}`,
      `3/4\n${repeatedScene}`,
      '4/4\n如果团队内容流程只能先固定一步，你会先固定哪一步？'
    ].join('\n\n'),
    qualitySignals: {
      hookStrength: 84,
      specificity: 90,
      evidence: 80,
      conversationality: 64,
      ctaNaturalness: 84,
      antiPatternPenalty: 0,
      humanLikeness: 72,
      structuralReadability: 88,
      visualizability: 78,
      derivativeReadiness: 74
    }
  });

  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.hardFails.includes('thread 条目职责重复'));
});

test('evaluateBenchmarkCase hard-fails repeated thread lines across different cards', () => {
  const benchmarkCase = BAOYU_FIXED_PROMPT_SUITE.find((item) => item.id === 'thread-user-feedback');
  assert.ok(benchmarkCase);

  const repeatedLine = '具体到某一句用户原话，读者才有东西可以回应。';
  const evaluation = evaluateBenchmarkCase({
    benchmarkCase,
    text: [
      `1/4\n用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。\n${repeatedLine}`,
      `2/4\n${repeatedLine}`,
      '3/4\n更有效的写法是：第二条直接放那句最扎心的用户原话，第三条再讲你准备怎么改，读者才会觉得你真的听见了反馈。',
      '4/4\n你最近最值得拿出来写的一句用户原话，是什么？'
    ].join('\n\n'),
    qualitySignals: {
      hookStrength: 84,
      specificity: 92,
      evidence: 84,
      conversationality: 78,
      ctaNaturalness: 84,
      antiPatternPenalty: 0,
      humanLikeness: 80,
      structuralReadability: 88,
      visualizability: 100,
      derivativeReadiness: 80
    }
  });

  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.hardFails.includes('thread 条目职责重复'));
});

test('evaluateBenchmarkCase hard-fails repeated tweet support lines even when a scene exists', () => {
  const benchmarkCase = BAOYU_FIXED_PROMPT_SUITE.find((item) => item.id === 'tweet-product-update');
  assert.ok(benchmarkCase);

  const evaluation = evaluateBenchmarkCase({
    benchmarkCase,
    text:
      '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。比如我会直接写：“以前会后要复制粘贴半小时，现在上传一段录音，3 分钟拿到会议纪要”，用户立刻知道这次更新省了哪一步，用户一眼就知道这次更新省了哪一步，用户一眼就知道这次更新省了哪一步。 如果今天这条更新只能保留一句，你会先留下哪一句？',
    qualitySignals: {
      hookStrength: 84,
      specificity: 78,
      evidence: 80,
      conversationality: 70,
      ctaNaturalness: 84,
      antiPatternPenalty: 0,
      humanLikeness: 76,
      structuralReadability: 84,
      visualizability: 76,
      derivativeReadiness: 72
    }
  });

  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.hardFails.includes('tweet support line 重复'));
});

test('evaluateBenchmarkCase hard-fails article generic cold-start scaffolding in non-cold-start topics', () => {
  const benchmarkCase = BAOYU_FIXED_PROMPT_SUITE.find((item) => item.id === 'article-founder-voice');
  assert.ok(benchmarkCase);

  const evaluation = evaluateBenchmarkCase({
    benchmarkCase,
    text: `产品早期为什么要先把一句判断讲透，读者为什么会在第一行滑走？

导语
多数人把“产品早期为什么要先把一句判断讲透”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。

一、多数人写“产品早期为什么要先把一句判断讲透”时，为什么第一段就失去读者
最常见的失误是：第一段就把赛道、定位、功能和愿景一起端上来，读者还没看到判断就已经滑走了。

二、先给判断，再补一个具体例子，读者才会继续读
单有判断，读者很难判断你是不是在喊口号；一旦补一个具体场景，可信度会立刻上来。

三、把表达动作排成稳定节奏，比等灵感更有效
很多团队把内容产出交给灵感，结果每次都从空白页开始。

结尾
读完以后，你最想先改哪一步？`,
    qualitySignals: {
      hookStrength: 84,
      specificity: 78,
      evidence: 80,
      conversationality: 70,
      ctaNaturalness: 84,
      antiPatternPenalty: 0,
      humanLikeness: 76,
      structuralReadability: 86,
      visualizability: 80,
      derivativeReadiness: 78
    }
  });

  assert.equal(evaluation.pass, false);
  assert.ok(evaluation.hardFails.includes('article 使用了通用冷启动脚手架'));
});

test('evaluateBenchmarkCase accepts grounded product-update tweets with a concrete before-after scene', () => {
  const benchmarkCase = BAOYU_FIXED_PROMPT_SUITE.find((item) => item.id === 'tweet-product-update');
  assert.ok(benchmarkCase);

  const text =
    '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。 我会直接写：“以前会后要复制粘贴半小时，现在上传一段录音，3 分钟拿到会议纪要”，用户立刻知道这次更新省了哪一步。 如果今天这条更新只能保留一句，你会先留下哪一句？';
  const evaluation = evaluateBenchmarkCase({
    benchmarkCase,
    text,
    qualitySignals: buildQualitySignalReport(text, 'tweet')
  });

  assert.equal(evaluation.pass, true);
  assert.ok(evaluation.rubric.visualizability >= 70);
});

test('evaluateBenchmarkCase accepts user-feedback threads with a quote card and an action card', () => {
  const benchmarkCase = BAOYU_FIXED_PROMPT_SUITE.find((item) => item.id === 'thread-user-feedback');
  assert.ok(benchmarkCase);

  const text = [
    '1/4\n用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。\n具体到某一句用户原话，读者才有东西可以回应。',
    '2/4\n用户原话是“我想知道为什么它总把重点埋掉”，这种原话比“我们持续优化体验”更容易引发回复。',
    '3/4\n更有效的写法是：第二条直接放那句最扎心的用户原话，第三条再讲你准备怎么改，读者才会觉得你真的听见了反馈。',
    '4/4\n你最近最值得拿出来写的一句用户原话，是什么？'
  ].join('\n\n');
  const evaluation = evaluateBenchmarkCase({
    benchmarkCase,
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread')
  });

  assert.equal(evaluation.pass, true);
  assert.ok(evaluation.rubric.visualizability >= 70);
});
