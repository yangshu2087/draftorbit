import type { ContentFormat } from '../content-strategy';

export type BenchmarkFewShot = {
  id: string;
  format: ContentFormat;
  sourceSkill: string;
  useAs: 'opening' | 'evidence' | 'cta' | 'structure';
  text: string;
  note: string;
};

export type BenchmarkRulePack = {
  format: ContentFormat;
  openingPatterns: string[];
  evidencePatterns: string[];
  ctaPatterns: string[];
  antiPatterns: string[];
  formatPreferences: string[];
  rewriteRules: string[];
  sourceCorpusRefs: string[];
  fewShots: BenchmarkFewShot[];
};

const COMMON_SOURCE_REFS = [
  'baoyu-danger-x-to-markdown',
  'baoyu-url-to-markdown',
  'baoyu-youtube-transcript',
  'baoyu-format-markdown',
  'baoyu-translate',
  'baoyu-markdown-to-html'
];

export const BAOYU_WRITING_BENCHMARKS: Record<ContentFormat, BenchmarkRulePack> = {
  tweet: {
    format: 'tweet',
    openingPatterns: [
      '先给判断或反差，不先铺背景。',
      '第一句要让读者知道：这条内容为什么值得停下来。',
      '优先用“不是A，而是B”或“多数人误判在这里”的开头。'
    ],
    evidencePatterns: [
      '观点后面立刻补一个真实例子、反例、before/after 或动作。',
      '例子要能让读者一秒看懂问题发生在哪个场景。',
      '如果没有例子，至少给一个具体动作，不要停在方法论口号。'
    ],
    ctaPatterns: [
      '结尾优先提一个读者愿意回答的具体问题。',
      'CTA 要与观点强相关，避免“欢迎留言讨论”。',
      '如果是选择题式问题，优先两难判断，不要开放空题。'
    ],
    antiPatterns: [
      '先讲愿景再讲判断',
      '空泛口号',
      '欢迎留言讨论',
      '把同一个观点解释两遍',
      'meta 词污染正文'
    ],
    formatPreferences: [
      'tweet 优先 180-250 字，不追求写满 280。',
      '尽量控制在 2-4 句，句子长度不宜过于平均。',
      '默认不加 hashtag，除非用户明确要求。'
    ],
    rewriteRules: [
      '如果首句没有判断，重写首句。',
      '如果没有例子感，补一个最常见场景。',
      '如果结尾只是求互动，改成具体问题。'
    ],
    sourceCorpusRefs: COMMON_SOURCE_REFS,
    fewShots: [
      {
        id: 'tweet-judgment-first',
        format: 'tweet',
        sourceSkill: 'baoyu-danger-x-to-markdown',
        useAs: 'opening',
        text: '多数冷启动内容没人停下来，不是缺信息，而是第一句还没给判断就先把背景讲完了。',
        note: '开头先给判断 + 反差。'
      },
      {
        id: 'tweet-example-after-claim',
        format: 'tweet',
        sourceSkill: 'baoyu-format-markdown',
        useAs: 'evidence',
        text: '比如第一条同时讲定位、功能和愿景，读者读完也记不住你到底证明了什么。',
        note: '观点后立刻补一个可视化场景。'
      },
      {
        id: 'tweet-question-close',
        format: 'tweet',
        sourceSkill: 'baoyu-danger-x-to-markdown',
        useAs: 'cta',
        text: '如果只能先删一个信息块，你会先删定位、功能，还是故事？',
        note: '结尾用具体选择题驱动回复。'
      }
    ]
  },
  thread: {
    format: 'thread',
    openingPatterns: [
      '首条先给判断，再给 promise 和继续读理由。',
      '第一条就说清：下面几条会帮读者解决什么误判。',
      '开头不能只是“下面拆 3 点”，要先给观点。'
    ],
    evidencePatterns: [
      '至少一条专门讲真实场景或 before/after。',
      '每条只推进一个新信息，不重复上一条的判断。',
      '如果某条没有例子或动作，就容易沦为解释腔。'
    ],
    ctaPatterns: [
      '最后一条负责收束判断或抛出一个自然问题。',
      '不要用“看到这里的人评论区见”之类廉价 CTA。',
      '如果收束，优先给下一步动作；如果提问，优先让读者对比自己的经历。'
    ],
    antiPatterns: [
      '下面我只拆 3 点',
      '讲清为什么',
      '每条都像同义改写',
      '没有推进的编号条目',
      '最后只求互动不收束'
    ],
    formatPreferences: [
      '默认 4-7 条，不为拆而拆。',
      '首条和末条最重要，中间条目要有职责差异。',
      '每条都要独立可读，但整体要形成推进感。'
    ],
    rewriteRules: [
      '首条没有判断时，重写首条。',
      '中间条没有新信息时，用例子或动作重写。',
      '结尾弱时，改为问题或收束判断。'
    ],
    sourceCorpusRefs: COMMON_SOURCE_REFS,
    fewShots: [
      {
        id: 'thread-opening-promise',
        format: 'thread',
        sourceSkill: 'baoyu-danger-x-to-markdown',
        useAs: 'structure',
        text: '多数人把冷启动内容写成解释，不是信息不够，而是第一条没有先给判断。下面 3 条，我只讲怎么让第一条先把人留下来。',
        note: '首条要有判断和继续读理由。'
      },
      {
        id: 'thread-evidence-lane',
        format: 'thread',
        sourceSkill: 'baoyu-format-markdown',
        useAs: 'evidence',
        text: '真实场景是：第一条同时讲定位、功能和故事，读者读完也不知道你想证明哪一点。',
        note: '单独用一条讲场景。'
      }
    ]
  },
  article: {
    format: 'article',
    openingPatterns: [
      '标题要具体，导语第一段就进入判断。',
      '导语不要写成长背景介绍，而要先解释为什么这篇值得读完。',
      '每个小节标题都要能独立成立，不写空泛章节名。'
    ],
    evidencePatterns: [
      '每节至少补一个真实场景、反例、before/after 或具体动作。',
      '抽象判断必须落到一段能被可视化的描述。',
      '例子最好放在小节前半段，让读者尽快知道这节不是空话。'
    ],
    ctaPatterns: [
      '结尾先收束判断，再给一个可执行 takeaway 或问题。',
      '长文结尾不要只说“欢迎交流”。',
      '如果提问，优先让读者对照自己的实践，而不是泛泛聊观点。'
    ],
    antiPatterns: [
      '标题像产品说明书',
      '每节都只有判断没有例子',
      '导语空泛',
      '无法配图的抽象段落',
      '把长文写成 tweet 扩写版'
    ],
    formatPreferences: [
      '文章结构固定为标题、导语、3-5 节、结尾。',
      '段落宜短，每节只推进一个意思。',
      '每节最好天然适合封面图、插图、卡片或信息图切分。'
    ],
    rewriteRules: [
      '导语没有判断时，重写导语。',
      '小节没有场景时，补一个真实例子或反例。',
      '如果结构不可 skim，拆短段并重写标题。'
    ],
    sourceCorpusRefs: COMMON_SOURCE_REFS,
    fewShots: [
      {
        id: 'article-lead',
        format: 'article',
        sourceSkill: 'baoyu-format-markdown',
        useAs: 'opening',
        text: '很多团队第一篇冷启动长文失败，不是因为观点太少，而是每一段都想把背景解释完整，结果读者读完导语也还没看到判断。',
        note: '导语先给判断，再展开。'
      },
      {
        id: 'article-evidence',
        format: 'article',
        sourceSkill: 'baoyu-markdown-to-html',
        useAs: 'evidence',
        text: '比如把“先讲清价值”落成一句具体动作：第一段只证明一个价值点，第二段再补真实使用场景，读者就更容易继续读。',
        note: '长文每节都要能落到动作或场景。'
      }
    ]
  }
};
