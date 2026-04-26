export type ContentFormat = 'tweet' | 'thread' | 'article';

export type HistoricalPostInput = {
  text: string;
  public_metrics?: Record<string, number | undefined> | null;
  created_at?: string | null;
};

export type HighPerformingExample = {
  text: string;
  score: number;
  hook: string;
  closing: string | null;
};

export type ContentStrategyContext = {
  intent: string;
  focus: string;
  format: ContentFormat;
  language: string;
  growthGoal: 'native_engagement';
  stylePriority: 'effect_first';
  voiceSummary: string | null;
  highPerformingExamples: HighPerformingExample[];
  hookPatterns: string[];
  ctaPatterns: string[];
  openingPatterns: string[];
  evidencePatterns: string[];
  formatPreferences: string[];
  antiPatterns: string[];
  platformRules: string[];
  sourceCorpusRefs: string[];
};

export type StrategySignals = {
  hookStrength: number;
  specificity: number;
  evidence: number;
  conversationality: number;
  ctaNaturalness: number;
  antiPatternPenalty: number;
};

export type QualitySignalReport = StrategySignals & {
  humanLikeness: number;
  structuralReadability: number;
  visualizability: number;
  derivativeReadiness: number;
};

const META_STOP_WORDS = new Set([
  '用户意图',
  '输出形式',
  '需要配图',
  '自动完成',
  '用户风格摘要',
  '已连接证据',
  'draftorbit',
  'operator',
  'hook',
  'thread',
  'cta',
  'title',
  'body',
  'article',
  'tweet',
  'yes',
  'no',
  '目标',
  '受众'
]);

const WEAK_CTA_PATTERNS = [/欢迎留言讨论/u, /欢迎交流/u, /留言我给你建议/u, /点赞关注/u, /评论区见/u, /需要.*扣1/u];
const TEMPLATE_CLICHE_PATTERNS = [
  /流程太散/u,
  /把流程跑顺才是增长关键/u,
  /你不是缺工具/u,
  /互动质量通常会明显改善/u,
  /很多账号发不起来/u
];

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function stripFormatSuffix(text: string): string {
  return text
    .replace(/https?:\/\/\S+/giu, '')
    .replace(/[：:]\s*$/u, '')
    .replace(/适合\s*X\s*平台?(文章格式)?的?(长文|文章|发布文案)?/giu, '')
    .replace(/重点说明为什么.*$/u, '')
    .replace(/的?\s*中文\s*X(?=\s*(文章|长文|发布文案)?$)/giu, '')
    .replace(/的?\s*X\s*(?:短推|串推|长文|文章|发布文案)$/giu, '')
    .replace(/的?\s*中文\s*(文章|长文|发布文案)$/giu, '')
    .replace(/的?\s*中文(?=(推文|短推|串推|thread|长文|文章|发布文案)?$)/giu, '')
    .replace(/的?\s*(中文推文|中文短推|中文串推|中文thread|中文长文|中文文章)$/giu, '')
    .replace(/的?(观点)?(推文|短推)$/giu, '')
    .replace(/的?\s*观点$/giu, '')
    .replace(/的?\s*(推文|短推)$/giu, '')
    .replace(/的?(观点)?(短推|串推|长文|文章|发布文案)$/u, '')
    .replace(/的?\s*(tweet|thread|article)$/iu, '')
    .replace(/[：:]\s*$/u, '')
    .trim();
}

function normalizeWriteAsSubject(text: string): string {
  const subject = stripFormatSuffix(text)
    .replace(/^(一个|一条|一篇|这个|这条|这篇)\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim();

  if (/AI 产品新功能/u.test(subject) && !/上线/u.test(subject)) {
    return `${subject}上线`;
  }

  return subject;
}

export function extractIntentFromPrompt(prompt: string): string {
  const matched = prompt.match(/^用户意图：(.*)$/m)?.[1]?.trim();
  return matched && matched.length > 0 ? matched : prompt.trim();
}

export function isPromptWrapperInstruction(text = ''): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return /(^|\b)(用户意图|输出形式|需要配图|自动完成|prompt|hook prompt|cta prompt)(\b|[:：])/iu.test(normalized) ||
    /(给我一条|更像真人|冷启动判断句|写推文|写一条|写一个|写一篇|输出一条|中文推文|中文串推|中文长文|写成\s*(?:thread|串推|长文|文章))/iu.test(
      normalized
    );
}

function isWritingColdStartPrompt(intent = ''): boolean {
  return /(别再靠灵感写推文|推文写作冷启动|冷启动判断句)/u.test(intent);
}

