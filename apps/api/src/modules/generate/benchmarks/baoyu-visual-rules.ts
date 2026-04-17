import type { ContentFormat } from '../content-strategy';

export type VisualAssetKind =
  | 'cover'
  | 'cards'
  | 'infographic'
  | 'illustration'
  | 'diagram';

export type VisualRule = {
  kind: VisualAssetKind;
  defaultPriority: 'primary' | 'supporting';
  type: string;
  layout: string;
  style: string;
  palette: string;
  rationale: string;
};

export const BAOYU_VISUAL_RULES: Record<ContentFormat, VisualRule[]> = {
  tweet: [
    {
      kind: 'cover',
      defaultPriority: 'primary',
      type: 'single-card',
      layout: '单观点主视觉 + 短判断标题',
      style: '高对比、低信息密度',
      palette: '深色底 + 高亮重点色',
      rationale: '适合让单条 tweet 的判断被一眼看懂。'
    },
    {
      kind: 'cards',
      defaultPriority: 'supporting',
      type: 'carousel-cards',
      layout: '一张主判断卡 + 一张例子卡',
      style: '社媒卡片、重点句放大',
      palette: '品牌主色 + 中性灰',
      rationale: '适合“判断 + 例子”结构的 tweet。'
    }
  ],
  thread: [
    {
      kind: 'cover',
      defaultPriority: 'primary',
      type: 'thread-cover',
      layout: '第一条封面 + 核心 promise',
      style: 'thread 首图',
      palette: '深色底 + 品牌强调色',
      rationale: '适合首条承担判断和继续读理由。'
    },
    {
      kind: 'cards',
      defaultPriority: 'primary',
      type: 'story-cards',
      layout: '按 2-4 张卡片切分每条推进点',
      style: '步骤或对比卡组',
      palette: '品牌主色渐变 + 白底正文',
      rationale: '适合 thread 逐条推进的信息结构。'
    },
    {
      kind: 'infographic',
      defaultPriority: 'supporting',
      type: 'before-after',
      layout: '流程或 before/after 信息图',
      style: '高密度结构图',
      palette: '浅底 + 强对比节点色',
      rationale: '适合 thread 中有固定步骤或结构对比时使用。'
    },
    {
      kind: 'diagram',
      defaultPriority: 'supporting',
      type: 'process-diagram',
      layout: 'flow',
      style: 'blueprint',
      palette: '品牌主色 + 中性灰',
      rationale: '适合把 thread 的步骤或因果链整理成流程图。'
    }
  ],
  article: [
    {
      kind: 'cover',
      defaultPriority: 'primary',
      type: 'editorial-cover',
      layout: '文章标题封面 + 一个具体场景',
      style: '长文封面',
      palette: '杂志感中性色 + 一处品牌亮色',
      rationale: '帮助长文建立进入感。'
    },
    {
      kind: 'illustration',
      defaultPriority: 'primary',
      type: 'section-illustrations',
      layout: '每个小节一张解释图或场景图',
      style: '插图式辅助阅读',
      palette: '统一插画色板',
      rationale: '适合长文中可视化的场景、反例和动作。'
    },
    {
      kind: 'infographic',
      defaultPriority: 'supporting',
      type: 'summary-infographic',
      layout: '步骤、结构、before/after 一图收束',
      style: '信息图',
      palette: '浅底 + 品牌强调色',
      rationale: '适合把长文压缩成可分享的图。'
    },
    {
      kind: 'diagram',
      defaultPriority: 'supporting',
      type: 'process-diagram',
      layout: 'flow',
      style: 'blueprint',
      palette: '浅底 + 品牌强调色',
      rationale: '适合把长文里的流程、判断树或系统关系画成 diagram。'
    }
  ]
};
