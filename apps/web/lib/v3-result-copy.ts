const EXACT_COPY_MAP: Record<string, string> = {
  'Researched angles, hooks, and supporting points for the topic.': '先整理了角度、开头和支撑信息。',
  'Structured the post into a publishable outline with a hook and CTA.': '先把内容结构整理成可发版本。',
  'Expanded the outline into a draft suitable for the requested channel.': '先把结构扩成一版可发草稿。',
  'Smoothed the draft to reduce AI trace while keeping the original stance.': '再把语气和表达调整得更像真人。',
  'Prepared media concepts and search keywords to support publishing.': '补上了配图方向和检索关键词。',
  'Packaged the final publish-ready result with variants and quality metadata.': '已整理成可直接检查的结果。',
  'Fast path：基于意图模板快速抽取研究角度与钩子，降低首段等待时间。': '已快速整理研究角度和开头切入点。',
  'Fast path：由研究结果直接生成结构化大纲，减少一次模型往返。': '已根据研究结果直接整理出内容结构。',
  'Fast path：按文案关键词生成素材建议与检索词，保证可发布素材包。': '已按文案内容补上配图建议和检索词。',
  'Fast path：本地拼装发布包并做质量门控，必要时才触发模型重写。': '已整理结果，并完成基础质量检查。',
  '结果包已就绪': '结果已准备好'
};

function normalizeSingleLine(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  if (EXACT_COPY_MAP[trimmed]) {
    return EXACT_COPY_MAP[trimmed];
  }

  if (trimmed === '[object Object]') {
    return '正在整理内容';
  }

  if (trimmed.startsWith('结果包已就绪')) {
    return trimmed.replace('结果包已就绪', EXACT_COPY_MAP['结果包已就绪']);
  }

  if (trimmed.startsWith('配图关键词：')) {
    return trimmed.replace(/^配图关键词：/, '配图方向：');
  }

  if (trimmed.startsWith('Fast path：')) {
    return applyCommonRewrites(trimmed.replace(/^Fast path：/, '').trim());
  }

  return applyCommonRewrites(trimmed);
}

function applyCommonRewrites(input: string): string {
  return input
    .replace(/^已确定 hook：/i, '开头切入点：')
    .replace(/draft\s*orbit/gi, 'DraftOrbit')
    .replace(/\bai\b/gi, 'AI')
    .replace(/#ai\b/gi, '#AI')
    .replace(/([\p{Script=Han}])AI/gu, '$1 AI')
    .replace(/AI([\p{Script=Han}])/gu, 'AI $1')
    .replace(/\s+([，。！？；：])/g, '$1')
    .replace(/([（【《“‘#])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function normalizeWhySummary(items: string[]): string[] {
  return items.map(normalizeSingleLine).filter(Boolean);
}

export function summarizeWhySummary(items: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of normalizeWhySummary(items)) {
    if (seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

export function normalizeStageSummary(summary?: string | null): string | null {
  if (!summary) return null;
  const normalized = normalizeSingleLine(summary);
  return normalized || null;
}

export function normalizeResultText(text?: string | null): string {
  if (!text) return '';

  const blocks = text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => applyCommonRewrites(line))
        .filter(Boolean)
        .join('\n')
    )
    .filter(Boolean);

  return blocks.join('\n\n').trim();
}
