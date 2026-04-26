import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContentQualityGate } from '../src/modules/generate/content-quality-gate';
import { buildQualitySignalReport, formatThreadPosts } from '../src/modules/generate/content-strategy';
import type { VisualPlan } from '../src/modules/generate/visual-planning.service';

test('buildContentQualityGate fails closed on prompt leakage and prompt-shaped visual cues', () => {
  const text =
    '别再靠灵感写推文，给我一条更像真人的冷启动判断句。 第一条还在写“别再靠灵感写推文”这种自我介绍，读者扫完整条还是不知道你到底想证明什么。 如果只能先改一个动作，你会先改哪一个？';
  const visualPlan: VisualPlan = {
    primaryAsset: 'cover',
    visualizablePoints: ['给我一条更像真人的冷启动判断句。'],
    keywords: ['给我一条', '冷启动'],
    items: [
      {
        kind: 'cover',
        priority: 'primary',
        type: 'single-card',
        layout: 'centered',
        style: 'editorial',
        palette: 'slate',
        cue: '给我一条更像真人的冷启动判断句。',
        reason: '复读 prompt'
      }
    ]
  };

  const gate = buildContentQualityGate({
    format: 'tweet',
    focus: '推文写作冷启动',
    text,
    qualitySignals: buildQualitySignalReport(text, 'tweet'),
    visualPlan
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('prompt_leakage'));
  assert.ok(gate.hardFails.includes('visual_prompt_leakage'));
  assert.equal(gate.safeToDisplay, false);
});

test('buildContentQualityGate accepts SkillTrust risk education that mentions prompt as the topic', () => {
  const text = [
    '1/5\nAI skill 不是 prompt 文案。\n更准确地说，它可能是一个能被 Agent 调用的工作流入口。',
    '2/5\nPrompt 主要影响输出；skill 可能影响执行：读文件、跑命令、联网、调用 API、要求 token。风险边界完全不是一回事。',
    '3/5\n所以安装前先问 5 件事：来源是谁、装了什么、能碰哪些文件、会不会联网、要不要长期凭据。',
    '4/5\nSkillTrust 的价值不是替你保证安全，而是把这些证据放到同一页，降低你安装前的判断成本。',
    '5/5\n评论区丢一个 Skill 链接或描述，我挑几个做公开审计。'
  ].join('\n\n');
  const visualPlan: VisualPlan = {
    primaryAsset: 'cards',
    visualizablePoints: ['AI skill 不是 prompt 文案', '安装前 5 问'],
    keywords: ['prompt 文案', '工作流入口', 'token'],
    items: [
      {
        kind: 'cards',
        priority: 'primary',
        type: 'series',
        layout: 'flow',
        style: 'blueprint',
        palette: 'slate',
        cue: 'AI skill 不是 prompt 文案',
        reason: '解释 prompt 与 skill 执行边界不同'
      }
    ]
  };

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: 'AI skill 不是 prompt 文案',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread'),
    visualPlan
  });

  assert.equal(gate.status, 'passed');
  assert.equal(gate.safeToDisplay, true);
  assert.doesNotMatch(gate.hardFails.join(','), /prompt_leakage/u);
});

test('buildContentQualityGate accepts SkillTrust workflow third card as an action step', () => {
  const text = [
    '1/5\n看到一个很香的 AI skill，我现在不会先点安装。\n我会先走 SkillTrust 的 5 步：搜来源、看命令、查权限、比证据、再人工决定。',
    '2/5\n第一步看来源：作者是谁、仓库是否公开、最近有没有维护。来源不清，功能越诱人越要慢一点。',
    '3/5\n第二步看执行边界：install 命令、文件读写、联网外传、token/凭据。这里决定它只是辅助，还是已经能影响你的环境。',
    '4/5\n第三步才比较功能。不是“能不能用”，而是证据够不够、风险能不能接受、要不要先沙箱试。',
    '5/5\n评论区丢一个 Skill 链接或描述，我挑几个做公开审计。'
  ].join('\n\n');

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: '工作流方法：从发现到人工决定',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread')
  });

  assert.equal(gate.status, 'passed');
  assert.equal(gate.safeToDisplay, true);
  assert.doesNotMatch(gate.hardFails.join(','), /thread_third_post_not_action/u);
});

