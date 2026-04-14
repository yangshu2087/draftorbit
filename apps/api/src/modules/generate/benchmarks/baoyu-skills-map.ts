export type DistilledSkillCategory =
  | 'learning'
  | 'writing'
  | 'visual'
  | 'image-runtime'
  | 'publish';

export type DistilledSkillUsage =
  | 'prompt_section'
  | 'few_shot'
  | 'rewrite_instruction'
  | 'anti_pattern'
  | 'visual_planning'
  | 'runtime_provider'
  | 'derivative_rule'
  | 'reference_only';

export type BaoyuSkillMapEntry = {
  skill: string;
  category: DistilledSkillCategory;
  draftOrbitSurface: string;
  distilledInto: DistilledSkillUsage[];
  summary: string;
};

export const BAOYU_SKILLS_MAP: BaoyuSkillMapEntry[] = [
  {
    skill: 'baoyu-url-to-markdown',
    category: 'learning',
    draftOrbitSurface: 'learning sources / corpus shaping',
    distilledInto: ['few_shot', 'prompt_section', 'reference_only'],
    summary: '网页内容先被整理成干净 markdown，再进入风格分析和 evidence 选择。'
  },
  {
    skill: 'baoyu-danger-x-to-markdown',
    category: 'learning',
    draftOrbitSurface: 'x corpus normalization',
    distilledInto: ['few_shot', 'anti_pattern', 'prompt_section'],
    summary: 'X 内容先去平台噪声，再抽取 hook、例子和 CTA 模式。'
  },
  {
    skill: 'baoyu-youtube-transcript',
    category: 'learning',
    draftOrbitSurface: 'external evidence shaping',
    distilledInto: ['few_shot', 'prompt_section'],
    summary: '视频口播可被转成结构化证据片段，适合写长文和 thread。'
  },
  {
    skill: 'baoyu-format-markdown',
    category: 'writing',
    draftOrbitSurface: 'article structure / cleanup',
    distilledInto: ['rewrite_instruction', 'derivative_rule'],
    summary: '强调段落、标题、列表和可 skim 的长文结构。'
  },
  {
    skill: 'baoyu-translate',
    category: 'writing',
    draftOrbitSurface: 'derivative guidance',
    distilledInto: ['derivative_rule', 'reference_only'],
    summary: '翻译规则被蒸馏为“什么时候内容适合跨语言导出”。'
  },
  {
    skill: 'baoyu-markdown-to-html',
    category: 'writing',
    draftOrbitSurface: 'article export readiness',
    distilledInto: ['derivative_rule'],
    summary: '推动 article 先写成稳定 markdown，再考虑 HTML 导出。'
  },
  {
    skill: 'baoyu-cover-image',
    category: 'visual',
    draftOrbitSurface: 'visual planning',
    distilledInto: ['visual_planning'],
    summary: '帮助判断内容是否适合封面图，以及封面该突出哪个判断。'
  },
  {
    skill: 'baoyu-article-illustrator',
    category: 'visual',
    draftOrbitSurface: 'article illustration planning',
    distilledInto: ['visual_planning'],
    summary: '把长文中最可视化的小节挑出来，形成插图位点。'
  },
  {
    skill: 'baoyu-image-cards',
    category: 'visual',
    draftOrbitSurface: 'tweet/thread card planning',
    distilledInto: ['visual_planning'],
    summary: '适合把判断和例子拆成社媒卡片。'
  },
  {
    skill: 'baoyu-xhs-images',
    category: 'visual',
    draftOrbitSurface: 'vertical card heuristics',
    distilledInto: ['visual_planning'],
    summary: '被蒸馏为高转化纵版卡片版式规则，而不是暴露小红书模式。'
  },
  {
    skill: 'baoyu-infographic',
    category: 'visual',
    draftOrbitSurface: 'infographic planning',
    distilledInto: ['visual_planning'],
    summary: '适合流程、对比、before/after 等高密度内容。'
  },
  {
    skill: 'baoyu-comic',
    category: 'visual',
    draftOrbitSurface: 'knowledge-comic heuristics',
    distilledInto: ['visual_planning', 'reference_only'],
    summary: '适合反例、误区、冲突明显的教育型内容。'
  },
  {
    skill: 'baoyu-slide-deck',
    category: 'visual',
    draftOrbitSurface: 'slide-summary planning',
    distilledInto: ['visual_planning', 'derivative_rule'],
    summary: '适合从 article/thread 提取 3-5 页摘要。'
  },
  {
    skill: 'baoyu-image-gen',
    category: 'image-runtime',
    draftOrbitSurface: 'visual provider seam parity',
    distilledInto: ['visual_planning', 'reference_only'],
    summary: '本轮通过 baoyu-imagine 同类 provider seam 对齐，不单独暴露 image-gen 模式。'
  },
  {
    skill: 'baoyu-imagine',
    category: 'image-runtime',
    draftOrbitSurface: 'visual artifact runtime',
    distilledInto: ['runtime_provider', 'visual_planning'],
    summary: '已作为图文资产 runtime 接入：生成 prompt files、调用 baoyu image runtime，并由 DraftOrbit 模板层渲染可审计 SVG。'
  },
  {
    skill: 'baoyu-compress-image',
    category: 'image-runtime',
    draftOrbitSurface: 'delivery standards',
    distilledInto: ['reference_only'],
    summary: '本轮蒸馏压缩/交付质量标准，不直连运行时。'
  },
  {
    skill: 'baoyu-post-to-x',
    category: 'publish',
    draftOrbitSurface: 'publish readiness',
    distilledInto: ['derivative_rule', 'reference_only'],
    summary: '蒸馏 X 发布前的格式收口要求，但不直接接 runtime。'
  },
  {
    skill: 'baoyu-post-to-wechat',
    category: 'publish',
    draftOrbitSurface: 'cross-platform derivative rules',
    distilledInto: ['derivative_rule', 'reference_only'],
    summary: '只学习其导出规范，不接主发布链。'
  },
  {
    skill: 'baoyu-post-to-weibo',
    category: 'publish',
    draftOrbitSurface: 'cross-platform derivative rules',
    distilledInto: ['derivative_rule', 'reference_only'],
    summary: '只学习其导出规范，不接主发布链。'
  }
];
