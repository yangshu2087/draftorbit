import { GenerationType, LearningSourceType, PublishJobStatus, StepName } from '@draftorbit/db';
import type { PackageResult } from '../generate/generate.service';

export type V3Stage = 'research' | 'strategy' | 'draft' | 'voice' | 'media' | 'publish_prep' | 'error';
export type XArticlePublishCapability = {
  mode: 'manual_x_web';
  nativeApiAvailable: false;
  nextAction: 'export_article';
  openUrl: string;
  description: string;
};

const SUPPORTED_X_ARTICLE_HOSTS = new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com']);
const X_ARTICLE_OPEN_URL = 'https://x.com';

export function mapGenerationStepToV3Stage(step: StepName | 'error' | string): { stage: V3Stage; label: string } {
  switch (step) {
    case StepName.HOTSPOT:
    case 'HOTSPOT':
      return { stage: 'research', label: '正在研究话题' };
    case StepName.OUTLINE:
    case 'OUTLINE':
      return { stage: 'strategy', label: '正在规划结构' };
    case StepName.DRAFT:
    case 'DRAFT':
      return { stage: 'draft', label: '正在生成草稿' };
    case StepName.HUMANIZE:
    case 'HUMANIZE':
      return { stage: 'voice', label: '正在匹配你的文风' };
    case StepName.IMAGE:
    case 'IMAGE':
      return { stage: 'media', label: '正在整理配图建议' };
    case StepName.PACKAGE:
    case 'PACKAGE':
      return { stage: 'publish_prep', label: '正在准备可发布结果' };
    default:
      return { stage: 'error', label: '生成失败' };
  }
}

export function buildV3SourceEvidence(
  sources: Array<{ sourceType: string; sourceRef: string; metadata?: Record<string, unknown> | null }>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const source of sources) {
    const connector = String(source.metadata?.connector ?? '').trim();
    let label: string | null = null;

    if (connector === 'x_self' || source.sourceType === 'X_TIMELINE') {
      label = '已学习你的 X 历史内容';
    } else if (
      connector === 'x_target' ||
      (/x\.com\//i.test(source.sourceRef) && source.sourceType === 'URL')
    ) {
      label = '已学习目标账号 / 推文链接';
    } else if (connector === 'obsidian' || connector === 'local_file' || source.sourceType === 'IMPORT_CSV') {
      label = '已接入 Obsidian / 本地知识库';
    } else if (source.sourceType === 'URL') {
      label = '已接入外部链接知识';
    }

    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }

  return result;
}

export function buildV3PromptEnvelope(input: {
  intent: string;
  format: 'tweet' | 'thread' | 'article';
  withImage: boolean;
  styleSummary?: string | null;
  sourceEvidence?: string[];
}) {
  return [
    '你是 DraftOrbit 的 X AI Operator。',
    `用户意图：${input.intent.trim()}`,
    `输出形式：${input.format}`,
    `需要配图：${input.withImage ? 'yes' : 'no'}`,
    '自动完成：意图理解、结构规划、文风适配、X 平台合规检查。',
    '不要把问题反抛给用户，不要要求用户再填写复杂 brief。',
    '请你自动判断目标受众、表达角度、hook、thread 结构、CTA 与风险控制。',
    input.format === 'article'
      ? '如果输出 article，请按 X 文章格式组织：标题、导语、3-5 个小节、结尾行动句；不要写成 tweet/thread 的短格式。'
      : '如果输出 tweet/thread，请优先保证可直接发布、读完即可懂。 ',
    input.styleSummary ? `用户风格摘要：${input.styleSummary}` : '用户风格摘要：如有历史内容，请优先匹配其稳定表达方式。',
    input.sourceEvidence && input.sourceEvidence.length > 0
      ? `已连接证据：${input.sourceEvidence.join('；')}`
      : '已连接证据：若缺少外部证据，请基于用户意图与 X 平台语境完成生成。'
  ].join('\n');
}

export function resolveV3PublishGuard(format: 'tweet' | 'thread' | 'article') {
  if (format !== 'article') return null;
  return {
    blockingReason: 'ARTICLE_PUBLISH_NOT_SUPPORTED',
    nextAction: 'export_article',
    message: '当前长文暂不支持直接发布，请先复制到 X 文章编辑器。'
  };
}

export function resolveXArticlePublishCapability(): XArticlePublishCapability {
  return {
    mode: 'manual_x_web',
    nativeApiAvailable: false,
    nextAction: 'export_article',
    openUrl: X_ARTICLE_OPEN_URL,
    description: '当前公开的 X Developer API 没有提供 Articles 发布端点，长文需要先在 X 网页端完成发布。'
  };
}

