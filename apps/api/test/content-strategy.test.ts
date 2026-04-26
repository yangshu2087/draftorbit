import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDraftPayloadFallback,
  buildArticleHumanizedFallback,
  buildTweetHumanizedFallback,
  buildContentStrategyContext,
  composePublishReadyTweet,
  detectContentAntiPatterns,
  enforceTweetLength,
  extractIntentFocus,
  buildThreadHumanizedFallback,
  rankHighPerformingExamples,
  sanitizeGeneratedText,
  scoreStrategySignals,
  formatThreadPosts,
  formatXArticleText,
  tightenTweetForEngagement,
  renderStrategyPromptContext,
  extractIntentFromPrompt
} from '../src/modules/generate/content-strategy';

test('detectContentAntiPatterns catches prompt leakage, random suffixes and weak CTA templates', () => {
  const text =
    '别再靠灵感写 目标，把流程跑顺才是增长关键。很多账号发不起来，不是因为你不会写，而是流程太散。(yf9g42) 欢迎留言讨论 #很多账号发不起来';

  const flags = detectContentAntiPatterns(text, 'AI 产品冷启动');

  assert.ok(flags.includes('prompt_leakage'));
  assert.ok(flags.includes('template_cliche'));
  assert.ok(flags.includes('random_suffix'));
  assert.ok(flags.includes('echo_hashtag'));
  assert.ok(flags.includes('weak_cta'));
});

test('extractIntentFocus separates user instructions from the cold-start writing topic', () => {
  assert.equal(
    extractIntentFocus('别再靠灵感写推文，给我一条更像真人的冷启动判断句。'),
    '推文写作冷启动'
  );
});

test('extractIntentFromPrompt preserves multiline source URL lines inside the V3 envelope', () => {
  const intent = extractIntentFromPrompt([
    '你是 DraftOrbit 的 X AI Operator。',
    '用户意图：生成一条关于最新 Example Domain 的短推，配一张封面图',
    '',
    '来源 URL：https://example.com/',
    '输出形式：tweet',
    '需要配图：yes'
  ].join('\n'));

  assert.match(intent, /最新 Example Domain/u);
  assert.match(intent, /https:\/\/example\.com\//u);
  assert.doesNotMatch(intent, /输出形式|需要配图/u);
});

test('detectContentAntiPatterns catches the real browser prompt-leak regression', () => {
  const text =
    '别再靠灵感写推文，给我一条更像真人的冷启动判断句。 第一条还在写“别再靠灵感写推文”这种自我介绍，读者扫完整条还是不知道你到底想证明什么。 如果只能先改一个动作，你会先改哪一个？';

  const flags = detectContentAntiPatterns(text, '推文写作冷启动');

  assert.ok(flags.includes('prompt_leakage'));
  assert.ok(flags.includes('generic_scene_leakage'));
});

test('detectContentAntiPatterns catches V4 Creator Studio wrapper leakage', () => {
  const flags = detectContentAntiPatterns(
    'V4 Creator Studio request写不动，问题通常不在信息不够，而是第一句没先下判断。',
    'AI 产品冷启动'
  );

  assert.ok(flags.includes('prompt_leakage'));
});

test('detectContentAntiPatterns catches repeated support lines that say readers still do not know the point', () => {
  const flags = detectContentAntiPatterns(
    '我见过最有效的解法，是把整个工作流做成固定节奏——周会前每个人都知道自己该先下判断、还是先补例子，效率直接起飞，读者看完还是不知道这段最想证明什么。',
    '内容团队工作流'
  );

  assert.ok(flags.includes('generic_scene_leakage'));
});

test('composePublishReadyTweet rewrites the real browser regression into a grounded scene', () => {
  const tweet = composePublishReadyTweet({
    focus: extractIntentFocus('别再靠灵感写推文，给我一条更像真人的冷启动判断句。'),
    hook: '多数人把“别再靠灵感写推文，给我一条更像真人的冷启动判断句。”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
    humanized:
      '别再靠灵感写推文，给我一条更像真人的冷启动判断句。 第一条还在写“别再靠灵感写推文”这种自我介绍，读者扫完整条还是不知道你到底想证明什么。 如果只能先改一个动作，你会先改哪一个？'
  });

  assert.doesNotMatch(tweet, /给我一条|更像真人|这种自我介绍|读者扫完整条还是不知道/u);
  assert.match(tweet, /周一|周三|判断→例子→问题|固定/u);
  assert.match(tweet, /你会先固定哪一步|先写哪个场景/u);
});

test('rankHighPerformingExamples prefers strong engagement posts and skips reply-like noise', () => {
  const examples = rankHighPerformingExamples([
    {
      text: '@someone 互关一下',
      public_metrics: { like_count: 2, reply_count: 0, retweet_count: 0, quote_count: 0 }
    },
    {
      text: '做内容最危险的错觉，是把“表达欲”当成“用户价值”。我现在会先写结论，再补证据，转化高很多。',
      public_metrics: { like_count: 102, reply_count: 18, retweet_count: 27, quote_count: 11 }
    },
    {
      text: '如果一条推文必须解释三遍，它就不适合发。先删形容词，再删套话，最后才考虑排版。',
      public_metrics: { like_count: 88, reply_count: 12, retweet_count: 16, quote_count: 6 }
    }
  ]);

  assert.equal(examples.length, 2);
  assert.match(examples[0].text, /表达欲/);
  assert.ok(examples[0].score > examples[1].score);
  assert.match(examples[0].hook, /做内容最危险的错觉/);
});

test('buildContentStrategyContext hydrates effect-first zh strategy with historical examples', () => {
  const context = buildContentStrategyContext({
    intent: '围绕 AI 产品冷启动，写一篇适合 X 平台文章格式的长文，重点说明为什么流程比灵感更重要。',
    format: 'article',
    language: 'zh',
    styleAnalysis: {
      voice_summary: '结论先行、句子短、偏冷静。',
      high_performing_examples: [
        {
          text: '好内容不是堆信息，而是让读者更快做判断。',
          score: 91,
          hook: '好内容不是堆信息',
          closing: '你最常卡在哪个判断点？'
        }
      ],
      anti_patterns: ['空泛口号', '先讲大道理再讲例子']
    }
  });

  assert.equal(context.focus, 'AI 产品冷启动');
  assert.equal(context.format, 'article');
  assert.equal(context.language, 'zh');
  assert.equal(context.growthGoal, 'native_engagement');
  assert.equal(context.stylePriority, 'effect_first');
  assert.equal(context.highPerformingExamples.length, 1);
  assert.ok(context.platformRules.some((rule) => rule.includes('观点后面立刻给例子')));
});

test('buildContentStrategyContext strips trailing 中文体裁词 from focus extraction', () => {
  const context = buildContentStrategyContext({
    intent: '帮我写一条关于 AI 产品冷启动的中文推文',
    format: 'tweet',
    language: 'zh'
  });

  assert.equal(context.focus, 'AI 产品冷启动');
});

test('buildContentStrategyContext extracts the real subject from write-as prompts instead of keeping the whole instruction', () => {
  const updateContext = buildContentStrategyContext({
    intent: '把今天的 AI 产品更新写成一条像真人发出来的中文推文，不要像 changelog。',
    format: 'tweet',
    language: 'zh'
  });
  const feedbackContext = buildContentStrategyContext({
    intent: '写一个 thread，讲 AI 产品怎么把用户反馈写成更容易引发回复的内容。',
    format: 'thread',
    language: 'zh'
  });

  assert.equal(updateContext.focus, '今天的 AI 产品更新');
  assert.equal(feedbackContext.focus, 'AI 产品怎么把用户反馈写成更容易引发回复的内容');
});

test('extractIntentFocus treats product feature thread requests as product update topic, not wrapper text', () => {
  assert.equal(
    extractIntentFocus('把一个 AI 产品新功能写成 4 条 thread，不要像建议模板。'),
    'AI 产品新功能上线'
  );
});

test('buildContentStrategyContext keeps benchmark-fed opening/evidence patterns and format preferences', () => {
  const context = buildContentStrategyContext({
    intent: '帮我写一条关于 AI 产品冷启动的中文推文',
    format: 'tweet',
    language: 'zh',
    styleAnalysis: {
      voice_summary: '结论先行，像真人对话。',
      opening_patterns: ['先给判断，再讲背景'],
      evidence_patterns: ['观点后面立刻补一个真实例子'],
      format_preferences: ['tweet 尽量控制在 180-250 字']
    }
  });

  assert.deepEqual(context.openingPatterns, ['先给判断，再讲背景']);
  assert.deepEqual(context.evidencePatterns, ['观点后面立刻补一个真实例子']);
  assert.deepEqual(context.formatPreferences, ['tweet 尽量控制在 180-250 字']);
});

test('renderStrategyPromptContext includes benchmark-fed structure and evidence rules', () => {
  const prompt = renderStrategyPromptContext(
    buildContentStrategyContext({
      intent: '帮我写一条关于 AI 产品冷启动的中文推文',
      format: 'tweet',
      styleAnalysis: {
        opening_patterns: ['先给判断，再讲背景'],
        evidence_patterns: ['观点后面立刻补一个真实例子'],
        format_preferences: ['tweet 尽量控制在 180-250 字']
      }
    })
  );

  assert.match(prompt, /开头模式：先给判断/u);
  assert.match(prompt, /证据模式：观点后面立刻补一个真实例子/u);
  assert.match(prompt, /体裁偏好：tweet 尽量控制在 180-250 字/u);
});

test('scoreStrategySignals rewards concrete and conversational writing over generic templates', () => {
  const generic = scoreStrategySignals(
    '很多账号发不起来，不是因为你不会写，而是流程太散。欢迎留言讨论。',
    'tweet'
  );
  const concrete = scoreStrategySignals(
    '多数 AI 产品冷启动卡住，不是没人看见，而是第一条内容同时想讲定位、功能和故事。先只讲一个判断，再补一个真实例子。你会发现回复率会立刻变高。你现在最想先讲哪一个？',
    'tweet'
  );

  assert.ok(concrete.hookStrength > generic.hookStrength);
  assert.ok(concrete.specificity > generic.specificity);
  assert.ok(concrete.evidence > generic.evidence);
  assert.ok(concrete.ctaNaturalness > generic.ctaNaturalness);
});

test('sanitizeGeneratedText removes prompt leakage tails and garbage hashtags from bad fixtures', () => {
  const cleaned = sanitizeGeneratedText(
    '别再靠灵感写 什么是skills，把流程跑顺才是增长关键。(yf9g42) #gib2ne',
    'tweet'
  );

  assert.doesNotMatch(cleaned, /yf9g42/);
  assert.doesNotMatch(cleaned, /#gib2ne/);
});


test('formatThreadPosts avoids meta fallback lines when later sections need synthetic copy', () => {
  const thread = formatThreadPosts({
    hook: '多数人把 AI 产品冷启动写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
    body: ['为什么多数“AI 产品冷启动”内容没人停下来', '先把判断讲清楚，再补一个具体例子', '最后把问题抛给读者，而不是自说自话'],
    cta: '如果只能先改一个动作，你会先改哪一个？',
    humanized: '很多内容看起来信息很多，但读者读完一句就滑走了。问题通常不是你懂得不够，而是第一句没有先给判断。先把立场讲清楚，再补一个具体例子，读者才知道为什么要继续看。'
  });

  assert.equal(thread.length, 4);
  assert.match(thread[3] ?? '', /(如果只能先改一个动作|你现在最想先改的是开头、例子，还是结尾|如果现在只改第一句，你会先写哪个用户场景)/u);
  assert.ok(thread.every((item) => !item.includes('这一条只讲')));
});

test('formatThreadPosts removes explainy bridge copy from the opening post', () => {
  const thread = formatThreadPosts({
    hook: '多数 AI 产品冷启动内容写不动，不是缺信息，而是第一句没有先给判断。',
    body: ['先讲清楚为什么没人停下来', '再补一个真实场景', '最后把问题抛给读者'],
    cta: '如果只能先改一个动作，你会先改哪一个？',
    humanized: '很多人会在第一条里讲太多背景，读者还没看到判断就已经滑走了。补一个真实场景，读者才会继续看。'
  });

  assert.equal(thread.length, 4);
  assert.doesNotMatch(thread[0] ?? '', /下面我只拆|讲清为什么/u);
});

test('formatThreadPosts turns tutorial headings into direct thread copy', () => {
  const thread = formatThreadPosts({
    hook: '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
    body: ['为什么多数“AI 产品冷启动”内容没人停下来', '先把判断讲清楚，再补一个具体例子', '最后把问题抛给读者，而不是自说自话'],
    cta: '如果只能先改一个动作，你会先改哪一个？',
    humanized:
      '很多内容没人停下来，不是信息不够，而是开头还没给判断就先把背景讲了一大段。先把判断讲清楚，再补一个真实场景，读者马上就能知道你说的是不是自己正在经历的问题。结尾别再自说自话，直接抛一个读者愿意回答的具体问题。'
  });

  const joined = thread.join('\n');
  assert.doesNotMatch(joined, /为什么多数“AI 产品冷启动”内容没人停下来/u);
  assert.doesNotMatch(joined, /最后把问题抛给读者，而不是自说自话/u);
  assert.match(joined, /2\/4\n(?:比如)?做周报助手，别先写“AI 写作平台”/u);
});

test('enforceTweetLength trims long tweets under 280 chars while keeping a natural question close', () => {
  const original =
    '多数 AI 产品冷启动内容没反应，不是因为观点不够，而是第一条同时想讲定位、产品、融资和愿景。先只保留一个判断，再补一个真实例子，读者才知道为什么要继续看。很多团队第一天就急着写完整故事，结果每一段都像概念介绍，没有一句能让人停下来。把第一条改成“我现在只证明一个判断”，内容会立刻顺很多。再往后，你会发现审批、发布时间和复盘节奏如果还混在一起，后面的内容也会继续变成流水账。最后真正拖慢增长的，往往不是表达能力，而是你在第一条里就试图解释整个世界。补一句真实的 before/after，读者就知道你到底验证过什么；补一个失败案例，读者也更容易相信这个判断不是灵感。你现在最想先改哪一步？';

  assert.ok([...original].length > 280);

  const shortened = enforceTweetLength(original);

  assert.ok([...shortened].length <= 280);
  assert.ok([...shortened].length < [...original].length);
  assert.match(shortened, /你现在最想先改哪一步[？?]$/u);
  assert.doesNotMatch(shortened, /补一句真实的 before\/after/u);
});

test('buildThreadHumanizedFallback creates human-sounding synthesis without meta instruction leakage', () => {
  const fallback = buildThreadHumanizedFallback({
    hook: '多数 AI 产品冷启动内容没人停下来，不是缺信息，而是第一句没有先给判断。',
    body: ['为什么多数内容没人停下来', '先把判断讲清楚，再补一个具体例子', '最后把问题抛给读者，而不是自说自话'],
    cta: '如果只能先改一个动作，你会先改哪一个？'
  });

  assert.match(fallback, /第一句/u);
  assert.match(fallback, /(具体|真实)例子/u);
  assert.match(fallback, /如果只能先改一个动作/u);
  assert.doesNotMatch(fallback, /这一条只讲/u);
  assert.doesNotMatch(fallback, /用户意图|skills|输出形式/u);
});

test('buildTweetHumanizedFallback keeps the core judgment and lands on a natural reply-driving question', () => {
  const fallback = buildTweetHumanizedFallback({
    draftPrimaryTweet:
      'AI 产品冷启动最忌讳第一条内容同时讲定位、功能和愿景。读者还没停下来，你就已经把所有信息一次性塞满了。',
    cta: '如果只能先删一个信息块，你会先删哪一个？'
  });

  assert.ok([...fallback].length <= 280);
  assert.match(fallback, /AI 产品冷启动最忌讳/u);
  assert.match(fallback, /如果只能先删一个信息块/u);
  assert.doesNotMatch(fallback, /欢迎留言讨论|skills|用户意图/u);
});

test('buildTweetHumanizedFallback keeps focus-specific scene support when model budget falls back to heuristic', () => {
  const fallback = buildTweetHumanizedFallback({
    focus: '今天的 AI 产品更新',
    hook: '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。',
    cta: '如果今天这条更新只能保留一句，你会先留下哪一句？',
    draftPrimaryTweet: '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。'
  });

  assert.doesNotMatch(fallback, /这类内容|第一段同时讲背景|访客才知道这屏/u);
  assert.match(fallback, /上传一段录音|会议纪要|省了哪一步/u);
});

test('composePublishReadyTweet repairs broken quoted examples into a complete scene sentence', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    humanized:
      'AI 产品冷启动最容易写废的，就是第一句还在铺介绍，没有先下判断。 某 AI 写作工具上线第一条："我们做了一款提升效率的 AI 助手。 如果只能先改一个动作，你会先改哪一个？'
  });

  assert.match(tweet, /AI 产品冷启动.*(写废|第一句)/u);
  assert.match(tweet, /贴一段口语|周报助手/u);
  assert.doesNotMatch(tweet, /读者看完还是不知道这条想证明什么/u);
  assert.doesNotMatch(tweet, /如果只能先改一个动作，你会先改哪一个？.*如果只能/u);
  assert.doesNotMatch(tweet, /："我们/u);
});

