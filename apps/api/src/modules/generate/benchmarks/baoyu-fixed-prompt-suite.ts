import type { ContentFormat } from '../content-strategy';

export type BaoyuPromptSuiteItem = {
  id: string;
  format: ContentFormat;
  prompt: string;
  baoyuBaselineNotes: string[];
  expectedStrengths: string[];
  knownAntiPatterns: string[];
};

export const BAOYU_FIXED_PROMPT_SUITE: BaoyuPromptSuiteItem[] = [
  {
    id: 'tweet-ai-cold-start',
    format: 'tweet',
    prompt: '写一条关于 AI 产品冷启动的中文短推，重点讲清“第一句先给判断，再补一个例子”为什么更容易让读者停下来。',
    baoyuBaselineNotes: ['判断先行', '必须落到真实场景', '结尾是具体问题'],
    expectedStrengths: ['hook 利落', '有例子感', '自然 close'],
    knownAntiPatterns: ['空泛判断', '欢迎交流', '双重诊断句']
  },
  {
    id: 'tweet-product-update',
    format: 'tweet',
    prompt: '把一次 AI 产品更新写成一条像真人发出来的中文推文，不要像 changelog。',
    baoyuBaselineNotes: ['更新点具体', '用用户摩擦切入', '像创始人/产品本人发言'],
    expectedStrengths: ['有人味', '不是公告腔', '适合配 cover'],
    knownAntiPatterns: ['功能列表', '模板式感谢用户', '像发布说明书']
  },
  {
    id: 'tweet-knowledge-opinion',
    format: 'tweet',
    prompt: '写一条关于“AI 写作产品为什么容易把内容写成说明书”的中文观点短推。',
    baoyuBaselineNotes: ['反直觉判断', '必须举一个说明书式坏例子'],
    expectedStrengths: ['判断鲜明', '反例明确', '可拆成图卡'],
    knownAntiPatterns: ['大词堆砌', '没有坏例子', '结尾空泛提问']
  },
  {
    id: 'tweet-launch-page',
    format: 'tweet',
    prompt: '写一条关于“AI 产品首页第一屏文案怎么避免被直接滑走”的中文短推。',
    baoyuBaselineNotes: ['要有第一屏/滑走场景', '最好包含 before/after'],
    expectedStrengths: ['场景清晰', '可视化强', '适合 single-card'],
    knownAntiPatterns: ['没有用户行为场景', '像运营手册']
  },
  {
    id: 'thread-ai-cold-start',
    format: 'thread',
    prompt: '围绕 AI 产品冷启动，写一个中文 thread，讲为什么“先下判断，再补例子，再抛问题”比堆信息更容易获得原生互动。',
    baoyuBaselineNotes: ['首条必须给 promise', '至少一条专讲场景', '最后一条自然收束'],
    expectedStrengths: ['真正拆成多条', '推进感强', '适合 cover+cards'],
    knownAntiPatterns: ['下面我拆 3 点', '每条像同义改写', '最后只求互动']
  },
  {
    id: 'thread-user-feedback',
    format: 'thread',
    prompt: '写一个 thread，讲 AI 产品怎么把用户反馈写成更容易引发回复的内容。',
    baoyuBaselineNotes: ['首条判断', '中间条给反馈场景', '末条让读者对照自己的经历'],
    expectedStrengths: ['有场景', '有动作', '问题自然'],
    knownAntiPatterns: ['解释腔', '像知识科普', '没有具体反馈片段']
  },
  {
    id: 'thread-feature-story',
    format: 'thread',
    prompt: '把一次 AI 功能上线写成 thread，要求不像发布说明，而像一组连贯观点。',
    baoyuBaselineNotes: ['避免 changelog 腔', '至少一条讲真实使用场景'],
    expectedStrengths: ['像真人串推', '不是列表', '适合卡片拆分'],
    knownAntiPatterns: ['条目职责重复', '首条没有继续读理由']
  },
  {
    id: 'thread-team-workflow',
    format: 'thread',
    prompt: '写一个关于 AI 内容团队工作流的中文 thread，重点讲为什么固定节奏比等灵感更有效。',
    baoyuBaselineNotes: ['必须给工作流场景', '至少有 before/after'],
    expectedStrengths: ['动作清楚', '中段不抽象', '可做 infographic'],
    knownAntiPatterns: ['方法论标题党', '没有团队场景']
  },
  {
    id: 'article-ai-cold-start',
    format: 'article',
    prompt: '写一篇关于 AI 产品冷启动的中文 X 文章，重点讲为什么“先下判断，再给例子，再给动作”更容易被读完和回复。',
    baoyuBaselineNotes: ['标题像真人文章标题', '导语先进入摩擦', '每节可视化'],
    expectedStrengths: ['结构清楚', '每节有场景', '适合 cover+illustrations'],
    knownAntiPatterns: ['方法论标题', '首节复述标题', '章节无例子']
  },
  {
    id: 'article-launch-copy',
    format: 'article',
    prompt: '写一篇关于“AI 产品上线文案为什么容易写成产品说明书”的中文文章。',
    baoyuBaselineNotes: ['标题要有读者问题', '需要坏例子和改法'],
    expectedStrengths: ['反例明确', '适合 infographic', '节奏可 skim'],
    knownAntiPatterns: ['全是判断', '没有坏例子', '结尾弱']
  },
  {
    id: 'article-founder-voice',
    format: 'article',
    prompt: '用创始人口吻写一篇中文 X 长文，讲产品早期为什么要先把一句判断讲透，而不是急着讲完整故事。',
    baoyuBaselineNotes: ['有创始人摩擦感', '必须有一次真实决策场景'],
    expectedStrengths: ['代入感强', '像人写', '不是模板长文'],
    knownAntiPatterns: ['全篇像教程', '没有真实决策场景']
  },
  {
    id: 'article-knowledge-to-visual',
    format: 'article',
    prompt: '写一篇适合后续做信息图的中文长文，主题是“AI 内容表达里哪些段落天然适合视觉化”。',
    baoyuBaselineNotes: ['每节都要有视觉锚点', '最好能切成 cover/illustration/infographic'],
    expectedStrengths: ['visualizable', '结构能导出', '适合 slide-summary'],
    knownAntiPatterns: ['抽象段落太多', '无法切图', '只剩关键词']
  }
];
