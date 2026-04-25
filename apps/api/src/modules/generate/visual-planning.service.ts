import { Injectable } from '@nestjs/common';
import type { ContentFormat } from './content-strategy';
import { extractTopKeywords, isPromptWrapperInstruction } from './content-strategy';
import { BAOYU_VISUAL_RULES, type VisualAssetKind, type VisualRule } from './benchmarks/baoyu-visual-rules';
import { normalizeVisualRequest, type VisualRequest } from './visual-request';

export type VisualPlanItem = {
  kind: VisualAssetKind;
  priority: 'primary' | 'supporting';
  type: string;
  layout: string;
  style: string;
  palette: string;
  cue: string;
  reason: string;
};

export type VisualPlan = {
  primaryAsset: VisualAssetKind;
  visualizablePoints: string[];
  keywords: string[];
  items: VisualPlanItem[];
};


function kindForMode(mode: string): VisualAssetKind | null {
  if (mode === 'cover') return 'cover';
  if (mode === 'cards') return 'cards';
  if (mode === 'infographic') return 'infographic';
  if (mode === 'article_illustration') return 'illustration';
  if (mode === 'diagram') return 'diagram';
  return null;
}

function wantsDiagram(input: { focus: string; text: string; visualRequest?: VisualRequest | null }): boolean {
  if (input.visualRequest?.mode === 'diagram') return true;
  return /(?:diagram|流程图|架构图|关系图|判断树|flow|mindmap|mind map|mermaid)/iu.test(`${input.focus}
${input.text}`);
}

function applyVisualRequestRules(input: {
  format: ContentFormat;
  focus: string;
  text: string;
  rules: VisualRule[];
  visualRequest?: VisualRequest | null;
}): VisualRule[] {
  const visual = normalizeVisualRequest(input.visualRequest, input.format);
  let rules = [...input.rules];
  const modeKind = kindForMode(visual.mode);
  if (modeKind) {
    const preferred = rules.find((rule) => rule.kind === modeKind) ?? {
      kind: modeKind,
      defaultPriority: 'primary' as const,
      type: modeKind === 'diagram' ? 'process-diagram' : modeKind,
      layout: modeKind === 'diagram' ? 'flow' : visual.layout,
      style: visual.style,
      palette: visual.palette,
      rationale: `用户显式选择 ${visual.mode} 视觉模式。`
    };
    rules = [preferred, ...rules.filter((rule) => rule.kind !== modeKind)];
  } else if (visual.mode === 'social_pack') {
    const order: VisualAssetKind[] = ['cover', 'cards', 'infographic', 'diagram'];
    rules = order.flatMap((kind) => rules.filter((rule) => rule.kind === kind));
  } else if (wantsDiagram(input)) {
    const diagram = rules.find((rule) => rule.kind === 'diagram');
    if (diagram) rules = [diagram, ...rules.filter((rule) => rule.kind !== 'diagram')];
  }
  return rules.map((rule) => ({
    ...rule,
    layout: visual.layout === 'auto' ? rule.layout : visual.layout,
    style: visual.style === 'draftorbit' ? rule.style : visual.style,
    palette: visual.palette === 'auto' ? rule.palette : visual.palette
  }));
}

function isUnsafeCue(text = ''): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return !normalized || isPromptWrapperInstruction(normalized) || /V4 Creator Studio request|userPrompt|system prompt|provider stderr/iu.test(normalized);
}