test('composePublishReadyTweet rewrites dangling self-intro quote scenes into a cleaner example line', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    humanized:
      'AI 产品冷启动最容易废掉的，就是第一句还在介绍自己。 不是内容差，是开头还在介绍背景——"我们是一款帮助 XX 的工具——读者扫完整条，不知道你在证明什么，直接划走。'
  });

  assert.match(tweet, /贴一段口语|周报助手/u);
  assert.doesNotMatch(tweet, /自我介绍|读者扫完整条还是不知道/u);
  assert.doesNotMatch(tweet, /"我们是一款帮助 XX 的工具——/u);
  assert.doesNotMatch(tweet, /读者看完还是不知道这条想证明什么。.*读者扫完整条/u);
});

test('composePublishReadyTweet prefers a concrete fallback example over a hypothetical question sentence', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    humanized:
      'AI 产品冷启动最容易写废的，就是第一句还在铺介绍，没有先下判断。 如果你的产品推文现在点击率很低，你觉得是功能没讲清，还是第一句话太客气了。'
  });

  assert.match(tweet, /贴一段口语|周报助手/u);
  assert.doesNotMatch(tweet, /如果你的产品推文现在点击率很低/u);
});

test('composePublishReadyTweet uses a focus-specific scene and close for product-update prompts', () => {
  const tweet = composePublishReadyTweet({
    focus: '今天的 AI 产品更新',
    humanized:
      '今天这条更新别再写成 changelog，先只讲一个用户立刻能感受到的变化。 如果你的产品更新要同时介绍三个功能，用户通常还是不知道这次到底解决了什么。'
  });

  assert.match(tweet, /今天这条产品更新别再写成 changelog/u);
  assert.match(tweet, /上传一段录音，3 分钟拿到会议纪要/u);
  assert.match(tweet, /如果今天这条更新只能保留一句/u);
});

test('composePublishReadyTweet repairs generic consequence tails in product-update before-after scenes', () => {
  const tweet = composePublishReadyTweet({
    focus: '今天的 AI 产品更新',
    humanized:
      '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。 刚试的功能：以前得划选、复制、切窗口、粘贴再等结果，现在划选完直接出答案，读者看完还是不知道这段最想证明什么。 如果今天这条更新只能保留一句，你会先留下哪一句？'
  });

  assert.doesNotMatch(tweet, /读者看完还是不知道这段最想证明什么/u);
  assert.match(tweet, /以前得划选、复制、切窗口|现在划选完直接出答案/u);
  assert.match(tweet, /省了哪一步|这次更新到底/u);
});

test('composePublishReadyTweet repairs generic consequence tails in writing-product bad examples', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 写作产品为什么容易把内容写成说明书',
    humanized:
      'AI 写作产品一开口像说明书，通常不是功能少，而是第一句还没给判断。 第一句写“支持多模型、多语气、多模版”，读者读完只会觉得你在念功能表，而不是在说一个值得停下来的判断，读者看完还是不知道这段最想证明什么。 你最近见过最像说明书的一句产品文案，是什么？'
  });

  assert.doesNotMatch(tweet, /读者看完还是不知道这段最想证明什么/u);
  assert.match(tweet, /比如(?:第一句写|坏例子是)“支持多模型、多语气、多模版”/u);
  assert.match(tweet, /说明书|功能表/u);
});

test('tightenTweetForEngagement repairs benchmark generic consequence tails before early-returning short tweets', () => {
  const tightened = tightenTweetForEngagement(
    '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。 刚出的 AI 新功能，与其教人如何在对话框里反复调优 Prompt，不如直接演示它如何一键把散乱的飞书文档变成一份标准的周报，读者看完还是不知道这段最想证明什么。 如果今天这条更新只能保留一句，你会先留下哪一句？',
    250,
    '今天的 AI 产品更新'
  );

  assert.doesNotMatch(tightened, /读者看完还是不知道这段最想证明什么/u);
  assert.match(tightened, /飞书文档|标准的周报/u);
  assert.match(tightened, /省掉了哪一步|省了哪一步/u);
});

test('composePublishReadyTweet keeps product-update support human instead of repeating the hook', () => {
  const tweet = composePublishReadyTweet({
    focus: '今天的 AI 产品更新',
    humanized:
      '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。 今天别先列功能清单，只讲“上传一段录音，3 分钟拿到会议纪要”这种立刻能感受到的变化，读者才知道这次更新到底解决了什么摩擦。 如果今天这条更新只能保留一句，你会先留下哪一句？'
  });

  assert.doesNotMatch(tweet, /今天别先列功能清单/u);
  assert.match(tweet, /会后半小时|复制粘贴|3 分钟拿到会议纪要/u);
});