export function normalizeXArticleUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (!SUPPORTED_X_ARTICLE_HOSTS.has(parsed.hostname.toLowerCase())) return null;
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function buildV3SuggestedAction(input: {
  defaultXAccount: { id: string } | null;
  sources: Array<{ id: string }>;
  styleSummary: string | null;
}) {
  const hasAccount = Boolean(input.defaultXAccount);
  const hasStyle = Boolean(input.styleSummary);
  const hasSources = input.sources.length > 0;

  if (!hasAccount && !hasStyle && !hasSources) return 'run_first_generation';
  if (!hasStyle && !hasSources) return 'run_first_generation';
  if (!hasStyle) return 'rebuild_profile';
  if (!hasSources) return 'connect_learning_source';
  return 'run_first_generation';
}
export type V3OperationNextAction =
  | 'add_source'
  | 'rewrite_from_source'
  | 'retry_visual_assets'
  | 'copy_markdown'
  | 'download_bundle'
  | 'prepare_publish'
  | 'open_project'
  | 'connect_x';

export type V3OperationSummary = {
  dataSources: Array<{
    kind: 'url' | 'x' | 'local_file' | 'search' | 'manual';
    status: 'ready' | 'missing' | 'failed' | 'skipped';
    label: string;
  }>;
  governance: {
    sourceStatus: 'ready' | 'required' | 'failed' | 'not_required';
    qualityStatus: 'passed' | 'blocked' | 'warning';
    hardFails: string[];
    userMessage: string;
  };
  intelligence: {
    stage: 'strategy' | 'generation' | 'visual_planning' | 'repair' | 'done';
    userFacingSummary: string;
  };
  workflow: {
    publishMode: 'manual_confirm';
    queueStatus: 'not_queued' | 'pending_confirm' | 'queued';
    nextActions: V3OperationNextAction[];
  };
  assets: {
    ready: number;
    failed: number;
    bundleReady: boolean;
  };
};

type OperationSourceArtifact = {
  kind?: string;
  url?: string;
  title?: string;
  status?: string;
  error?: string;
};

type OperationQualityGate = {
  status?: string;
  safeToDisplay?: boolean;
  hardFails?: string[];
  visualHardFails?: string[];
  sourceRequired?: boolean;
  sourceStatus?: string;
  userMessage?: string;
  recoveryAction?: string;
  judgeNotes?: string[];
} | null | undefined;

type OperationVisualAsset = {
  status?: string;
  assetPath?: string | null;
  signedAssetUrl?: string | null;
  assetUrl?: string | null;
};

function uniqueActions(actions: V3OperationNextAction[]): V3OperationNextAction[] {
  return [...new Set(actions)];
}

function sourceArtifactKind(kind?: string): 'url' | 'x' | 'local_file' | 'search' | 'manual' {
  if (kind === 'x') return 'x';
  if (kind === 'search') return 'search';
  if (kind === 'url' || kind === 'youtube') return 'url';
  return 'manual';
}

