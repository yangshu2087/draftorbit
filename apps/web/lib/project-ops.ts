import type { V3Format, V3VisualRequest } from './queries';

export type ProjectPresetKey = 'generic_x_ops' | 'skilltrust_x_ops';

export type ProjectMetadataSummaryInput = {
  objective?: unknown;
  audience?: unknown;
  contentPillars?: unknown;
  sourceUrls?: unknown;
  visualDefaults?: unknown;
  publishChecklist?: unknown;
};

export type ProjectPresetCard = {
  preset: ProjectPresetKey;
  title: string;
  description: string;
  defaultName: string;
  badge: string;
  pillars: string[];
};

export const projectPresetCards: ProjectPresetCard[] = [
  {
    preset: 'generic_x_ops',
    title: '通用 X 运营项目',
    description: '通用项目可沉淀受众、内容支柱、来源和发布前检查。',
    defaultName: '我的 X 运营项目',
    badge: 'Generic',
    pillars: ['观点短推', '经验复盘', '产品更新']
  },
  {
    preset: 'skilltrust_x_ops',
    title: 'SkillTrust 推特/X 运营',
    description: '围绕审计演示、风险教育、工作流和发布日志快速生成线程图文。',
    defaultName: 'SkillTrust 推特/X 运营',
    badge: 'SkillTrust',
    pillars: ['审计演示', '风险教育', '工作流方法']
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function getProjectPresetCard(preset: ProjectPresetKey) {
  return projectPresetCards.find((card) => card.preset === preset) ?? null;
}

export function summarizeProjectMetadata(metadata?: ProjectMetadataSummaryInput | null) {
  const visualDefaults = isRecord(metadata?.visualDefaults) ? metadata.visualDefaults : null;
  const mode = typeof visualDefaults?.mode === 'string' ? visualDefaults.mode : 'auto';
  const style = typeof visualDefaults?.style === 'string' ? visualDefaults.style : 'draftorbit';
  return {
    objective: typeof metadata?.objective === 'string' && metadata.objective.trim() ? metadata.objective.trim() : '持续产出可信的 X 内容',
    audience: typeof metadata?.audience === 'string' && metadata.audience.trim() ? metadata.audience.trim() : '目标用户',
    pillars: stringList(metadata?.contentPillars),
    sources: stringList(metadata?.sourceUrls),
    visualStyle: `${mode} / ${style}`,
    checklist: stringList(metadata?.publishChecklist)
  };
}

export function buildProjectGeneratePayload(input: {
  intent: string;
  format?: V3Format;
  visualDefaults?: V3VisualRequest;
  sourceUrls?: string[];
}) {
  return {
    intent: input.intent.trim(),
    format: input.format ?? 'thread',
    withImage: true,
    safeMode: true,
    sourceUrls: (input.sourceUrls ?? []).filter(Boolean),
    visualRequest: input.visualDefaults ?? { mode: 'cards', style: 'draftorbit', layout: 'balanced', palette: 'draftorbit', exportHtml: true }
  };
}