test('buildContentQualityGate fails closed on malformed article markdown and dirty visual cues', () => {
  const text = `**

导语
AI 写的内容全是判断，读者凭什么相信你？

一、纯判断只能让人点头，例子才能让人信**
单有判断，读者很难判断你是不是在喊口号；一旦补一个具体场景，可信度会立刻上来。比如把“互动低”改成“第一条同时讲定位、功能和故事，所以用户读完也记不住重点”，读者就能马上看懂问题出在哪。

二、别整节整节讲方法，每一节只给一个看得见的 bef
别整节整节讲方法，每一节只给一个看得见的 before-after。 比如先补一个真实场景或反例，读者会更容易相信这一节不是抽象口号。

三、结尾别再教育人，把球踢回他正在写的素材**
结尾别再教育人，把球踢回他正在写的素材。 比如先补一个真实场景或反例，读者会更容易相信这一节不是抽象口号。

结尾
读完以后，你最想先改哪一步？`;

  const visualPlan: VisualPlan = {
    primaryAsset: 'cover',
    visualizablePoints: ['**\n\n导语\nAI 写的内容全是判断，读者凭什么相信你？'],
    keywords: ['别整节整节讲方法', 'bef'],
    items: [
      {
        kind: 'cover',
        priority: 'primary',
        type: 'editorial-cover',
        layout: 'article-cover',
        style: 'magazine',
        palette: 'neutral',
        cue: '** 导语 AI 写的内容全是判断，读者凭什么相信你？',
        reason: '标题 cue 仍带 markdown 残片'
      }
    ]
  };

  const gate = buildContentQualityGate({
    format: 'article',
    focus: 'AI 内容全是判断没有例子的 X 长文',
    text,
    qualitySignals: buildQualitySignalReport(text, 'article'),
    visualPlan
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('article_malformed_markdown'));
  assert.ok(gate.hardFails.includes('visual_malformed_cue'));
  assert.equal(gate.safeToDisplay, false);
});

test('buildContentQualityGate fails source-ready articles that leak markdown front matter metadata', () => {
  const text = `取代龙虾的是爱马仕，先别写成空泛资讯

导语
这条来源可以写，但第一屏必须先把事实放稳：requestedUrl: "https://tech.ifeng.com/c/8sDHJq3vKxM" 把 最新 Hermes Agent 放进文章时，重点不是抢“最新”两个字，而是说明它改变了哪个具体判断。

一、先把来源里的具体事实放到第一屏
读者需要先知道这条来源到底发生了什么。比起直接下判断，更稳的写法是先给出来源里的动作和对象：coverImage: "https://x0.ifengimg.com/example.jpg" 这样文章不是在复述标题，而是在帮读者判断这件事为什么值得停一下。

二、再解释它改变了哪个具体场景
如果只说“影响很大”，文章会变成空判断。更有效的方式，是把之前和现在拆开：之前用户、团队或读者需要怎样完成这件事，现在这条来源让哪一步变短、变清楚，或者变得更有争议。这里可用的支撑句是：summary: "取代龙虾的是爱马仕？"

三、最后收束成一个可讨论的问题
这类最新内容不适合用口号结尾。结尾应该把读者拉回一个具体选择：他们更关心这条变化带来的效率提升、成本变化，还是长期风险。图文拆分也应该用来源里的 before/after。

结尾
你更关心它带来的效率变化，还是它背后的长期风险？`;

  const gate = buildContentQualityGate({
    format: 'article',
    focus: '最新 Hermes Agent',
    text,
    qualitySignals: buildQualitySignalReport(text, 'article'),
    sourceRequired: true,
    sourceStatus: 'ready'
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('source_metadata_leakage'));
});

test('buildContentQualityGate fails source-ready articles that expose writing-process scaffolding', () => {
  const text = `取代龙虾的是爱马仕，先别写成空泛资讯

导语
这条来源可以写，但第一屏必须先把事实放稳：2026年04月10日 17:18:07 来自北京 把 最新 Hermes Agent 放进文章时，重点不是抢“最新”两个字，而是说明它改变了哪个具体判断。

一、先把来源里的具体事实放到第一屏
读者需要先知道这条来源到底发生了什么。比起直接下判断，更稳的写法是先给出来源里的动作和对象：在之前那篇讨论 Harness 该怎么翻译的文章，有读者留言说可以叫 Hermes 爱马仕。

二、再解释它改变了哪个具体场景
如果只说“影响很大”，文章会变成空判断。更有效的方式，是把之前和现在拆开：之前用户、团队或读者需要怎样完成这件事，现在这条来源让哪一步变短、变清楚，或者变得更有争议。

三、最后收束成一个可讨论的问题
这类最新内容不适合用口号结尾。结尾应该把读者拉回一个具体选择：他们更关心这条变化带来的效率提升、成本变化，还是长期风险。

结尾
读完以后，你最想先改哪一步？`;

  const gate = buildContentQualityGate({
    format: 'article',
    focus: '最新 Hermes Agent',
    text,
    qualitySignals: buildQualitySignalReport(text, 'article'),
    sourceRequired: true,
    sourceStatus: 'ready'
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('article_generic_scaffold'));
  assert.match(gate.userMessage ?? '', /内容还像大纲|写作过程/u);
  assert.equal(gate.recoveryAction, 'retry');
});

test('buildContentQualityGate allows grounded text and visual cues', () => {
  const text =
    '内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。比如周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。如果团队内容流程只能先固定一步，你会先固定哪一步？';
  const visualPlan: VisualPlan = {
    primaryAsset: 'cover',
    visualizablePoints: ['周一谁都在等灵感，周三还没发。'],
    keywords: ['周一', '周三', '内容流程'],
    items: [
      {
        kind: 'cover',
        priority: 'primary',
        type: 'single-card',
        layout: 'before-after',
        style: 'editorial',
        palette: 'slate',
        cue: '周一谁都在等灵感，周三还没发。',
        reason: '真实团队节奏摩擦'
      }
    ]
  };

  const gate = buildContentQualityGate({
    format: 'tweet',
    focus: '推文写作冷启动',
    text,
    qualitySignals: buildQualitySignalReport(text, 'tweet'),
    visualPlan
  });

  assert.equal(gate.status, 'passed');
  assert.equal(gate.safeToDisplay, true);
  assert.equal(gate.hardFails.length, 0);
});

test('buildContentQualityGate rejects source metadata leakage for tweets too', () => {
  const text =
    'Example Domain 可以安全拿来测试抓取链路。比如文档里只需要一个公开示例页，就不用把真实业务 URL 放进去。URL: https://example.com/';

  const gate = buildContentQualityGate({
    format: 'tweet',
    focus: 'Example Domain',
    text,
    qualitySignals: buildQualitySignalReport(text, 'tweet'),
    sourceRequired: true,
    sourceStatus: 'ready'
  });

  assert.equal(gate.status, 'failed');
  assert.equal(gate.safeToDisplay, false);
  assert.ok(gate.hardFails.includes('source_metadata_leakage'));
  assert.match(gate.userMessage ?? '', /来源元数据/u);
});

test('buildContentQualityGate allows diagram-intent tweet prompts without missing_scene hard fail', () => {
  const text =
    '把发布流程画成流程图：运营同学先写一句话，系统依次做来源核验、正文草拟、图文生成，最后由你手动确认是否发布。';
  const visualPlan: VisualPlan = {
    primaryAsset: 'diagram',
    visualizablePoints: ['输入→来源→正文→图文→确认'],
    keywords: ['流程图', '运营同学', '手动确认'],
    items: [
      {
        kind: 'diagram',
        priority: 'primary',
        type: 'process-diagram',
        layout: 'flow',
        style: '蓝图流程图',
        palette: 'draftorbit',
        cue: '输入→来源→正文→图文→确认',
        reason: '用户明确要求流程图'
      }
    ]
  };

  const gate = buildContentQualityGate({
    format: 'tweet',
    focus: 'DraftOrbit 发布流程图',
    text,
    qualitySignals: buildQualitySignalReport(text, 'tweet'),
    visualPlan
  });

  assert.equal(gate.status, 'passed');
  assert.equal(gate.safeToDisplay, true);
  assert.equal(gate.hardFails.includes('missing_scene'), false);
});

test('buildContentQualityGate treats source failures as fail-closed recoverable states', () => {
  const text = `Hermes 这次更新值得写成一篇长文。

一、先确认读者到底在看哪个 Hermes
比如同一个词可能指奢侈品牌，也可能指 AI 模型；不抓来源就直接写，会把读者带到错误实体上。

二、把来源先落成 markdown 再写
具体动作是先抓到发布页、说明页或新闻页，再把文案里的判断绑定到来源事实。

三、没有来源就不要假装知道最新事实
这不是写慢一点，而是避免把“最新”写成幻觉。`;

  const gate = buildContentQualityGate({
    format: 'article',
    focus: 'Hermes 最新内容',
    text,
    qualitySignals: buildQualitySignalReport(text, 'article'),
    sourceRequired: true,
    sourceStatus: 'ambiguous',
    sourceHardFails: ['source_ambiguous']
  });

  assert.equal(gate.status, 'failed');
  assert.equal(gate.safeToDisplay, false);
  assert.equal(gate.sourceRequired, true);
  assert.equal(gate.sourceStatus, 'ambiguous');
  assert.ok(gate.hardFails.includes('source_ambiguous'));
  assert.match(gate.judgeNotes.join('\n'), /可靠来源|不能编造最新事实/u);
});

test('buildContentQualityGate fails thread cards that repeat hype copy instead of advancing', () => {
  const text = [
    '1/4\n内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。\n我见过最狠的团队，把这个死循环彻底干掉了，效率直接起飞，值得你继续往下看。',
    '2/4\n我见过最狠的团队，把这个死循环彻底干掉了，效率直接起飞，值得你继续往下看，读者看完还是不知道这段最想证明什么。',
    '3/4\n核心变化只有一点：把“选题”从灵感事件变成固定动作。',
    '4/4\n如果团队内容流程只能先固定一步，你会先固定哪一步？'
  ].join('\n\n');

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: '内容团队工作流',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread')
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('thread_hype_repeated'));
});

test('buildContentQualityGate fails thread cards that start with a stray closing quote', () => {
  const text = [
    '1/4\n一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。\n你愿意继续看，是因为想知道这次功能到底替你省掉哪一步。',
    '2/4\n比如这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景。',
    '3/4\n”\n\n现在第一屏直接给他预置了 6 个他所在行业的真实场景，他连想都不用想就能往下走。',
    '4/4\n如果这次上线只能先讲一个场景，你会先讲哪一个？'
  ].join('\n\n');

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: 'AI 产品新功能上线',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread')
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('thread_stray_quote'));
});

test('buildContentQualityGate fails thread cards with leftover markdown labels', () => {
  const text = [
    '1/4\n内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。',
    '2/4\n比如周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。',
    '3/4\n**3/4**\n我带过的三个 AI 内容团队，只要把“第一段必须先甩判断”定成周会前强制动作，改稿次数减少一半。',
    '4/4\n如果团队内容流程只能先固定一步，你会先固定哪一步？'
  ].join('\n\n');

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: '内容团队工作流',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread')
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('thread_markdown_artifact'));
});

