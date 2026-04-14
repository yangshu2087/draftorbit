import { Injectable } from '@nestjs/common';
import fs from 'node:fs/promises';
import type { ContentFormat } from './content-strategy';
import { isPromptWrapperInstruction } from './content-strategy';
import type { VisualAssetKind } from './benchmarks/baoyu-visual-rules';
import type { VisualPlan } from './visual-planning.service';

export type VisualAssetRenderer = 'template-svg' | 'provider-image';
export type VisualAssetTextLayer = 'app-rendered' | 'none';
export type VisualAssetAspectRatio = '1:1' | '16:9';

export type VisualAssetRenderMetadata = {
  renderer: VisualAssetRenderer;
  textLayer: VisualAssetTextLayer;
  aspectRatio: VisualAssetAspectRatio;
};

export type VisualAssetRenderDiagnostics = {
  overflow: boolean;
  lineCount: number;
};

export type VisualCardRenderResult = {
  svg: string;
  metadata: VisualAssetRenderMetadata;
  diagnostics: VisualAssetRenderDiagnostics;
};

const SVG_FONT_STYLE =
  '<style>text{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",Arial,sans-serif;dominant-baseline:auto;}</style>';

function escapeSvg(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function splitGraphemes(value: string): string[] {
  return [...value.replace(/\s+/gu, ' ').trim()];
}

function cleanCardText(value: string): string {
  return value
    .replace(/(?:^|\n)\s*\*{1,3}\s*\d+\/\d+\s*\*{1,3}\s*/gu, ' ')
    .replace(/(?:^|\n)\s*\d+\/\d+\s*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function safeCue(cue: string, fallback: string): string {
  const normalized = cleanCardText(cue);
  if (!normalized || isPromptWrapperInstruction(normalized)) return fallback;
  return normalized;
}

function addEllipsis(value: string, maxUnits: number): string {
  const chars = splitGraphemes(value);
  let result = '';
  let units = 0;
  for (const ch of chars) {
    const isAscii = /[\x00-\x7F]/u.test(ch);
    const weight = isAscii ? 0.55 : 1;
    if (units + weight > Math.max(1, maxUnits - 1)) break;
    result += ch;
    units += weight;
  }
  return `${result.trim()}…`;
}

function wrapSvgLines(value: string, maxUnits: number, maxLines: number, options?: { truncate?: boolean }): { lines: string[]; overflow: boolean } {
  const source = cleanCardText(value);
  const chars = splitGraphemes(source);
  const lines: string[] = [];
  let current = '';
  let units = 0;
  let overflow = false;

  for (const ch of chars) {
    const isAscii = /[\x00-\x7F]/u.test(ch);
    const weight = isAscii ? 0.55 : 1;
    if (current && units + weight > maxUnits) {
      lines.push(current.trim());
      current = '';
      units = 0;
      if (lines.length >= maxLines) {
        if (options?.truncate) {
          lines[lines.length - 1] = addEllipsis(lines[lines.length - 1] ?? '', maxUnits);
        } else {
          overflow = true;
        }
        break;
      }
    }
    current += ch;
    units += weight;
  }
  if (current.trim() && lines.length < maxLines) lines.push(current.trim());
  return { lines, overflow };
}

function svgTextBlock(input: {
  text: string;
  x: number;
  y: number;
  maxUnits: number;
  maxLines: number;
  size: number;
  lineHeight: number;
  fill: string;
  weight?: number;
  truncate?: boolean;
}): { svg: string; overflow: boolean; lineCount: number } {
  const wrapped = wrapSvgLines(input.text, input.maxUnits, input.maxLines, { truncate: input.truncate });
  return {
    svg: wrapped.lines
      .map((line, index) => {
        const y = input.y + index * input.lineHeight;
        return `<text x="${input.x}" y="${y}" font-size="${input.size}" font-weight="${input.weight ?? 600}" fill="${input.fill}">${escapeSvg(line)}</text>`;
      })
      .join('\n'),
    overflow: wrapped.overflow,
    lineCount: wrapped.lines.length
  };
}

function parseThreadPosts(text: string): string[] {
  const chunks = text
    .split(/\n\s*\n/gu)
    .map((chunk) => cleanCardText(chunk))
    .filter(Boolean);
  return chunks.length > 0 ? chunks : [cleanCardText(text)].filter(Boolean);
}

function titleFromCue(cue: string, fallback: string): string {
  const cleaned = safeCue(cue, fallback)
    .replace(/^我会/u, '')
    .replace(/[。！？!?]+$/u, '')
    .trim();
  return cleaned || fallback;
}

function withDiagnostics(svg: string, blocks: Array<{ overflow: boolean; lineCount: number }>, aspectRatio: VisualAssetAspectRatio): VisualCardRenderResult {
  return {
    svg,
    metadata: {
      renderer: 'template-svg',
      textLayer: 'app-rendered',
      aspectRatio
    },
    diagnostics: {
      overflow: blocks.some((block) => block.overflow),
      lineCount: blocks.reduce((sum, block) => sum + block.lineCount, 0)
    }
  };
}

function renderThreadCardsSvg(input: { cue: string; text: string; fallback: string }): VisualCardRenderResult {
  const posts = parseThreadPosts(input.text).slice(0, 4);
  const blocks: Array<{ overflow: boolean; lineCount: number }> = [];
  const cards = posts
    .map((post, index) => {
      const x = index % 2 === 0 ? 92 : 626;
      const y = index < 2 ? 250 : 702;
      const textBlock = svgTextBlock({
        text: post,
        x: x + 54,
        y: y + 150,
        maxUnits: 16,
        maxLines: 5,
        size: 26,
        lineHeight: 40,
        fill: '#111827',
        weight: 700,
        truncate: true
      });
      blocks.push(textBlock);
      return [
        `<rect x="${x}" y="${y}" width="482" height="360" rx="42" fill="#FFFFFF" opacity="0.96"/>`,
        `<circle cx="${x + 64}" cy="${y + 68}" r="34" fill="#111827"/>`,
        `<text x="${x + 64}" y="${y + 82}" text-anchor="middle" font-size="32" font-weight="800" fill="#FFFFFF">${index + 1}</text>`,
        textBlock.svg
      ].join('\n');
    })
    .join('\n');
  const title = svgTextBlock({
    text: titleFromCue(input.cue, input.fallback),
    x: 92,
    y: 190,
    maxUnits: 20,
    maxLines: 2,
    size: 46,
    lineHeight: 58,
    fill: '#0F172A',
    weight: 900,
    truncate: true
  });
  blocks.push(title);
  return withDiagnostics(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  ${SVG_FONT_STYLE}
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#EEF6FF"/>
      <stop offset="52%" stop-color="#EFFFF5"/>
      <stop offset="100%" stop-color="#FFF7ED"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" rx="0" fill="url(#bg)"/>
  <circle cx="1030" cy="150" r="180" fill="#9AE6B4" opacity="0.35"/>
  <circle cx="124" cy="1030" r="220" fill="#93C5FD" opacity="0.28"/>
  <text x="92" y="128" font-size="32" font-weight="800" fill="#16A34A">DraftOrbit · thread cards</text>
  ${title.svg}
  ${cards}
</svg>`, blocks, '1:1');
}

function renderCoverSvg(input: { cue: string; fallback: string; format: ContentFormat }): VisualCardRenderResult {
  const title = svgTextBlock({
    text: titleFromCue(input.cue, input.fallback),
    x: 180,
    y: 430,
    maxUnits: 12,
    maxLines: 4,
    size: 72,
    lineHeight: 92,
    fill: '#020617',
    weight: 900,
    truncate: true
  });
  return withDiagnostics(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  ${SVG_FONT_STYLE}
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="48%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#0F766E"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="1200" height="1200" rx="0" fill="url(#bg)"/>
  <circle cx="1050" cy="160" r="260" fill="#22C55E" opacity="0.18"/>
  <circle cx="140" cy="1060" r="280" fill="#60A5FA" opacity="0.16"/>
  <rect x="96" y="130" width="260" height="58" rx="29" fill="#FFFFFF" opacity="0.12"/>
  <text x="130" y="170" font-size="27" font-weight="800" fill="#D1FAE5">DraftOrbit · ${escapeSvg(input.format)}</text>
  <rect x="118" y="292" width="964" height="560" rx="60" fill="#FFFFFF" opacity="0.96" filter="url(#shadow)"/>
  ${title.svg}
  <rect x="180" y="748" width="180" height="10" rx="5" fill="#22C55E"/>
</svg>`, [title], '1:1');
}

function renderInfographicSvg(input: { cue: string; text: string; fallback: string; format: ContentFormat }): VisualCardRenderResult {
  const isArticle = input.format === 'article';
  const width = isArticle ? 1600 : 1200;
  const height = isArticle ? 900 : 1200;
  const cardY = isArticle ? 306 : 380;
  const posts = parseThreadPosts(input.text);
  const title = svgTextBlock({
    text: titleFromCue(input.cue, input.fallback),
    x: 88,
    y: 188,
    maxUnits: isArticle ? 26 : 17,
    maxLines: 2,
    size: 54,
    lineHeight: 68,
    fill: '#0F172A',
    weight: 900,
    truncate: true
  });
  const left = svgTextBlock({
    text: posts[1] ?? input.cue,
    x: 146,
    y: cardY + 150,
    maxUnits: isArticle ? 20 : 15,
    maxLines: 5,
    size: isArticle ? 31 : 28,
    lineHeight: isArticle ? 46 : 42,
    fill: '#334155',
    weight: 700,
    truncate: true
  });
  const right = svgTextBlock({
    text: posts[2] ?? input.cue,
    x: isArticle ? 960 : 730,
    y: cardY + 150,
    maxUnits: isArticle ? 20 : 15,
    maxLines: 5,
    size: isArticle ? 31 : 28,
    lineHeight: isArticle ? 46 : 42,
    fill: '#064E3B',
    weight: 800,
    truncate: true
  });
  return withDiagnostics(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${SVG_FONT_STYLE}
  <rect width="${width}" height="${height}" fill="#F8FAFC"/>
  <rect x="0" y="0" width="${width}" height="18" fill="#22C55E"/>
  <text x="88" y="110" font-size="30" font-weight="800" fill="#16A34A">visual summary</text>
  ${title.svg}
  <rect x="88" y="${cardY}" width="${isArticle ? 610 : 440}" height="${isArticle ? 420 : 520}" rx="44" fill="#FFFFFF" stroke="#D1FAE5" stroke-width="4"/>
  <rect x="${isArticle ? 902 : 672}" y="${cardY}" width="${isArticle ? 610 : 440}" height="${isArticle ? 420 : 520}" rx="44" fill="#ECFDF5" stroke="#86EFAC" stroke-width="4"/>
  <text x="146" y="${cardY + 72}" font-size="34" font-weight="900" fill="#64748B">before</text>
  <text x="${isArticle ? 960 : 730}" y="${cardY + 72}" font-size="34" font-weight="900" fill="#16A34A">after</text>
  ${left.svg}
  ${right.svg}
  <path d="M ${isArticle ? 750 : 560} ${cardY + 210} C ${isArticle ? 820 : 610} ${cardY + 190}, ${isArticle ? 820 : 620} ${cardY + 330}, ${isArticle ? 878 : 648} ${cardY + 300}" fill="none" stroke="#22C55E" stroke-width="14" stroke-linecap="round"/>
  <path d="M ${isArticle ? 874 : 648} ${cardY + 300} l -36 -14 l 24 38 z" fill="#22C55E"/>
</svg>`, [title, left, right], isArticle ? '16:9' : '1:1');
}

function renderIllustrationSvg(input: { cue: string; fallback: string; format: ContentFormat }): VisualCardRenderResult {
  const isArticle = input.format === 'article';
  const width = isArticle ? 1600 : 1200;
  const height = isArticle ? 900 : 1200;
  const title = svgTextBlock({
    text: titleFromCue(input.cue, input.fallback),
    x: 160,
    y: 300,
    maxUnits: isArticle ? 30 : 18,
    maxLines: 4,
    size: isArticle ? 58 : 54,
    lineHeight: isArticle ? 74 : 70,
    fill: '#111827',
    weight: 900,
    truncate: true
  });
  return withDiagnostics(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${SVG_FONT_STYLE}
  <rect width="${width}" height="${height}" fill="#FFF7ED"/>
  <circle cx="${width - 190}" cy="160" r="170" fill="#FDBA74" opacity="0.38"/>
  <circle cx="170" cy="${height - 150}" r="210" fill="#BBF7D0" opacity="0.5"/>
  <rect x="96" y="110" width="${width - 192}" height="${height - 220}" rx="56" fill="#FFFFFF" stroke="#FED7AA" stroke-width="5"/>
  <text x="160" y="200" font-size="32" font-weight="900" fill="#F97316">scene cue</text>
  ${title.svg}
  <rect x="160" y="${isArticle ? 650 : 840}" width="${isArticle ? 540 : 420}" height="22" rx="11" fill="#22C55E"/>
  <rect x="160" y="${isArticle ? 694 : 888}" width="${isArticle ? 820 : 620}" height="22" rx="11" fill="#86EFAC" opacity="0.75"/>
  <rect x="160" y="${isArticle ? 738 : 936}" width="${isArticle ? 680 : 510}" height="22" rx="11" fill="#FDBA74" opacity="0.75"/>
</svg>`, [title], isArticle ? '16:9' : '1:1');
}

@Injectable()
export class VisualCardRenderService {
  render(input: {
    format: ContentFormat;
    focus: string;
    text: string;
    item: VisualPlan['items'][number];
  }): VisualCardRenderResult {
    const cue = safeCue(input.item.cue, input.focus);
    if (input.item.kind === 'cards') return renderThreadCardsSvg({ cue, text: input.text, fallback: input.focus });
    if (input.item.kind === 'infographic') return renderInfographicSvg({ cue, text: input.text, fallback: input.focus, format: input.format });
    if (input.item.kind === 'illustration') return renderIllustrationSvg({ cue, fallback: input.focus, format: input.format });
    return renderCoverSvg({ cue, fallback: input.focus, format: input.format });
  }
}

export async function renderDeterministicVisualAsset(input: {
  format: ContentFormat;
  focus: string;
  text: string;
  item: VisualPlan['items'][number];
  assetPath: string;
}): Promise<VisualCardRenderResult> {
  const result = new VisualCardRenderService().render(input);
  await fs.writeFile(input.assetPath, result.svg, 'utf8');
  return result;
}
