import { apiFetch, API_BASE_URL } from './api';
import type {
  VisualRequestAspect,
  VisualRequestLayout,
  VisualRequestMode,
  VisualRequestPalette,
  VisualRequestStyle
} from './queries';

export type V4StudioFormat = 'tweet' | 'thread' | 'article' | 'diagram' | 'social_pack';

export type V4FormatOption = {
  value: V4StudioFormat;
  label: string;
  description: string;
  visualMode: VisualRequestMode;
  baoyuSkill: string;
};

export const V4_FORMAT_OPTIONS: V4FormatOption[] = [
  { value: 'tweet', label: 'Tweet', description: '单条观点 + 封面图', visualMode: 'cover', baoyuSkill: 'baoyu-cover-image' },
  { value: 'thread', label: 'Thread', description: '4 张卡片 + 连续叙事', visualMode: 'cards', baoyuSkill: 'baoyu-image-cards' },
  { value: 'article', label: 'Article', description: '封面、信息图、章节配图与 HTML', visualMode: 'article_illustration', baoyuSkill: 'baoyu-article-illustrator' },
  { value: 'diagram', label: 'Diagram', description: '流程图 / 架构图 SVG', visualMode: 'diagram', baoyuSkill: 'baoyu-diagram' },
  { value: 'social_pack', label: 'Social pack', description: '社交图文包 + 发布准备', visualMode: 'social_pack', baoyuSkill: 'baoyu-imagine' }
];

export type V4VisualControls = {
  mode?: VisualRequestMode | 'auto';
  style: VisualRequestStyle;
  layout: VisualRequestLayout;
  palette: VisualRequestPalette;
  aspect: VisualRequestAspect;
  exportHtml: boolean;
};

export type V4StudioRunRequest = {
  prompt: string;
  format: V4StudioFormat;
  sourceUrl?: string;
  visualRequest: {
    mode: VisualRequestMode;
    style: VisualRequestStyle;
    layout: VisualRequestLayout;
    palette: VisualRequestPalette;
    aspect: VisualRequestAspect;
    exportHtml: boolean;
  };
  exportRequest: { markdown: boolean; html: boolean; bundle: boolean };
};

export type V4StudioRunStart = {
  requestId?: string;
  runId: string;
  stage: string;
  nextAction: string;
  blockingReason: string | null;
  streamUrl?: string;
  studio?: Record<string, unknown>;
  publishPreparation?: { mode: string; label: string; canAutoPost: boolean };
  usageEvidence?: { primaryProvider: string; evidencePolicy?: string };
};

export type V4StudioPreviewContract = {
  requestId?: string;
  runId?: string;
  status?: string;
  textResult: { format: string; content: string; variants: unknown[] };
  visualAssets: Array<{
    id: string;
    kind: string;
    status: 'ready' | 'generating' | 'failed';
    provider?: string;
    model?: string;
    skill?: string;
    exportFormat?: string;
    checksum?: string;
    signedAssetUrl?: string;
    promptPath?: string;
    specPath?: string;
    cue?: string;
    provenanceLabel?: string;
  }>;
  sourceArtifacts: unknown[];
  qualityGate: { status: 'passed' | 'failed' | 'unknown'; safeToDisplay: boolean; hardFails: string[] };
  publishPreparation: { mode: string; label: string; canAutoPost: boolean };
  usageEvidence: { primaryProvider: string; model?: string | null; fallbackDepth?: number };
};

export type V4PreviewView = {
  readyAssets: Array<V4StudioPreviewContract['visualAssets'][number] & { providerLabel: string; normalizedUrl?: string }>;
  failedAssets: Array<V4StudioPreviewContract['visualAssets'][number] & { providerLabel: string }>;
  sourceCount: number;
  qualityCopy: string;
  publishCopy: string;
};

export function getV4FormatOption(format: V4StudioFormat): V4FormatOption {
  return V4_FORMAT_OPTIONS.find((item) => item.value === format) ?? V4_FORMAT_OPTIONS[0];
}

