import { Injectable } from '@nestjs/common';
import type { ContentFormat } from './content-strategy';
import { extractTopKeywords, isPromptWrapperInstruction } from './content-strategy';
import { BAOYU_VISUAL_RULES, type VisualAssetKind } from './benchmarks/baoyu-visual-rules';

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

function isUnsafeCue(text = ''): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return !normalized || isPromptWrapperInstruction(normalized);
}

function cleanVisualCue(text = ''): string {
  return text
    .replace(/(?:^|\n)\s*\d+\/\d+\s*/gu, ' ')
    .replace(/(?:^|\n)\s*\*{1,3}\s*\d+\/\d+\s*\*{1,3}\s*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
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
  buildPlan(input: {
    format: ContentFormat;
    focus: string;
    text: string;
    outline?: { title?: string | null; hook?: string | null; body?: string[] | null } | null;
  }): VisualPlan {
    const rules = BAOYU_VISUAL_RULES[input.format];
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
