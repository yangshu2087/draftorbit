import type { OperationNextAction, OperationSummary, V3Format, V3RunResponse } from './queries';
import { API_BASE_URL } from './api';

export type ThreadPreviewItem = {
  label: string;
  role: string;
  text: string;
};

export type ArticlePreviewSection = {
  heading: string;
  body: string;
};

export type ArticlePreview = {
  title: string;
  lead: string | null;
  sections: ArticlePreviewSection[];
  ending: string | null;
};

export type SourceFailureView = {
  active: boolean;
  status: 'failed' | 'ambiguous' | 'not_configured';
  title: string;
  description: string;
  primaryAction: string;
  secondaryAction: string;
};

export type QualityFailureView = {
  active: boolean;
  title: string;
  description: string;
  primaryAction: string;
  secondaryAction: string;
};

export type FreshSourceInputHint = {
  active: boolean;
  tone: 'warning' | 'ready';
  title: string;
  description: string;
  primaryAction: string;
};

export type PrimarySourceEvidenceCard = {
  title: string;
  sourceTitle: string;
  href?: string;
  description: string;
};

export type SourceEvidenceArtifact = {
  kind: 'url' | 'x' | 'youtube' | 'search';
  url?: string;
  title?: string;
  markdownPath?: string;
  capturedAt?: string;
  status: 'ready' | 'failed' | 'skipped';
  evidenceUrl?: string;
  error?: string;
};

export type OperationHubCard = {
  title: string;
  value: string;
  description: string;
  tone: 'ready' | 'warning' | 'blocked' | 'neutral';
};

