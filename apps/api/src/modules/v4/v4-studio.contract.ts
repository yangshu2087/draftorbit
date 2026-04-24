import type { V3RunChatDto } from '../v3/v3.dto';
import { normalizeVisualRequest, type VisualRequest, type VisualRequestMode } from '../generate/visual-request';

export const V4_STUDIO_FORMATS = ['tweet', 'thread', 'article', 'diagram', 'social_pack'] as const;
export type V4StudioFormat = typeof V4_STUDIO_FORMATS[number];
export type V4ExportRequest = { markdown?: boolean; html?: boolean; bundle?: boolean };

export type V4StudioSkillParity = {
  skill: string;
  productCapability: string;
  usedByDraftOrbit: boolean;
  safeMode?: 'manual-confirm' | 'local-render' | 'blocked';
};

export const V4_STUDIO_SKILL_MATRIX: V4StudioSkillParity[] = [
  { skill: 'baoyu-imagine', productCapability: 'Codex 视觉规格与 SVG 图文资产生成', usedByDraftOrbit: true, safeMode: 'local-render' },
  { skill: 'baoyu-cover-image', productCapability: 'tweet/article 封面图', usedByDraftOrbit: true, safeMode: 'local-render' },
  { skill: 'baoyu-image-cards', productCapability: 'thread 卡片组', usedByDraftOrbit: true, safeMode: 'local-render' },
  { skill: 'baoyu-infographic', productCapability: 'article 信息图', usedByDraftOrbit: true, safeMode: 'local-render' },
  { skill: 'baoyu-article-illustrator', productCapability: 'article 章节配图', usedByDraftOrbit: true, safeMode: 'local-render' },
  { skill: 'baoyu-diagram', productCapability: '流程图 / diagram SVG', usedByDraftOrbit: true, safeMode: 'local-render' },
  { skill: 'baoyu-markdown-to-html', productCapability: 'Markdown / HTML 导出包', usedByDraftOrbit: true, safeMode: 'local-render' },
  { skill: 'baoyu-post-to-x', productCapability: 'X 发布准备与手动确认', usedByDraftOrbit: true, safeMode: 'manual-confirm' },
  { skill: 'baoyu-image-gen', productCapability: '旧 raster 入口，已迁移到 baoyu-imagine', usedByDraftOrbit: false, safeMode: 'blocked' }
];

export type V4StudioRunRequest = {
  prompt: string;
  format: V4StudioFormat;
  sourceUrl?: string;
  visualRequest?: VisualRequest;
  exportRequest?: V4ExportRequest;
};

export type V4SourceRequirement =
  | { blocked: false }
  | {
      blocked: true;
      code: 'SOURCE_REQUIRED';
      statusCode: 424;
      recoveryAction: 'add_source';
      message: string;
    };

export type V4NormalizedStudioRequest = {
  prompt: string;
  format: V4StudioFormat;
  sourceUrl: string | null;
  exportRequest: Required<V4ExportRequest>;
  v3: V3RunChatDto;
  contract: {
    mode: 'codex-oauth-first';
    ollamaDefault: 'disabled';
    safePublish: 'manual-confirm';
  };
};

export type V4VisualAssetPreview = {
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
  provenanceLabel: string;
};

export type V4StudioPreview = {
  runId: string;
  status: string;
  textResult: { format: V4StudioFormat | 'tweet' | 'thread' | 'article'; content: string; variants: unknown[] };
  visualAssets: V4VisualAssetPreview[];
  sourceArtifacts: unknown[];
  qualityGate: {
    status: 'passed' | 'failed' | 'unknown';
    safeToDisplay: boolean;
    hardFails: string[];
  };
  publishPreparation: {
    mode: 'manual-confirm';
    label: string;
    canAutoPost: false;
  };
  usageEvidence: {
    primaryProvider: 'codex-local' | 'openai' | 'openrouter' | 'ollama' | 'unknown';
    model: string | null;
    fallbackDepth: number;
  };
};

