import type { ContentFormat } from './content-strategy';

export const VISUAL_REQUEST_MODES = [
  'auto',
  'cover',
  'cards',
  'infographic',
  'article_illustration',
  'diagram',
  'social_pack'
] as const;
export const VISUAL_REQUEST_STYLES = ['draftorbit', 'notion', 'sketch-notes', 'blueprint', 'minimal', 'bold-editorial'] as const;
export const VISUAL_REQUEST_LAYOUTS = ['auto', 'sparse', 'balanced', 'dense', 'list', 'comparison', 'flow', 'mindmap', 'quadrant'] as const;
export const VISUAL_REQUEST_PALETTES = ['auto', 'draftorbit', 'macaron', 'warm', 'neon', 'mono'] as const;
export const VISUAL_REQUEST_ASPECTS = ['auto', '1:1', '16:9', '4:5', '2.35:1'] as const;

export type VisualRequestMode = typeof VISUAL_REQUEST_MODES[number];
export type VisualRequestStyle = typeof VISUAL_REQUEST_STYLES[number];
export type VisualRequestLayout = typeof VISUAL_REQUEST_LAYOUTS[number];
export type VisualRequestPalette = typeof VISUAL_REQUEST_PALETTES[number];
export type VisualRequestAspect = typeof VISUAL_REQUEST_ASPECTS[number];

export type VisualRequest = {
  mode?: VisualRequestMode;
  style?: VisualRequestStyle;
  layout?: VisualRequestLayout;
  palette?: VisualRequestPalette;
  aspect?: VisualRequestAspect;
  exportHtml?: boolean;
};

function pickAllowed<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T[number] : fallback;
}

export function normalizeVisualRequest(input?: VisualRequest | null, format?: ContentFormat): Required<VisualRequest> {
  return {
    mode: pickAllowed(input?.mode, VISUAL_REQUEST_MODES, 'auto'),
    style: pickAllowed(input?.style, VISUAL_REQUEST_STYLES, 'draftorbit'),
    layout: pickAllowed(input?.layout, VISUAL_REQUEST_LAYOUTS, 'auto'),
    palette: pickAllowed(input?.palette, VISUAL_REQUEST_PALETTES, 'draftorbit'),
    aspect: pickAllowed(input?.aspect, VISUAL_REQUEST_ASPECTS, format === 'article' ? '16:9' : '1:1'),
    exportHtml: Boolean(input?.exportHtml ?? format === 'article')
  };
}

export function visualRequestSummary(input?: VisualRequest | null): string {
  const visual = normalizeVisualRequest(input);
  return [
    `mode=${visual.mode}`,
    `style=${visual.style}`,
    `layout=${visual.layout}`,
    `palette=${visual.palette}`,
    `aspect=${visual.aspect}`,
    `exportHtml=${visual.exportHtml ? 'yes' : 'no'}`
  ].join('; ');
}