test('composePublishReadyTweet repairs product-update tails that omit the 最 marker from benchmark output', () => {
  const tweet = composePublishReadyTweet({
    focus: '今天的 AI 产品更新',
    humanized:
      '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。 某大厂刚上线的“自动流转”功能，不是又多了一个按钮，而是把原来要在四个页面之间来回复制粘贴的 10 分钟，压成一次确认，读者看完还是不知道这条想证明什么。 如果今天这条更新只能保留一句，你会先留下哪一句？'
  });

  assert.doesNotMatch(tweet, /读者看完还是不知道这条想证明什么|自动流转|四个页面之间来回复制粘贴/u);
  assert.match(tweet, /上传一段录音|会议纪要|省了哪一步/u);
});

test('composePublishReadyTweet repairs product-update self-intro tails from latest benchmark output', () => {
  const tweet = composePublishReadyTweet({
    focus: '今天的 AI 产品更新',
    humanized:
      '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。 比如第一条还在写“优化了长文本处理逻辑”这种自我介绍，读者扫完整条还是不知道你到底想证明什么。 如果今天这条更新只能保留一句，你会先留下哪一句？'
  });

  assert.doesNotMatch(tweet, /优化了长文本处理逻辑|自我介绍|不知道你到底想证明什么/u);
  assert.match(tweet, /上传一段录音|会议纪要|省了哪一步/u);
});

test('composePublishReadyTweet removes duplicated explanation from writing-product benchmark bad examples', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 写作产品为什么容易把内容写成说明书',
    humanized:
      'AI 写作产品一开口像说明书，通常不是功能少，而是第一句还没给判断。 比如第一句写“支持多模型、多语气、多模版”，读者读完只会觉得你在念功能表，而不是在说一个值得停下来的判断，读者会把它当成说明书，而不是一个值得停下来的判断。 你最近见过最像说明书的一句产品文案，是什么？'
  });

  assert.doesNotMatch(tweet, /值得停下来的判断，读者会把它当成说明书/u);
  assert.match(tweet, /客户吐槽|复盘开头|使用场景|念功能表/u);
});

test('composePublishReadyTweet keeps writing-product bad examples as an explicit scene instead of a bare explanation', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 写作产品为什么容易把内容写成说明书',
    humanized:
      'AI 写作产品一开口像说明书，通常不是功能少，而是第一句还没给判断。 坏例子是“支持多模型、多语气、多模版”；更像人的写法是“贴一段客户吐槽，我帮你改成复盘开头”，读者才知道这是使用场景，不是功能表。 你最近见过最像说明书的一句产品文案，是什么？'
  });

  assert.match(tweet, /比如坏例子是|反例/u);
  assert.match(tweet, /客户吐槽|复盘开头/u);
});

test('formatThreadPosts repairs benchmark generic consequence tails in feature-story scene posts', () => {
  const thread = formatThreadPosts({
    focus: '一次 AI 功能上线',
    hook: '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
    cta: '如果这次上线只能先讲一个场景，你会先讲哪一个？',
    humanized:
      '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。真正能留住读者的不是技术参数，而是“场景的颗粒度”，读者看完还是不知道这段最想证明什么。把一个大功能拆解成三个能立刻解决痛点的小动作，比堆砌十个不明觉厉的底层架构更能换来真实的转化。'
  });

  assert.doesNotMatch(thread.join('\n'), /读者看完还是不知道这段最想证明什么/u);
  assert.match(thread[1] ?? '', /功能到底解决了哪一个使用摩擦|使用场景|跟进清单/u);
});

test('formatThreadPosts repairs feature-story repeated judgment actions into a concrete feature action', () => {
  const thread = formatThreadPosts({
    focus: '一次 AI 功能上线',
    hook: '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
    cta: '如果这次上线只能先讲一个场景，你会先讲哪一个？',
    humanized:
      '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。第一条必须先给判断，而不是铺垫背景，读者看完还是不知道这条想证明什么。第一条必须先给判断，而不是铺垫背景。'
  });

  const joined = thread.join('\n');
  assert.doesNotMatch(joined, /第一条必须先给判断，而不是铺垫背景，读者看完还是不知道这条想证明什么|3\/4\n第一条必须先给判断/u);
  assert.match(thread[2] ?? '', /使用场景|别一上来就列功能|跟进清单/u);
});

test('formatThreadPosts repairs latest benchmark feature-story generic third-post actions', () => {
  const thread = formatThreadPosts({
    focus: '把一次 AI 功能上线写成 thread，要求不像发布说明，而像一组连贯观点',
    hook: '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
    cta: '如果这次上线只能先讲一个场景，你会先讲哪一个？',
    humanized:
      '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。只改开头这一处，读者继续读下去的概率就会明显不一样。比如这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景，读者才知道这次功能到底解决了哪一个使用摩擦。真正让人停下来的，不是信息更多，而是你在开头就先把判断讲清楚。'
  });

  assert.doesNotMatch(thread[2] ?? '', /真正让人停下来|开头就先把判断讲清楚/u);
  assert.match(thread[2] ?? '', /使用场景|别一上来就列功能/u);
});

test('formatThreadPosts makes feature-story action cards sound like a product-side note instead of advice template', () => {
  const thread = formatThreadPosts({
    focus: '把一次 AI 功能上线写成 thread，要求不像发布说明，而像一组连贯观点',
    hook: '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
    cta: '如果这次上线只能先讲一个场景，你会先讲哪一个？',
    humanized:
      '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。只改开头这一处，读者继续读下去的概率就会明显不一样。比如这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景，读者才知道这次功能到底解决了哪一个使用摩擦。真正让人停下来的，不是信息更多，而是你在开头就先把判断讲清楚。'
  });

  assert.doesNotMatch(thread[2] ?? '', /^3\/4\n更有效的写法是/u);
  assert.match(thread[2] ?? '', /我会|你/u);
});

test('formatThreadPosts repairs stray closing quote product-feature action cards', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品新功能上线',
    hook: '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
    cta: '如果这次上线只能先讲一个场景，你会先讲哪一个？',
    humanized: `一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。
比如这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景。
”

现在第一屏直接给他预置了 6 个他所在行业的真实场景，他连想都不用想就能往下走。`
  });

  assert.equal(thread.length, 4);
  assert.doesNotMatch(thread[2] ?? '', /3\/4\n[”"']/u);
  assert.doesNotMatch(thread[2] ?? '', /3\/4\n\s*$/u);
  assert.match(thread[2] ?? '', /我会把第三条只留成一个动作|使用场景|别一上来就列功能/u);
});

test('formatThreadPosts removes markdown thread labels from action cards', () => {
  const thread = formatThreadPosts({
    focus: '内容团队工作流',
    hook: '内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。',
    cta: '如果团队内容流程只能先固定一步，你会先固定哪一步？',
    humanized: `内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。
比如周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。
**3/4**
我带过的三个 AI 内容团队，只要把“第一段必须先甩判断”定成周会前强制动作，改稿次数减少一半。`
  });

  const joined = thread.join('\n\n');
  assert.equal(thread.length, 4);
  assert.doesNotMatch(joined, /\*\*\s*3\/4\s*\*\*/u);
  assert.doesNotMatch(thread[2] ?? '', /\*\*/u);
});

test('formatThreadPosts repairs generic consequence tails that omit 最 and drops stray quote cold-start actions', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品冷启动',
    hook: 'AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。',
    cta: '如果现在只改第一句，你会先写哪个用户场景？',
    humanized:
      'AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。如果你还在纠结模型参数和功能列表，大概率连 1% 的转化率都跑不到。用户在信息流里看到“全能 AI 助手”会直接滑走，但看到“一键生成小红书爆款标题”就会停下。 ” 改成一个真实场景，读者看完还是不知道这条想证明什么。'
  });

  const joined = thread.join('\n');
  assert.doesNotMatch(joined, /读者看完还是不知道这条想证明什么|小红书爆款|转化率|^[”"]/um);
  assert.match(joined, /贴一段口语|老板的周报|真实场景 before\/after/u);
});

test('formatThreadPosts does not pick the question close as a cold-start scene with a generic tail', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品冷启动',
    hook: 'AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。',
    cta: '如果现在只改第一句，你会先写哪个用户场景？',
    humanized:
      'AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。只改开头这一处，读者继续读下去的概率就会明显不一样。如果现在只改第一句，你会先写哪个用户场景？做周报助手，别先写“AI 写作平台”，直接写“贴一段口语，我帮你改成能发给老板的周报”，用户才知道第一步该怎么用。'
  });

  assert.doesNotMatch(thread[1] ?? '', /如果现在只改第一句|读者看完还是不知道这条想证明什么/u);
  assert.match(thread[1] ?? '', /周报助手|贴一段口语|老板的周报/u);
});

test('formatThreadPosts removes inflated cold-start claims and keeps a stable user scene', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品冷启动',
    hook: 'AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。',
    cta: '如果现在只改第一句，你会先写哪个用户场景？',
    humanized:
      'AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。如果你还在纠结模型参数和功能列表，大概率连 1% 的转化率都跑不到。用户在信息流里看到“全能 AI 助手”会直接滑走，但看到“一键生成小红书爆款标题”就会停下。就像我之前测过的一个产品，原标题是“多模态理解引擎”，点击率惨不忍睹；改成“把 1 小时播客变成 5 分钟思维导图”后，服务器直接被新用户挤爆了。'
  });

  const joined = thread.join('\n');
  assert.doesNotMatch(joined, /1%|小红书爆款|服务器直接被新用户挤爆|转化率.*翻/u);
  assert.match(joined, /周报助手|贴一段口语|老板的周报/u);
});

test('formatThreadPosts repairs team-workflow benchmark generic tails into before-after work scenes', () => {
  const thread = formatThreadPosts({
    focus: 'AI 内容团队工作流',
    hook: 'AI 内容团队最怕的，不是没灵感，而是每次都从空白页开始。',
    cta: '如果团队内容流程只能先固定一步，你会先固定哪一步？',
    humanized:
      'AI 内容团队最怕的，不是没灵感，而是每次都从空白页开始。很多团队拿到一个爆款提示词就开始疯狂洗稿，结果三天后就陷入“不知道该发什么”的死循环，读者看完还是不知道这段最想证明什么。核心动作只有一步：把“写内容”拆成“定结构”和“填血肉”。'
  });

  const joined = thread.join('\n');
  assert.doesNotMatch(joined, /读者看完还是不知道这段最想证明什么|爆款提示词.*疯狂洗稿/u);
  assert.match(joined, /周一|周三|判断→例子→问题|周会前/u);
});