const SOURCE_HARD_FAILS = new Set([
  'fresh_source_required',
  'source_not_configured',
  'source_search_failed',
  'source_capture_failed',
  'source_ambiguous'
]);
const URL_HINT_PATTERN = /https?:\/\/[^\s"'，。！？）)]+/iu;
const FRESH_SOURCE_HINT_PATTERN =
  /(?:最新|今天|刚刚|近期|昨天|昨日|新闻|融资|\blatest\b|\bcurrent\b|\bbreaking\b|\btoday\b|\byesterday\b|实时(?:价格|新闻)|价格(?:调整|上涨|下调|变化|变动)|涨价|降价)/iu;
const NEGATED_FRESHNESS_HINT_PATTERN = /(?:不要|不用|无需|不需要|不依赖|非).{0,8}(?:最新|实时|新闻|融资|价格|联网|外部数据)/u;
const SOURCE_URL_LINE_LABEL = '来源 URL：';

function countByStatus(summary: OperationSummary | null | undefined, status: OperationSummary['dataSources'][number]['status']) {
  return summary?.dataSources.filter((source) => source.status === status).length ?? 0;
}

export function formatOperationNextAction(action: OperationNextAction): string {
  switch (action) {
    case 'add_source':
      return '补充来源';
    case 'rewrite_from_source':
      return '基于来源重写';
    case 'retry_visual_assets':
      return '重试图文资产';
    case 'copy_markdown':
      return '复制 Markdown';
    case 'download_bundle':
      return '下载图文包';
    case 'prepare_publish':
      return '准备发布';
    case 'open_project':
      return '打开项目';
    case 'connect_x':
      return '连接 X';
    default:
      return '下一步';
  }
}

export function buildOperationHubCards(summary?: OperationSummary | null): OperationHubCard[] {
  if (!summary) return [];

  const readySources = countByStatus(summary, 'ready');
  const missingSources = countByStatus(summary, 'missing') + countByStatus(summary, 'failed');
  const qualityTone =
    summary.governance.qualityStatus === 'blocked'
      ? 'blocked'
      : summary.governance.qualityStatus === 'warning'
        ? 'warning'
        : 'ready';
  const sourceTone =
    summary.governance.sourceStatus === 'required' || summary.governance.sourceStatus === 'failed'
      ? 'blocked'
      : readySources > 0
        ? 'ready'
        : 'neutral';
  const assetTone = summary.assets.failed > 0 ? 'warning' : summary.assets.ready > 0 || summary.assets.bundleReady ? 'ready' : 'neutral';
  const queueCopy: Record<OperationSummary['workflow']['queueStatus'], string> = {
    not_queued: '待人工确认',
    pending_confirm: '待确认',
    queued: '已入队'
  };

  return [
    {
      title: '数据源',
      value: readySources > 0 ? `${readySources} 个已采用` : missingSources > 0 ? '待补来源' : '无需外部来源',
      description: summary.dataSources.map((source) => source.label).slice(0, 2).join(' / '),
      tone: sourceTone
    },
    {
      title: '治理',
      value: summary.governance.qualityStatus === 'passed' ? '质量门通过' : summary.governance.qualityStatus === 'warning' ? '需人工留意' : '已拦截坏稿',
      description: summary.governance.userMessage,
      tone: qualityTone
    },
    {
      title: '智能中枢',
      value: summary.intelligence.stage === 'done' ? '已完成编排' : summary.intelligence.stage === 'repair' ? '正在修复' : '已规划下一步',
      description: summary.intelligence.userFacingSummary,
      tone: summary.intelligence.stage === 'repair' ? 'warning' : 'neutral'
    },
    {
      title: '工作流',
      value: queueCopy[summary.workflow.queueStatus],
      description: summary.workflow.nextActions.length
        ? `下一步：${summary.workflow.nextActions.map(formatOperationNextAction).slice(0, 3).join('、')}`
        : '等待下一次生成或人工确认。',
      tone: summary.workflow.queueStatus === 'queued' ? 'ready' : 'neutral'
    },
    {
      title: '图文资产',
      value: summary.assets.ready > 0 ? `${summary.assets.ready} 个 ready` : summary.assets.failed > 0 ? '待重试' : '待生成',
      description: summary.assets.bundleReady ? '导出包已准备好，可以下载归档。' : summary.assets.failed > 0 ? `${summary.assets.failed} 个资产需要重试。` : '生成通过后会展示 SVG / Markdown / HTML。',
      tone: assetTone
    }
  ];
}

export function buildSourceUrlLinePrompt(intent: string): string {
  const trimmed = intent.trim();
  if (!trimmed) return SOURCE_URL_LINE_LABEL;
  return trimmed.includes(SOURCE_URL_LINE_LABEL) ? trimmed : `${trimmed}\n\n${SOURCE_URL_LINE_LABEL}`;
}

export function getSourceUrlLineSelectionRange(intent: string): { start: number; end: number } | null {
  const start = intent.indexOf(SOURCE_URL_LINE_LABEL);
  if (start < 0) return null;
  return { start, end: intent.length };
}

export function buildFreshSourceInputHint(intent: string): FreshSourceInputHint | null {
  const text = intent.trim();
  if (!text || NEGATED_FRESHNESS_HINT_PATTERN.test(text)) return null;
  if (!FRESH_SOURCE_HINT_PATTERN.test(text)) return null;
  if (URL_HINT_PATTERN.test(text)) {
    return {
      active: true,
      tone: 'ready',
      title: '已检测到来源 URL，可以生成',
      description: '这次会优先使用你粘贴的来源，生成后会在结果区显示“来源已采用”。',
      primaryAction: '继续生成'
    };
  }
  return {
    active: true,
    tone: 'warning',
    title: '这类主题建议先补来源',
    description: '涉及最新、新闻、融资或实时价格时，DraftOrbit 会先要可靠来源，避免编造事实。',
    primaryAction: '粘贴来源 URL'
  };
}

export function buildPrimarySourceEvidenceCard(
  artifacts?: SourceEvidenceArtifact[] | null
): PrimarySourceEvidenceCard | null {
  const ready = (artifacts ?? []).find((artifact) => artifact.status === 'ready' && (artifact.url || artifact.title));
  if (!ready) return null;
  return {
    title: '来源已采用',
    sourceTitle: ready.title ?? ready.url ?? ready.kind,
    href: ready.evidenceUrl ?? ready.url,
    description: '已抓取并清洗来源，正文和图文资产会优先依据这条材料生成。'
  };
}

export function buildSourceFailureView(result: V3RunResponse['result']): SourceFailureView | null {
  const gate = result?.qualityGate;
  if (!gate) return null;
  const sourceRequired = Boolean(gate.sourceRequired) || gate.hardFails.some((flag) => SOURCE_HARD_FAILS.has(flag));
  if (!sourceRequired || gate.sourceStatus === 'ready') return null;
  const status =
    gate.sourceStatus === 'ambiguous'
      ? 'ambiguous'
      : gate.sourceStatus === 'not_configured'
        ? 'not_configured'
        : 'failed';

  const descriptionByStatus: Record<SourceFailureView['status'], string> = {
    not_configured: '这类“最新/今天/新闻/融资/实时价格”内容必须先抓到来源；当前没有可用搜索配置。请粘贴来源 URL，或把需求改成不依赖最新事实的运营文案。',
    ambiguous: '搜索结果指向多个可能实体，DraftOrbit 不能替你猜。请补一句限定语，或粘贴目标来源 URL。',
    failed: '搜索或来源抓取没有拿到可用 markdown。DraftOrbit 已阻止生成，避免编造最新事实。'
  };

  return {
    active: true,
    status,
    title: '需要可靠来源，不能编造最新事实',
    description: descriptionByStatus[status],
    primaryAction: '粘贴来源 URL 再生成',
    secondaryAction: '改成非最新主题再生成'
  };
}

export function buildQualityFailureView(result: V3RunResponse['result']): QualityFailureView | null {
  const gate = result?.qualityGate;
  if (!gate || gate.safeToDisplay !== false) return null;
  if (buildSourceFailureView(result)) return null;

  const hardFails = gate.hardFails ?? [];
  const sourceReadyEvidence =
    gate.sourceStatus === 'ready' ||
    hardFails.includes('source_ready_repair_failed') ||
    Boolean(buildPrimarySourceEvidenceCard(result?.sourceArtifacts as SourceEvidenceArtifact[] | null | undefined));
  if (sourceReadyEvidence) {
    return {
      active: true,
      title: '来源已采用，但这版文案还需重写',
      description:
        '来源已经抓取成功，但这版正文或图文没达到发布标准。请基于同一条来源重写一版，DraftOrbit 不会展示坏稿或坏图。',
      primaryAction: '基于该来源重写一版',
      secondaryAction: '回到输入框调整'
    };
  }
  const description =
    gate.userMessage && !/[_a-z]+_[a-z_]+/iu.test(gate.userMessage)
      ? `${gate.userMessage} 建议直接再来一版，或把主题写得更具体。`
      : hardFails.includes('article_generic_scaffold')
        ? '这版内容还像大纲或写作过程，DraftOrbit 已拦截坏稿。建议直接再来一版，或把主题写得更具体。'
        : hardFails.includes('source_metadata_leakage')
          ? '这版把来源抓取元数据当成正文事实，DraftOrbit 已拦截坏稿。建议再来一版，或换一个更清晰的来源。'
          : hardFails.includes('visual_asset_missing') || (gate.visualHardFails ?? []).length > 0
            ? '这版图文资产没有达到可发布标准，DraftOrbit 已拦截坏稿。建议再来一版，或先关闭配图生成。'
            : 'DraftOrbit 已拦截坏稿，没有把它交给你发布。建议直接再来一版，或把主题写得更具体。';

  return {
    active: true,
    title: '这版还没达到可发布标准',
    description,
    primaryAction: '再来一版',
    secondaryAction: '回到输入框调整'
  };
}

export function buildRunProgressLabel(input: {
  activeStageLabel?: string | null;
  runLoading?: boolean;
  hasResult?: boolean;
  sourceFailureView?: SourceFailureView | null;
  qualityFailureView?: QualityFailureView | null;
  suggestedActionTitle?: string | null;
}): string {
  if (input.activeStageLabel) return input.activeStageLabel;
  if (input.runLoading) return '正在生成结果…';
  if (input.sourceFailureView) return '需要可靠来源后再生成';
  if (input.qualityFailureView?.title.includes('来源已采用')) return '来源已采用，等待重写';
  if (input.qualityFailureView) return '需要处理后再交付';
  if (input.hasResult) return '结果已生成';
  if (input.suggestedActionTitle) return input.suggestedActionTitle;
  return '写一句话，然后点击开始生成。';
}

export function buildResultDeliveryCopy(input: {
  qualityGateFailed?: boolean;
  sourceFailureView?: SourceFailureView | null;
  qualityFailureView?: QualityFailureView | null;
}): { title: string; description: string; tone: 'success' | 'danger' } {
  if (input.sourceFailureView) {
    return {
      title: '等待可靠来源',
      description: '缺少可靠来源，DraftOrbit 已停止展示坏稿。粘贴来源 URL 后可以重新生成。',
      tone: 'danger'
    };
  }
  if (input.qualityGateFailed || input.qualityFailureView) {
    if (input.qualityFailureView?.title.includes('来源已采用')) {
      return {
        title: '来源已采用，等待重写',
        description: '来源证据已保留；请基于同一条来源重写一版，避免把未达标文案当成成品。',
        tone: 'danger'
      };
    }
    return {
      title: '需要处理后再交付',
      description: '这版未达到可发布标准，请重试或补充更具体的目标。',
      tone: 'danger'
    };
  }
  return {
    title: '已生成，可人工确认',
    description: '后台已完成来源检查、正文整理、图文资产和导出包准备。',
    tone: 'success'
  };
}

export function buildRiskReminderItems(input: {
  sourceFailureView?: SourceFailureView | null;
  riskFlags?: string[] | null;
  hasReadySource?: boolean;
  qualityGateFailed?: boolean;
}): string[] {
  if (input.sourceFailureView) {
    return ['缺少可靠来源。请粘贴来源 URL，或改成不依赖最新事实的运营文案。'];
  }
  const riskFlags = input.riskFlags ?? [];
  if (input.hasReadySource && !input.qualityGateFailed) {
    return riskFlags.filter((flag) => !/(?:整体质量未达到推荐阈值|质量未通过|质量门未通过)/u.test(flag));
  }
  return riskFlags;
}

export function formatVisualAssetLabel(kind: string): string {
  switch (kind) {
    case 'cover':
      return '封面图';
    case 'cards':
    case 'card':
      return '卡片组';
    case 'infographic':
      return '信息图';
    case 'illustration':
      return '章节插图';
    case 'diagram':
      return '流程图';
    case 'html':
      return 'HTML 导出';
    case 'markdown':
      return 'Markdown 导出';
    default:
      return kind;
  }
}

export function formatVisualProviderLabel(provider?: string | null): string {
  switch (provider) {
    case 'codex-local-svg':
      return 'SVG 图文资产';
    case 'template-svg':
      return '导出资产';
    case 'baoyu-imagine':
      return '图文资产';
    case 'ollama-text':
      return '本地草稿资产';
    default:
      return provider ? '图文资产' : '本地资产';
  }
}

export type VisualAssetCardInput = {
  id?: string;
  kind: string;
  status: 'ready' | 'generating' | 'failed';
  renderer?: 'template-svg' | 'provider-image';
  provider?: 'codex-local-svg' | 'template-svg' | 'baoyu-imagine' | 'ollama-text';
  model?: string;
  skill?: string;
  exportFormat?: 'svg' | 'html' | 'markdown' | 'zip';
  aspectRatio?: '1:1' | '16:9';
  textLayer?: 'app-rendered' | 'none';
  width?: number;
  height?: number;
  checksum?: string;
  assetUrl?: string;
  signedAssetUrl?: string;
  promptPath?: string;
  specPath?: string;
  cue: string;
  reason?: string;
  error?: string;
};

export type VisualAssetCard = VisualAssetCardInput & {
  label: string;
  providerLabel: string;
  isExport: boolean;
  statusLabel: string;
  canPreview: boolean;
};

export function normalizeVisualAssetUrl(assetUrl?: string): string | undefined {
  if (!assetUrl) return undefined;
  if (/^(?:https?:|data:|blob:)/iu.test(assetUrl)) return assetUrl;
  if (assetUrl.startsWith('/')) return `${API_BASE_URL}${assetUrl}`;
  return assetUrl;
}

function hasUnsafeVisualAssetPreview(asset: VisualAssetCardInput, normalizedUrl?: string): boolean {
  const joined = [normalizedUrl, asset.assetUrl, asset.signedAssetUrl, asset.promptPath, asset.specPath, asset.error].filter(Boolean).join(' ');
  if (/placeholder|mock/iu.test(joined)) return true;
  return /给我一条|更像真人|冷启动判断句|不要像|写一篇关于|生成关于最新|prompt-wrapper/iu.test(asset.cue ?? '');
}

export function buildRunAssetsZipUrl(runId?: string | null): string | undefined {
  if (!runId) return undefined;
  return `${API_BASE_URL}/v3/chat/runs/${encodeURIComponent(runId)}/assets.zip`;
}

export function buildVisualAssetCards(assets?: VisualAssetCardInput[] | null): VisualAssetCard[] {
  return (assets ?? [])
    .filter((asset) => asset && asset.cue?.trim())
    .map((asset) => {
      const normalizedUrl = normalizeVisualAssetUrl(asset.signedAssetUrl ?? asset.assetUrl);
      const unsafePreview = hasUnsafeVisualAssetPreview(asset, normalizedUrl);
      const isExport = Boolean(asset.exportFormat && asset.exportFormat !== 'svg');
      return {
        ...asset,
        assetUrl: normalizedUrl,
        label: formatVisualAssetLabel(asset.kind),
        providerLabel: formatVisualProviderLabel(asset.provider),
        isExport,
        statusLabel: unsafePreview
          ? '生成失败：图文 cue 或图片来源未达标'
          : asset.status === 'ready'
            ? '已生成'
            : asset.status === 'generating'
              ? '生成中'
              : `生成失败${asset.error ? `：${asset.error}` : ''}`,
        canPreview: asset.status === 'ready' && Boolean(normalizedUrl) && !unsafePreview && !isExport
      };
    });
}

export function buildVisualAnchorTags(input: {
  primaryAsset?: string | null;
  visualizablePoints?: string[] | null;
  keywords?: string[] | null;
}): string[] {
  const anchors = (input.visualizablePoints ?? []).map((item) => item.trim()).filter(Boolean);
  const keywordFallback = (input.keywords ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => [...item].length <= 18);

  return [
    ...(input.primaryAsset ? [formatVisualAssetLabel(input.primaryAsset)] : []),
    ...anchors.slice(0, 3),
    ...keywordFallback.slice(0, 3)
  ].filter((item, index, all) => Boolean(item) && all.indexOf(item) === index);
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])\s*/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function inferThreadRole(index: number, total: number): string {
  if (index === 0) return '判断 / 为什么值得继续读';
  if (index === 1) return '具体场景 / 反例';
  if (index === total - 2) return '动作 / 拆解';
  if (index === total - 1) return '自然收束 / 提问';
  return '补充展开';
}