const FRESHNESS_PATTERN = /(最新|今天|昨日|昨天|刚刚|近期|实时|新闻|current|latest|breaking|today|yesterday|this week)/iu;
const URL_PATTERN = /https?:\/\/\S+/iu;

function sanitizePrompt(input: unknown): string {
  return typeof input === 'string' ? input.trim() : '';
}

function normalizeFormat(input: unknown): V4StudioFormat {
  return typeof input === 'string' && (V4_STUDIO_FORMATS as readonly string[]).includes(input)
    ? input as V4StudioFormat
    : 'tweet';
}

function v3FormatFromV4(format: V4StudioFormat): V3RunChatDto['format'] {
  if (format === 'article') return 'article';
  if (format === 'thread' || format === 'social_pack') return 'thread';
  return 'tweet';
}

function defaultModeForV4(format: V4StudioFormat): VisualRequestMode {
  if (format === 'thread') return 'cards';
  if (format === 'article') return 'article_illustration';
  if (format === 'diagram') return 'diagram';
  if (format === 'social_pack') return 'social_pack';
  return 'cover';
}

function sourceUrlFrom(input: V4StudioRunRequest): string | null {
  const explicit = typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : '';
  if (explicit) return explicit;
  const prompt = sanitizePrompt(input.prompt);
  return prompt.match(URL_PATTERN)?.[0] ?? null;
}

export function resolveV4SourceRequirement(input: Pick<V4StudioRunRequest, 'prompt' | 'format' | 'sourceUrl'>): V4SourceRequirement {
  const prompt = sanitizePrompt(input.prompt);
  const format = normalizeFormat(input.format);
  const sourceUrl = sourceUrlFrom({ prompt, format, sourceUrl: input.sourceUrl });
  const requiresSource = FRESHNESS_PATTERN.test(prompt) && !sourceUrl;
  if (!requiresSource) return { blocked: false };
  return {
    blocked: true,
    code: 'SOURCE_REQUIRED',
    statusCode: 424,
    recoveryAction: 'add_source',
    message: '涉及最新事实但没有可靠来源。请粘贴 URL 或配置搜索 provider，DraftOrbit 不会编造最新信息。'
  };
}

function buildV4Intent(input: { prompt: string; format: V4StudioFormat; sourceUrl: string | null; exportRequest: Required<V4ExportRequest> }) {
  return [
    'V4 Creator Studio request',
    `format: ${input.format}`,
    `sourceUrl: ${input.sourceUrl ?? 'none'}`,
    `exports: markdown=${input.exportRequest.markdown ? 'yes' : 'no'}, html=${input.exportRequest.html ? 'yes' : 'no'}, bundle=${input.exportRequest.bundle ? 'yes' : 'no'}`,
    'routing: codex-local first via Codex OAuth; Ollama disabled unless explicitly enabled as low-memory fallback.',
    'publish: prepare/manual-confirm only; never auto-post.',
    `userPrompt: ${input.prompt}`
  ].join('\n');
}

export function normalizeV4StudioRequest(input: V4StudioRunRequest): V4NormalizedStudioRequest {
  const prompt = sanitizePrompt(input.prompt);
  const format = normalizeFormat(input.format);
  const sourceUrl = sourceUrlFrom({ ...input, prompt, format });
  const v3Format = v3FormatFromV4(format);
  const exportRequest: Required<V4ExportRequest> = {
    markdown: input.exportRequest?.markdown ?? true,
    html: input.exportRequest?.html ?? true,
    bundle: input.exportRequest?.bundle ?? true
  };
  const requestedMode = input.visualRequest?.mode === 'auto' || !input.visualRequest?.mode
    ? defaultModeForV4(format)
    : input.visualRequest.mode;
  const visualRequest = normalizeVisualRequest(
    {
      ...input.visualRequest,
      mode: requestedMode,
      exportHtml: input.visualRequest?.exportHtml ?? exportRequest.html
    },
    v3Format
  );

  return {
    prompt,
    format,
    sourceUrl,
    exportRequest,
    v3: {
      intent: buildV4Intent({ prompt, format, sourceUrl, exportRequest }),
      format: v3Format,
      withImage: true,
      safeMode: true,
      visualRequest
    },
    contract: {
      mode: 'codex-oauth-first',
      ollamaDefault: 'disabled',
      safePublish: 'manual-confirm'
    }
  };
}