test('buildContentQualityGate fails thread cards when the third card is another close question', () => {
  const text = [
    '1/4\n一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。\n你愿意继续看，是因为想知道这次功能到底替你省掉哪一步。',
    '2/4\n这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景。',
    '3/4\n如果你只能让这个功能先解决你工作里的一个具体场景，你现在最想让它干掉的是哪一个？',
    '4/4\n如果这次上线只能先讲一个场景，你会先讲哪一个？'
  ].join('\n\n');

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: 'AI 产品新功能上线',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread')
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('thread_third_post_not_action'));
});

test('buildContentQualityGate fails thread cards when the third card talks about the third card itself', () => {
  const text = [
    '1/4\n一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。\n你愿意继续看，是因为想知道这次功能到底替你省掉哪一步。',
    '2/4\n这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景。',
    '3/4\n我会把第三条只留成一个动作：先讲一个最值得记住的使用场景，再决定要不要补第二个细节，别一上来就列功能。',
    '4/4\n如果这次上线只能先讲一个场景，你会先讲哪一个？'
  ].join('\n\n');

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: 'AI 产品新功能上线',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread')
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('thread_third_post_not_action'));
});

test('buildContentQualityGate fails advice-template phrasing in the third thread card', () => {
  const text = [
    '1/4\nAI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景。\n只改开头这一处，读者继续读下去的概率就会明显不一样。',
    '2/4\n做周报助手，别先写“AI 写作平台”，直接写“贴一段口语，我帮你改成能发给老板的周报”，用户才知道第一步该怎么用。',
    '3/4\n更有效的写法是：把第一句改成“贴一段口语→生成能发给老板的周报”这种真实场景 before/after，让读者知道第一步该怎么用。',
    '4/4\n如果现在只改第一句，你会先写哪个用户场景？'
  ].join('\n\n');

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: 'AI 产品冷启动',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread')
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('thread_third_post_not_action'));
});