function cleanVisualCue(text = ''): string {
  return text
    .replace(/(?:^|\n)\s*\d+\/\d+\s*/gu, ' ')
    .replace(/(?:^|\n)\s*\*{1,3}\s*\d+\/\d+\s*\*{1,3}\s*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

const VISUAL_ASSET_KINDS: VisualAssetKind[] = ['cover', 'cards', 'infographic', 'illustration', 'diagram'];

function isVisualAssetKind(value: unknown): value is VisualAssetKind {
  return typeof value === 'string' && VISUAL_ASSET_KINDS.includes(value as VisualAssetKind);
}

function normalizeStringArray(value: unknown, limit: number): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n|]+/u)
      : [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of source) {
    const text = cleanVisualCue(String(item ?? ''));
    if (!text || isUnsafeCue(text) || seen.has(text)) continue;
    seen.add(text);
    normalized.push(text);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function safeSpecText(value: unknown, fallback: string): string {
  const text = cleanVisualCue(String(value ?? ''));
  return text && !isUnsafeCue(text) ? text : fallback;
}

function isLowValueVisualKeyword(text = ''): boolean {
  return /^(多数人把|写得没反应|开头切入点|先给|再补|最后抛出|讲清为什么)$/iu.test(text.trim());
}

function hasConcreteVisualSignal(text = ''): boolean {
  return /(比如|例如|第一|第二|第三|before\/after|反例|动作|场景|周一|周三|团队|用户|首页|上传|录音|会议纪要|判断→例子→问题|改成|贴一段|读者|访客)/iu.test(
    text
  );
}

@Injectable()
export class VisualPlanningService {
  buildPlanFromSpec(input: {
    format: ContentFormat;
    focus: string;
    text: string;
    spec: unknown;
    outline?: { title?: string | null; hook?: string | null; body?: string[] | null } | null;
    visualRequest?: VisualRequest | null;
  }): VisualPlan {
    const fallback = this.buildPlan(input);
    if (!input.spec || typeof input.spec !== 'object') return fallback;
    const data = input.spec as Record<string, unknown>;
    const requested = normalizeVisualRequest(input.visualRequest, input.format);
    const visualizablePoints = normalizeStringArray(data.visualizablePoints, input.format === 'article' ? 4 : 3);
    const keywords = normalizeStringArray(data.keywords, 8);
    const rawItems = Array.isArray(data.items) ? data.items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
    const items = fallback.items.map((baseItem, index) => {
      const byKind = rawItems.find((item) => item.kind === baseItem.kind);
      const raw = byKind ?? rawItems[index] ?? {};
      const kind = isVisualAssetKind(raw.kind) ? raw.kind : baseItem.kind;
      const cue = safeSpecText(raw.cue ?? raw.title ?? visualizablePoints[index], baseItem.cue);
      const reason = safeSpecText(raw.reason ?? raw.rationale, baseItem.reason);
      return {
        ...baseItem,
        kind,
        type: safeSpecText(raw.type, baseItem.type),
        layout: requested.layout === 'auto' ? safeSpecText(raw.layout, baseItem.layout) : requested.layout,
        style: requested.style === 'draftorbit' ? safeSpecText(raw.style, baseItem.style) : requested.style,
        palette: requested.palette === 'auto' ? safeSpecText(raw.palette, baseItem.palette) : requested.palette,
        cue,
        reason
      };
    });

    return {
      primaryAsset: isVisualAssetKind(data.primaryAsset) ? data.primaryAsset : items[0]?.kind ?? fallback.primaryAsset,
      visualizablePoints: visualizablePoints.length ? visualizablePoints : fallback.visualizablePoints,
      keywords: keywords.length ? keywords : fallback.keywords,
      items
    };
  }

  buildPlan(input: {
    format: ContentFormat;
    focus: string;
    text: string;
    outline?: { title?: string | null; hook?: string | null; body?: string[] | null } | null;
    visualRequest?: VisualRequest | null;
  }): VisualPlan {
    const rules = applyVisualRequestRules({
      format: input.format,
      focus: input.focus,
      text: input.text,
      rules: BAOYU_VISUAL_RULES[input.format],
      visualRequest: input.visualRequest
    });
    const text = input.text.trim();
    const outlinePoints = (input.outline?.body ?? [])
      .map((item) => cleanVisualCue(item))
      .filter(Boolean)
      .filter((item) => !isUnsafeCue(item));
    const sentencePoints = text
      .split(/(?<=[。！？!?])\s*/u)
      .map((item) => cleanVisualCue(item))
      .filter((item) => hasConcreteVisualSignal(item))
      .filter((item) => !isUnsafeCue(item))
      .slice(0, 4);
    const visualizablePoints = [...new Set([...sentencePoints, ...outlinePoints.filter((item) => hasConcreteVisualSignal(item))])].slice(
      0,
      input.format === 'article' ? 4 : 3
    );
    const cueSeed = cleanVisualCue(input.outline?.title?.trim() || input.outline?.hook?.trim() || text);
    const safeCueSeed = isUnsafeCue(cueSeed) ? text : cueSeed;
    const keywords = extractTopKeywords([text, input.focus, safeCueSeed].filter((item) => item && !isUnsafeCue(item)).join(' '), 8).filter(
      (keyword) => !isUnsafeCue(keyword) && !isLowValueVisualKeyword(keyword)
    );
    const fallbackCue =
      visualizablePoints[0] ||
      sentencePoints[0] ||
      (hasConcreteVisualSignal(text) && !isUnsafeCue(text) ? cleanVisualCue(text) : `${input.focus} 的核心场景`);
    const items = rules.map((rule, index) => ({
      kind: rule.kind,
      priority: rule.defaultPriority,
      type: rule.type,
      layout: rule.layout,
      style: rule.style,
      palette: rule.palette,
      cue: visualizablePoints[index] || fallbackCue,
      reason: rule.rationale
    }));

    return {
      primaryAsset: items[0]?.kind ?? 'cover',
      visualizablePoints:
        visualizablePoints.length > 0
          ? visualizablePoints
          : [
              input.format === 'article'
                ? `${input.focus} 最值得画出来的场景`
                : fallbackCue
            ],
      keywords: keywords.length > 0 ? keywords : [input.focus],
      items
    };
  }
}
