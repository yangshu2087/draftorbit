import type { ContentFormat } from '../content-strategy';

export type DerivativeRuleSet = {
  markdown: string[];
  html: string[];
  translation: string[];
  slideSummary: string[];
};

export const BAOYU_DERIVATIVE_RULES: Record<ContentFormat, DerivativeRuleSet> = {
  tweet: {
    markdown: ['句子短、换行少时可直接规范化为卡片文案。'],
    html: ['tweet 通常不需要 HTML，但当其承担长图文说明时可转为极简 HTML 摘录。'],
    translation: ['判断句和例子分明时更适合翻译成英文摘要。'],
    slideSummary: ['单条 tweet 默认不产 slide summary。']
  },
  thread: {
    markdown: ['thread 每条职责清晰时，适合整理成 markdown 结构摘要。'],
    html: ['thread 有明显开头/中段/结尾时，可导出成长页摘要。'],
    translation: ['当 thread 的条目不依赖中文梗或语气词时，适合翻译。'],
    slideSummary: ['当 thread 有 3-5 个推进点时，适合 slide-style summary。']
  },
  article: {
    markdown: ['标题、导语、小节和结尾完整时，适合稳定导出 markdown。'],
    html: ['article 结构完整且段落可 skim 时，适合导出 HTML。'],
    translation: ['长文每节都具备清晰判断与例子时，更适合做译文。'],
    slideSummary: ['长文存在 3-5 个强小节时，适合做 slide-style summary。']
  }
};