test('buildContentQualityGate fails thread visual cues that still carry card numbers', () => {
  const text = formatThreadPosts({
    focus: 'AI 产品新功能上线',
    hook: '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
    humanized: ''
  }).join('\n\n');

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: 'AI 产品新功能上线',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread'),
    visualPlan: {
      primaryAsset: 'cover',
      visualizablePoints: ['1/4 一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。'],
      keywords: [],
      items: [
        {
          kind: 'cover',
          priority: 'primary',
          type: 'before-after',
          layout: 'split',
          style: 'editorial',
          palette: 'slate',
          cue: '2/4 昨晚录一段语音，今天早上它已经帮你整理好跟进清单。',
          reason: 'card label should be stripped before visual prompting'
        }
      ]
    }
  });

  assert.equal(gate.status, 'failed');
  assert.ok(gate.hardFails.includes('visual_malformed_cue'));
});

test('buildContentQualityGate allows product feature thread fallback with concrete scene and action', () => {
  const text = formatThreadPosts({
    focus: 'AI 产品新功能上线',
    hook: '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
    humanized: ''
  }).join('\n\n');

  const gate = buildContentQualityGate({
    format: 'thread',
    focus: 'AI 产品新功能上线',
    text,
    qualitySignals: buildQualitySignalReport(text, 'thread')
  });

  assert.equal(text.match(/(?:^|\n)\d+\/\d+(?=\n)/gu)?.length, 4);
  assert.doesNotMatch(text, /读者看完还是不知道这(?:条|段)(?:最)?想证明什么/u);
  assert.doesNotMatch(text, /第三条|第\s*3\s*条/u);
  assert.match(text, /录一段语音|跟进清单|使用场景|省掉哪一步/u);
  assert.equal(gate.status, 'passed');
  assert.equal(gate.safeToDisplay, true);
});