export function buildThreadPreview(text: string): ThreadPreviewItem[] {
  const blocks = splitParagraphs(text);
  if (blocks.length === 0) return [];

  const posts: ThreadPreviewItem[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const firstLine = lines[0] ?? '';
    const labelMatch = firstLine.match(/^(\d+\/\d+)$/u);

    if (labelMatch) {
      posts.push({
        label: labelMatch[1],
        role: '',
        text: lines.slice(1).join('\n').trim()
      });
      continue;
    }

    const previous = posts[posts.length - 1];
    if (previous && /^\d+\/\d+$/u.test(previous.label)) {
      previous.text = `${previous.text}\n${block}`.trim();
      continue;
    }

    posts.push({
      label: posts.length === 0 ? '首条' : `补充 ${posts.length}`,
      role: '',
      text: block
    });
  }

  if (posts.length <= 1) {
    const sentences = splitSentences(text).slice(0, 5);
    return sentences.map((sentence, index) => ({
      label: index === 0 ? '首条' : `${index}/${Math.max(3, sentences.length - 1)}`,
      role: inferThreadRole(index, sentences.length),
      text: sentence
    }));
  }

  return posts.slice(0, 6).map((item, index, all) => ({
    ...item,
    role: inferThreadRole(index, all.length)
  }));
}