test('formatThreadPosts repairs structural-template team workflow tails from benchmark output', () => {
  const thread = formatThreadPosts({
    focus: 'AI 内容团队工作流',
    hook: 'AI 内容团队最怕的，不是没灵感，而是每次都从空白页开始。',
    cta: '如果团队内容流程只能先固定一步，你会先固定哪一步？',
    humanized:
      'AI 内容团队最怕的，不是没灵感，而是每次都从空白页开始。高效团队不是因为每个人都很会写，而是因为他们把“选题判断→场景例子→发布问题”分工细到不用猜，读者看完还是不知道这段最想证明什么。第一屏永远结构模板。'
  });

  const joined = thread.join('\n');
  assert.doesNotMatch(joined, /读者看完还是不知道这段最想证明什么|第一屏永远结构模板/u);
  assert.match(joined, /周一|周三|周会前|判断→例子→问题/u);
});

test('formatThreadPosts keeps team-workflow action distinct from the scene card', () => {
  const thread = formatThreadPosts({
    focus: 'AI 内容团队工作流，固定节奏比等灵感更有效',
    hook: 'AI 内容团队最怕的，不是没灵感，而是每次都从空白页开始。',
    cta: '如果团队内容流程只能先固定一步，你会先固定哪一步？',
    humanized:
      'AI 内容团队最怕的，不是没灵感，而是每次都从空白页开始。有了固定节奏，周会前就知道谁先下判断、谁补例子。周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。'
  });

  assert.notEqual(thread[1]?.replace(/^2\/4\n/u, ''), thread[2]?.replace(/^3\/4\n/u, ''));
  assert.match(thread[2] ?? '', /分工|谁先下判断|谁补例子/u);
});

test('formatThreadPosts keeps user-feedback promise distinct from the scene quote', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    cta: '你最近最值得拿出来写的一句用户原话，是什么？',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。用户原话是“我想知道为什么它总把重点埋掉”，这种原话比“我们持续优化体验”更容易引发回复。用户原话是“我想知道为什么它总把重点埋掉”，这种原话比“我们持续优化体验”更容易引发回复。更有效的写法是：第二条直接放那句最扎心的用户原话，第三条再讲你准备怎么改，读者才会觉得你真的听见了反馈。'
  });

  assert.doesNotMatch(thread[0] ?? '', /用户原话是“我想知道为什么它总把重点埋掉”/u);
  assert.match(thread[0] ?? '', /具体到某一句用户原话|读者才有东西可以回应/u);
  assert.match(thread[1] ?? '', /用户原话是“我想知道为什么它总把重点埋掉”/u);
});

test('formatThreadPosts uses a real feedback quote when the only available scene repeats the promise', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    cta: '你最近最值得拿出来写的一句用户原话，是什么？',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。具体到某一句用户原话，读者才有东西可以回应。更有效的写法是：第二条直接放那句最扎心的用户原话，第三条再讲你准备怎么改，读者才会觉得你真的听见了反馈。'
  });

  assert.doesNotMatch(thread[1] ?? '', /具体到某一句用户原话，读者才有东西可以回应/u);
  assert.match(thread[1] ?? '', /用户原话是“我想知道为什么它总把重点埋掉”/u);
});

test('composePublishReadyTweet dedupes latest product-update repeated support tails', () => {
  const tweet = composePublishReadyTweet({
    focus: '今天的 AI 产品更新，不要像 changelog',
    hook: '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。',
    cta: '如果今天这条更新只能保留一句，你会先留下哪一句？',
    humanized:
      '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。比如我会直接写：“以前会后要复制粘贴半小时，现在上传一段录音，3 分钟拿到会议纪要”，用户立刻知道这次更新省了哪一步，用户一眼就知道这次更新省了哪一步，用户一眼就知道这次更新省了哪一步，用户一眼就知道这次更新省了哪一步。 如果今天这条更新只能保留一句，你会先留下哪一句？'
  });

  assert.equal((tweet.match(/用户一眼就知道这次更新省了哪一步/gu) ?? []).length, 0);
  assert.equal((tweet.match(/这次更新省了哪一步/gu) ?? []).length, 1);
  assert.ok([...tweet].length <= 220);
});

test('composePublishReadyTweet keeps before-after scene examples intact instead of appending a contradictory generic consequence', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    humanized:
      'AI 产品冷启动最容易写废的，就是第一句还在铺介绍，没有先下判断。 你写“我们是一款基于大模型的自动化效率工具”，用户只会滑走；但如果你写“别再手动整理周报了，这事儿 AI 3 秒就能干完”，瞬间就能抓住注意力。'
  });

  assert.match(tweet, /但如果你写/u);
  assert.doesNotMatch(tweet, /瞬间就能抓住注意力，读者看完还是不知道这条想证明什么/u);
});

test('composePublishReadyTweet rejects abstract “删掉介绍换成场景” support lines and falls back to a concrete cold-start scene', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    humanized:
      'AI 产品冷启动写废，往往不是观点不够，而是第一句还在铺介绍。 把你的产品介绍删掉，换成一个能立刻被感知的具体场景，读者看完还是不知道这条想证明什么。'
  });

  assert.doesNotMatch(tweet, /把你的产品介绍删掉，换成一个能立刻被感知的具体场景/u);
  assert.match(tweet, /贴一段口语|周报助手/u);
});

test('composePublishReadyTweet uses a sharper focus-aware cold-start hook and close', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    humanized:
      '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。 比如第一条写“我们是一家做 AI 工作流的团队”，后面再补三句功能和愿景，读者刷完整条还是不知道你到底替他省掉哪一步。 如果只能先改一个动作，你会先改哪一个？'
  });

  assert.match(tweet, /^AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。/u);
  assert.match(tweet, /贴一段口语|周报助手/u);
  assert.match(tweet, /如果现在只改第一句，你会先写哪个用户场景/u);
});

test('tightenTweetForEngagement compresses explanatory tweets toward a tighter x-native shape', () => {
  const original =
    '多数 AI 产品冷启动内容没反应，不是因为观点不够，而是第一条同时想讲定位、产品、融资和愿景。很多内容看起来信息很多，但读者读完一句就滑走了。问题通常不是你懂得不够，而是第一句没有先给判断。先把立场讲清楚，再补一个具体例子，读者才知道为什么要继续看。你现在最想先改哪一步？';

  const tightened = tightenTweetForEngagement(original);

  assert.ok([...tightened].length < [...original].length);
  assert.ok([...tightened].length <= 250);
  assert.match(tightened, /第一条/u);
  assert.match(tightened, /(你现在最想先改哪一步|如果只能先改一个动作，你会先改哪一个)[？?]$/u);
});

test('tightenTweetForEngagement normalizes leaked 中文体裁词 and weak english fragments', () => {
  const original =
    '多数人把“AI 产品冷启动的中文推文”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由 AI产品冷启动最怕的不是没人看，而是第一句话没把人拽住。 比如我们的聊天助手上线时只写“新功能上线”，用户滑 past；改成“打开它，30 秒解决你最近的工作瓶颈”，点击率直接翻了三倍。 你现在的启动文案，敢不敢把第一句改成“解决XX问题”？';

  const tightened = tightenTweetForEngagement(original);

  assert.doesNotMatch(tightened, /中文推文/u);
  assert.doesNotMatch(tightened, /滑 past/u);
  assert.match(tightened, /AI 产品冷启动/u);
  assert.match(tightened, /用户直接滑走|点击率/u);
});

test('tightenTweetForEngagement drops repetitive explanation lines and keeps the strongest concrete example', () => {
  const original =
    '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由 不是文案太长，而是开头没给判断——大多数 AI 产品的中文冷启动文案根本抓不住眼球。 比如某聊天机器人最初写“我们让对话更自然”，点击率仅 3%；改成“别让机器人尴尬沉默——让对话立刻流畅”，瞬间冲到 12%。 如果只能改一句，你会先改哪句？';

  const tightened = tightenTweetForEngagement(original);

  assert.ok([...tightened].length <= 250);
  assert.doesNotMatch(tightened, /不是文案太长/u);
  assert.match(tightened, /点击率仅 3%|瞬间冲到 12%/u);
});

test('buildArticleHumanizedFallback returns x-article structure when humanize JSON fails', () => {
  const fallback = buildArticleHumanizedFallback({
    title: 'AI 产品冷启动，不要把第一条写成产品说明书',
    hook: '冷启动最容易犯的错，不是不会写，而是一上来就想把所有信息讲完。',
    body: ['先把判断讲清楚', '再补一个真实例子', '最后把下一步动作讲明白'],
    cta: '如果你愿意，也可以把这篇再拆成 thread 版本。',
    draftPrimaryTweet:
      '很多团队发第一条内容时，会把定位、功能、愿景一次性塞进去。结果信息很多，但读者根本不知道该先记住哪一个判断。'
  });

  assert.match(fallback, /^AI 产品冷启动，为什么第一句总让读者直接滑走？$/m);
  assert.match(fallback, /\n\n导语\n/);
  assert.match(fallback, /\n\n一、第一句先下判断，读者才知道这条值不值得读\n/);
  assert.match(fallback, /\n\n结尾\n/);
});

test('formatXArticleText adds concrete support when a section is still too abstract', () => {
  const article = formatXArticleText({
    title: 'AI 产品冷启动，不要把第一条写成产品说明书',
    hook: '冷启动最容易犯的错，不是不会写，而是一上来就想把所有信息讲完。',
    body: ['先把判断讲清楚', '再补一个真实例子', '最后把下一步动作讲明白'],
    cta: '你最想先改哪一步？',
    humanized:
      'AI 产品冷启动，不要把第一条写成产品说明书\n\n导语\n冷启动最容易犯的错，不是不会写，而是一上来就想把所有信息讲完。\n\n一、先把判断讲清楚\n很多团队会先讲一堆背景。\n\n二、再补一个真实例子\n读者需要马上理解你的判断。\n\n三、最后把下一步动作讲明白\n结尾别停在口号上。\n\n结尾\n你最想先改哪一步？'
  });

  assert.match(article, /比如|最常见的场景/u);
  assert.match(article, /一、先把判断讲清楚/u);
});

test('formatXArticleText replaces placeholder article paragraphs with concrete readable support', () => {
  const article = formatXArticleText({
    title: 'AI 产品冷启动：先把判断讲清楚，再让读者继续读下去',
    hook: '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
    body: ['为什么第一段就失去读者', '先给判断，再补具体例子', '把表达动作排成稳定节奏'],
    cta: '读完以后，你最想先改哪一步？',
    humanized:
      'AI 产品冷启动：先把判断讲清楚，再让读者继续读下去\n\n导语\n多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。\n\n一、为什么第一段就失去读者\nAI 产品冷启动的关键策略。\n\n二、先给判断，再补具体例子\n先把“先给判断，再补具体例子”说具体，再给一个例子或动作，不要停在口号上。\n\n三、把表达动作排成稳定节奏\n先把“把表达动作排成稳定节奏”说具体，再给一个例子或动作，不要停在口号上。\n\n结尾\n读完以后，你最想先改哪一步？'
  });

  assert.doesNotMatch(article, /关键策略/u);
  assert.doesNotMatch(article, /先把“.+”说具体/u);
  assert.match(article, /最常见的失误|更有效的写法/u);
  assert.match(article, /具体场景|固定成“判断→例子→问题”的节奏/u);
});