export function v4ProviderLabel(provider?: string | null): string {
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

function inferPrimaryProvider(usage: unknown[] | undefined): V4StudioPreview['usageEvidence']['primaryProvider'] {
  const first = usage?.[0];
  if (!first || typeof first !== 'object') return 'unknown';
  const text = JSON.stringify(first).toLowerCase();
  if (text.includes('codex-local') || text.includes('codex_local')) return 'codex-local';
  if (text.includes('openrouter')) return 'openrouter';
  if (text.includes('openai')) return 'openai';
  if (text.includes('ollama')) return 'ollama';
  return 'unknown';
}

function inferModel(usage: unknown[] | undefined): string | null {
  const first = usage?.[0];
  if (!first || typeof first !== 'object') return null;
  const record = first as Record<string, unknown>;
  return typeof record.modelUsed === 'string'
    ? record.modelUsed
    : typeof record.model === 'string'
      ? record.model
      : null;
}

export function buildV4PreviewFromV3Run(v3Run: {
  runId: string;
  status: string;
  format: string;
  result: null | {
    text?: string;
    variants?: unknown[];
    visualAssets?: Array<Record<string, unknown>>;
    sourceArtifacts?: unknown[];
    qualityGate?: { status?: string; safeToDisplay?: boolean; hardFails?: string[] } | null;
    usage?: unknown[];
  };
}): V4StudioPreview {
  const gate = v3Run.result?.qualityGate ?? null;
  const usage = v3Run.result?.usage;
  return {
    runId: v3Run.runId,
    status: v3Run.status,
    textResult: {
      format: (['tweet', 'thread', 'article'].includes(v3Run.format) ? v3Run.format : 'tweet') as 'tweet' | 'thread' | 'article',
      content: v3Run.result?.text ?? '',
      variants: v3Run.result?.variants ?? []
    },
    visualAssets: (v3Run.result?.visualAssets ?? []).map((asset) => ({
      id: String(asset.id ?? ''),
      kind: String(asset.kind ?? 'asset'),
      status: asset.status === 'failed' ? 'failed' : asset.status === 'generating' ? 'generating' : 'ready',
      provider: typeof asset.provider === 'string' ? asset.provider : undefined,
      model: typeof asset.model === 'string' ? asset.model : undefined,
      skill: typeof asset.skill === 'string' ? asset.skill : undefined,
      exportFormat: typeof asset.exportFormat === 'string' ? asset.exportFormat : undefined,
      checksum: typeof asset.checksum === 'string' ? asset.checksum : undefined,
      signedAssetUrl: typeof asset.signedAssetUrl === 'string' ? asset.signedAssetUrl : typeof asset.assetUrl === 'string' ? asset.assetUrl : undefined,
      promptPath: typeof asset.promptPath === 'string' ? asset.promptPath : undefined,
      specPath: typeof asset.specPath === 'string' ? asset.specPath : undefined,
      cue: typeof asset.cue === 'string' ? asset.cue : undefined,
      provenanceLabel: v4ProviderLabel(typeof asset.provider === 'string' ? asset.provider : null)
    })),
    sourceArtifacts: v3Run.result?.sourceArtifacts ?? [],
    qualityGate: {
      status: gate?.status === 'failed' ? 'failed' : gate?.status === 'passed' ? 'passed' : 'unknown',
      safeToDisplay: gate?.safeToDisplay !== false,
      hardFails: gate?.hardFails ?? []
    },
    publishPreparation: {
      mode: 'manual-confirm',
      label: '准备发布 / 手动确认',
      canAutoPost: false
    },
    usageEvidence: {
      primaryProvider: inferPrimaryProvider(usage),
      model: inferModel(usage),
      fallbackDepth: Math.max((usage?.length ?? 1) - 1, 0)
    }
  };
}