export function extractIntentFocus(prompt: string): string {
  const intent = extractIntentFromPrompt(prompt)
    .replace(/https?:\/\/\S+/giu, '')
    .replace(/[：:]\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (isWritingColdStartPrompt(intent)) {
    return '推文写作冷启动';
  }

  const projectTopic = intent.match(/^本次运营主题[：:]\s*([^\n。！？；]+)/u)?.[1]?.trim();
  if (projectTopic) {
    return stripFormatSuffix(projectTopic) || projectTopic;
  }

  const inspirationSubject = intent.match(/^别再靠灵感写\s*([^，。！？；\n]+)/u)?.[1]?.trim();
  if (inspirationSubject) {
    return stripFormatSuffix(inspirationSubject) || inspirationSubject;
  }

  const quotedAbout = intent.match(/关于\s*[“"]([^”"]+)[”"]/u)?.[1];
  if (quotedAbout) {
    return stripFormatSuffix(quotedAbout) || intent;
  }

  const about = intent.match(/关于\s*([^，。！？；\n]+)/u)?.[1];
  if (about) {
    return stripFormatSuffix(about) || intent;
  }

  const around = intent.match(/^围绕\s*([^，。！？；\n]+)/u)?.[1];
  if (around) {
    return stripFormatSuffix(around) || intent;
  }

  const theme = intent.match(/主题是\s*([^，。！？；\n]+)/u)?.[1];
  if (theme) {
    return stripFormatSuffix(theme) || intent;
  }

  const writeAs = intent.match(/^把(.+?)写成\s*(?:\d+\s*条\s*)?(?:一条|一个|一篇|适合|像|thread|串推|短推|推文|长文|文章|中文)/u)?.[1];
  if (writeAs) {
    return normalizeWriteAsSubject(writeAs) || intent;
  }

  const transform = intent.match(/把(.+?)整理成/u)?.[1];
  if (transform) {
    return stripFormatSuffix(transform) || intent;
  }

  const talk = intent.match(/(?:写一条|写一个|写一篇|做一条|做一个)[^，。！？；\n]*[，,]\s*讲\s*([^，。！？；\n]+)/u)?.[1];
  if (talk) {
    return stripFormatSuffix(talk) || intent;
  }

  const normalized = stripFormatSuffix(
    intent
      .replace(/^(帮我|请|给我|麻烦)\s*/u, '')
      .replace(/^参考我最近的风格[，,]?\s*/u, '')
      .replace(/^围绕\s*/u, '')
      .replace(/^更容易引发讨论的\s*thread[，,]?\s*主题是\s*/iu, '')
      .replace(/^(写一条|发一条|写一篇|写个|整理成一条|整理成|输出一条|做一条)\s*/u, '')
      .replace(/[，,]\s*写一篇.*$/u, '')
  );

  return normalized || intent;
}

export function extractTopKeywords(input: string, max = 8): string[] {
  const tokens = (input.match(/[\p{L}\p{N}_-]{2,}/gu) ?? [])
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const stopWords = new Set([
    '这个',
    '那个',
    '我们',
    '你们',
    '他们',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'the'
  ]);

  const counter = new Map<string, number>();
  for (const token of tokens) {
    if (stopWords.has(token) || META_STOP_WORDS.has(token)) continue;
    counter.set(token, (counter.get(token) ?? 0) + 1);
  }

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([token]) => token);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])\s*/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ensureSentenceEnding(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[。！？!?]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function normalizeSectionTitle(value: string): string {
  return value
    .replace(/^\d+[.、]\s*/u, '')
    .replace(/^[一二三四五六七八九十]+[、.．]\s*/u, '')
    .replace(/[。！？；：]+$/u, '')
    .trim();
}

function isWeakArticleParagraph(section: string, paragraph: string): boolean {
  const normalized = paragraph.trim();
  if (!normalized) return true;
  if (/先把“.+”说具体/u.test(normalized)) return true;
  if (/关键策略。?$/u.test(normalized)) return true;
  if ([...normalized].length < 52) return true;
  if (/[💡⭐🔥]|Takeaway|疯狂转发/u.test(normalized)) return true;
  if (/读者需要马上理解你的判断/u.test(normalized)) return true;
  if (/结尾别停在口号上/u.test(normalized)) return true;
  if ((/例子|判断|动作|节奏/u.test(section) || /为什么|失去读者/u.test(section)) && !hasExampleSignal(normalized)) {
    return true;
  }
  return false;
}

function hasExampleSignal(text: string): boolean {
  return /(比如|例如|我会直接写|用户原话|最常见的场景|真实场景|before\/after|反例|一次|我见过|常见情况|拿.*来说|以前.+现在)/u.test(text);
}

function buildArticleSectionSupport(section: string): string {
  if (/为什么|失去读者|没人停下来/u.test(section)) {
    return '比如最常见的场景是：开头先交代背景、定位和愿景，结果读者还没看到判断就已经滑走了。';
  }
  if (/例子|具体|判断/u.test(section)) {
    return '比如把“互动低”改写成“第一条同时讲定位、功能和故事”，读者会更快理解这个判断到底落在什么场景。';
  }
  if (/节奏|动作|灵感|有效/u.test(section)) {
    return '最常见的场景是：想到什么写什么，结果每次都从头起草；一旦固定成“判断→例子→问题”的节奏，内容就更容易稳定。';
  }
  return '比如先补一个真实场景或反例，读者会更容易相信这一节不是抽象口号。';
}

function hasDanglingQuote(text: string): boolean {
  const doubleQuotes = (text.match(/"/g) ?? []).length;
  const leftCn = (text.match(/“/g) ?? []).length;
  const rightCn = (text.match(/”/g) ?? []).length;
  return doubleQuotes === 1 || leftCn !== rightCn;
}

function extractDanglingQuoteLead(text: string): string | null {
  const snippet =
    text.match(/[“"]([^"”——\-，。！？?\n]{4,36})/u)?.[1]?.trim() ||
    text.match(/[“"]([^"”]{4,36})/u)?.[1]?.split(/[——\-，。！？?]/u)[0]?.trim() ||
    null;
  return snippet ? snippet.replace(/\s+/g, ' ').trim() : null;
}

function buildArticleSectionParagraph(section: string, baseParagraph: string): string {
  const trimmed = ensureSentenceEnding(
    baseParagraph
      .replace(/\*\*\s*/g, '')
      .replace(/\s*\*\*/g, '')
      .replace(/^\*\s*/gmu, '')
      .replace(/[💡⭐🔥]\s*/gu, '')
      .replace(/^Takeaway[:：]?\s*/gimu, '')
      .replace(/欢迎在评论区贴出[^。！？!?]*[。！？!?]?/gu, '')
      .replace(/欢迎在评论区[^。！？!?]*[。！？!?]?/gu, '')
      .replace(/评论区见[。！？!?]?/gu, '')
      .replace(/我们一起改改[。！？!?]?/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
  if (!isWeakArticleParagraph(section, trimmed)) {
    return trimmed;
  }

  if (/为什么|失去读者|没人停下来/u.test(section)) {
    return '最常见的失误是：第一段就把赛道、定位、功能和愿景一起端上来，读者还没看到判断就已经滑走了。更有效的写法是先讲一句明确判断，比如“第一条别讲全，只证明一个价值点”，让读者先知道这篇到底要解决什么问题。';
  }

  if (/例子|具体|判断/u.test(section)) {
    return '单有判断，读者很难判断你是不是在喊口号；一旦补一个具体场景，可信度会立刻上来。比如把“互动低”改成“第一条同时讲定位、功能和故事，所以用户读完也记不住重点”，读者就能马上看懂问题出在哪。';
  }

  if (/节奏|动作|灵感|有效/u.test(section)) {
    return '很多团队把内容产出交给灵感，结果每次都从空白页开始，越写越散。更稳的做法是固定成“先判断、再举例、最后抛问题”的节奏，这样不仅更容易写，也更容易让读者跟上你的思路。';
  }

  return `${trimmed} ${buildArticleSectionSupport(section)}`.trim();
}

type ArticleBlueprint = {
  title: string;
  lead: string;
  sections: Array<{ title: string; body: string }>;
  ending: string;
};

function renderArticleBlueprint(blueprint: ArticleBlueprint): string {
  const numerals = ['一', '二', '三', '四', '五'];
  const blocks: string[] = [blueprint.title, '', '导语', blueprint.lead];
  blueprint.sections.forEach((section, index) => {
    blocks.push('', `${numerals[index] ?? `${index + 1}`}、${section.title}`, section.body);
  });
  blocks.push('', '结尾', blueprint.ending);
  return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function looksLikeGenericArticleScaffold(text: string, focus = ''): boolean {
  const cleaned = sanitizeGeneratedText(text, 'article');
  if (/(AI 产品冷启动)/u.test(focus)) return false;
  return (
    /赛道、定位、功能和愿景/u.test(cleaned) ||
    /把表达动作排成稳定节奏，比等灵感更有效/u.test(cleaned) ||
    /多数人把“[^”]+”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由/u.test(cleaned)
  );
}

function normalizeArticleRepeatKey(value: string): string {
  return sanitizeGeneratedText(value, 'article')
    .replace(/^\s*[一二三四五六七八九十]+[、.]\s*/u, '')
    .replace(/[*#_`>\s"'“”‘’。！？!?，,；;：:、.-]/gu, '')
    .trim();
}

function hasRepeatedArticleHeadingBody(text: string): boolean {
  const sections = text
    .split(/(?=^[一二三四五六七八九十]+[、.])/gmu)
    .map((block) => block.trim())
    .filter((block) => /^[一二三四五六七八九十]+[、.]/u.test(block));

  for (const section of sections) {
    const [heading = '', ...bodyLines] = section.split(/\n+/u).map((line) => line.trim()).filter(Boolean);
    const headingKey = normalizeArticleRepeatKey(heading);
    const bodyKey = normalizeArticleRepeatKey(bodyLines.join(' '));
    if (headingKey.length >= 10 && bodyKey.startsWith(headingKey)) return true;
  }

  return false;
}

function looksLikeMalformedArticleOutput(text: string): boolean {
  const cleaned = sanitizeGeneratedText(text, 'article');
  if (!cleaned) return false;
  return (
    /(?:^|\n)\s*\*{1,3}\s*(?:\n|$)/u.test(cleaned) ||
    /(?:^|\n)[一二三四五六七八九十]+[、.][^\n]{1,80}\*{2}\s*(?:\n|$)/u.test(cleaned) ||
    /(?:^|\n)[一二三四五六七八九十]+[、.][^\n]*\bbef\s*(?:\n|$)/u.test(cleaned) ||
    (/\*{2}|\bbef\b/u.test(cleaned) && hasRepeatedArticleHeadingBody(cleaned))
  );
}

function buildFocusArticleBlueprint(focus = ''): ArticleBlueprint | null {
  if (/AI 产品冷启动/u.test(focus)) {
    return {
      title: 'AI 产品冷启动，为什么第一句总让读者直接滑走？',
      lead:
        '很多 AI 产品冷启动卡住，不是因为没人看见，而是第一句还没给读者一个值得停下来的判断。',
      sections: [
        {
          title: '第一句先下判断，读者才知道这条值不值得读',
          body:
            '坏例子是“我们做了一个 AI 写作平台，支持多种模板”。读者看到这里，只知道你有功能，不知道它和自己有什么关系。更自然的写法，是先说“AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景”，判断先出来，读者才愿意继续看例子。'
        },
        {
          title: '例子要落到一个真实动作，不要停在产品定位',
          body:
            '比如做周报助手，别先写“AI 写作平台”。直接写“贴一段口语，我帮你改成能发给老板的周报”，读者会马上知道第一步怎么用。这个场景比“提升写作效率”更容易被记住，也更适合后续拆成图卡。'
        },
        {
          title: '最后给一个能接住的动作或问题',
          body:
            '冷启动内容最怕结尾变成一句空泛互动提醒。更自然的收束，是问一个具体选择：如果现在只改第一句，你会先写哪个用户场景？这个问题会把读者拉回自己的产品，而不是让他评价一句空口号。'
        }
      ],
      ending: '如果现在只改第一句，你会先写哪个用户场景？'
    };
  }

  if (/上线文案.*说明书/u.test(focus)) {
    return {
      title: 'AI 产品上线文案，为什么总会写成说明书？',
      lead: '很多 AI 产品一发上线文案，就急着把功能解释一遍，读者还没看到判断，就已经把它当成说明书滑过去了。',
      sections: [
        {
          title: '多数人写上线文案时，为什么第一段就会失去读者',
          body:
            '坏例子是“支持多模型、多语气、多模版”，读者只会觉得你在念功能清单。更自然的写法，是先讲一个用户摩擦：下班前把当天的琐碎聊天记录贴给它，它会自动帮你生成一份老板挑不出刺的周报，读者立刻知道这次更新省了哪一步。'
        },
        {
          title: '把更新点写成 before/after，而不是功能列表',
          body:
            '同样是上线一个整理功能，“新增会议纪要模块”很像说明书；“以前你要在聊天记录里翻 20 分钟，现在它直接给你三条待办”就有场景。读者看到 before/after，才知道这不是抽象能力，而是今天能少做的一步。'
        },
        {
          title: '最后只留一个用户能接住的问题',
          body:
            '上线文案最怕结尾变成“欢迎体验新版”。更自然的收束，是问一个跟场景有关的问题：如果今天这条更新只能保留一句，你会先留下哪一句？这样读者不是在读公告，而是在对照自己的使用摩擦。'
        }
      ],
      ending: '如果今天这条更新只能保留一句，你会先留下哪一句？'
    };
  }

  if (/AI 写作产品.*说明书|写作产品为什么容易.*说明书|容易把内容写成说明书/u.test(focus)) {
    return {
      title: 'AI 写作产品，为什么一开口就像说明书？',
      lead:
        'AI 写作产品最容易写废的，不是功能太少，而是第一句话还在解释能力，读者没有看到一个能马上代入的使用场景。',
      sections: [
        {
          title: '功能清单会让读者把你当说明书',
          body:
            '坏例子是“支持多模型、多语气、多模版”，信息很多，但读者不知道该从哪一步开始用。更像人的写法，是直接说“贴一段客户吐槽，我帮你改成复盘开头”，场景先出现，功能才有意义。'
        },
        {
          title: '先放一个真实动作，再解释能力',
          body:
            '如果你想讲 AI 写作能力，别先讲模型和模板。先给一个 before/after：原句是“客户反馈不好”，改后是“客户说找不到导出按钮，复盘第一段应该先承认这个摩擦”。读者会更快判断这东西能不能帮到自己。'
        },
        {
          title: '结尾问场景，不要问态度',
          body:
            '“你怎么看 AI 写作”太空；“你最近最想改掉哪一句像说明书的产品文案”就具体得多。一个好问题应该把读者拉回自己的工作台，而不是让他评价一个抽象概念。'
        }
      ],
      ending: '你最近最想改掉哪一句像说明书的产品文案？'
    };
  }

  if (/创始人口吻|完整故事|先把一句判断讲透/u.test(focus)) {
    return {
      title: '产品早期，创始人为什么要先把一句判断讲透？',
      lead:
        '我后来才意识到，产品早期最容易讲错的不是故事太少，而是我们太急着把完整故事讲完，结果第一行连一个清楚判断都没有。',
      sections: [
        {
          title: '我第一次删稿，是因为读者根本不知道我们在证明什么',
          body:
            '有一次上线前，我把团队背景、产品愿景和三项功能都塞进第一段。合伙人看完只问了一句：“所以用户今天到底能少做哪一步？”那次我们把整段删掉，只留下一句判断：先别讲全，只证明一个价值点。'
        },
        {
          title: '完整故事可以晚一点，真实摩擦必须先出现',
          body:
            '早期产品没有足够强的品牌信用，读者不会耐心等你铺垫。比如你想讲“AI 帮内容团队提效”，先别讲方法论，先讲周会前还在等灵感、周三还没发出去的那个场景，读者才会知道这件事和自己有关。'
        },
        {
          title: '判断讲透以后，再补动作才不会像教程',
          body:
            '我现在会先问：这篇只证明哪一句？如果答案不清楚，就不继续扩故事。等这一句判断站住，再补一个 before/after 和下一步动作，文章才像人在复盘一次真实决策，而不是在套一篇教程。'
        }
      ],
      ending: '读完以后，你会先把哪一句判断讲透？'
    };
  }

  if (/视觉化|适合后续做信息图|天然适合视觉化/u.test(focus)) {
    return {
      title: 'AI 内容表达里，哪些段落一看就适合做图？',
      lead:
        '适合视觉化的段落，通常不是关键词最多的段落，而是读者需要“看一眼关系”才能理解的段落：对比、流程、层级和取舍。',
      sections: [
        {
          title: '有 before/after 的段落，适合拆成对比卡片',
          body:
            '比如“改前是功能清单，改后是用户少做一步”这种段落，天然适合做成左右对比图。左边放原句，右边放改写后的场景句，读者不用读完整段，也能看懂差异。'
        },
        {
          title: '有多维取舍的段落，适合做四象限或表格',
          body:
            '如果一段内容在比较速度、成本、可信度和可执行性，就别硬写成长段解释。把四个维度放进四象限或表格，读者会更快看到你真正想让他选择什么。'
        },
        {
          title: '有步骤循环的段落，适合做流程图或信息图',
          body:
            '像“判断→例子→问题→反馈→再改判断”这种表达，本身就是闭环流程。把它画成流程图，比写三段抽象解释更清楚，也更适合后续拆成 cover、section illustration 和 infographic summary。'
        }
      ],
      ending: '读完以后，你最想先把哪一段改成图？'
    };
  }

  if (/全是判断没有例子|不要全是判断|判断没有例子/u.test(focus)) {
    return {
      title: 'AI 内容写得全是判断，读者为什么还是不信？',
      lead:
        '很多 AI 内容看起来观点很密，读者却读不下去，不是因为判断不够多，而是每一节都缺一个能让人代入的场景。',
      sections: [
        {
          title: '判断句只能让读者点头，例子才让读者相信',
          body:
            '比如只写“AI 内容要更具体”，读者很难判断你是不是在喊口号。换成“把‘效率提升’改成‘周五把 30 条用户反馈贴进去，10 分钟拿到复盘开头’”，他马上知道你说的具体到底是什么。'
        },
        {
          title: '每一节都要有一个可看见的 before/after',
          body:
            '坏写法是连续三段都在说“先判断、再证据、最后动作”。更稳的写法，是每节都放一个改前改后：改前是一句抽象结论，改后是一条用户能照着做的动作，读者才会觉得这不是模板。'
        },
        {
          title: '结尾不要再补判断，把读者拉回自己的素材',
          body:
            '如果结尾还在说“内容要重视例子”，它就又回到了判断。更自然的收束，是问一个具体选择：你现在手上哪一段最像空判断，能不能马上补一个真实场景？'
        }
      ],
      ending: '你现在手上哪一段最像空判断，能不能马上补一个真实场景？'
    };
  }

  return null;
}

function buildArticleLead(lead: string, focus = ''): string {
  const normalized = ensureSentenceEnding(lead);
  if (!normalized) return normalized;
  if (/上线文案.*说明书/u.test(focus)) {
    if (
      /把“AI 产品上线文案为什么容易写成产品说明书”写得没反应/u.test(normalized) ||
      /第一句没有给读者停下来的理由/u.test(normalized) ||
      /写成说明书/u.test(normalized)
    ) {
      return '很多 AI 产品一发上线文案，就急着把功能解释一遍，读者还没看到判断，就已经把它当成说明书滑过去了。';
    }
  }
  if (/首页第一屏|第一屏文案|直接滑走|第一行滑走/u.test(focus)) {
    if (/^(别在|别再).*(为什么|怎么)/u.test(normalized) || /为什么用户看一眼就想关掉/u.test(normalized)) {
      return '很多 AI 产品的首页第一屏不是在解释价值，而是在逼用户猜它到底有什么用。';
    }
  }
  if (/AI 产品冷启动/u.test(focus)) {
    if (/^(别在|别再).*(为什么|怎么)/u.test(normalized) || /为什么.*滑走/u.test(normalized)) {
      return '很多 AI 产品冷启动卡住，不是因为没人看见，而是第一句还没让读者知道这条到底值不值得继续读。';
    }
  }
  if (/(滑走|第一行|第一屏|真实场景|比如|例如)/u.test(normalized)) return normalized;

  if (/(第一句没有给读者停下来的理由|写得没反应|没有给读者停下来的理由)/u.test(normalized)) {
    return normalized.replace(/[。！？!?]+$/u, '，很多读者看到第一行还没拿到判断就已经滑走了。');
  }

  return normalized;
}

function extractArticleSubject(title: string, lead: string): string {
  const normalizedTitle = sanitizeGeneratedText(title, 'article').replace(/[：:].*$/u, '').trim();
  if (normalizedTitle) return normalizedTitle;

  const quoted = lead.match(/“([^”]{2,24})”/u)?.[1]?.trim();
  if (quoted) return quoted;

  const topic = lead.match(/([A-Za-z0-9\u4e00-\u9fa5 ]{2,24})(?:写得没反应|没有给读者停下来的理由)/u)?.[1]?.trim();
  return topic || '这篇内容';
}

function buildHumanArticleTitle(title: string, lead: string, focus = ''): string {
  const normalized = sanitizeGeneratedText(title, 'article').replace(/[。！？!?]+$/u, '').trim();
  if (!normalized) return normalized;
  const focusLabel = focus.trim();

  if (/(上线文案|上线).*(说明书|产品说明书)/u.test(focusLabel)) {
    return 'AI 产品上线文案，为什么总会写成说明书？';
  }
  if (/创始人口吻|完整故事/u.test(focusLabel)) {
    return '产品早期，创始人为什么要先把一句判断讲透？';
  }
  if (/视觉化|适合后续做信息图|天然适合视觉化/u.test(focusLabel)) {
    return 'AI 内容表达里，哪些段落一看就适合做图？';
  }
  if (/首页第一屏|第一屏文案|直接滑走|第一行滑走/u.test(focusLabel)) {
    return 'AI 产品首页第一屏，用户为什么会直接滑走？';
  }
  if (/AI 产品冷启动/u.test(focusLabel)) {
    return 'AI 产品冷启动，为什么第一句总让读者直接滑走？';
  }
  if (!/(先把|再让|不要把|别把|最后把|讲清楚|动作|节奏|说明书)/u.test(normalized)) return normalized;

  const subject = extractArticleSubject(normalized, lead);
  if (/(第一句没有给读者停下来的理由|没有给读者停下来的理由)/u.test(lead)) {
    return `${subject}，读者为什么会在第一行滑走？`;
  }
  if (/写得没反应/u.test(lead)) {
    return `${subject}，最容易写废的其实是第一句`;
  }

  return normalized;
}

function normalizeArticleEnding(text: string, focus = ''): string {
  const cleaned = sanitizeGeneratedText(text, 'article')
    .replace(/[💡⭐🔥]\s*/gu, '')
    .replace(/^Takeaway[:：]?\s*/giu, '')
    .replace(/^(总结|收尾|最后想说)[：:\s]*/u, '')
    .trim();

  if (!cleaned || /^[。！？!?]+$/u.test(cleaned)) {
    return buildQuestionCloseFallback(focus, 'article');
  }

  return ensureSentenceEnding(cleaned);
}

function humanizeArticleSectionTitle(section: string, focus = ''): string {
  const normalized = normalizeSectionTitle(section);
  if (!normalized) return normalized;

  if (/上线文案.*说明书/u.test(focus)) {
    if (/^核心展开$/u.test(normalized)) {
      return '多数人写上线文案时，为什么第一段就会失去读者';
    }
    if (/AI 产品上线文案为什么容易写成产品说明书/u.test(normalized) || /第一段就失去读者/u.test(normalized)) {
      return '多数人写上线文案时，为什么第一段就会失去读者';
    }
  }

  return normalized;
}

function normalizeBranding(text: string): string {
  return text
    .replace(/(^|[\s（(，,。])ai(?=[$\s）)。，,!！？?])/giu, '$1AI')
    .replace(/draftorbit/giu, 'DraftOrbit');
}

function extractHookFromText(text: string): string {
  return splitSentences(text)[0] ?? text.trim();
}

function extractClosingFromText(text: string): string | null {
  const sentences = splitSentences(text);
  return sentences.length > 1 ? sentences[sentences.length - 1] : null;
}

function normalizeQuestionClose(text: string, fallback = '你现在最想先改的是开头、例子，还是结尾？'): string {
  const cleaned = sanitizeGeneratedText(text, 'tweet')
    .replace(/^(最后|结尾|收尾)[，,：:\s]*/u, '')
    .replace(/(欢迎交流|欢迎留言讨论|评论区见|你怎么看)[。！？!?]*$/u, '')
    .trim();
  const candidate = cleaned && !/(如果只能先改一个动作|你现在最想先改哪一步|你会先改哪一个|你会先改哪一步)/u.test(cleaned) ? cleaned : fallback;
  return candidate.replace(/[。！!]+$/u, '').replace(/[？?]*$/u, '').concat('？');
}

function looksGenericOrBrokenSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if ([...trimmed].length < 10) return true;
  if (/(紧接着|然后|最后)(再)?给出一个具体的动作/u.test(trimmed)) return true;
  if (/^如果你的.*(还是|会不会|要不要)/u.test(trimmed)) return true;
  if (/^(把你的|先把|删掉|换成一个能立刻被感知的具体场景)/u.test(trimmed) && !/(比如|例如|“|”|第一条|首页|用户原话|点击率|周一|昨晚)/u.test(trimmed)) {
    return true;
  }
  if (/判断才能[。！？!?]?$/u.test(trimmed)) return true;
  if (/介绍留不住人/u.test(trimmed)) return true;
  if (/没有理由停下来——没有判断、没有冲突、没有跟我有关的东西/u.test(trimmed)) return true;
  if (/自然会继续读|自然会更愿意|真的会更容易/u.test(trimmed)) return true;
  if (/^读者[0-9.]+秒/u.test(trimmed)) return true;
  if (/^[^。！？!?]{0,14}判断[。！？!?]?$/u.test(trimmed)) return true;
  return false;
}

function isColdStartFocus(focus = ''): boolean {
  return /AI 产品冷启动/u.test(focus);
}

function isWritingWorkflowFocus(focus = ''): boolean {
  return /推文写作冷启动|内容团队|团队工作流|固定节奏|等灵感|靠灵感写推文/u.test(focus);
}

function isSkillTrustFocus(focus = ''): boolean {
  return /SkillTrust|#SkillTrust|安装前审计|盲装|AI\s*skill|Agent\s*skill|Codex\/Claude\s*skill|来源.*权限|token\s*风险|可执行工作流入口|安装前.*(来源|权限|命令|联网|token|凭据|文件)/iu.test(focus);
}

function buildColdStartTweetSceneFallback(): string {
  return '比如做周报助手，别先写“AI 写作平台”，直接写“贴一段口语，我帮你改成能发给老板的周报”，用户才知道第一步该怎么用。';
}

function isDegradedColdStartScene(text: string): boolean {
  return /空荡荡|空白页|空输入框|空的输入框|空白输入框|空荡荡的?(?:输入框|对话框)|巨大(?:的)?输入框|对话框让用户发呆|成品按钮|烂口语变地道周报|自我介绍|介绍自己|介绍背景|团队背景|我们是一家做 AI 工作流的团队|我们是一款帮助 XX 的工具|底层架构优化|唯一能自动填报销单|起码差\s*\d+\s*倍|起码翻[一二三四五六七八九十\d]+\s*倍|转化率.*翻[一二三四五六七八九十\d]+\s*倍|翻\s*\d+\s*倍|连\s*1%\s*的转化率|小红书爆款|服务器直接被新用户挤爆|热度.*归零|支持全球\s*100\+\s*语言|粤语黑话|伦敦人都觉得地道|来自硅谷|AI 原生团队|重塑生产力|读者看完还是不知道这条想证明什么|读者扫完整条还是不知道|不知道这条想证明什么/u.test(
    text
  );
}

function rewriteJudgmentHook(sentence: string, focus = ''): string {
  const cleaned = sanitizeGeneratedText(sentence, 'tweet')
    .replace(/^["“”‘’]+/u, '')
    .replace(/[‘’]/gu, '')
    .replace(/([A-Za-z0-9\u4e00-\u9fa5])”(?=写)/u, '$1')
    .replace(/AI产品/gu, 'AI 产品')
    .replace(/“([^”]+)的中文推文”/gu, '“$1”')
    .replace(/“([^”]+)的中文”/gu, '“$1”')
    .trim();

  const quotedFocus = cleaned.match(/“([^”]{2,24})”/u)?.[1]?.trim();
  const focusLabel = quotedFocus && !isPromptWrapperInstruction(quotedFocus) ? quotedFocus : focus || '这类内容';

  if (isColdStartFocus(focusLabel)) {
    return ensureSentenceEnding('AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景');
  }

  if (isWritingWorkflowFocus(focusLabel)) {
    return ensureSentenceEnding('内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始');
  }

  if (/^目标$|目标写作|写目标/u.test(focusLabel)) {
    return ensureSentenceEnding('目标写不清，通常不是想得不够，而是没落到下一步动作');
  }

  if (isSkillTrustFocus(focusLabel) || isSkillTrustFocus(cleaned)) {
    return ensureSentenceEnding('装 AI skill 前，最该看的不是功能有多香，而是它会碰到哪些执行边界');
  }

  if (/skills|skill|什么是\s*skills?/iu.test(focusLabel)) {
    return ensureSentenceEnding('skills 最容易被讲玄，不是概念复杂，而是没先给一个重复动作场景');
  }

  if (/今天的?\s*AI 产品更新|产品更新|changelog/i.test(focusLabel)) {
    return ensureSentenceEnding('今天这条产品更新别再写成 changelog，先只讲一个用户立刻能感受到的变化');
  }

  if (/AI 写作产品.*说明书|写成说明书/u.test(focusLabel)) {
    return ensureSentenceEnding('AI 写作产品一开口就像说明书，通常不是信息太少，而是第一句还在解释功能');
  }

  if (/首页第一屏|第一屏文案|直接滑走|第一行滑走/u.test(focusLabel)) {
    return ensureSentenceEnding('AI 产品首页第一屏写废，通常不是字太少，而是开头还在介绍自己');
  }

  if (/用户反馈/u.test(focusLabel)) {
    return ensureSentenceEnding('用户反馈写不出回复，通常不是素材少，而是你把原话写成了总结');
  }

  if (/功能上线|上线写成 thread|上线写成串推/u.test(focusLabel)) {
    return ensureSentenceEnding('一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单');
  }

  if (/团队工作流|固定节奏|等灵感/u.test(focusLabel)) {
    return ensureSentenceEnding('AI 内容团队最怕的，不是没灵感，而是每次都从空白页开始');
  }

  if (/多数人把“([^”]+)”写得没反应，不是缺观点，而是第一句(没有给读者停下来的理由|没让读者停下来的理由)/u.test(cleaned)) {
    return ensureSentenceEnding(`“${focusLabel}”写不动，通常不是观点不够，而是第一句没先下判断`);
  }

  if (/AI 产品冷启动没反应/u.test(cleaned) || /AI 产品冷启动.*第一句/u.test(cleaned)) {
    return ensureSentenceEnding('AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景');
  }

  if (/第一句(没有给读者停下来的理由|没让读者停下来的理由)/u.test(cleaned)) {
    return ensureSentenceEnding(`${focusLabel}写不动，问题通常不在信息不够，而是第一句没先下判断`);
  }

  if (/多数人把/u.test(cleaned) || /不是缺观点/u.test(cleaned)) {
    return ensureSentenceEnding(
      cleaned
        .replace(/^多数人把/u, '')
        .replace(/写得没反应，不是缺观点，而是/u, '写不动，往往是')
        .replace(/没有给读者停下来的理由/u, '第一句没先下判断')
    );
  }

  return ensureSentenceEnding(cleaned);
}

function buildSceneFallback(focus = '这类内容'): string {
  const subject = focus || '这类内容';
  if (isWritingWorkflowFocus(subject)) {
    return '比如周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。';
  }
  if (/^目标$|目标写作|写目标/u.test(subject)) {
    return '比如周一复盘会只写“提升影响力”没人知道怎么做；改成“本周先让 20 个老用户回复一个真实使用场景”，团队立刻知道下一步动作。';
  }
  if (isSkillTrustFocus(subject)) {
    return '比如你看到一个 Claude/Codex skill 写着“自动整理文件”，安装前先看 sourceUrl、install 命令、文件读写范围、联网外传和 token 要求；这不是找茬，是别把执行权限交给来源不明的脚本。';
  }
  if (/skills|skill|什么是\s*skills?/iu.test(subject)) {
    return '比如“每天整理 10 条用户反馈”不是一句提示词，而是可以封装成 skill 的重复动作：固定输入、固定步骤、固定输出。';
  }
  if (/今天的?\s*AI 产品更新|产品更新|changelog/i.test(subject)) {
    return '比如我会直接写：“以前会后要复制粘贴半小时，现在上传一段录音，3 分钟拿到会议纪要”，用户立刻知道这次更新省了哪一步。';
  }
  if (/AI 写作产品.*说明书|写成说明书/u.test(subject)) {
    return '比如坏例子是“支持多模型、多语气、多模版”；更像人的写法是“贴一段客户吐槽，我帮你改成复盘开头”，读者才知道这是使用场景，不是功能表。';
  }
  if (/首页第一屏|第一屏文案|直接滑走|第一行滑走/u.test(subject)) {
    return '比如第一屏改前写“新一代 AI 生产力平台”，改后写“上传一段会议录音，3 分钟拿到跟进清单”；访客一眼就知道你替他省掉哪一步，才不会直接滑走。';
  }
  if (/用户反馈/u.test(subject)) {
    return '比如用户原话是“我想知道为什么它总把重点埋掉”，这种原话比“我们持续优化体验”更容易引发回复。';
  }
  if (/功能上线|上线写成 thread|上线写成串推/u.test(subject)) {
    return '比如这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景。';
  }
  if (/团队工作流|固定节奏|等灵感/u.test(subject)) {
    return '比如周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。';
  }
  if (isColdStartFocus(subject)) {
    return buildColdStartTweetSceneFallback();
  }
  return `比如第一段同时讲背景、功能和愿景，读者读完还是不知道“${subject}”最想证明什么。`;
}

function stripQuestionTail(text: string): string {
  return text
    .replace(/\s*(如果只能先改一个动作|如果只能改一句|你现在最想先改哪一步|你会先改哪一个|你会先改哪一步|你的第一句文案，敢直接下结论吗|你现在第一句最想先改哪一个词).*[？?].*$/u, '')
    .trim();
}

function ensureSceneConsequence(text: string, focus = ''): string {
  const cleaned = ensureSentenceEnding(text)
    .replace(/。\s*。+/gu, '。')
    .trim();
  if (/用户反馈/u.test(focus) && /(用户原话|原话比“我们持续优化体验”更容易引发回复)/u.test(cleaned)) {
    return cleaned;
  }
  if (/(不知道你到底想证明什么|不知道这条想证明什么|不知道它到底解决什么问题|直接滑走|看完还是不知道)/u.test(cleaned)) {
    return cleaned;
  }
  if (/(替他省掉哪一步|省了哪一步|用户一眼就知道|到底解决了什么摩擦|哪 10 分钟|值不值得点开)/u.test(cleaned)) {
    return cleaned;
  }
  if (/功能上线|上线写成 thread|上线写成串推/u.test(focus) && /(录一段语音|跟进清单|使用场景|六个新功能)/u.test(cleaned)) {
    return cleaned;
  }
  if (/(改成|换成|但如果|点击率|打开率|转化率|回复率|瞬间|立刻抓住注意力|用户才知道)/u.test(cleaned)) {
    return cleaned;
  }
  if (/AI 产品冷启动/u.test(focus) || /第一条|首页|上线/u.test(cleaned)) {
    return cleaned.replace(/[。！？!?]+$/u, '，读者看完还是不知道这条想证明什么。');
  }
  return cleaned.replace(/[。！？!?]+$/u, '，读者看完还是不知道这段最想证明什么。');
}

function repairGenericConsequenceTail(text: string, focus = ''): string {
  const genericTail = /[，,]?\s*读者看完还是不知道这(?:条|段)(?:最)?想证明什么[。！？!?]?/u;
  if (!genericTail.test(text)) return text;

  if (isColdStartFocus(focus)) {
    return buildColdStartTweetSceneFallback();
  }

  if (/首页|第一屏|愿景|形容词/u.test(text)) {
    return text.replace(genericTail, '，访客才知道这屏到底替他省掉哪一步。');
  }

  if (/爆款提示词|疯狂洗稿|死循环/u.test(text)) {
    return buildSceneFallback('团队工作流');
  }

  if (/结构模版|结构模板|分工细到|选题判断→场景例子→发布问题/u.test(text)) {
    return buildSceneFallback('团队工作流');
  }

  if (/今天的?\s*AI 产品更新|产品更新|changelog/i.test(focus) && /自动流转|某大厂|四个页面|来回复制粘贴|按钮|压成一次确认/u.test(text)) {
    return buildSceneFallback(focus);
  }

  if (/周报|飞书文档|划选|复制|粘贴|Prompt|一键/u.test(text)) {
    return text.replace(genericTail, '，用户一眼就知道这次更新省了哪一步。');
  }

  if (/功能表|多模型|多语气|多模版|说明书/u.test(text)) {
    return text.replace(genericTail, '，读者会把它当成说明书，而不是一个值得停下来的判断。');
  }

  if (/技术参数|场景的颗粒度|功能上线|大功能/u.test(text)) {
    return text.replace(genericTail, '，读者才知道这次功能到底解决了哪一个使用摩擦。');
  }

  if (/今天的?\s*AI 产品更新|产品更新|changelog/i.test(focus)) {
    return text.replace(genericTail, '，用户才知道这次更新到底省了哪一步。');
  }

  if (/AI 写作产品.*说明书|写成说明书|功能表/u.test(focus)) {
    return text.replace(genericTail, '，读者会把它当成说明书，而不是一个值得停下来的判断。');
  }

  if (/用户反馈/u.test(focus)) {
    return text.replace(genericTail, '，读者才知道这不是客服总结，而是一句真实的人话。');
  }

  if (/功能上线|上线写成 thread|上线写成串推/u.test(focus)) {
    return text.replace(genericTail, '，读者才知道这次功能到底解决了哪一个使用摩擦。');
  }

  if (/团队工作流|固定节奏|等灵感/u.test(focus)) {
    return text.replace(genericTail, '，团队才知道下一步该补例子还是改判断。');
  }

  if (isWritingWorkflowFocus(focus)) {
    return buildSceneFallback(focus);
  }

  if (/首页第一屏|第一屏文案|直接滑走|第一行滑走/u.test(focus)) {
    return text.replace(genericTail, '，访客才知道这屏到底替他省了哪一步。');
  }

  return text.replace(genericTail, '，读者才知道这段到底在证明什么。');
}

function repairSceneSentence(sentence: string, focus = ''): string {
  const cleaned = stripQuestionTail(
    sanitizeGeneratedText(sentence, 'tweet')
      .replace(/^举个真实场景[：:，,\s]*/u, '')
      .replace(/^比如[：:，,\s]*/u, '')
      .replace(/^例如[：:，,\s]*/u, '')
      .replace(/[‘’]/gu, '')
      .replace(/某AI/gu, '某 AI')
      .replace(/某 AI写作/u, '某 AI 写作')
      .trim()
  );

  const consequenceRepaired = repairGenericConsequenceTail(cleaned, focus);
  if (consequenceRepaired !== cleaned) {
    return ensureSentenceEnding(consequenceRepaired.startsWith('比如') ? consequenceRepaired : `比如${consequenceRepaired}`);
  }

  if (
    /用户反馈/u.test(focus) &&
    (/(Emoji|导师|笑脸)/u.test(cleaned) || /能引发互动的写法是/u.test(cleaned) || hasDanglingQuote(cleaned))
  ) {
    return buildSceneFallback(focus);
  }

  if (
    /今天的?\s*AI 产品更新|产品更新|changelog/i.test(focus) &&
    /(复读机|叹气|更温柔|瞬间把语调|像在安慰你|喂到嘴边|杀手锏|今天别先列功能清单|立刻能感受到.*立刻能感受到|用户一眼就知道这次更新省了哪一步.*用户一眼就知道这次更新省了哪一步)/u.test(cleaned)
  ) {
    return buildSceneFallback(focus);
  }

  if (
    /今天的?\s*AI 产品更新|产品更新|changelog/i.test(focus) &&
    /(优化了长文本处理逻辑|这种自我介绍|不知道你到底想证明什么)/u.test(cleaned)
  ) {
    return buildSceneFallback(focus);
  }

  if (/AI 写作产品.*说明书|写成说明书/u.test(focus) && /(值得停下来的判断.*说明书|当成说明书.*值得停下来的判断)/u.test(cleaned)) {
    return buildSceneFallback(focus);
  }

  if (/AI 写作产品.*说明书|写成说明书/u.test(focus) && /^坏例子是/u.test(cleaned)) {
    return ensureSentenceEnding(`比如${cleaned}`);
  }

  if (isColdStartFocus(focus) && isDegradedColdStartScene(cleaned)) {
    return buildColdStartTweetSceneFallback();
  }

  if (isWritingWorkflowFocus(focus) && (isDegradedColdStartScene(cleaned) || isPromptWrapperInstruction(cleaned))) {
    return buildSceneFallback(focus);
  }

  if (
    /首页第一屏|第一屏文案|直接滑走|第一行滑走/u.test(focus) &&
    /(转化率.*翻倍|转化率能直接翻倍|翻\s*\d+\s*倍)/u.test(cleaned)
  ) {
    return buildSceneFallback(focus);
  }

  if (
    /首页第一屏|第一屏文案|直接滑走|第一行滑走/u.test(focus) &&
    /(新一代 AI 生产力平台|不知道你到底替他省掉哪一步|直接就滑过去|直接滑走)/u.test(cleaned) &&
    !/(改前|改后|before|after)/iu.test(cleaned)
  ) {
    return buildSceneFallback(focus);
  }

  if (!cleaned || looksGenericOrBrokenSentence(cleaned)) {
    return buildSceneFallback(focus);
  }

  const subject =
    cleaned.match(/(某 ?AI[^，。！？?]{0,20}(?:工具|助手|机器人|产品))/u)?.[1]?.replace(/\s+/g, ' ').trim() ||
    cleaned.match(/(某[^，。！？?]{0,18}(?:工具|助手|机器人|产品))/u)?.[1]?.trim() ||
    null;
  const danglingQuote = hasDanglingQuote(cleaned);
  const danglingQuoteLead = danglingQuote ? extractDanglingQuoteLead(cleaned) : null;
  const quoted = danglingQuote ? null : cleaned.match(/[“"]([^”"]{4,36})[”"]?/u)?.[1]?.trim();

  if (danglingQuote && subject) {
    return `比如${subject}第一条还在介绍自己，读者看完还是不知道这条想证明什么。`;
  }

  if (danglingQuoteLead) {
    return `比如第一条还在写“${danglingQuoteLead}”这种自我介绍，读者扫完整条还是不知道你到底想证明什么。`;
  }

  if (subject && quoted) {
    const position = /首页/u.test(cleaned) ? '首页' : /第一条|上线/u.test(cleaned) ? '第一条' : '第一屏';
    return ensureSceneConsequence(`比如${subject}${position}写“${quoted}”`, focus);
  }

  if (/第一条同时讲定位、功能和(故事|愿景)/u.test(cleaned)) {
    return ensureSceneConsequence(cleaned.startsWith('比如') ? cleaned : `比如${cleaned}`, focus);
  }

  if (/^第一条(?:先)?写/u.test(cleaned)) {
    return ensureSceneConsequence(`比如${cleaned}`, focus);
  }

  if (danglingQuote) {
    return buildSceneFallback(focus);
  }

  return ensureSceneConsequence(cleaned, focus);
}

function pickSceneSentence(sentences: string[], focus = ''): string {
  const candidates = sentences
    .map((sentence) => sanitizeGeneratedText(sentence, 'tweet').trim())
    .filter(Boolean)
    .filter((sentence) => !/^更有效的写法是[：:]/u.test(sentence))
    .filter((sentence) => !/^(因为)?读者(扫完整条|看完|读完)/u.test(sentence))
    .filter((sentence) => !/^如果你的.*(还是|会不会|要不要)/u.test(sentence))
    .filter((sentence) => !/[？?]$/u.test(sentence))
    .filter((sentence) => !looksGenericOrBrokenSentence(sentence));

  const preferred =
    candidates.find(
      (sentence) =>
        !/^(把你的|先把|删掉|换成一个能立刻被感知的具体场景)/u.test(sentence) &&
        !/(先把判断讲清楚，再补一个(具体|真实)场景|再补一个具体例子|读者才知道为什么要继续看|说的是不是自己正在经历的问题)/u.test(
          sentence
        ) &&
        (hasExampleSignal(sentence) || /(比如|第一条|首页|场景|点击率|滑走|记不住|不知道|见过太多|同时塞|同时讲)/u.test(sentence))
    );

  if (isSkillTrustFocus(focus)) {
    return ensureSentenceEnding(preferred || buildSceneFallback(focus))
      .replace(/，?读者看完还是不知道这段最想证明什么[。！？!?]?/u, '。')
      .replace(/，?读者才知道这段到底在证明什么[。！？!?]?/u, '。');
  }

  return repairSceneSentence(preferred || buildSceneFallback(focus), focus);
}

function pickActionSentence(sentences: string[], focus = ''): string {
  if (isSkillTrustFocus(focus)) return buildActionFallback(focus);
  const candidates = sentences
    .map((sentence) => sanitizeGeneratedText(sentence, 'thread').trim())
    .filter(Boolean)
    .filter((sentence) => !/^更有效的写法是[：:]/u.test(sentence))
    .filter((sentence) => !looksGenericOrBrokenSentence(sentence));

  const preferred = candidates.find((sentence) =>
    /(先删|只保留|先把|改成|最后用|先给判断|再补一个场景|先删掉背景|动作|我会|周会前|下一版具体改|直接放|准备怎么改)/u.test(
      sentence
    )
  );

  if (preferred) return ensureSentenceEnding(preferred);

  return buildActionFallback(focus);
}

function buildActionFallback(focus = ''): string {
  if (isSkillTrustFocus(focus)) {
    return '我的动作会很简单：先搜来源，再看安装命令、文件读写、联网和 token；证据不够就先不装，或者丢进 SkillTrust compare 后人工决定。';
  }
  if (/用户反馈/u.test(focus)) {
    return '我会把第二条改成用户原话，再只写一个改法：先承认卡点，再告诉读者下一版具体改哪一处。';
  }
  if (/功能上线|上线写成 thread|上线写成串推/u.test(focus)) {
    return '我会只保留一个动作：把功能清单改成“录音→跟进清单”的使用场景，再把其余卖点放到后续卡片，别一上来就列功能。';
  }
  if (/团队工作流|固定节奏|等灵感/u.test(focus)) {
    return '把固定节奏拆成具体分工：谁先下判断，谁补例子，谁负责收尾问题；周会前按这个顺序过一遍。';
  }
  if (/首页第一屏|第一屏文案/u.test(focus)) {
    return '我会先删掉第一屏里的愿景句，只保留一句用户马上能听懂的价值判断。';
  }
  if (/AI 产品冷启动/u.test(focus)) {
    return '我会先把第一句改成“贴一段口语→生成能发给老板的周报”的 before/after，让读者马上知道第一步怎么用。';
  }
  return '我会先删掉背景介绍，只证明一个判断，再补一个读者一看就懂的真实场景。';
}

function buildQuestionCloseFallback(focus = '', format: ContentFormat = 'tweet'): string {
  if (/今天的?\s*AI 产品更新|产品更新|changelog/i.test(focus)) {
    return '如果今天这条更新只能保留一句，你会先留下哪一句？';
  }
  if (/AI 写作产品.*说明书|写成说明书/u.test(focus)) {
    return '你最近见过最像说明书的一句产品文案，是什么？';
  }
  if (/首页第一屏|第一屏文案|直接滑走|第一行滑走/u.test(focus)) {
    return '如果现在就改第一屏，你最先删掉的是愿景、功能，还是形容词？';
  }
  if (isColdStartFocus(focus)) {
    return '如果现在只改第一句，你会先写哪个用户场景？';
  }
  if (isWritingWorkflowFocus(focus)) {
    return format === 'article'
      ? '读完以后，你最想先固定哪一步节奏？'
      : '如果团队内容流程只能先固定一步，你会先固定哪一步？';
  }
  if (/^目标$|目标写作|写目标/u.test(focus)) {
    return '你现在最想先把哪个目标写成一句可执行动作？';
  }
  if (isSkillTrustFocus(focus)) {
    return '你现在最想先审哪一个 AI skill？';
  }
  if (/skills|skill|什么是\s*skills?/iu.test(focus)) {
    return '你现在最想把哪个重复动作做成 skill？';
  }
  if (/用户反馈/u.test(focus)) {
    return '你最近最值得拿出来写的一句用户原话，是什么？';
  }
  if (/功能上线|上线写成 thread|上线写成串推/u.test(focus)) {
    return '如果这次上线只能先讲一个场景，你会先讲哪一个？';
  }
  if (/团队工作流|固定节奏|等灵感/u.test(focus)) {
    return format === 'article'
      ? '读完以后，你最想先固定哪一步节奏？'
      : '如果团队内容流程只能先固定一步，你会先固定哪一步？';
  }
  if (/创始人口吻|完整故事/u.test(focus)) {
    return format === 'article'
      ? '读完以后，你会先把哪一句判断讲透？'
      : '如果只能先讲透一句判断，你会先讲哪一句？';
  }
  return format === 'article'
    ? '读完以后，你最想先改哪一步？'
    : '如果只能先改一个动作，你会先改哪一个？';
}

export function composePublishReadyTweet(input: {
  focus?: string | null;
  hook?: string | null;
  cta?: string | null;
  humanized: string;
}): string {
  const focus = String(input.focus ?? '').trim();
  const cleaned = sanitizeGeneratedText(input.humanized, 'tweet')
    .replace(/某AI/gu, '某 AI')
    .replace(/用AI/gu, '用 AI')
    .replace(/AI产品/gu, 'AI 产品');
  const sentences = splitSentences(cleaned);
  const hook = rewriteJudgmentHook(input.hook?.trim() || sentences[0] || cleaned, focus);
  const pickedScene = pickSceneSentence(sentences.slice(1), focus);
  const scene =
    /^目标$|目标写作|写目标/u.test(focus) &&
    /(今年要健身|半年一次都没去|读者才知道这段到底在证明什么|还是不知道这段最想证明什么)/u.test(pickedScene)
      ? buildSceneFallback(focus)
      : pickedScene;
  const closeFallback = buildQuestionCloseFallback(focus, 'tweet');
  const closeInput =
    input.cta?.trim() ||
    sentences.find((sentence) => /[？?]$/.test(sentence)) ||
    closeFallback;
  const close = normalizeQuestionClose(
    ((isColdStartFocus(focus) || isWritingWorkflowFocus(focus) || /首页第一屏|第一屏文案|直接滑走|第一行滑走/u.test(focus)) &&
    /自我介绍|删掉哪句|只能先改一个动作|会先改哪一个|给我一条|更像真人/u.test(closeInput))
      ? closeFallback
      : closeInput,
    closeFallback
  );

  return tightenTweetForEngagement([hook, scene, close].filter(Boolean).join(' '), 220, focus);
}

function engagementScore(metrics?: Record<string, number | undefined> | null): number {
  if (!metrics) return 0;
  const likes = Number(metrics.like_count ?? 0);
  const replies = Number(metrics.reply_count ?? 0);
  const retweets = Number(metrics.retweet_count ?? 0);
  const quotes = Number(metrics.quote_count ?? 0);
  const bookmarks = Number(metrics.bookmark_count ?? 0);
  return likes + replies * 2 + retweets * 2.4 + quotes * 2.8 + bookmarks * 1.6;
}

function looksLikeReply(text: string): boolean {
  return /^@\w+/u.test(text.trim());
}

export function rankHighPerformingExamples(posts: HistoricalPostInput[], limit = 4): HighPerformingExample[] {
  return posts
    .map((post) => {
      const text = post.text.trim();
      const score = engagementScore(post.public_metrics);
      return {
        text,
        score,
        hook: extractHookFromText(text),
        closing: extractClosingFromText(text)
      };
    })
    .filter((post) => {
      const chars = [...post.text].length;
      return chars >= 24 && chars <= 420 && !looksLikeReply(post.text) && post.score > 0;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function fallbackVoiceSummary(styleAnalysis: Record<string, unknown>): string | null {
  const tone = typeof styleAnalysis.tone === 'string' ? styleAnalysis.tone : '';
  const vocabularyPreferences =
    styleAnalysis.vocabulary_preferences && typeof styleAnalysis.vocabulary_preferences === 'object'
      ? (styleAnalysis.vocabulary_preferences as Record<string, unknown>)
      : null;
  const vocabulary = Array.isArray(vocabularyPreferences?.notable_phrases)
    ? vocabularyPreferences.notable_phrases
    : null;

  const parts: string[] = [];
  if (tone) parts.push(String(tone).trim());
  if (Array.isArray(vocabulary) && vocabulary.length > 0) {
    parts.push(`常用表达：${vocabulary.slice(0, 3).join('、')}`);
  }
  return parts.length > 0 ? parts.join('；') : null;
}

export function enrichStyleAnalysis(
  styleAnalysis: unknown,
  posts: HistoricalPostInput[],
  limit = 4
): Record<string, unknown> {
  const base = styleAnalysis && typeof styleAnalysis === 'object' ? { ...(styleAnalysis as Record<string, unknown>) } : {};
  const examples = rankHighPerformingExamples(posts, limit);
  const hookPatterns = examples.map((item) => item.hook).slice(0, 4);
  const ctaPatterns = examples
    .map((item) => item.closing)
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);

  const antiPatterns = Array.isArray(base.anti_patterns)
    ? (base.anti_patterns as unknown[]).map((item) => String(item).trim()).filter(Boolean)
    : ['空泛口号', '先讲大道理再讲例子', '为互动而互动的结尾'];
  const openingPatterns = Array.isArray(base.opening_patterns)
    ? (base.opening_patterns as unknown[]).map((item) => String(item).trim()).filter(Boolean)
    : ['先给判断，再讲背景'];
  const evidencePatterns = Array.isArray(base.evidence_patterns)
    ? (base.evidence_patterns as unknown[]).map((item) => String(item).trim()).filter(Boolean)
    : ['观点后面立刻补一个真实例子'];
  const formatPreferences = Array.isArray(base.format_preferences)
    ? (base.format_preferences as unknown[]).map((item) => String(item).trim()).filter(Boolean)
    : ['按体裁控制结构，不为展开而展开。'];
  const sourceCorpusRefs = Array.isArray(base.source_corpus_refs)
    ? (base.source_corpus_refs as unknown[]).map((item) => String(item).trim()).filter(Boolean)
    : [];

  return {
    ...base,
    voice_summary:
      (typeof base.voice_summary === 'string' && base.voice_summary.trim()) || fallbackVoiceSummary(base) || null,
    high_performing_examples: examples,
    hook_patterns: hookPatterns,
    cta_patterns: ctaPatterns,
    anti_patterns: antiPatterns,
    opening_patterns: openingPatterns,
    evidence_patterns: evidencePatterns,
    format_preferences: formatPreferences,
    source_corpus_refs: sourceCorpusRefs
  };
}

export function buildContentStrategyContext(input: {
  intent: string;
  format: ContentFormat;
  language?: string | null;
  styleAnalysis?: unknown;
}): ContentStrategyContext {
  const analysis = input.styleAnalysis && typeof input.styleAnalysis === 'object'
    ? (input.styleAnalysis as Record<string, unknown>)
    : {};
  const examples = Array.isArray(analysis.high_performing_examples)
    ? (analysis.high_performing_examples as unknown[])
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          const text = String(row.text ?? '').trim();
          const hook = String(row.hook ?? '').trim() || extractHookFromText(text);
          const score = Number(row.score ?? 0);
          const closing = typeof row.closing === 'string' ? row.closing.trim() : null;
          if (!text) return null;
          return { text, score: Number.isFinite(score) ? score : 0, hook, closing } satisfies HighPerformingExample;
        })
        .filter((item): item is HighPerformingExample => Boolean(item))
    : [];

  const antiPatterns = Array.isArray(analysis.anti_patterns)
    ? (analysis.anti_patterns as unknown[]).map((item) => String(item).trim()).filter(Boolean)
    : ['空泛口号', '流程万能论', '弱 CTA'];
  const openingPatterns = Array.isArray(analysis.opening_patterns)
    ? (analysis.opening_patterns as unknown[]).map((item) => String(item).trim()).filter(Boolean)
    : ['先给判断，再讲背景'];
  const evidencePatterns = Array.isArray(analysis.evidence_patterns)
    ? (analysis.evidence_patterns as unknown[]).map((item) => String(item).trim()).filter(Boolean)
    : ['观点后面立刻补一个真实例子'];
  const formatPreferences = Array.isArray(analysis.format_preferences)
    ? (analysis.format_preferences as unknown[]).map((item) => String(item).trim()).filter(Boolean)
    : [];
  const sourceCorpusRefs = Array.isArray(analysis.source_corpus_refs)
    ? (analysis.source_corpus_refs as unknown[]).map((item) => String(item).trim()).filter(Boolean)
    : [];

  const platformRulesByFormat: Record<ContentFormat, string[]> = {
    tweet: [
      '开头先给判断、反差或具体问题，不要先铺大道理。',
      '正文尽量控制在 220-250 字内，不把 280 用满。',
      '观点后面立刻跟一个例子、事实或可执行动作。',
      '结尾优先用问题句驱动回复，不要用“欢迎留言讨论”。'
    ],
    thread: [
      '第 1 条必须说明为什么值得继续读。',
      '中间每条只推进一个新信息，不要重复同一个结论。',
      '总条数默认 4-7 条，不为拆而拆。',
      '最后一条负责收束观点或提出问题，不做廉价求赞。'
    ],
    article: [
      '标题要具体，导语要迅速进入判断，不要写成空泛前言。',
      '每个小节只推进一个重点，观点后面立刻给例子、反例或动作。',
      '段落要短，结构要可 skim。',
      '结尾要给 takeaway，并用问题驱动回复或分享。'
    ]
  };

  return {
    intent: input.intent.trim(),
    focus: extractIntentFocus(input.intent),
    format: input.format,
    language: input.language?.trim() || 'zh',
    growthGoal: 'native_engagement',
    stylePriority: 'effect_first',
    voiceSummary:
      (typeof analysis.voice_summary === 'string' && analysis.voice_summary.trim()) || fallbackVoiceSummary(analysis) || null,
    highPerformingExamples: examples.slice(0, 4),
    hookPatterns:
      (Array.isArray(analysis.hook_patterns) ? analysis.hook_patterns : examples.map((item) => item.hook))
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 4),
    ctaPatterns:
      (Array.isArray(analysis.cta_patterns)
        ? analysis.cta_patterns
        : examples.map((item) => item.closing).filter(Boolean))
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 4),
    openingPatterns: openingPatterns.slice(0, 4),
    evidencePatterns: evidencePatterns.slice(0, 4),
    formatPreferences: formatPreferences.slice(0, 4),
    antiPatterns: antiPatterns.slice(0, 6),
    platformRules: platformRulesByFormat[input.format],
    sourceCorpusRefs: sourceCorpusRefs.slice(0, 8)
  };
}

export function renderStrategyPromptContext(context: ContentStrategyContext): string {
  const exampleBlock =
    context.highPerformingExamples.length > 0
      ? context.highPerformingExamples
          .map((item, index) => `样本${index + 1}：${item.text}`)
          .join('\n')
      : '样本：暂无历史高表现内容，优先使用通用 X 高互动结构。';

  const antiPatterns = context.antiPatterns.length > 0 ? context.antiPatterns.join('、') : '空泛口号、prompt 泄漏、弱 CTA';

  return [
    `语言：${context.language}`,
    `增长目标：${context.growthGoal}`,
    `风格优先级：${context.stylePriority}`,
    `目标体裁：${context.format}`,
    `真实主题：${context.focus}`,
    context.voiceSummary ? `风格摘要：${context.voiceSummary}` : '风格摘要：优先自然、结论先行、像真人表达。',
    `平台规则：${context.platformRules.join('；')}`,
    context.openingPatterns.length > 0 ? `开头模式：${context.openingPatterns.join('；')}` : null,
    context.evidencePatterns.length > 0 ? `证据模式：${context.evidencePatterns.join('；')}` : null,
    context.formatPreferences.length > 0 ? `体裁偏好：${context.formatPreferences.join('；')}` : null,
    `禁止模式：${antiPatterns}`,
    context.sourceCorpusRefs.length > 0 ? `学习源参考：${context.sourceCorpusRefs.join('、')}` : null,
    '高表现样本（内部 few-shot，仅供学习）：',
    exampleBlock
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n');
}

export function detectContentAntiPatterns(text: string, intentFocus = ''): string[] {
  const normalized = text.trim();
  const flags = new Set<string>();

  if (/[[(]object Object[)\]]/i.test(normalized)) flags.add('object_leakage');
  if (/\(([a-z0-9]{6,8})\)/iu.test(normalized)) flags.add('random_suffix');
  if (/(用户意图|输出形式|需要配图|自动完成|V4\s*Creator\s*Studio|你是\s*(?:一个|一名|chatgpt|ai))/iu.test(normalized)) {
    flags.add('prompt_leakage');
  }
  if (/(给我一条|更像真人|冷启动判断句)/u.test(normalized)) flags.add('prompt_leakage');
  if (/(别再靠灵感写\s*(目标|什么是skills|skills|围绕))/u.test(normalized)) flags.add('prompt_leakage');
  if (/(这种自我介绍|读者扫完整条还是不知道|读者看完还是不知道这(?:条|段)(?:最)?想证明什么|不知道你到底想证明什么)/u.test(normalized)) {
    flags.add('generic_scene_leakage');
  }
  if (TEMPLATE_CLICHE_PATTERNS.some((rule) => rule.test(normalized))) flags.add('template_cliche');
  if (WEAK_CTA_PATTERNS.some((rule) => rule.test(normalized))) flags.add('weak_cta');
  if (/^围绕/u.test(normalized) || /用“围绕”拆解动作/u.test(normalized)) flags.add('meta_pollution');
  if (intentFocus && normalized.includes(`围绕 ${intentFocus}`)) flags.add('meta_pollution');

  const hashtags = [...normalized.matchAll(/#([\p{L}\p{N}_-]+)/gu)];
  for (const [, tag] of hashtags) {
    if (/^[a-z0-9]{6}$/i.test(tag)) flags.add('garbage_hashtag');
    if (normalized.replace(new RegExp(`#${tag}`, 'gu'), '').includes(tag)) flags.add('echo_hashtag');
  }

  return [...flags];
}

export function sanitizeGeneratedText(text: string, format: ContentFormat): string {
  let next = normalizeBranding(text)
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\(([a-z0-9]{6,8})\)/giu, '')
    .replace(/\[object Object\]/giu, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  next = next
    .replace(/#([a-z0-9]{6})\b/giu, '')
    .replace(/[^\S\n]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const hashtags = [...next.matchAll(/#([\p{L}\p{N}_-]+)/gu)];
  for (const [, tag] of hashtags) {
    if (next.replace(new RegExp(`#${tag}`, 'gu'), '').includes(tag)) {
      next = next
        .replace(new RegExp(`#${tag}\\b`, 'gu'), '')
        .replace(/[^\S\n]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }
  }

  if (format === 'article') {
    next = next
      .replace(/#[\p{L}\p{N}_-]+/gu, '')
      .replace(/[^\S\n]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return next;
}


type ParsedArticleSection = {
  title: string;
  body: string;
};

type ParsedArticleDraft = {
  title: string | null;
  lead: string | null;
  sections: ParsedArticleSection[];
  ending: string | null;
};

function stripArticleLabel(line: string, label: string): string {
  return line.replace(new RegExp(`^${label}[：:]?\\s*`, 'u'), '').trim();
}

function parseStructuredArticleDraft(text: string): ParsedArticleDraft | null {
  const normalized = sanitizeGeneratedText(text, 'article')
    .replace(/(标题：|导语：|结尾：)/g, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!/(标题：|导语[:：]|(?:^|\n)[一二三四五六七八九十]+[、.]|(?:^|\n)\d+[.、])/u.test(normalized)) {
    return null;
  }

  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  let title: string | null = null;
  let lead: string | null = null;
  let ending: string | null = null;
  const sections: ParsedArticleSection[] = [];
  let current: ParsedArticleSection | null = null;

  const flush = () => {
    if (!current) return;
    current.body = current.body.trim();
    if (current.title && current.body) sections.push(current);
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    if (line.startsWith('标题：')) {
      title = stripArticleLabel(line, '标题') || title;
      continue;
    }

    if (line === '导语') {
      const nextLine = lines[index + 1] ?? '';
      if (nextLine && !nextLine.startsWith('标题：')) {
        lead = nextLine.trim();
        index += 1;
      }
      continue;
    }

    if (line.startsWith('导语：')) {
      lead = stripArticleLabel(line, '导语') || lead;
      continue;
    }

    if (line === '结尾') {
      const nextLine = lines[index + 1] ?? '';
      if (nextLine) {
        ending = nextLine.trim();
        index += 1;
      }
      continue;
    }

    if (line.startsWith('结尾：')) {
      ending = stripArticleLabel(line, '结尾') || ending;
      continue;
    }

    const heading = line.match(/^(?:[一二三四五六七八九十]+[、.]|\d+[.、])\s*(.+)$/u)?.[1]?.trim();
    if (heading) {
      flush();
      let title = normalizeSectionTitle(heading);
      let body = '';
      if ([...heading].length > 30) {
        const punctuationIndex = heading.search(/[。！？!?]/u);
        const hasInlineNextSection = /[二三四五六七八九十]+、/u.test(heading);
        if (punctuationIndex > 0 && punctuationIndex < 30) {
          title = normalizeSectionTitle(heading.slice(0, punctuationIndex));
          body = heading.slice(punctuationIndex + 1).trim();
        } else if (hasInlineNextSection) {
          title = normalizeSectionTitle(heading.slice(0, 24));
          body = heading.slice(24).trim();
        }
      }
      current = { title, body };
      continue;
    }

    if (!title && !lead && line.length <= 40 && !/[。！？!?]$/.test(line)) {
      title = line;
      continue;
    }

    if (!lead) {
      lead = line;
      continue;
    }

    if (!current) {
      current = { title: '核心展开', body: line };
    } else {
      current.body = `${current.body}${current.body ? '\n' : ''}${line}`;
    }
  }

  flush();

  if (!title && !lead && sections.length === 0) return null;

  return { title, lead, sections, ending };
}

function splitInlineArticleSections(section: ParsedArticleSection): ParsedArticleSection[] {
  const normalizedBody = sanitizeGeneratedText(section.body, 'article')
    .replace(/([一二三四五六七八九十]+)、/gu, '\n$1、')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const markdownParts = normalizedBody
    .split(/(?=^#{2,4}\s*\d+[.、]\s*)/gmu)
    .map((part) => part.trim())
    .filter((part) => /^#{2,4}\s*\d+[.、]\s*/u.test(part));
  if (markdownParts.length >= 2) {
    const expanded = markdownParts
      .map((part) => {
        const [headingLine = '', ...bodyLines] = part.split(/\n+/).map((line) => line.trim()).filter(Boolean);
        const title = normalizeSectionTitle(headingLine.replace(/^#{2,4}\s*\d+[.、]\s*/u, '').trim());
        const body = bodyLines.join('\n').trim();
        return {
          title: title || section.title,
          body: body || title || section.body
        };
      })
      .filter((item) => item.title && item.body);

    if (expanded.length >= 2) return expanded;
  }

  const lines = normalizedBody.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const numberedLines = lines.filter((line) => /^[一二三四五六七八九十]+、/u.test(line));

  if (numberedLines.length < 2 && !/^[一二三四五六七八九十]+、/u.test(lines[0] ?? '')) {
    return [section];
  }

  const expanded = lines
    .filter((line) => /^[一二三四五六七八九十]+、/u.test(line))
    .map((line) => {
      const content = line.replace(/^[一二三四五六七八九十]+、\s*/u, '').trim();
      const punctuationIndex = content.search(/[。！？!?]/u);
      const title =
        punctuationIndex > 0 && punctuationIndex < 34
          ? normalizeSectionTitle(content.slice(0, punctuationIndex))
          : normalizeSectionTitle(content.slice(0, 24));
      const body =
        punctuationIndex > 0 && punctuationIndex < content.length - 1
          ? content.slice(punctuationIndex + 1).trim()
          : content;
      return {
        title: title || section.title,
        body: body || content
      };
    })
    .filter((item) => item.title && item.body);

  return expanded.length > 0 ? expanded : [section];
}

function dedupeArticleSections(sections: ParsedArticleSection[]): ParsedArticleSection[] {
  const seen = new Set<string>();
  const deduped: ParsedArticleSection[] = [];

  for (const section of sections) {
    const bodyKey = sanitizeGeneratedText(section.body, 'article')
      .replace(/\s+/g, ' ')
      .replace(/[“”"'‘’]/gu, '')
      .trim();
    if (!bodyKey || seen.has(bodyKey)) continue;
    seen.add(bodyKey);
    deduped.push(section);
  }

  return deduped;
}

export function scoreStrategySignals(text: string, format: ContentFormat): StrategySignals {
  const firstSentence = splitSentences(text)[0] ?? text.trim();
  const antiPatterns = detectContentAntiPatterns(text);
  const totalChars = [...text].length;

  const hookStrength = clampPercent(
    34 +
      (/(\?|？|为什么|不是|别再|多数|真正|如果)/u.test(firstSentence) ? 22 : 0) +
      (/[0-9一二三四五六七八九十]/u.test(firstSentence) ? 12 : 0) +
      (firstSentence.length >= 14 && firstSentence.length <= 48 ? 16 : 4)
  );

  const specificity = clampPercent(
    30 +
      ((text.match(/[0-9]+/g) ?? []).length > 0 ? 18 : 0) +
      ((text.match(/(AI 产品冷启动|回复率|发布|复盘|例子|截图|数据|一次|第一条|第一屏|首页|周报|录音|划选|会议纪要|省了哪一步|用户原话|持续优化体验|反馈|客户吐槽|复盘开头|播客|思维导图|周会|一个判断)/gu) ?? []).length * 8) +
      (/[“”"'‘’]/u.test(text) ? 8 : 0)
  );

  const evidence = clampPercent(
    24 +
      ((text.match(/(比如|例如|我会直接写|用户原话|一次|一个例子|真实例子|例子|数据|之前|之后|以前|现在|因为|所以|导致|结果|回复率|截图|对比|反例)/gu) ?? []).length * 11)
  );

  const conversationality = clampPercent(
    38 +
      ((text.match(/(你|我|我们|现在|其实|真的|会发现|你会发现|你现在)/gu) ?? []).length * 6) -
      ((text.match(/(总而言之|综上所述|本质上|需要注意的是|下面我只拆|讲清为什么)/gu) ?? []).length * 14)
  );

  let ctaNaturalness = 48;
  if (/[？?]$/.test(text.trim())) ctaNaturalness += 24;
  if (/(你现在|你会怎么做|你最想先|你更认同哪种|你会先做哪一步)/u.test(text)) ctaNaturalness += 16;
  if (WEAK_CTA_PATTERNS.some((rule) => rule.test(text))) ctaNaturalness -= 28;
  ctaNaturalness = clampPercent(ctaNaturalness);

  let antiPatternPenalty = antiPatterns.length * 18;
  if (format === 'article' && /#[\p{L}\p{N}_-]+/u.test(text)) antiPatternPenalty += 20;
  if (format === 'tweet' && totalChars > 250) antiPatternPenalty += 12;
  if (format === 'thread' && /(下面我只拆|讲清为什么|真正有效的结尾)/u.test(text)) antiPatternPenalty += 10;
  antiPatternPenalty = clampPercent(antiPatternPenalty);

  return {
    hookStrength,
    specificity,
    evidence,
    conversationality,
    ctaNaturalness,
    antiPatternPenalty
  };
}

export function buildQualitySignalReport(text: string, format: ContentFormat): QualitySignalReport {
  const base = scoreStrategySignals(text, format);
  const structureMarkers =
    format === 'article'
      ? (text.match(/(?:^|\n)(导语|结尾|[一二三四五六七八九十]、)/gu) ?? []).length
      : format === 'thread'
        ? (text.match(/\d+\/\d+/gu) ?? []).length
        : splitSentences(text).length;
  const exampleCount = (text.match(/(比如|例如|我会直接写|用户原话|最常见的场景|反例|before\/after|真实例子|动作)/gu) ?? []).length;
  const questionClose = /[？?]$/.test(text.trim()) ? 10 : 0;
  const humanLikeness = clampPercent(base.conversationality * 0.55 + base.ctaNaturalness * 0.2 + (100 - base.antiPatternPenalty) * 0.25);
  const structuralReadability = clampPercent(
    34 +
      structureMarkers * (format === 'article' ? 14 : format === 'thread' ? 10 : 8) +
      (format === 'tweet' && [...text].length <= 250 ? 14 : 0) +
      questionClose
  );
  const visualizability = clampPercent(
    30 + exampleCount * 18 + ((text.match(/(对比|流程|步骤|场景|卡片|截图|before|after|首页|第一屏|滑走|周报|录音|会议纪要|省了哪一步|用户原话|持续优化体验|反馈|客户吐槽|功能表|划选|播客|思维导图|周会|四象限|流程图)/giu) ?? []).length * 8)
  );
  const derivativeReadiness = clampPercent(
    28 +
      (format === 'article' ? 24 : format === 'thread' ? 16 : 8) +
      structureMarkers * 8 +
      exampleCount * 10
  );

  return {
    ...base,
    humanLikeness,
    structuralReadability,
    visualizability,
    derivativeReadiness
  };
}

export function formatXArticleText(input: {
  focus?: string | null;
  title?: string | null;
  hook?: string | null;
  body?: string[];
  cta?: string | null;
  humanized: string;
}): string {
  const cleaned = sanitizeGeneratedText(input.humanized, 'article');
  const focusLabel = String(input.focus ?? '').trim();
  const focusBlueprint = buildFocusArticleBlueprint(focusLabel);
  if (focusBlueprint && looksLikeMalformedArticleOutput(cleaned)) {
    return renderArticleBlueprint(focusBlueprint);
  }

  const parsed = parseStructuredArticleDraft(cleaned);
  const sentences = splitSentences(cleaned);
  const lead = buildArticleLead(parsed?.lead?.trim() || input.hook?.trim() || sentences[0] || cleaned, focusLabel);
  const title = buildHumanArticleTitle(
    parsed?.title?.trim() || input.title?.trim() || 'X 长文草稿',
    lead,
    focusLabel
  );
  const structuredSections = parsed?.sections.length
    ? dedupeArticleSections(parsed.sections.flatMap((section) => splitInlineArticleSections(section)))
    : [];
  const remaining = structuredSections.length
    ? structuredSections.map((section) => section.body).filter(Boolean)
    : sentences.filter((sentence) => sentence !== lead);
  const sectionTitles = (structuredSections.length ? structuredSections.map((section) => section.title) : input.body ?? [])
    .map((section) => humanizeArticleSectionTitle(section, focusLabel))
    .filter(Boolean)
    .slice(0, 5);
  const fallbackSections = ['先把判断讲清楚', '立刻补一个具体例子', '最后把下一步动作讲明白'];
  const finalSectionTitles = sectionTitles.length > 0 ? sectionTitles : fallbackSections;
  const numerals = ['一', '二', '三', '四', '五'];
  const ending = normalizeArticleEnding(
    parsed?.ending?.trim() || input.cta?.trim() || buildQuestionCloseFallback(focusLabel, 'article'),
    focusLabel
  );

  const hasSpecificArticleMaterial = /(下班前|Before\s*&?\s*After|层级演进|多维度对比|循环往复|反例：|修正：)/iu.test(cleaned);
  const shouldUseBlueprint =
    Boolean(focusBlueprint) &&
    (!cleaned ||
      structuredSections.length < 3 ||
      (looksLikeGenericArticleScaffold(cleaned, focusLabel) && !hasSpecificArticleMaterial));
  const blueprint = shouldUseBlueprint ? focusBlueprint : null;
  if (blueprint) {
    return renderArticleBlueprint(blueprint);
  }

  const blocks: string[] = [title.trim(), '', '导语', lead];
  finalSectionTitles.forEach((section, index) => {
    const baseParagraph = remaining[index] || `先把“${section}”说具体，再给一个例子或动作，不要停在口号上。`;
    const paragraph = buildArticleSectionParagraph(section, baseParagraph);
    blocks.push('', `${numerals[index] ?? `${index + 1}`}、${section}`, paragraph);
  });
  blocks.push('', '结尾', ending);

  const formatted = blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (
    focusBlueprint &&
    (looksLikeMalformedArticleOutput(formatted) ||
      (looksLikeGenericArticleScaffold(formatted, focusLabel) && !hasSpecificArticleMaterial))
  ) {
    return renderArticleBlueprint(focusBlueprint);
  }

  return formatted;
}

function normalizeThreadCardForComparison(value: string): string {
  return sanitizeGeneratedText(value, 'thread')
    .replace(/^\d+\/\d+\s*/u, '')
    .replace(/[。！？!?，,；;：:\s"“”‘’]/gu, '')
    .trim();
}


function buildSkillTrustThreadPosts(focus = '', cta?: string | null): string[] {
  const rawClose = cta?.trim() ?? '';
  const safeClose = rawClose && !/(只能先改|哪一步|哪一个|欢迎留言|求赞|讨论)/u.test(rawClose)
    ? rawClose
    : '评论区丢一个 Skill 链接或描述，我挑几个做公开审计。';
  const close = ensureSentenceEnding(safeClose).replace(/[。！？!?]+$/u, '。');

  const normalized = focus.trim();
  const isWorkflow = /工作流|搜索|比较|人工决定|发现到人工|看到.*很香/u.test(normalized);
  const isRiskEducation = /不是\s*prompt|prompt 文案|可执行工作流入口|风险教育/u.test(normalized);
  const isAuditDemo = /审计第|Codex\/Claude|安装命令|token 风险|来源、安装/u.test(normalized);

  const posts = isRiskEducation
    ? [
          '1/5\nAI skill 不是 prompt 文案。\n更准确地说，它可能是一个能被 Agent 调用的工作流入口。',
          '2/5\nPrompt 主要影响输出；skill 可能影响执行：读文件、跑命令、联网、调用 API、要求 token。风险边界完全不是一回事。',
          '3/5\n所以安装前先问 5 件事：来源是谁、装了什么、能碰哪些文件、会不会联网、要不要长期凭据。',
          '4/5\nSkillTrust 的价值不是替你保证安全，而是把这些证据放到同一页，降低你安装前的判断成本。',
          `5/5\n${close}`
        ]
      : isWorkflow
        ? [
            '1/5\n看到一个很香的 AI skill，我现在不会先点安装。\n我会先走 SkillTrust 的 5 步：搜来源、看命令、查权限、比证据、再人工决定。',
            '2/5\n第一步看来源：作者是谁、仓库是否公开、最近有没有维护。来源不清，功能越诱人越要慢一点。',
            '3/5\n第二步看执行边界：install 命令、文件读写、联网外传、token/凭据。这里决定它只是辅助，还是已经能影响你的环境。',
            '4/5\n第三步才比较功能。不是“能不能用”，而是证据够不够、风险能不能接受、要不要先沙箱试。',
            `5/5\n${close}`
          ]
      : isAuditDemo
        ? [
            '1/5\n装 Codex/Claude skill 前，最该看的不是功能有多香。\n先看它会碰到哪些执行边界。',
            '2/5\n真实场景：README 写“自动整理文件”，但安装命令会拉脚本、读工作区、联网请求，还可能要求 token。这里才是安装前判断的重点。',
            '3/5\n我会按 5 个信号看：来源/作者、install 命令、文件读写、网络外传、凭据要求。少一个证据，就先降级成待核验。',
            '4/5\nSkillTrust 不是安全担保。它做的是把来源、权限和风险信号聚在一起，让你别在兴奋时盲装。',
            `5/5\n${close}`
          ]
        : [
            '1/5\n装 AI skill 前，最该看的不是功能有多香。\n先看它会碰到哪些执行边界。',
            '2/5\n最常见的坑，是把 skill 当成普通提示词；但它可能读文件、跑命令、联网，甚至要求 token。',
            '3/5\n安装前先看来源、安装命令、权限范围、网络外传和凭据要求。证据不够，就先不要把执行权交出去。',
            '4/5\nSkillTrust 的定位是安装前判断系统：降低筛选成本，不替你承诺绝对安全。',
            `5/5\n${close}`
          ];

  return posts.map((item) => sanitizeGeneratedText(item, 'thread')).filter(Boolean);
}

export function formatThreadPosts(input: {
  focus?: string | null;
  hook?: string | null;
  body?: string[];
  cta?: string | null;
  humanized: string;
}): string[] {
  const cleaned = sanitizeGeneratedText(input.humanized, 'thread')
    .replace(/(?:^|\n)\*{1,3}\s*\d+\/\d+\s*\*{1,3}\s*/gu, '\n')
    .replace(/(?:^|\n)\d+\/\d+\s*/gu, '\n')
    .replace(/(?:^|\n)首条\s*/gu, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const sentences = splitSentences(cleaned);
  const focus = String(input.focus ?? '').trim();
  const opening = rewriteJudgmentHook(input.hook?.trim() || sentences[0] || cleaned, focus);
  const skillTrustFocus = isSkillTrustFocus(focus || opening);
  if (skillTrustFocus) {
    return buildSkillTrustThreadPosts(focus || opening, input.cta);
  }

  const promise = ensureSentenceEnding(
    sentences.find(
      (sentence) =>
        /(继续往下看|读下去|完读率|回复|互动|只改开头|只改这一处|概率)/u.test(sentence) &&
        ensureSentenceEnding(sentence) !== opening &&
        !(/用户反馈/u.test(focus || opening) && /翻\s*三倍|起码翻|互动率|1%|翻\s*\d+\s*倍|直接翻/u.test(sentence)) &&
        !(/用户反馈/u.test(focus || opening) && /多数人把.*用户反馈.*写得没反应|第一句没有给读者停下来的理由/u.test(sentence)) &&
        !(/用户反馈/u.test(focus || opening) && /用户原话|持续优化体验/u.test(sentence)) &&
        !(isColdStartFocus(focus || opening) && /1%|转化率|小红书爆款|服务器|爆款/u.test(sentence))
    ) ||
      (/用户反馈/u.test(focus || opening)
        ? '具体到某一句用户原话，读者才有东西可以回应。'
        : /功能上线|上线写成 thread|上线写成串推/u.test(focus || opening)
          ? '你愿意继续看，是因为想知道这次功能到底替你省掉哪一步。'
        : /团队工作流|固定节奏|等灵感/u.test(focus || opening)
          ? '有了固定节奏，周会前就知道谁先下判断、谁补例子。'
        : '只改开头这一处，读者继续读下去的概率就会明显不一样。')
  );
  const pickedScene = pickSceneSentence(sentences.slice(1), focus || opening);
  const scene =
    /用户反馈/u.test(focus || opening) &&
    (normalizeThreadCardForComparison(pickedScene) === normalizeThreadCardForComparison(promise) ||
      /具体到某一句用户原话，读者才有东西可以回应/u.test(pickedScene))
      ? buildSceneFallback(focus || opening)
      : pickedScene;
  const action = ensureSentenceEnding(
    pickActionSentence(sentences.slice(1), focus || opening)
      .replace(/^最后提醒读者可以多互动[。！？!?]?/u, '先删掉空泛提醒，只保留一个判断，再补一个真实场景')
      .replace(/回复率通常会比空泛求互动更高[。！？!?]?/u, '先删掉空泛提醒，只保留一个判断，再补一个真实场景')
  );
  const normalizedAction =
    /用户反馈/u.test(focus || opening) &&
    (/这种真实感比任何/u.test(action) ||
      /场景补全计划/u.test(action) ||
      /征求意见|寻求站队|最高效手段/u.test(action) ||
      /1%|翻\s*\d+\s*倍|直接翻/u.test(action) ||
      /读者看完还是不知道这(?:条|段)(?:最)?想证明什么/u.test(action) ||
      /归纳中心思想|痛点判断/u.test(action) ||
      /真正让人停下来|开头就先把判断讲清楚/u.test(action) ||
      /^[”"]/.test(action.trim()) ||
      action.replace(/[。！？!?]/gu, '') === ensureSentenceEnding(scene).replace(/[。！？!?]/gu, ''))
      ? ensureSentenceEnding(buildActionFallback(focus || opening))
      : /功能上线|上线写成 thread|上线写成串推/u.test(focus || opening) &&
          (/第一条必须先给判断|真正让人停下来|开头就先把判断讲清楚|所以现在我做任何新功能发布|读者看完还是不知道这(?:条|段)(?:最)?想证明什么/u.test(action) ||
            normalizeThreadCardForComparison(action) === normalizeThreadCardForComparison(scene))
        ? ensureSentenceEnding(buildActionFallback(focus || opening))
      : /团队工作流|固定节奏|等灵感/u.test(focus || opening) &&
          (/翻\s*\d+\s*倍|效率能直接|读者看完还是不知道这(?:条|段)(?:最)?想证明什么|第一屏永远结构模板|结构模版|结构模板/u.test(action) ||
            normalizeThreadCardForComparison(action) === normalizeThreadCardForComparison(scene))
        ? ensureSentenceEnding(buildActionFallback(focus || opening))
      : /[？?]\s*$/.test(action.trim()) || /^如果/u.test(action.trim())
        ? ensureSentenceEnding(buildActionFallback(focus || opening))
      : isColdStartFocus(focus || opening) && isDegradedColdStartScene(action)
        ? ensureSentenceEnding(buildActionFallback(focus || opening))
      : normalizeThreadCardForComparison(action) === normalizeThreadCardForComparison(scene)
        ? ensureSentenceEnding(buildActionFallback(focus || opening))
      : action;
  const closeFallback = buildQuestionCloseFallback(focus || opening, 'thread');
  const close = normalizeQuestionClose(
    input.cta?.trim() ||
      sentences.find((sentence) => /[？?]$/.test(sentence)) ||
      closeFallback,
    closeFallback
  );

  return [
    `1/4\n${opening}\n${promise}`,
    `2/4\n${scene}`,
    `3/4\n${normalizedAction}`,
    `4/4\n${close}`
  ]
    .map((item) => sanitizeGeneratedText(item, 'thread'))
    .filter(Boolean);
}

function trimToCharLimit(text: string, limit: number, questionEnding = false): string {
  const chars = [...text.trim()];
  if (chars.length <= limit) {
    const next = chars.join('').trim();
    return questionEnding ? next.replace(/[。！？!?]+$/u, '').concat('？') : ensureSentenceEnding(next);
  }

  const sliced = chars
    .slice(0, Math.max(0, limit - (questionEnding ? 1 : 0)))
    .join('')
    .replace(/[，,；;：:\s]+$/u, '')
    .trim();

  if (!sliced) return questionEnding ? '你会先改哪一步？' : '';
  return questionEnding ? sliced.replace(/[。！？!?]+$/u, '').concat('？') : ensureSentenceEnding(sliced);
}

export function enforceTweetLength(text: string, limit = 280): string {
  const cleaned = sanitizeGeneratedText(text, 'tweet');
  if ([...cleaned].length <= limit) return cleaned;

  const sentences = splitSentences(cleaned);
  const trailingQuestion = sentences.length > 1 && /[？?]$/.test(sentences[sentences.length - 1] ?? '')
    ? sentences.pop() ?? null
    : null;
  const closing = trailingQuestion ? trailingQuestion.trim() : null;
  const separator = closing ? ' ' : '';
  const budget = limit - (closing ? [...closing].length + [...separator].length : 0);

  let body = '';
  for (const sentence of sentences) {
    const candidate = `${body}${body ? '' : ''}${sentence}`.trim();
    if ([...candidate].length <= budget) {
      body = candidate;
      continue;
    }
    break;
  }

  if (!body) {
    const firstSentence = sentences[0] ?? cleaned;
    body = trimToCharLimit(firstSentence, Math.max(40, budget));
  }

  let finalText = `${body}${closing ? `${separator}${closing}` : ''}`.trim();
  if ([...finalText].length > limit && closing) {
    const reducedBody = trimToCharLimit(body, Math.max(24, limit - [...closing].length - 1));
    finalText = `${reducedBody} ${closing}`.trim();
  }

  if ([...finalText].length > limit) {
    finalText = trimToCharLimit(finalText, limit, /[？?]$/.test(finalText));
  }

  return sanitizeGeneratedText(finalText, 'tweet');
}

export function tightenTweetForEngagement(text: string, target = 250, focus = ''): string {
  const cleaned = sanitizeGeneratedText(text, 'tweet')
    .replace(/(第一句没把判断亮出来)(?=\s*多数人以为)/u, '$1。')
    .replace(/(第一句没把判断亮出来)(?=\s*多数冷启动内容没人停下来)/u, '$1。')
    .replace(/(第一句没把判断亮出来)(?=\s*比如)/u, '$1。')
    .replace(/某AI/gu, '某 AI')
    .replace(/某 AI写作/u, '某 AI 写作')
    .replace(/用AI/gu, '用 AI');
  const sentences = splitSentences(cleaned);
  const focusLabel = String(focus ?? '').trim();
  const needsRepair =
    /^["“]/u.test(cleaned) ||
    /冷启动中文AI 产品写作/u.test(cleaned) ||
    /最常见问题是：第一句没问/u.test(cleaned) ||
    /读者看完还是不知道这(?:条|段)最想证明什么/u.test(cleaned) ||
    /[‘“][^’”"]*$/u.test(cleaned) ||
    (isColdStartFocus(focusLabel) && isDegradedColdStartScene(cleaned));
  if (sentences.length <= 2 && [...cleaned].length <= Math.min(target, 220) && !needsRepair) return cleaned;

  const closeFallback = buildQuestionCloseFallback(focusLabel, 'tweet');
  const rawClosing = /[？?]$/.test(sentences[sentences.length - 1] ?? '') ? sentences.pop()?.trim() ?? null : null;
  const closing = rawClosing ? normalizeQuestionClose(rawClosing, closeFallback) : null;
  const hook = (sentences.shift()?.trim() ?? cleaned)
    .replace(/(第一句没有给读者停下来的理由)\s+(?:[^。！？!?]{0,12})?不是.+$/u, '$1')
    .replace(/(没有给读者停下来的理由)\s+(?:[^。！？!?]{0,12})?不是.+$/u, '$1');
  const support =
    sentences.find((sentence) => hasExampleSignal(sentence) || /(例子|真实|团队|读者|一次|场景|第一条)/u.test(sentence)) ??
    sentences.find((sentence) => !/(很多内容看起来|问题通常不是|真正拖慢|会继续变成)/u.test(sentence)) ??
    sentences[0] ??
    '';
  const normalizedHook = ensureSentenceEnding(
    (isColdStartFocus(focusLabel)
      ? 'AI 产品冷启动最容易输，不是内容少，是第一句没给具体使用场景'
      : /今天的?\s*AI 产品更新|产品更新|changelog/i.test(focusLabel)
        ? '今天这条产品更新别再写成 changelog，先讲用户今天立刻能感受到哪一点变化'
        : /首页第一屏|第一屏文案|直接滑走|第一行滑走/u.test(focusLabel)
          ? 'AI 产品首页第一屏最容易写废的，不是字太少，而是开头还在解释自己'
          : /AI 写作产品.*说明书|写成说明书/u.test(focusLabel)
            ? 'AI 写作产品一开口像说明书，通常不是功能少，而是第一句还没给判断'
            : hook)
      .replace(/^["“”]+/u, '')
      .replace(/”(?=没反应)/u, '')
      .replace(/多数人把“([^”]+)”写得没反应，不是缺观点，而是第一句没有给读者停下来的理由/u, '“$1”没反应，通常不是观点不够，而是第一句没把判断亮出来')
      .replace(/多数人把“([^”]+)”写得没反应，不是缺观点，而是第一句没让读者停下来的理由/u, '“$1”没反应，通常不是观点不够，而是第一句没把判断亮出来')
      .replace(/冷启动中文AI 产品写作最常见问题是：第一句没问[‘’“”"]?为什么你要读这个[？?]?/u, 'AI 产品冷启动最容易写废的，就是第一句没把判断亮出来')
      .replace(/第一句没问[‘’“”"]?为什么你要读这个[？?]?/u, '第一句没把判断亮出来')
      .replace(/\s+多数\s*AI 产品冷启动失败，不是缺技术，而是第一句话没给判断[。！？!?]?/u, '')
      .replace(/“([^”]+)的中文推文”/gu, '“$1”')
      .replace(/“([^”]+)的中文”/gu, '“$1”')
      .replace(/AI产品/u, 'AI 产品')
      .replace(/[‘’]/gu, '')
  );
  const cleanedSupport = support
    .trim()
    .replace(/^多数人以为AI 产品冷启动难是因为模型不够好，其实是第一句没给读者停下来的理由[。！？!?]?\s*/u, '')
    .replace(/^多数人以为 AI 产品冷启动难是因为模型不够好，其实是第一句没给读者停下来的理由[。！？!?]?\s*/u, '')
    .replace(/^多数冷启动内容没人停下来，不是缺信息，而是第一句还没给判断就先把背景讲完了[。！？!?]?\s*/u, '')
    .replace(/^不是文案太长，而是开头没给判断[——-]*/u, '')
    .replace(/^不是信息不够，而是/u, '')
    .replace(/^多数[^。！？!?]+不是[^。！？!?]+而是[^。！？!?]+[。！？!?]\s*/u, '')
    .replace(/^(?:[^。！？!?]{0,12})?不是[^。！？!?]+而是[^。！？!?]+[。！？!?]\s*/u, '')
    .replace(/^AI产品/u, 'AI 产品')
    .replace(/用户滑\s*past/giu, '用户直接滑走')
    .replace(/[‘’]/gu, '')
    .replace(/^比如第一条写“我们是一家做 AI 工作流的团队”，后面再补三句功能和愿景/u, '比如第一条先写“我们是一家做 AI 工作流的团队”，后面再补功能和愿景');
  const shouldRepairSupport =
    isColdStartFocus(focusLabel) ||
    /今天的?\s*AI 产品更新|产品更新|changelog|AI 写作产品.*说明书|写成说明书|首页第一屏|第一屏文案|用户反馈|功能上线|团队工作流|固定节奏|等灵感/i.test(
      focusLabel
    ) ||
    /读者看完还是不知道这(?:条|段)最想证明什么/u.test(cleanedSupport);
  const normalizedSupport = support
    ? shouldRepairSupport
      ? repairSceneSentence(cleanedSupport, focusLabel)
      : ensureSentenceEnding(cleanedSupport)
    : '';
  const merged = [normalizedHook, normalizedSupport, closing].filter(Boolean).join(' ').trim();
  const tightened = enforceTweetLength(merged || cleaned, target);
  const normalizedTightened = tightened
    .replace(/[’'"]+——/gu, '——')
    .replace(/[’'"]+\?/gu, '?')
    .replace(/[’'"]+？/gu, '？')
    .replace(/\s+[’'"](?=[？?])/gu, ' ')
    .replace(/(如果只能先改一个动作|你现在最想先改的是开头、例子，还是结尾)\?/u, closeFallback)
    .replace(/如果现在就改第一句，你最先删掉的是[^？?]+[？?]/u, closeFallback)
    .trim();
  return /[？?]$/.test(cleaned) && !/[？?]$/.test(normalizedTightened)
    ? enforceTweetLength(`${normalizedTightened} ${closing ?? closeFallback}`, target)
    : normalizedTightened;
}

function buildThreadSectionSentence(section: string): string {
  if (/为什么|没人停下来|读者|第一句/u.test(section)) {
    return '真正让人停下来的，不是信息更多，而是你在开头就先把判断讲清楚。';
  }
  if (/例子|证据|判断/u.test(section)) {
    return '同一个观点，只要补一个真实例子，读者马上就能分辨这是不是空话。';
  }
  if (/问题|动作|自说自话|结尾/u.test(section)) {
    return '结尾最有用的做法，不是求互动，而是抛出一个读者愿意回答的具体问题。';
  }
  return `先把“${normalizeSectionTitle(section)}”说具体，再补一个真实场景，读者才会继续往下看。`;
}

export function buildThreadHumanizedFallback(input: {
  hook?: string | null;
  body?: string[];
  cta?: string | null;
  draftPrimaryTweet?: string | null;
}): string {
  const sections = (input.body ?? []).map(normalizeSectionTitle).filter(Boolean).slice(0, 3);
  const opening = ensureSentenceEnding(
    input.hook?.trim() || input.draftPrimaryTweet?.trim() || '这条 thread 先只讲一个判断：为什么读者没有停下来。'
  );

  const bodySentences = sections.length > 0
    ? sections.map((section) => ensureSentenceEnding(buildThreadSectionSentence(section)))
    : [
        '先把判断说短，说具体，再补一个能让人马上理解的例子。',
        '这样读者才知道你不是在重复大词，而是真的在推进一个判断。'
      ].map(ensureSentenceEnding);

  const closing = ensureSentenceEnding(input.cta?.trim() || '如果只能先改一个动作，你会先改哪一步？');

  return sanitizeGeneratedText([opening, ...bodySentences, closing].join(' '), 'thread');
}

export function buildTweetHumanizedFallback(input: {
  focus?: string | null;
  draftPrimaryTweet?: string | null;
  hook?: string | null;
  cta?: string | null;
}): string {
  return composePublishReadyTweet({
    focus: input.focus?.trim(),
    hook: input.hook?.trim() || input.draftPrimaryTweet?.trim() || '先把一个判断讲清楚，再让读者决定要不要继续看。',
    cta: input.cta,
    humanized: input.draftPrimaryTweet?.trim() || input.hook?.trim() || ''
  });
}

export function buildArticleHumanizedFallback(input: {
  title?: string | null;
  hook?: string | null;
  body?: string[];
  cta?: string | null;
  draftPrimaryTweet?: string | null;
}): string {
  return formatXArticleText({
    focus: input.title || input.hook || undefined,
    title: input.title,
    hook: input.hook,
    body: input.body,
    cta: input.cta,
    humanized: input.draftPrimaryTweet?.trim() || input.hook?.trim() || ''
  });
}

export function buildDraftPayloadFallback(input: {
  format: ContentFormat;
  focus?: string | null;
  title?: string | null;
  hook?: string | null;
  body?: string[];
  cta?: string | null;
  draftPrimaryTweet?: string | null;
}): { primaryTweet: string; thread?: string[] } {
  if (input.format === 'thread') {
    const humanized = buildThreadHumanizedFallback({
      hook: input.hook,
      body: input.body,
      cta: input.cta,
      draftPrimaryTweet: input.draftPrimaryTweet
    });
    return {
      primaryTweet: humanized,
      thread: formatThreadPosts({
        focus: input.focus || input.hook,
        hook: input.hook,
        body: input.body,
        cta: input.cta,
        humanized
      })
    };
  }

  if (input.format === 'article') {
    return {
      primaryTweet: buildArticleHumanizedFallback({
        title: input.title,
        hook: input.hook,
        body: input.body,
        cta: input.cta,
        draftPrimaryTweet: input.draftPrimaryTweet
      })
    };
  }

  return {
    primaryTweet: buildTweetHumanizedFallback({
      focus: input.focus,
      draftPrimaryTweet: input.draftPrimaryTweet || input.hook,
      hook: input.hook,
      cta: input.cta
    })
  };
}