test('formatXArticleText enriches a generic lead with a reader-behavior scene', () => {
  const article = formatXArticleText({
    title: 'AI 产品冷启动，先别急着把所有东西讲完',
    hook: '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
    body: ['先把判断讲清楚', '再补一个真实例子', '最后把下一步动作讲明白'],
    cta: '读完以后，你最想先改哪一步？',
    humanized:
      'AI 产品冷启动，先别急着把所有东西讲完\n\n导语\n多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。\n\n一、先把判断讲清楚\n关键策略。\n\n二、再补一个真实例子\n关键策略。\n\n三、最后把下一步动作讲明白\n关键策略。'
  });

  assert.match(article, /\n导语\n.*(滑走|第一行|第一屏)/su);
});

test('tightenTweetForEngagement removes duplicate diagnosis clauses after the main hook', () => {
  const original =
    '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由 冷启动不是缺内容，而是第一句没抓住痛点。 比如某个 AI 写作工具第一条同时讲定位、功能和愿景，结果读者读完还是不知道你到底想证明什么。 如果只能先改一个动作，你会先改哪一个？';

  const tightened = tightenTweetForEngagement(original);

  assert.ok([...tightened].length <= 220);
  assert.doesNotMatch(tightened, /冷启动不是缺内容/u);
  assert.match(tightened, /比如某个 AI 写作工具/u);
});

test('tightenTweetForEngagement sharpens a generic hook into a more direct judgment sentence', () => {
  const original =
    '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。 比如某个 AI 工具的首页第一屏连续写了三句愿景，用户还没看到判断就直接滑走了。 你现在第一句最想先改哪一个词？';

  const tightened = tightenTweetForEngagement(original);

  assert.ok([...tightened].length <= 180);
  assert.doesNotMatch(tightened, /多数人把/u);
  assert.match(tightened, /AI 产品冷启动/u);
  assert.match(tightened, /(第一句|第一屏)/u);
});

test('tightenTweetForEngagement repairs malformed short hooks instead of returning them unchanged', () => {
  const original =
    '"冷启动中文AI 产品写作最常见问题是：第一句没问‘为什么你要读这个？ 比如，某产品冷启动时用‘AI工具帮你省时间’作为开头，中文用户点击率只能维持在3%。';

  const tightened = tightenTweetForEngagement(original);

  assert.doesNotMatch(tightened, /^["“]/u);
  assert.doesNotMatch(tightened, /冷启动中文AI 产品写作/u);
  assert.match(tightened, /AI 产品冷启动/u);
  assert.match(tightened, /第一句/u);
});

test('tightenTweetForEngagement removes malformed closing quotes and repeated diagnosis sentences from short outputs', () => {
  const original =
    'AI 产品冷启动”没反应，通常不是观点不够，而是第一句没把判断亮出来 多数 AI 产品冷启动失败，不是缺技术，而是第一句话没给判断。 比如某聊天机器人上线先说"我们想让对话更自然"，用户根本不知道它能解决什么痛点，热度直接归零。 你在下一个产品的启动页，最想先改的价值点是什么？';

  const tightened = tightenTweetForEngagement(original);

  assert.doesNotMatch(tightened, /AI 产品冷启动”没反应/u);
  assert.doesNotMatch(tightened, /多数 AI 产品冷启动失败/u);
  assert.match(tightened, /用户根本不知道它能解决什么痛点/u);
});

test('tightenTweetForEngagement trims a second diagnosis sentence and restores sentence boundaries in malformed short tweet output', () => {
  const original =
    'AI 产品冷启动没反应，通常不是观点不够，而是第一句没把判断亮出来 多数人以为AI 产品冷启动难是因为模型不够好，其实是第一句没给读者停下来的理由。 比如某AI写作工具首页直接写“我们用AI帮你写稿”，结果访客刷完就走；改成“写稿卡住？';

  const tightened = tightenTweetForEngagement(original);

  assert.doesNotMatch(tightened, /多数人以为AI 产品冷启动难/u);
  assert.match(tightened, /AI 产品冷启动没反应/u);
  assert.match(tightened, /亮出来。 比如某 AI 写作工具/u);
});

test('tightenTweetForEngagement removes stray quote marks before the final question close', () => {
  const original =
    'AI 产品冷启动没反应，通常不是观点不够，而是第一句没把判断亮出来。 比如有人直接甩出定位+功能+愿景三段式，读者瞬间划走，根本记不住你到底想证明什么。 ’——你会怎么做？';

  const tightened = tightenTweetForEngagement(original);

  assert.doesNotMatch(tightened, /’——/u);
  assert.match(tightened, /你会怎么做/u);
});

test('tightenTweetForEngagement trims duplicated cold-start diagnosis copy from the support sentence', () => {
  const original =
    'AI 产品冷启动没反应，通常不是观点不够，而是第一句没把判断亮出来 多数冷启动内容没人停下来，不是缺信息，而是第一句还没给判断就先把背景讲完了。 比如第一条同时说定位、功能和愿景，读者读完也记不住你到底证明了什么。 你的第一句文案，敢直接下结论吗？';

  const tightened = tightenTweetForEngagement(original);

  assert.doesNotMatch(tightened, /多数冷启动内容没人停下来/u);
  assert.match(tightened, /亮出来。 比如第一条同时说定位、功能和愿景/u);
});

test('tightenTweetForEngagement applies a sharper focus-aware cold-start hook', () => {
  const original =
    '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。 比如第一条写“我们是一家做 AI 工作流的团队”，后面再补功能和愿景，读者刷完整条还是不知道你到底替他省掉哪一步。 如果现在就改第一句，你最先删掉的是定位、功能，还是愿景？';

  const tightened = tightenTweetForEngagement(original, 220, 'AI 产品冷启动');

  assert.match(tightened, /^AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。/u);
  assert.match(tightened, /如果现在只改第一句，你会先写哪个用户场景/u);
});

test('formatThreadPosts prefers scene-based lines over abstract coaching language in later posts', () => {
  const thread = formatThreadPosts({
    hook: '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
    body: ['为什么第一条没人停下来', '再补一个具体例子', '最后把问题抛给读者'],
    cta: '如果只能先改一个动作，你会先改哪一个？',
    humanized:
      '很多内容没人停下来，不是信息不够，而是开头还没给判断就先把背景讲了一大段。先把判断讲清楚，再补一个具体例子，读者才知道为什么要继续看。结尾别再自说自话，直接抛一个问题。'
  });

  const joined = thread.join('\n');
  assert.doesNotMatch(joined, /同一个判断，只要补一个真实场景/u);
  assert.match(joined, /周报助手|贴一段口语|用户才知道第一步/u);
});

test('formatThreadPosts makes the third post feel like a concrete close instead of a generic advice template', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品冷启动',
    hook: '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
    body: ['为什么第一条没人停下来', '再补一个具体例子', '最后把问题抛给读者'],
    cta: '如果只能先改一个动作，你会先改哪一个？',
    humanized:
      '很多内容没人停下来，不是信息不够，而是开头还没给判断就先把背景讲了一大段。比如第一条同时讲定位、功能和故事，读者读完还是不知道你到底想证明什么。最后提醒读者可以多互动。'
  });

  const thirdPost = thread[2] ?? '';
  assert.doesNotMatch(thirdPost, /回复率通常会比空泛求互动更高/u);
  assert.doesNotMatch(thirdPost, /更有效的写法是/u);
  assert.match(thirdPost, /(我会先把第一句改成|先删掉空泛提醒|真实场景)/u);
});

test('formatThreadPosts removes advice-template phrasing from AI cold-start action cards', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品冷启动',
    hook: 'AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。',
    body: ['做周报助手，别先写“AI 写作平台”，直接写“贴一段口语，我帮你改成能发给老板的周报”。'],
    cta: '如果现在只改第一句，你会先写哪个用户场景？',
    humanized:
      'AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。做周报助手，别先写“AI 写作平台”，直接写“贴一段口语，我帮你改成能发给老板的周报”，用户才知道第一步该怎么用。更有效的写法是：把第一句改成“贴一段口语→生成能发给老板的周报”这种真实场景 before/after，让读者知道第一步该怎么用。'
  });

  assert.doesNotMatch(thread[2] ?? '', /更有效的写法是/u);
  assert.match(thread[2] ?? '', /我会先把第一句改成/u);
});

test('formatThreadPosts uses focus-specific copy instead of generic “这类内容” for feature-story threads', () => {
  const thread = formatThreadPosts({
    focus: '一次 AI 功能上线',
    humanized:
      '把一次 AI 功能上线写成 thread，要求不像发布说明，而像一组连贯观点。 别上来就列功能。'
  });

  assert.doesNotMatch(thread.join('\n'), /这类内容/u);
  assert.match(thread[0] ?? '', /一次 AI 功能上线最怕的/u);
  assert.match(thread[1] ?? '', /昨晚录一段语音|整理好跟进清单/u);
  assert.match(thread[3] ?? '', /只能先讲一个场景/u);
});

test('formatThreadPosts feature-story fallback keeps a concrete launch scene without generic consequence leakage', () => {
  const posts = formatThreadPosts({
    focus: '一次 AI 功能上线',
    hook: '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
    body: ['开头切入点', '具体场景', '动作拆解'],
    cta: '如果这次上线只能先讲一个场景，你会先讲哪一个？',
    humanized: ''
  });
  const joined = posts.join('\n\n');

  assert.equal(posts.length, 4);
  assert.match(joined, /昨晚录一段语音|跟进清单/u);
  assert.doesNotMatch(joined, /读者看完还是不知道这条想证明什么/u);
});

test('formatXArticleText upgrades abstract example sections into more scene-rich paragraphs', () => {
  const article = formatXArticleText({
    title: 'AI 产品冷启动，别把第一条写成背景介绍',
    hook: '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
    body: ['为什么第一段就失去读者', '先给判断，再补具体例子', '把表达动作排成稳定节奏'],
    cta: '读完以后，你最想先改哪一步？',
    humanized:
      'AI 产品冷启动，别把第一条写成背景介绍\n\n导语\n多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。\n\n一、为什么第一段就失去读者\n先把背景讲清楚，读者自然会继续看下去。\n\n二、先给判断，再补具体例子\n先把判断讲清楚，再用一个例子支撑，读者自然会更愿意继续读完整篇内容。\n\n三、把表达动作排成稳定节奏\n保持稳定节奏，表达会更顺。\n\n结尾\n读完以后，你最想先改哪一步？'
  });

  assert.match(article, /比如|最常见的场景/u);
  assert.match(article, /第一段就把赛道、定位、功能和愿景一起端上来|第一条同时讲定位、功能和故事/u);
});

