import type { BaoyuPromptSuiteItem } from './baoyu-fixed-prompt-suite';

export const BAOYU_ADVERSARIAL_PROMPT_SUITE: BaoyuPromptSuiteItem[] = [
  {
    id: 'adversarial-tweet-cold-start-real-regression',
    format: 'tweet',
    prompt: '别再靠灵感写推文，给我一条更像真人的冷启动判断句。',
    baoyuBaselineNotes: ['只把“给我一条/更像真人”当约束', '正文落到内容团队冷启动场景', '不能复述原 prompt'],
    expectedStrengths: ['判断利落', '有周一/周三这类真实工作场景', '自然 close'],
    knownAntiPatterns: ['prompt 泄漏', '这种自我介绍', '读者扫完整条还是不知道']
  },
  {
    id: 'adversarial-tweet-goal-wrapper',
    format: 'tweet',
    prompt: '别再靠灵感写 目标，写一条中文短推。',
    baoyuBaselineNotes: ['“别再靠灵感写”是元指令，不应原样进正文', '需要把目标写作落到具体团队动作'],
    expectedStrengths: ['不复读包装词', '目标要具体', '适合 single-card'],
    knownAntiPatterns: ['别再靠灵感写 目标', '空泛方法论', '欢迎交流']
  },
  {
    id: 'adversarial-tweet-skills-wrapper',
    format: 'tweet',
    prompt: '别再靠灵感写 什么是skills，写一条像真人发出来的中文推文。',
    baoyuBaselineNotes: ['skills 是主题，包装词不能进入正文', '需要用真实使用场景解释 skills'],
    expectedStrengths: ['解释有例子', '不像术语定义', '自然提问'],
    knownAntiPatterns: ['别再靠灵感写 什么是skills', '百科腔', '空结尾']
  },
  {
    id: 'adversarial-thread-around-action',
    format: 'thread',
    prompt: '用“围绕”拆解动作，写一个关于 AI 内容团队工作流的 thread。',
    baoyuBaselineNotes: ['“围绕”是写作动作，不应成为正文主语', '第 3 条必须是具体动作，不是建议模板'],
    expectedStrengths: ['4-6 条', '第 3 条有动作/拆解', '有团队工作流场景'],
    knownAntiPatterns: ['用“围绕”拆解动作', '下面我拆 3 点', '第 3 条像建议模板']
  },
  {
    id: 'adversarial-tweet-product-update',
    format: 'tweet',
    prompt: '把一次 AI 产品更新写成一条判断句更利落的推文，不要像 changelog，也不要用“欢迎留言讨论”。',
    baoyuBaselineNotes: ['更新点要写成用户可感知的 before/after', '结尾不能模板求互动'],
    expectedStrengths: ['判断句利落', '有 before/after', '自然 close'],
    knownAntiPatterns: ['changelog 腔', '欢迎留言讨论', '功能列表']
  },
  {
    id: 'adversarial-thread-third-template',
    format: 'thread',
    prompt: '写一个关于 AI 产品首页第一屏文案的 thread，特别注意第 3 条别像建议模板。',
    baoyuBaselineNotes: ['第三条必须落到删愿景/留用户动作等具体拆法', '每条职责不同'],
    expectedStrengths: ['第 3 条不是建议模板', '有第一屏 before/after', '适合 cover+cards'],
    knownAntiPatterns: ['第 3 条像建议模板', '条目职责重复', '没有第一屏场景']
  },
  {
    id: 'adversarial-article-method-title',
    format: 'article',
    prompt: '写一篇关于 AI 写作产品为什么容易把内容写成说明书的中文文章，标题更不像方法论标题，更像真人文章标题。',
    baoyuBaselineNotes: ['标题要像读者问题/真实摩擦', '每节至少一个坏例子或改法'],
    expectedStrengths: ['标题有人味', '每节有例子', '结构可导出'],
    knownAntiPatterns: ['方法论标题', '章节无例子', '首节复述标题']
  },
  {
    id: 'adversarial-article-all-judgment-no-example',
    format: 'article',
    prompt: '写一篇中文 X 长文，主题是 AI 内容表达不要全是判断没有例子。',
    baoyuBaselineNotes: ['每一节都要出现场景/反例/动作', '不能只讲抽象判断'],
    expectedStrengths: ['每节有场景', '可视化锚点明确', '结尾自然'],
    knownAntiPatterns: ['全是判断', '没有例子', '无法切图']
  },
  {
    id: 'latest-hermes-ambiguous',
    format: 'article',
    prompt: '生成关于最新的 Hermes 的文章',
    baoyuBaselineNotes: ['Hermes 可能是奢侈品牌、AI 模型或项目名', '无明确来源时必须自动检索并在歧义时阻断'],
    expectedStrengths: ['sourceArtifacts ready，或 source_ambiguous 明确阻断', '不编造最新事实', '候选来源可见'],
    knownAntiPatterns: ['直接猜实体', '没有来源仍写最新新闻', 'source failure 被包装成普通质量失败']
  },
  {
    id: 'latest-ai-model-with-url',
    format: 'article',
    prompt: '根据这个来源写一篇关于最新 AI 模型发布的 X 长文：https://openrouter.ai/anthropic/claude-sonnet-4.6',
    baoyuBaselineNotes: ['URL 必须先抓成 markdown', '写作只引用 source artifact 的事实'],
    expectedStrengths: ['sourceArtifacts ready', '段落有来源事实', '图文 cue 来自正文与来源'],
    knownAntiPatterns: ['跳过 URL 抓取', '只根据模型记忆编造', 'visual cue 复读 URL prompt']
  },
  {
    id: 'latest-product-update-no-url',
    format: 'tweet',
    prompt: '把今天的 AI 产品更新写成一条像真人发出来的中文推文，不要像 changelog。',
    baoyuBaselineNotes: ['无 URL 但有今天/更新信号，必须走 search provider', 'provider 不可用时 fail-closed'],
    expectedStrengths: ['source ready 或 source_not_configured/source_search_failed 阻断', '不编造更新点'],
    knownAntiPatterns: ['把“今天更新”写成泛泛功能想象', '没有来源仍展示成稿']
  }
];
