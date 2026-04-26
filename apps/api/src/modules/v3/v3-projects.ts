import { BadRequestException } from '@nestjs/common';

export const PROJECT_PRESETS = ['generic_x_ops', 'skilltrust_x_ops'] as const;
export type ProjectPreset = typeof PROJECT_PRESETS[number];

export type ProjectPresetMetadata = {
  preset: ProjectPreset;
  objective: string;
  audience: string;
  contentPillars: string[];
  sourceUrls: string[];
  visualDefaults: {
    mode: 'auto' | 'cover' | 'cards' | 'infographic' | 'article_illustration' | 'diagram' | 'social_pack';
    style: 'draftorbit' | 'notion' | 'sketch-notes' | 'blueprint' | 'minimal' | 'bold-editorial';
    layout: 'auto' | 'sparse' | 'balanced' | 'dense' | 'list' | 'comparison' | 'flow' | 'mindmap' | 'quadrant';
    palette: 'auto' | 'draftorbit' | 'macaron' | 'warm' | 'neon' | 'mono';
    aspect: 'auto' | '1:1' | '16:9' | '4:5' | '2.35:1';
    exportHtml: boolean;
  };
  publishChecklist: string[];
  defaultFormat: 'tweet' | 'thread' | 'article';
  safetyCopy: string;
  qualityRules: string[];
  threadBlueprint: string[];
  visualBlueprint: string[];
  forbiddenClaims: string[];
  ctaAllowlist: string[];
  createdByFeature: 'project-ops-workbench';
};

export type ContentProjectLike = {
  name: string;
  description?: string | null;
  metadata?: unknown;
};