test('formatXArticleText rewrites method-style titles into more human article titles', () => {
  const article = formatXArticleText({
    title: 'AI 产品冷启动：先把判断讲清楚，再让读者继续读下去',
    hook: '多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。',
    body: ['为什么第一段就失去读者', '先给判断，再补具体例子', '把表达动作排成稳定节奏'],
    cta: '读完以后，你最想先改哪一步？',
    humanized:
      'AI 产品冷启动：先把判断讲清楚，再让读者继续读下去\n\n导语\n多数人把“AI 产品冷启动”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。\n\n一、为什么第一段就失去读者\n最常见的失误是：第一段就把赛道、定位、功能和愿景一起端上来，读者还没看到判断就已经滑走了。\n\n二、先给判断，再补具体例子\n比如把“互动低”改成“第一条同时讲定位、功能和故事”，读者就能马上看懂问题出在哪。\n\n三、把表达动作排成稳定节奏\n更稳的做法是固定成“先判断、再举例、最后抛问题”的节奏。\n\n结尾\n读完以后，你最想先改哪一步？'
  });

  const title = article.split('\n')[0] ?? '';
  assert.doesNotMatch(title, /先把判断讲清楚/u);
  assert.match(title, /(第一句|第一行|滑走|写废)/u);
});

test('formatXArticleText uses focus-aware human titles for launch-copy articles', () => {
  const article = formatXArticleText({
    focus: 'AI 产品上线文案为什么容易写成产品说明书',
    title: 'AI 产品上线文案：先把判断讲清楚，再让用户继续读下去',
    hook: '上线文案最容易写废的，不是没信息，而是第一段就把功能列表端上来了。',
    body: ['为什么上线文案一开头就像说明书', '坏例子到底坏在哪', '怎样把功能翻成用户获得感'],
    cta: '读完以后，你最想先改哪一步？',
    humanized:
      'AI 产品上线文案：先把判断讲清楚，再让用户继续读下去\n\n导语\n上线文案最容易写废的，不是没信息，而是第一段就把功能列表端上来了。\n\n一、为什么上线文案一开头就像说明书\n最常见的失误是：第一段就把功能列表和愿景一起端上来。\n\n二、坏例子到底坏在哪\n比如第一句写“支持多模型、多语气、多模版”，读者读完只觉得你在念功能表。\n\n三、怎样把功能翻成用户获得感\n更稳的做法是先讲一句用户立刻能感受到的变化。\n\n结尾\n读完以后，你最想先改哪一步？'
  });

  const title = article.split('\n')[0] ?? '';
  assert.equal(title, 'AI 产品上线文案，为什么总会写成说明书？');
});

test('formatXArticleText uses focus-aware human titles for homepage-first-screen articles', () => {
  const article = formatXArticleText({
    focus: 'AI 产品首页第一屏文案怎么避免被直接滑走',
    title: 'AI 产品首页第一屏：先把判断讲清楚，再让读者继续读下去',
    hook: '首页第一屏最容易写废的，不是内容少，而是开头还在解释自己。',
    body: ['为什么第一屏一开头就把人写走', '哪些坏例子最容易让访客直接滑走', '怎样把第一屏改成一句明确判断'],
    cta: '如果现在就改第一屏，你最想先删掉哪一句？',
    humanized:
      'AI 产品首页第一屏：先把判断讲清楚，再让读者继续读下去\n\n导语\n首页第一屏最容易写废的，不是内容少，而是开头还在解释自己。\n\n一、为什么第一屏一开头就把人写走\n最常见的失误是：第一段就把愿景和定位一起端上来。\n\n二、哪些坏例子最容易让访客直接滑走\n比如第一句写“新一代 AI 生产力平台”，访客还是不知道你到底替他省掉哪一步。\n\n三、怎样把第一屏改成一句明确判断\n更稳的做法是先讲一句用户马上能听懂的价值判断。\n\n结尾\n如果现在就改第一屏，你最想先删掉哪一句？'
  });

  const title = article.split('\n')[0] ?? '';
  assert.equal(title, 'AI 产品首页第一屏，用户为什么会直接滑走？');
});

test('composePublishReadyTweet replaces ad-like product-update support lines with a grounded user-facing scene', () => {
  const tweet = composePublishReadyTweet({
    focus: '今天的 AI 产品更新',
    hook: '把今天的 AI 产品更新写成一条像真人发出来的中文推文，不要像 changelog。',
    humanized:
      '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。刚更新的 AI 实时语音，它不再是死板的复读机，而是能听懂你的一声叹气，并瞬间把语调切换得更温柔。 如果今天这条更新只能保留一句，你会先留下哪一句？'
  });

  assert.doesNotMatch(tweet, /复读机|叹气|更温柔/u);
  assert.match(tweet, /上传一段录音|会议纪要|立刻能感受到的变化/u);
});

test('composePublishReadyTweet drops breathless product-update metaphors like 喂到嘴边 and 杀手锏', () => {
  const tweet = composePublishReadyTweet({
    focus: '今天的 AI 产品更新',
    hook: '把今天的 AI 产品更新写成一条像真人发出来的中文推文，不要像 changelog。',
    humanized:
      '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化。以前写代码要跳到浏览器查文档，现在 Cursor 直接在侧边栏喂到嘴边，这种“不打断感”才是真正的杀手锏。 如果今天这条更新只能保留一句，你会先留下哪一句？'
  });

  assert.doesNotMatch(tweet, /喂到嘴边|杀手锏/u);
  assert.match(tweet, /上传一段录音|会议纪要|立刻能感受到的变化/u);
});

test('composePublishReadyTweet falls back from inflated cold-start marketing claims to a grounded self-intro example', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    hook: '给 AI 产品冷启动写一条更像真人发的中文 tweet，重点说清为什么第一句决定读者会不会停下来',
    humanized:
      'AI 产品冷启动最容易输的，不是内容少，而是第一句还在介绍自己。 把开头从“我们用底层架构优化了效率”改成“这可能是目前唯一能自动填报销单的工具”，点击率起码差 5 倍。 如果现在就改第一句，你最想先删掉哪句自我介绍？'
  });

  assert.doesNotMatch(tweet, /底层架构优化|唯一能自动填报销单|起码差 5 倍/u);
  assert.match(tweet, /贴一段口语|周报助手|用户才知道第一步/u);
});

test('composePublishReadyTweet falls back from inflated homepage conversion claims to a grounded first-screen scene', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品首页第一屏文案怎么避免被直接滑走',
    humanized:
      'AI 产品首页第一屏最容易写废的，不是字太少，而是开头还在解释自己。 把空洞的“赋能企业数字化转型”换成“一键把 50 页 PDF 变成 3 分钟短视频”，转化率能直接翻倍。 如果现在就改第一屏，你最先删掉的是愿景、功能，还是自我介绍？'
  });

  assert.doesNotMatch(tweet, /转化率能直接翻倍/u);
  assert.match(tweet, /第一屏|滑过去了|替他省掉哪一步/u);
});

test('composePublishReadyTweet upgrades homepage first-screen support into a single-card before-after scene', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品首页第一屏文案怎么避免被直接滑走',
    humanized:
      'AI 产品首页第一屏最容易写废的，不是字太少，而是开头还在解释自己。 第一屏先写“新一代 AI 生产力平台”，访客扫完还是不知道你到底替他省掉哪一步，直接就滑过去了。 如果现在就改第一屏，你最先删掉的是愿景、功能，还是自我介绍？'
  });

  assert.match(tweet, /改前|改后|before\/after/u);
  assert.match(tweet, /新一代 AI 生产力平台/u);
  assert.doesNotMatch(tweet, /自我介绍/u);
});

test('composePublishReadyTweet rewrites cold-start product-demo scenes instead of appending a contradictory generic tail', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    humanized:
      'AI 产品冷启动最容易写废的，就是第一句还在铺介绍，没有先下判断。 做 AI 翻译，首页堆参数不如放一个巨大的输入框，让用户一秒看到结果，读者看完还是不知道这条想证明什么。 如果只能先改一个动作，你会先改哪一个？'
  });

  assert.doesNotMatch(tweet, /读者看完还是不知道这条想证明什么/u);
  assert.doesNotMatch(tweet, /输入框/u);
  assert.match(tweet, /贴一段口语|周报助手|用户才知道第一步/u);
});

test('composePublishReadyTweet rewrites cold-start translation-demo scenes away from clever-but-floaty copy', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    humanized:
      'AI 产品冷启动最容易输的，不是内容少，而是第一句还在介绍自己。 做 AI 翻译，与其复读“支持全球 100+ 语言”，不如直接展示如何把一句粤语黑话翻译得连伦敦人都觉得地道，读者看完还是不知道这条想证明什么。 如果现在就改第一句，你最想先删掉哪句自我介绍？'
  });

  assert.doesNotMatch(tweet, /支持全球 100\+ 语言|伦敦人都觉得地道|读者看完还是不知道这条想证明什么/u);
  assert.match(tweet, /译成正常中文|用户才知道|省掉哪一步|第一步怎么开始/u);
});

test('composePublishReadyTweet rewrites cold-start startup-brag scenes into a grounded user-facing example', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    humanized:
      'AI 产品冷启动最容易输的，不是内容少，而是第一句还在介绍自己。 很多团队第一条推文习惯写“我们是来自硅谷的 AI 原生团队，致力于重塑生产力”，这种废话只会让人秒划走，读者看完还是不知道这条想证明什么。 如果现在就改第一句，你最想先删掉哪句自我介绍？'
  });

  assert.doesNotMatch(tweet, /硅谷|重塑生产力|读者看完还是不知道这条想证明什么/u);
  assert.match(tweet, /用户才知道|第一步怎么开始|省掉哪一步/u);
});

test('composePublishReadyTweet stabilizes generic cold-start support lines into a real user scene', () => {
  const tweet = composePublishReadyTweet({
    focus: 'AI 产品冷启动',
    humanized:
      'AI 产品冷启动最容易输的，不是内容少，而是第一句还在介绍自己。 做提示词工具，与其在首页挂个空荡荡的对话框让用户发呆，不如直接放一个“一键把烂口语变地道周报”的成品按钮，读者看完还是不知道这条想证明什么。 如果现在就改第一句，你最想先删掉哪句自我介绍？'
  });

  assert.doesNotMatch(tweet, /空荡荡|对话框|成品按钮|烂口语变地道周报|读者看完还是不知道这条想证明什么|自我介绍/u);
  assert.match(tweet, /贴一段口语|周报|用户才知道第一步/u);
  assert.match(tweet, /如果现在只改第一句，你会先写哪个用户场景/u);
});