export function buildArticlePreview(text: string): ArticlePreview {
  const paragraphs = splitParagraphs(text);
  const title = paragraphs[0] ?? '';
  let lead: string | null = null;
  let ending: string | null = null;
  const sections: ArticlePreviewSection[] = [];

  for (let index = 1; index < paragraphs.length; index += 1) {
    const block = paragraphs[index];
    if (block === '导语') {
      lead = paragraphs[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (block === '结尾') {
      ending = paragraphs[index + 1] ?? null;
      index += 1;
      continue;
    }

    const sectionMatch = block.match(/^([一二三四五六七八九十]+、.+)$/u);
    if (sectionMatch) {
      sections.push({
        heading: sectionMatch[1],
        body: paragraphs[index + 1] ?? ''
      });
      index += 1;
    }
  }

  return {
    title,
    lead,
    sections,
    ending
  };
}

export function buildPrimaryResultHighlights(result: V3RunResponse['result']): string[] {
  if (!result?.qualitySignals) return [];
  const entries = [
    ['开头有抓手', result.qualitySignals.hookStrength],
    ['场景更具体', result.qualitySignals.specificity],
    ['证据更清楚', result.qualitySignals.evidenceDensity],
    ['表达更自然', result.qualitySignals.humanLikeness],
    ['适合配图', result.qualitySignals.visualizability]
  ] as const;

  return entries
    .filter(([, score]) => typeof score === 'number')
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3)
    .map(([label]) => label);
}

export function getResultPreviewMode(format: V3Format): 'tweet' | 'thread' | 'article' {
  if (format === 'thread') return 'thread';
  if (format === 'article') return 'article';
  return 'tweet';
}