function sourceRowKind(source: { sourceType?: string; sourceRef?: string; metadata?: Record<string, unknown> | null }): 'url' | 'x' | 'local_file' | 'search' | 'manual' {
  const connector = String(source.metadata?.connector ?? '').toLowerCase();
  const sourceType = String(source.sourceType ?? '').toUpperCase();
  const sourceRef = String(source.sourceRef ?? '').toLowerCase();
  if (connector.includes('x_') || sourceType.includes('X') || /(?:x|twitter)\.com\//i.test(sourceRef)) return 'x';
  if (connector.includes('local') || connector.includes('obsidian') || sourceType.includes('IMPORT')) return 'local_file';
  if (sourceType === 'URL') return 'url';
  return 'manual';
}

export function buildV3OperationSummary(input: {
  format: 'tweet' | 'thread' | 'article';
  sources?: Array<{ sourceType?: string; sourceRef?: string; metadata?: Record<string, unknown> | null }>;
  sourceArtifacts?: OperationSourceArtifact[] | null;
  qualityGate?: OperationQualityGate;
  visualAssets?: OperationVisualAsset[] | null;
  visualAssetsBundleUrl?: string | null;
  publishJobs?: Array<{ status: PublishJobStatus | string }>;
  contentProjectId?: string | null;
  hasConnectedX?: boolean;
}): V3OperationSummary {
  const gate = input.qualityGate ?? null;
  const hardFails = [...new Set([...(gate?.hardFails ?? []), ...(gate?.visualHardFails ?? [])])];
  const sourceArtifacts = input.sourceArtifacts ?? [];
  const visualAssets = input.visualAssets ?? [];
  const readyAssets = visualAssets.filter((asset) => asset.status === 'ready');
  const failedAssets = visualAssets.filter((asset) => asset.status === 'failed');
  const bundleReady = Boolean(input.visualAssetsBundleUrl) || readyAssets.some((asset) => Boolean(asset.assetPath || asset.signedAssetUrl || asset.assetUrl));

  const dataSources: V3OperationSummary['dataSources'] = [];
  for (const artifact of sourceArtifacts.slice(0, 4)) {
    const status = artifact.status === 'ready' ? 'ready' : artifact.status === 'failed' ? 'failed' : 'skipped';
    dataSources.push({
      kind: sourceArtifactKind(artifact.kind),
      status,
      label: artifact.title || artifact.url || (artifact.kind === 'search' ? '搜索来源' : '外部来源')
    });
  }
  if (dataSources.length === 0) {
    for (const source of (input.sources ?? []).slice(0, 3)) {
      dataSources.push({
        kind: sourceRowKind(source),
        status: 'ready',
        label: buildV3SourceEvidence([source as { sourceType: string; sourceRef: string; metadata?: Record<string, unknown> | null }])[0] ?? '已连接运营来源'
      });
    }
  }
  if (dataSources.length === 0 && (gate?.sourceRequired || ['not_configured', 'failed', 'ambiguous'].includes(String(gate?.sourceStatus ?? '')))) {
    dataSources.push({ kind: 'manual', status: 'missing', label: '需要补充可靠来源' });
  }
  if (dataSources.length === 0) {
    dataSources.push({ kind: 'manual', status: 'skipped', label: '本轮不依赖外部来源' });
  }

  const sourceStatus: V3OperationSummary['governance']['sourceStatus'] = gate?.sourceStatus === 'ready'
    ? 'ready'
    : gate?.sourceRequired
      ? gate.sourceStatus === 'failed' || gate.sourceStatus === 'ambiguous'
        ? 'failed'
        : 'required'
      : 'not_required';
  const qualityStatus: V3OperationSummary['governance']['qualityStatus'] = gate?.safeToDisplay === false || gate?.status === 'failed'
    ? 'blocked'
    : hardFails.length > 0
      ? 'warning'
      : 'passed';

  const nextActions: V3OperationNextAction[] = [];
  if (sourceStatus === 'required' || sourceStatus === 'failed') nextActions.push('add_source');
  if (hardFails.includes('source_ready_repair_failed')) nextActions.push('rewrite_from_source');
  if (failedAssets.length > 0 || hardFails.some((flag) => flag.includes('visual'))) nextActions.push('retry_visual_assets');
  if (qualityStatus !== 'blocked') {
    nextActions.push('copy_markdown');
    if (bundleReady) nextActions.push('download_bundle');
    nextActions.push('prepare_publish');
  }
  if (input.contentProjectId) nextActions.push('open_project');
  if (qualityStatus !== 'blocked' && !input.hasConnectedX && input.format !== 'article') nextActions.push('connect_x');

  const queued = (input.publishJobs ?? []).some((job) => ['QUEUED', 'RUNNING'].includes(String(job.status)));
  const pending = (input.publishJobs ?? []).some((job) => ['PENDING'].includes(String(job.status)));
  const queueStatus: V3OperationSummary['workflow']['queueStatus'] = queued ? 'queued' : pending ? 'pending_confirm' : 'not_queued';

  const intelligenceStage: V3OperationSummary['intelligence']['stage'] = qualityStatus === 'blocked'
    ? hardFails.includes('source_ready_repair_failed')
      ? 'repair'
      : 'generation'
    : readyAssets.length > 0 || bundleReady
      ? 'done'
      : 'visual_planning';

  return {
    dataSources,
    governance: {
      sourceStatus,
      qualityStatus,
      hardFails,
      userMessage: gate?.userMessage || (qualityStatus === 'blocked' ? '这版未达到发布标准，已阻止展示坏稿。' : '来源、质量门和发布前检查已完成。')
    },
    intelligence: {
      stage: intelligenceStage,
      userFacingSummary: qualityStatus === 'blocked'
        ? '智能中枢已拦截未达标结果，并给出下一步恢复动作。'
        : '智能中枢已完成内容策略、正文整理、视觉规划和发布前检查。'
    },
    workflow: {
      publishMode: 'manual_confirm',
      queueStatus,
      nextActions: uniqueActions(nextActions)
    },
    assets: {
      ready: readyAssets.length,
      failed: failedAssets.length,
      bundleReady
    }
  };
}