test('formatThreadPosts falls back to a clean user-feedback scene when quoted anecdotes become malformed', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。 ” 能引发互动的写法是直接贴截图：“救命，我用你们的 AI 给导师写信，它居然建议我加个 Emoji 显得不那么像机器人，结果导师真的回了我一个笑脸。 具体的动作只有一步：删掉所有形容词，只留动词和名词。 你最近最值得拿出来写的一句用户原话，是什么？'
  });

  assert.equal(thread.length, 4);
  assert.doesNotMatch(thread[1] ?? '', /^2\/4\n[”"]/u);
  assert.doesNotMatch(thread[1] ?? '', /Emoji|导师|笑脸/u);
  assert.doesNotMatch(thread[1] ?? '', /读者看完还是不知道这段最想证明什么/u);
  assert.match(thread[1] ?? '', /用户原话|持续优化体验/u);
});

test('formatThreadPosts avoids inflated engagement promises for user-feedback threads', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。 学会把原话直接丢出来，互动率起码翻三倍。 “针对这个废话多的问题，我们把默认输出长度缩减了 30%”，这种真实感比任何“全方位升级”都有力量。 你最近最值得拿出来写的一句用户原话，是什么？'
  });

  assert.doesNotMatch(thread[0] ?? '', /翻三倍/u);
  assert.match(thread[0] ?? '', /听见了反馈|继续往下看|原话/u);
});

test('formatThreadPosts removes latest benchmark user-feedback inflated promise and tail variants', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。把“你们的新功能不错”改成“我用这个功能少加了两天班”，回复率能从 1% 直接翻 10 倍。用户说“这功能帮我省了 3 小时，终于能陪女儿吃晚饭了”，你转发时只写“效率提升，不负期待”，读者看完还是不知道这段想证明什么。'
  });

  const joined = thread.join('\n');
  assert.doesNotMatch(joined, /1%|直接翻 10 倍|读者看完还是不知道这段想证明什么/u);
  assert.match(thread[0] ?? '', /用户原话|继续往下看|有东西可以回应/u);
  assert.match(thread[1] ?? '', /用户说|陪女儿吃晚饭|效率提升，不负期待/u);
});

test('formatThreadPosts upgrades abstract user-feedback benchmark scenes into a visible feedback quote', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。不要写“提升了 UI 易用性”，要写“之前那个藏在三级菜单的功能，现在第一屏就能点到”，结论先行，用户才知道这事儿跟他有什么关系。别急着归纳中心思想，直接抛出那个最具体的痛点判断。'
  });

  const joined = thread.join('\n');
  assert.doesNotMatch(joined, /结论先行|归纳中心思想|痛点判断/u);
  assert.match(joined, /用户原话|持续优化体验|真的听见了反馈/u);
});

test('formatThreadPosts removes focus-leaking user-feedback promises when heuristic fallback is used', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。多数人把“AI 产品怎么把用户反馈写成更容易引发回复的内容”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。用户原话是“我想知道为什么它总把重点埋掉”，这种原话比“我们持续优化体验”更容易引发回复。真正让人停下来的，不是信息更多，而是你在开头就先把判断讲清楚。'
  });

  const joined = thread.join('\n');
  assert.doesNotMatch(joined, /多数人把“AI 产品怎么把用户反馈写成更容易引发回复的内容”|真正让人停下来/u);
  assert.match(thread[0] ?? '', /用户原话|读者才有东西可以回应/u);
  assert.match(thread[2] ?? '', /第二条改成用户原话|下一版具体改/u);
});

test('formatThreadPosts repairs generic user-feedback tails and repeated action lines from benchmark output', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。 把“征求意见”改成“寻求站队”，是引发回复的最高效手段。 截图里那个错别字、那个激动的表情包，甚至是用户吐槽前代版本难用的脏话，读者看完还是不知道这段最想证明什么。 把“征求意见”改成“寻求站队”，是引发回复的最高效手段。 你最近最值得拿出来写的一句用户原话，是什么？'
  });

  assert.doesNotMatch(thread.join('\n'), /读者看完还是不知道这段最想证明什么/u);
  assert.match(thread[1] ?? '', /截图里那个错别字|真实的人话/u);
  assert.doesNotMatch(thread[2] ?? '', /征求意见|寻求站队|最高效手段/u);
  assert.match(thread[2] ?? '', /第二条改成用户原话|下一版具体改/u);
});

test('formatThreadPosts keeps the third user-feedback post as an action step instead of repeating the scene quote', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。 “针对这个废话多的问题，我们把默认输出长度缩减了 30%”，这种真实感比任何“全方位升级”都有力量。 你最近最值得拿出来写的一句用户原话，是什么？'
  });

  assert.doesNotMatch(thread[2] ?? '', /这种真实感比任何“全方位升级”都有力量/u);
  assert.match(thread[2] ?? '', /第二条改成用户原话|下一版具体改/u);
});

test('formatThreadPosts repairs stray-quote action lines in user-feedback threads back into a usable action post', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。 用户说“这功能帮我省了 3 小时，终于能陪女儿吃晚饭了”，你转发时只写“效率提升，不负期待”。 ” 把反馈当成“场景补全计划”。 你最近最值得拿出来写的一句用户原话，是什么？'
  });

  assert.doesNotMatch(thread[2] ?? '', /^3\/4\n[”"]/u);
  assert.doesNotMatch(thread[2] ?? '', /场景补全计划/u);
  assert.match(thread[2] ?? '', /第二条改成用户原话|下一版具体改/u);
});

test('formatThreadPosts repairs generic user-feedback action stubs back into a concrete action step', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。 用户原话是“我想知道为什么它总把重点埋掉”，这种原话比“我们持续优化体验”更容易引发回复。 紧接着给出一个具体的动作。 你最近最值得拿出来写的一句用户原话，是什么？'
  });

  assert.doesNotMatch(thread[2] ?? '', /紧接着给出一个具体的动作/u);
  assert.match(thread[2] ?? '', /第二条改成用户原话|下一版具体改/u);
});

test('formatThreadPosts does not append a generic “还是不知道证明什么” tail onto already-concrete feedback scenes', () => {
  const thread = formatThreadPosts({
    focus: 'AI 产品怎么把用户反馈写成更容易引发回复的内容',
    hook: '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。',
    humanized:
      '用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结。 用户说“这功能帮我省了 3 小时，终于能陪女儿吃晚饭了”，你转发时只写“效率提升，不负期待”。 你最近最值得拿出来写的一句用户原话，是什么？'
  });

  assert.doesNotMatch(thread[1] ?? '', /还是不知道这段最想证明什么/u);
  assert.match(thread[1] ?? '', /用户说|效率提升，不负期待|用户原话/u);
});

test('formatXArticleText rewrites title-like homepage leads and strips weak comment-bait from article sections', () => {
  const article = formatXArticleText({
    focus: 'AI 产品首页第一屏文案怎么避免被直接滑走',
    title: 'AI 产品首页第一屏，用户为什么会直接滑走？',
    hook: '首页第一屏最容易写废的，不是内容少，而是开头还在解释自己。',
    body: ['多数人写第一屏时为什么会把人赶走', '先给判断，再补一个摩擦场景', 'CTA 为什么不能再写成立即开始'],
    cta: '如果现在就改第一屏，你最先删掉的是愿景、功能，还是自我介绍？',
    humanized:
      'AI 产品首页第一屏，用户为什么会直接滑走？\n\n导语\n别在 AI 产品首页写“废话”：为什么用户看一眼就想关掉？\n\n一、多数人写第一屏时为什么会把人赶走\n很多 AI 产品的首页第一屏不是在获客，而是在赶客。\n\n二、先给判断，再补一个摩擦场景\n* 反例：“基于大模型的全场景智能协同办公平台。”（没人知道你要干嘛）\n* 好例子：“一键把 1 小时会议录音变成 500 字执行清单。”\n\n三、CTA 为什么不能再写成立即开始\n* 反例：按钮文字写“立即开始”或“了解详情”。\n* 动作：改成“生成我的第一张 AI 海报”。欢迎在评论区贴出你的第一屏文案，我们一起改改。\n\n结尾\n如果现在就改第一屏，你最先删掉的是愿景、功能，还是自我介绍？'
  });

  assert.match(article, /\n导语\n很多 AI 产品的首页第一屏/u);
  assert.doesNotMatch(article, /别在 AI 产品首页写“废话”/u);
  assert.doesNotMatch(article, /欢迎在评论区贴出|一起改改/u);
});

test('formatXArticleText rewrites launch-copy leads and section titles away from prompt-shaped repetition', () => {
  const article = formatXArticleText({
    focus: 'AI 产品上线文案为什么容易写成产品说明书',
    title: 'AI 产品上线文案，为什么总会写成说明书？',
    hook: '把上线文案写得像说明书，通常不是信息太少，而是第一句还在念功能。',
    body: ['多数人写“AI 产品上线文案为什么容易写成产品说明书”时，为什么第一段就失去读者', '先给判断，再补一个具体例子，读者才会继续读', '把表达动作排成稳定节奏，比等灵感更有效'],
    cta: '读完以后，你最想先改哪一步？',
    humanized:
      'AI 产品上线文案，为什么总会写成说明书？\n\n导语\n多数人把“AI 产品上线文案为什么容易写成产品说明书”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。\n\n一、多数人写“AI 产品上线文案为什么容易写成产品说明书”时，为什么第一段就失去读者\n先把背景、定位、功能和愿景一起端上来，读者还没拿到判断就已经滑走了。\n\n二、先给判断，再补一个具体例子，读者才会继续读\n比如第一句写“支持多模型、多语气、多模版”，读者只会觉得你在念功能表。\n\n三、把表达动作排成稳定节奏，比等灵感更有效\n很多团队想到什么写什么，结果上线文案越写越像说明书。\n\n结尾\n读完以后，你最想先改哪一步？'
  });

  assert.match(article, /很多 AI 产品一发上线文案/u);
  assert.doesNotMatch(article, /把“AI 产品上线文案为什么容易写成产品说明书”写得没反应/u);
  assert.doesNotMatch(article, /多数人写“AI 产品上线文案为什么容易写成产品说明书”时/u);
  assert.match(article, /多数人写上线文案时/u);
});

test('formatXArticleText uses launch-copy specific article sections instead of generic cold-start scaffolding', () => {
  const article = formatXArticleText({
    focus: 'AI 产品上线文案为什么容易写成产品说明书',
    humanized: `AI 产品上线文案，为什么总会写成说明书？

导语
很多 AI 产品一发上线文案，就急着把功能解释一遍，读者还没看到判断，就已经把它当成说明书滑过去了。

一、多数人写上线文案时，为什么第一段就会失去读者
最常见的失误是：第一段就把赛道、定位、功能和愿景一起端上来，读者还没看到判断就已经滑走了。

二、先给判断，再补一个具体例子，读者才会继续读
单有判断，读者很难判断你是不是在喊口号；一旦补一个具体场景，可信度会立刻上来。

三、把表达动作排成稳定节奏，比等灵感更有效
很多团队把内容产出交给灵感，结果每次都从空白页开始，越写越散。

结尾
读完以后，你最想先改哪一步？`
  });

  assert.match(article, /功能清单|支持多模型|说明书/u);
  assert.match(article, /以前会后要复制粘贴半小时|会议纪要/u);
  assert.doesNotMatch(article, /把表达动作排成稳定节奏，比等灵感更有效/u);
});