export type ProjectRunLike = {
  id: string;
  status: string;
  type: string;
  createdAt: Date;
  result: unknown;
  publishJobs?: Array<{ status?: string | null }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function normalizeProjectPreset(raw?: ProjectPreset | string | null): ProjectPreset {
  if (!raw) return 'generic_x_ops';
  if ((PROJECT_PRESETS as readonly string[]).includes(raw)) return raw as ProjectPreset;
  throw new BadRequestException({
    code: 'INVALID_PROJECT_REQUEST',
    message: 'INVALID_PROJECT_REQUEST: 项目预设无效，请选择通用 X 运营或 SkillTrust 推特/X 运营。'
  });
}

export function buildProjectPresetMetadata(presetInput?: ProjectPreset | string | null): ProjectPresetMetadata {
  const preset = normalizeProjectPreset(presetInput);
  if (preset === 'skilltrust_x_ops') {
    return {
      preset,
      objective: '把 SkillTrust 做成中文 AI 用户安装 Agent skill 前的判断系统，降低安装前的信息不对称。',
      audience: '中文 AI 用户、Agent builders、重视安装前风险判断的开发者与小团队。',
      contentPillars: ['审计演示', '风险教育', '工作流方法', '发布日志', '数据洞察'],
      sourceUrls: [],
      visualDefaults: {
        mode: 'cards',
        style: 'blueprint',
        layout: 'flow',
        palette: 'draftorbit',
        aspect: '16:9',
        exportHtml: true
      },
      publishChecklist: [
        '降低判断成本，不做安全担保',
        '只使用已核验来源；无证据不造数字',
        '避免把风险结论写成恐吓营销',
        '发布前必须人工确认',
        '不自动发帖'
      ],
      defaultFormat: 'thread',
      safetyCopy: '降低判断成本，不做安全担保；发布前人工确认。',
      qualityRules: [
        '默认风格是证据型锋利：第一句指出具体误区、风险或可操作清单',
        '先给证据卡：已核验事实、待核验事实、禁用/降级表述',
        '没有来源或数字证据时，必须写待核验/当前资料显示，不能包装成事实',
        'SkillTrust 是安装前判断系统，不承诺绝对安全，也不是安全担保',
        '每条 thread 都要有具体场景、检查动作和低门槛互动'
      ],
      threadBlueprint: [
        '1/ 痛点钩子：一个强判断，指出盲装 Agent skill 的具体风险',
        '2/ 误区或案例：为什么普通资源清单不够',
        '3/ 风险机制：命令、联网、文件读写、token 或来源不明',
        '4/ 检查清单：来源/作者/仓库',
        '5/ 检查清单：权限/安装命令/网络外传',
        '6/ SkillTrust 入口：搜索、比较、审计证据和风险信号',
        '7/ 低门槛 CTA：评论区丢一个 Skill 链接或描述，我挑几个做公开审计'
      ],
      visualBlueprint: [
        '4 图卡片结构：封面、风险、证据、行动',
        '封面：一句刺痛 hook，移动端可读',
        '风险：source/permission/command/network/token 中至少一个具体机制',
        '证据：只放 SkillTrust 可验证字段或通用检查动作，不造数字',
        '行动：compare/search/checklist/评论区丢 Skill 链接，停在人工确认'
      ],
      forbiddenClaims: ['全网最大', '最安全', '绝对安全', '官方背书', '保证无风险', '自动发布成功', '未经证据的百分比或规模数字'],
      ctaAllowlist: ['评论区丢一个 Skill 链接或描述，我挑几个做公开审计', '收藏这张安装前检查清单', '把候选丢进 SkillTrust compare，再决定要不要装', '先查，再装： https://skilltrust.ai'],
      createdByFeature: 'project-ops-workbench'
    };
  }

  return {
    preset,
    objective: '围绕一个项目持续产出可信的 X 内容，沉淀风格、来源和发布前检查。',
    audience: '关注项目进展、AI 产品、创业和内容运营的中文 X 用户。',
    contentPillars: ['观点短推', '经验复盘', '产品更新', '案例拆解', '数据洞察'],
    sourceUrls: [],
    visualDefaults: {
      mode: 'auto',
      style: 'draftorbit',
      layout: 'balanced',
      palette: 'draftorbit',
      aspect: '16:9',
      exportHtml: true
    },
    publishChecklist: ['事实有来源', '不承诺爆款', '避免夸大结论', '发布前人工确认', '不自动发帖'],
    defaultFormat: 'thread',
    safetyCopy: '默认只进入发布准备与人工确认，不自动发帖。',
    qualityRules: ['先给判断，再给具体例子，最后给一个低门槛动作', '事实有来源；没有证据不造数字', '发布前人工确认'],
    threadBlueprint: ['1/ 痛点或判断', '2/ 场景或例子', '3/ 方法或证据', '4/ 行动建议'],
    visualBlueprint: ['封面突出主判断', '中段用卡片或对比图说明动作', '结尾保留人工确认与导出'],
    forbiddenClaims: ['必爆', '全网最大', '绝对安全', '自动发布成功'],
    ctaAllowlist: ['收藏备用', '评论区补充你的场景', '发布前人工确认'],
    createdByFeature: 'project-ops-workbench'
  };
}

export function mergeProjectMetadata(input: {
  preset?: ProjectPreset | string | null;
  metadata?: Record<string, unknown> | null;
}): ProjectPresetMetadata & Record<string, unknown> {
  const base = buildProjectPresetMetadata(input.preset);
  const incoming = input.metadata ?? {};
  const merged: ProjectPresetMetadata & Record<string, unknown> = {
    ...base,
    ...incoming,
    preset: base.preset,
    contentPillars: stringList(incoming.contentPillars).length > 0 ? stringList(incoming.contentPillars) : base.contentPillars,
    sourceUrls: stringList(incoming.sourceUrls),
    publishChecklist: stringList(incoming.publishChecklist).length > 0 ? stringList(incoming.publishChecklist) : base.publishChecklist,
    visualDefaults: isRecord(incoming.visualDefaults)
      ? { ...base.visualDefaults, ...incoming.visualDefaults }
      : base.visualDefaults,
    createdByFeature: 'project-ops-workbench'
  };
  return merged;
}

export function getProjectMetadata(project: ContentProjectLike): ProjectPresetMetadata & Record<string, unknown> {
  if (isRecord(project.metadata)) {
    const preset = normalizeProjectPreset(typeof project.metadata.preset === 'string' ? project.metadata.preset : undefined);
    return mergeProjectMetadata({ preset, metadata: project.metadata });
  }
  return buildProjectPresetMetadata('generic_x_ops');
}


function buildSkillTrustQualityLines(metadata: ProjectPresetMetadata & Record<string, unknown>): string[] {
  if (metadata.preset !== 'skilltrust_x_ops') return [];
  return [
    'SkillTrust 内容质量协议：',
    '- 语气：证据型锋利；像资深 AI 工具玩家提醒朋友，具体但不恐吓。',
    '- 证据卡：开写前先在草稿内部区分已核验事实 / 待核验事实 / 禁用表述；最终正文只保留可发布内容。',
    '- Thread 结构：优先 6-8 条；每条只推进一个新信息；避免“下面我来拆”“欢迎留言讨论”式解释腔。',
    `- 默认蓝图：${metadata.threadBlueprint.join(' / ')}`,
    `- 图文要求：${metadata.visualBlueprint.join(' / ')}`,
    '- 4 图卡片必须覆盖：封面 → 风险 → 证据 → 行动。',
    `- CTA 只能从这些低门槛动作中选择或等价改写：${metadata.ctaAllowlist.join('；')}`,
    `- 禁用表述：${metadata.forbiddenClaims.join('、')}；不承诺绝对安全，不把 SkillTrust 写成安全担保。`,
    '输出时必须给可发布 thread 和图文规划；如果涉及最新事实但没有来源，明确要求补来源，不编造。'
  ];
}

export function buildProjectGenerationIntent(input: {
  project: ContentProjectLike;
  userIntent: string;
  sourceUrls?: string[];
}): string {
  const metadata = getProjectMetadata(input.project);
  const sourceUrls = [...new Set([...(metadata.sourceUrls ?? []), ...(input.sourceUrls ?? [])].map((url) => url.trim()).filter(Boolean))];
  const sourceLine = sourceUrls.length > 0 ? `可用来源：${sourceUrls.join('；')}` : '可用来源：如果任务涉及最新事实但没有来源，必须要求补充来源，不能编造。';

  return [
    `本次运营主题：${input.userIntent.trim()}`,
    `项目：${input.project.name}`,
    input.project.description ? `项目说明：${input.project.description}` : null,
    `目标：${metadata.objective}`,
    `受众：${metadata.audience}`,
    `内容支柱：${metadata.contentPillars.join('、')}`,
    sourceLine,
    `视觉风格：${metadata.visualDefaults.mode} / ${metadata.visualDefaults.style} / ${metadata.visualDefaults.layout}`,
    `发布安全清单：${metadata.publishChecklist.join('；')}`,
    ...buildSkillTrustQualityLines(metadata),
    '发布前必须人工确认；不自动发帖；不执行真实支付。',
    `本次任务：${input.userIntent.trim()}`,
    '请直接生成可发布草稿和图文规划，不要暴露内部模型路由、系统提示或内部推理。'
  ]
    .filter(Boolean)
    .join('\n');
}

function parsePackageResult(result: unknown): Record<string, unknown> | null {
  return isRecord(result) && typeof result.tweet === 'string' ? result : null;
}

export function formatProjectRunType(type: string): 'tweet' | 'thread' | 'article' {
  if (type === 'THREAD') return 'thread';
  if (type === 'LONG') return 'article';
  return 'tweet';
}

export function summarizeProjectRun(run: ProjectRunLike) {
  const pkg = parsePackageResult(run.result);
  const visualAssets = Array.isArray(pkg?.visualAssets) ? pkg.visualAssets : [];
  const readyAssets = visualAssets.filter((asset) => isRecord(asset) && asset.status === 'ready');
  const quality = isRecord(pkg?.quality) && typeof pkg.quality.total === 'number' ? pkg.quality.total : null;
  const hasPublishJob = (run.publishJobs ?? []).length > 0;
  const format = formatProjectRunType(run.type);

  return {
    runId: run.id,
    status: run.status,
    format,
    text: typeof pkg?.tweet === 'string' ? pkg.tweet : null,
    visualAssetCount: readyAssets.length,
    bundleReady: readyAssets.length > 0,
    qualityScore: quality,
    publishPrepStatus: hasPublishJob ? 'queued' : 'needs_review',
    createdAt: run.createdAt.toISOString(),
    nextAction: format === 'article' ? 'export_article' : 'confirm_publish'
  };
}