export function buildV4StudioRunRequest(input: {
  prompt: string;
  format: V4StudioFormat;
  sourceUrl?: string;
  controls: V4VisualControls;
}): V4StudioRunRequest {
  const option = getV4FormatOption(input.format);
  const mode = input.controls.mode && input.controls.mode !== 'auto' ? input.controls.mode : option.visualMode;
  const sourceUrl = input.sourceUrl?.trim();
  return {
    prompt: input.prompt.trim(),
    format: input.format,
    ...(sourceUrl ? { sourceUrl } : {}),
    visualRequest: {
      mode,
      style: input.controls.style,
      layout: input.controls.layout,
      palette: input.controls.palette,
      aspect: input.controls.aspect,
      exportHtml: input.controls.exportHtml
    },
    exportRequest: { markdown: true, html: true, bundle: true }
  };
}

export function getV4ProviderLabel(provider?: string | null): string {
  switch (provider) {
    case 'codex-local-svg':
      return 'Codex 本机 SVG';
    case 'template-svg':
      return '安全模板渲染';
    case 'baoyu-imagine':
      return 'baoyu provider';
    case 'ollama-text':
      return '本地低内存模型';
    default:
      return provider || '本地资产';
  }
}

function normalizeAssetUrl(input?: string): string | undefined {
  if (!input) return undefined;
  if (/^(?:https?:|data:|blob:)/iu.test(input)) return input;
  if (input.startsWith('/')) return `${API_BASE_URL}${input}`;
  return input;
}

export function buildV4StudioPreview(input: V4StudioPreviewContract): V4PreviewView {
  const readyAssets = input.visualAssets
    .filter((asset) => asset.status === 'ready')
    .map((asset) => ({
      ...asset,
      providerLabel: asset.provenanceLabel ?? getV4ProviderLabel(asset.provider),
      normalizedUrl: normalizeAssetUrl(asset.signedAssetUrl)
    }));
  const failedAssets = input.visualAssets
    .filter((asset) => asset.status === 'failed')
    .map((asset) => ({ ...asset, providerLabel: asset.provenanceLabel ?? getV4ProviderLabel(asset.provider) }));
  return {
    readyAssets,
    failedAssets,
    sourceCount: input.sourceArtifacts.length,
    qualityCopy: input.qualityGate.safeToDisplay ? '质量门通过，可进入人工确认。' : '质量门未通过，DraftOrbit 已阻止展示或发布。',
    publishCopy: input.publishPreparation.canAutoPost
      ? '可发布，但仍建议人工确认。'
      : `${input.publishPreparation.label}：不会自动真实发帖。`
  };
}

export function getV4ErrorCopy(code?: string) {
  if (code === 'SOURCE_REQUIRED') {
    return {
      title: '需要来源后再生成',
      description: '这类最新事实不能靠模型猜。请粘贴 URL，或先配置搜索 provider。',
      primaryAction: '粘贴来源 URL',
      tone: 'warning' as const
    };
  }
  if (code === 'UNAUTHORIZED') {
    return {
      title: '需要先登录',
      description: '本地体验请从首页点击“本机快速体验”，正式使用请连接 X。',
      primaryAction: '回首页登录',
      tone: 'warning' as const
    };
  }
  return {
    title: '生成没有完成',
    description: '请稍后重试；如果是 provider 不可用，系统会保留本地默认通过路径。',
    primaryAction: '重试',
    tone: 'danger' as const
  };
}

export async function fetchV4Capabilities() {
  return apiFetch<{
    version: string;
    defaultRouting: { primary: string; oauth: string; ollamaDefault: string; publishMode: string };
    formats: V4StudioFormat[];
    skillMatrix: Array<{ skill: string; productCapability: string; usedByDraftOrbit: boolean; safeMode?: string }>;
    exportFormats: string[];
    safety: Record<string, string>;
  }>('/v4/studio/capabilities');
}

export async function runV4Studio(input: V4StudioRunRequest) {
  return apiFetch<V4StudioRunStart>('/v4/studio/run', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 60_000
  });
}

export async function fetchV4StudioRun(runId: string) {
  return apiFetch<V4StudioPreviewContract>(`/v4/studio/runs/${encodeURIComponent(runId)}`, {
    timeoutMs: 30_000
  });
}
