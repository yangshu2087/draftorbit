import type { V3Format, V3RunResponse } from './queries';
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

const SOURCE_HARD_FAILS = new Set([
  'fresh_source_required',
  'source_not_configured',
  'source_search_failed',
  'source_capture_failed',
  'source_ambiguous'
]);

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
    not_configured: '这类“最新/发布/版本/新闻”内容必须先抓到来源；当前没有可用搜索配置，请粘贴来源 URL 后再生成。',
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
      return 'Codex 本机 SVG';
    case 'template-svg':
      return '模板渲染';
    case 'baoyu-imagine':
      return 'baoyu provider';
    case 'ollama-text':
      return '本地模型文本';
    default:
      return provider || '本地资产';
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
    ['hook', result.qualitySignals.hookStrength],
    ['具体性', result.qualitySignals.specificity],
    ['证据感', result.qualitySignals.evidenceDensity],
    ['人话感', result.qualitySignals.humanLikeness],
    ['可视化', result.qualitySignals.visualizability]
  ] as const;

  return entries
    .filter(([, score]) => typeof score === 'number')
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 3)
    .map(([label, score]) => `${label} ${Math.round(score ?? 0)}`);
}

export function getResultPreviewMode(format: V3Format): 'tweet' | 'thread' | 'article' {
  if (format === 'thread') return 'thread';
  if (format === 'article') return 'article';
  return 'tweet';
}
