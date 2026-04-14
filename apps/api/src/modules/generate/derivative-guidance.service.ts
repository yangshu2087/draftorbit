import { Injectable } from '@nestjs/common';
import type { ContentFormat } from './content-strategy';
import type { VisualPlan } from './visual-planning.service';

export type DerivativeStatus = {
  ready: boolean;
  score: number;
  reason: string;
};

export type DerivativeReadiness = {
  markdown: DerivativeStatus;
  html: DerivativeStatus;
  cards: DerivativeStatus;
  infographic: DerivativeStatus;
  translation: DerivativeStatus;
  slideSummary: DerivativeStatus;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

@Injectable()
export class DerivativeGuidanceService {
  buildReadiness(input: { format: ContentFormat; text: string; visualPlan: VisualPlan }): DerivativeReadiness {
    const text = input.text.trim();
    const paragraphs = text.split(/\n{2,}/).filter((block) => block.trim()).length;
    const sections = (text.match(/(?:^|\n)[一二三四五六七八九十]、/gu) ?? []).length;
    const hasExamples = /(比如|例如|场景|反例|before\/after|动作)/u.test(text);
    const visualDepth = input.visualPlan.items.length;
    const cardDepth = input.visualPlan.items.filter((item) => item.kind === 'cards').length;
    const infographicDepth = input.visualPlan.items.filter((item) => item.kind === 'infographic').length;

    const markdownScore = clampScore(
      42 + (paragraphs >= 3 ? 18 : 0) + (sections >= 2 ? 18 : 0) + (hasExamples ? 12 : 0)
    );
    const htmlScore = clampScore(
      input.format === 'article'
        ? 52 + (sections >= 3 ? 20 : 0) + (paragraphs >= 5 ? 14 : 0) + (hasExamples ? 10 : 0)
        : 30 + (paragraphs >= 3 ? 12 : 0)
    );
    const translationScore = clampScore(
      38 + (hasExamples ? 14 : 0) + (paragraphs >= 3 ? 10 : 0) + (input.format !== 'tweet' ? 8 : 0)
    );
    const cardsScore = clampScore(
      (input.format === 'thread' ? 52 : input.format === 'tweet' ? 46 : 34) +
        cardDepth * 16 +
        (sections >= 3 ? 14 : 0) +
        (hasExamples ? 12 : 0) +
        (paragraphs >= 3 ? 8 : 0)
    );
    const infographicScore = clampScore(
      (input.format === 'article' ? 50 : input.format === 'thread' ? 46 : 30) +
        infographicDepth * 18 +
        (sections >= 3 ? 14 : 0) +
        (hasExamples ? 10 : 0)
    );
    const slideScore = clampScore(
      (input.format === 'article' ? 48 : input.format === 'thread' ? 44 : 22) +
        (visualDepth >= 3 ? 16 : 0) +
        (sections >= 3 ? 18 : 0)
    );

    return {
      markdown: {
        ready: markdownScore >= 60,
        score: markdownScore,
        reason: markdownScore >= 60 ? '结构完整，适合规范化为 markdown。' : '结构还不够稳定，markdown 可读性不足。'
      },
      html: {
        ready: htmlScore >= 68,
        score: htmlScore,
        reason: htmlScore >= 68 ? '结构完整，适合进一步导出 HTML。' : '段落或章节结构还不足以稳定导出 HTML。'
      },
      cards: {
        ready: cardsScore >= 62,
        score: cardsScore,
        reason: cardsScore >= 62 ? '判断与场景都比较清晰，适合拆成卡片组。' : '卡片切分点还不够明确，暂不适合直接做 cards。'
      },
      infographic: {
        ready: infographicScore >= 64,
        score: infographicScore,
        reason: infographicScore >= 64 ? '结构、对比和场景足够清晰，适合做信息图总结。' : '结构对比度还不够，信息图会偏空。'
      },
      translation: {
        ready: translationScore >= 58,
        score: translationScore,
        reason: translationScore >= 58 ? '判断与例子较清晰，适合做译文衍生。' : '表达仍偏依赖上下文，不适合直接翻译。'
      },
      slideSummary: {
        ready: slideScore >= 62,
        score: slideScore,
        reason: slideScore >= 62 ? '结构和视觉位点足够清晰，适合 slide-style 摘要。' : '当前还缺少足够清晰的摘要切分。'
      }
    };
  }
}