test('formatXArticleText uses founder-voice sections with a concrete decision scene', () => {
  const article = formatXArticleText({
    focus: '创始人口吻 产品早期为什么要先把一句判断讲透，而不是急着讲完整故事',
    humanized: `产品早期为什么要先把一句判断讲透，读者为什么会在第一行滑走？

导语
多数人把“产品早期为什么要先把一句判断讲透”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。

一、多数人写“产品早期为什么要先把一句判断讲透”时，为什么第一段就失去读者
最常见的失误是：第一段就把赛道、定位、功能和愿景一起端上来。

二、先给判断，再补一个具体例子，读者才会继续读
单有判断，读者很难判断你是不是在喊口号。

三、把表达动作排成稳定节奏，比等灵感更有效
很多团队把内容产出交给灵感，结果每次都从空白页开始。

结尾
读完以后，你最想先改哪一步？`
  });

  assert.match(article, /我|我们/u);
  assert.match(article, /早期|上线前|删掉|只留一句/u);
  assert.match(article, /真实|决策|当时/u);
  assert.doesNotMatch(article, /把表达动作排成稳定节奏，比等灵感更有效/u);
});

test('formatXArticleText uses visual-specific sections that can map to infographic assets', () => {
  const article = formatXArticleText({
    focus: 'AI 内容表达里哪些段落天然适合视觉化',
    humanized: `AI 内容表达里，哪些段落一看就适合做图？

导语
多数人把“AI 内容表达里哪些段落天然适合视觉化”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由。

一、多数人写“AI 内容表达里哪些段落天然适合视觉化”时，为什么第一段就失去读者
最常见的失误是：第一段就把赛道、定位、功能和愿景一起端上来。

二、先给判断，再补一个具体例子，读者才会继续读
单有判断，读者很难判断你是不是在喊口号。

三、把表达动作排成稳定节奏，比等灵感更有效
很多团队把内容产出交给灵感，结果每次都从空白页开始。

结尾
读完以后，你最想先改哪一步？`
  });

  assert.match(article, /Before\/After|四象限|流程图|信息图/u);
  assert.match(article, /视觉锚点|做图|卡片/u);
  assert.doesNotMatch(article, /赛道、定位、功能和愿景/u);
});

test('formatXArticleText cleans launch-copy articles that still contain markdown-heavy bullets and generic 核心展开 scaffolding', () => {
  const article = formatXArticleText({
    focus: 'AI 产品上线文案为什么容易写成产品说明书',
    humanized: `AI 产品上线文案，为什么总会写成说明书？

导语
大多数 AI 团队发布产品时，最常犯的错误就是陷入“开发者自嗨”。

一、核心展开
AI 产品文案的本质不是“能力展示”，而是“场景交付”。以下是让你的文案从没人看到疯狂转发的 3 个修正方案：。

二、丢掉“名词堆砌”，直接给“动词指引”
* **反例：** “通过先进的自然语言处理技术，实现高效、全方位的周报撰写功能。”
* **修正：** “下班前把当天的琐碎聊天记录贴给它，它会自动帮你生成一份老板挑不出刺的周报。”

结尾
💡 Takeaway：
好的 AI 上线文案不该是冷冰冰的 PDF 说明书，而是一封邀请用户“变强”的邀请函。`
  });

  assert.doesNotMatch(article, /核心展开|疯狂转发|Takeaway|\*\*/u);
  assert.match(article, /多数人写上线文案时，为什么第一段就会失去读者/u);
  assert.match(article, /下班前把当天的琐碎聊天记录贴给它/u);
});

test('formatXArticleText expands inline numbered sections instead of leaving a giant first block with duplicated later headings', () => {
  const article = formatXArticleText({
    focus: 'AI 产品上线文案为什么容易写成产品说明书',
    humanized: `AI 产品上线文案，为什么总会写成说明书？

导语
很多 AI 产品的发布文案，本质上是“自嗨式说明书”。

一、多数人写上线文案时，为什么第一段就会失去读者
一、第一段别谈愿景，先给一个“扎心”的判断大多数文案在第一段就输了，因为他们试图把赛道背景、融资信息和产品全貌塞进同一个句子。读者不需要前戏，他们需要判断。二、别只给功能清单，给一个 Before & After 的场景抽象的功能描述是读者的认知负担，具体的场景对比才是转化动力。三、放弃“全能”幻觉，一节只推进一个记忆点AI 产品最怕“既要又要”。文案结构要像剥洋葱，每一节只解决一个疑虑，并立刻补上操作建议。

二、标题要具体到某个痛点
单有判断，读者很难判断你是不是在喊口号；一旦补一个具体场景，可信度会立刻上来。

三、第一句必须是明确的价值判断
单有判断，读者很难判断你是不是在喊口号；一旦补一个具体场景，可信度会立刻上来。

结尾
读完以后，你最想先改哪一步？`
  });

  assert.doesNotMatch(article, /一、第一段别谈愿景.*二、别只给功能清单.*三、放弃“全能”幻觉/us);
  assert.match(article, /[一二三四]、别只给功能清单/u);
  assert.match(article, /[一二三四]、放弃“全能”幻觉/u);
});

test('formatXArticleText expands markdown numbered subsections from visual articles into real X article sections', () => {
  const article = formatXArticleText({
    focus: 'AI 内容表达里哪些段落天然适合视觉化',
    humanized: `AI 内容表达里，哪些段落一看就适合做图？

导语
大多数 AI 生成的内容让人读不下去，真不是逻辑有问题，而是读者的视觉注意力在密集的文字块面前瞬间崩塌了。

一、核心展开
以下是 AI 表达中最值得、也最容易被转化为视觉图表的四类黄金段落：
### 1. 涉及“层级演进”的逻辑推导
反例：只写“先给角色，再给背景，最后给约束”。具体动作：做一个 Before/After 对比图。
### 2. 包含“多维度对比”的参数选择
真实摩擦：分三段写模型优劣，读者读到最后已经忘了第一段。具体动作：制作一个四象限图。
### 3. 描述“循环往复”的反馈机制
反例：只列出步骤 1、2、3。具体动作：画一个闭环流程图。

结尾
读完以后，你最想先改哪一步？`
  });

  const sectionCount = (article.match(/(?:^|\n)[一二三四五六七八九十]、/gu) ?? []).length;
  assert.ok(sectionCount >= 3);
  assert.doesNotMatch(article, /###\s*\d+\./u);
  assert.match(article, /[一二三四]、涉及“层级演进”的逻辑推导/u);
  assert.match(article, /[一二三四]、包含“多维度对比”的参数选择/u);
  assert.match(article, /[一二三四]、描述“循环往复”的反馈机制/u);
});

test('formatXArticleText uses all-judgment blueprint instead of markdown-heavy generic article scaffolding', () => {
  const article = formatXArticleText({
    focus: 'AI 内容表达不要全是判断没有例子',
    humanized: `**AI 内容表达不要全是判断没有例子：先把判断讲清楚，再让读者继续读下去**

导语
多数人写 AI 相关内容时，第一段就失去读者，不是因为观点不深刻，而是通篇只有“应该怎样”“必须这样”的判断句。

### 一、核心展开
先把判断讲清楚。

### 二、继续讲判断
再补一个判断。

结尾
读完以后，你最想先改哪一步？`
  });

  assert.match(article, /^AI 内容写得全是判断，读者为什么还是不信？$/m);
  assert.doesNotMatch(article, /\*\*|###|核心展开/u);
  assert.match(article, /周五把 30 条用户反馈贴进去/u);
  assert.match(article, /每一节都要有一个可看见的 before\/after/u);
});

test('formatXArticleText fails over to all-judgment blueprint when model returns malformed bold headings', () => {
  const article = formatXArticleText({
    focus: 'AI 内容全是判断没有例子的 X 长文',
    title: '**',
    hook: 'AI 写的内容全是判断，读者凭什么相信你？',
    humanized: `**

导语
AI 写的内容全是判断，读者凭什么相信你？

一、纯判断只能让人点头，例子才能让人信**
单有判断，读者很难判断你是不是在喊口号；一旦补一个具体场景，可信度会立刻上来。比如把“互动低”改成“第一条同时讲定位、功能和故事，所以用户读完也记不住重点”，读者就能马上看懂问题出在哪。

二、别整节整节讲方法，每一节只给一个看得见的 bef
别整节整节讲方法，每一节只给一个看得见的 before-after。 比如先补一个真实场景或反例，读者会更容易相信这一节不是抽象口号。

三、结尾别再教育人，把球踢回他正在写的素材**
结尾别再教育人，把球踢回他正在写的素材。 比如先补一个真实场景或反例，读者会更容易相信这一节不是抽象口号。

结尾
读完以后，你最想先改哪一步？`
  });

  assert.match(article, /^AI 内容写得全是判断，读者为什么还是不信？$/m);
  assert.doesNotMatch(article, /^\*\*$/m);
  assert.doesNotMatch(article, /信\*\*|素材\*\*|\bbef\b/u);
  assert.match(article, /周五把 30 条用户反馈贴进去/u);
  assert.match(article, /你现在手上哪一段最像空判断/u);
});

test('buildDraftPayloadFallback returns clean payloads for tweet, thread and article', () => {
  const tweet = buildDraftPayloadFallback({
    format: 'tweet',
    hook: '多数人把 AI 产品冷启动写成说明书，不是缺知识，而是第一句没有先给判断。',
    body: ['先给一个明确判断', '再补一个真实例子', '最后抛出一个让人愿意回复的问题'],
    cta: '如果只能先改一个动作，你会先改哪一个？'
  });
  const thread = buildDraftPayloadFallback({
    format: 'thread',
    hook: '多数人把 AI 产品冷启动写得没反应，不是缺信息，而是第一句没有给读者停下来的理由。',
    body: ['为什么多数内容没人停下来', '先把判断讲清楚，再补一个具体例子', '最后把问题抛给读者，而不是自说自话'],
    cta: '如果只能先改一个动作，你会先改哪一个？'
  });
  const article = buildDraftPayloadFallback({
    format: 'article',
    title: 'AI 产品冷启动，不要把第一条写成产品说明书',
    hook: '冷启动最容易犯的错，不是不会写，而是一上来就想把所有信息讲完。',
    body: ['先把判断讲清楚', '再补一个真实例子', '最后把下一步动作讲明白'],
    cta: '如果你愿意，也可以把这篇再拆成 thread 版本。'
  });

  assert.ok(tweet.primaryTweet.length > 0);
  assert.ok([...tweet.primaryTweet].length <= 280);
  assert.equal(thread.thread?.length, 4);
  assert.match(article.primaryTweet, /\n\n导语\n/);
  assert.doesNotMatch(tweet.primaryTweet, /用户意图|skills/u);
});
