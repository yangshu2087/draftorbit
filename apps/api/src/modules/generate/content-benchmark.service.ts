import { Injectable } from '@nestjs/common';
import {
  buildContentStrategyContext,
  enrichStyleAnalysis as enrichBaseStyleAnalysis,
  type ContentFormat,
  type ContentStrategyContext,
  type HistoricalPostInput
} from './content-strategy';
import { BAOYU_WRITING_BENCHMARKS } from './benchmarks/baoyu-writing-benchmarks';
import { BAOYU_SKILLS_MAP } from './benchmarks/baoyu-skills-map';

type PromptContextInput = {
  format: ContentFormat;
  focus: string;
};

@Injectable()
export class ContentBenchmarkService {
  enrichStyleAnalysis(styleAnalysis: unknown, posts: HistoricalPostInput[]) {
    const base = enrichBaseStyleAnalysis(styleAnalysis, posts);
    const tweetPack = BAOYU_WRITING_BENCHMARKS.tweet;
    const threadPack = BAOYU_WRITING_BENCHMARKS.thread;
    const articlePack = BAOYU_WRITING_BENCHMARKS.article;

    const openingPatterns = [
      ...tweetPack.openingPatterns.slice(0, 2),
      ...threadPack.openingPatterns.slice(0, 1),
      ...articlePack.openingPatterns.slice(0, 1)
    ];
    const evidencePatterns = [
      ...tweetPack.evidencePatterns.slice(0, 1),
      ...threadPack.evidencePatterns.slice(0, 1),
      ...articlePack.evidencePatterns.slice(0, 1)
    ];
    const formatPreferences = [
      tweetPack.formatPreferences[0],
      threadPack.formatPreferences[0],
      articlePack.formatPreferences[0]
    ].filter(Boolean);

    return {
      ...base,
      opening_patterns: openingPatterns,
      evidence_patterns: evidencePatterns,
      format_preferences: formatPreferences,
      source_corpus_refs: [
        ...new Set(
          BAOYU_SKILLS_MAP.filter((entry) => entry.category === 'learning' || entry.category === 'writing').map(
            (entry) => entry.skill
          )
        )
      ],
      benchmark_few_shots: [
        ...tweetPack.fewShots.slice(0, 2),
        ...threadPack.fewShots.slice(0, 1),
        ...articlePack.fewShots.slice(0, 1)
      ]
    };
  }

  buildPromptContext(input: PromptContextInput): string {
    const pack = BAOYU_WRITING_BENCHMARKS[input.format];
    const fewShots = pack.fewShots
      .slice(0, 2)
      .map((item, index) => `样本${index + 1}（${item.useAs}）：${item.text}`)
      .join('\n');
    const antiPatterns = pack.antiPatterns.map((rule) =>
      /不要/u.test(rule) ? `- ${rule}` : `- 不要写“${rule}”`
    );

    return [
      'Benchmark 结构规则：',
      ...pack.openingPatterns.map((rule) => `- ${rule}`),
      '证据/例子规则：',
      ...pack.evidencePatterns.map((rule) => `- ${rule}`),
      '重写禁止项：',
      ...antiPatterns,
      'Few-shot 学习样本：',
      fewShots,
      `当前主题：${input.focus}`
    ].join('\n');
  }

  buildBenchmarkContext(input: {
    intent: string;
    format: ContentFormat;
    language?: string | null;
    styleAnalysis?: unknown;
  }): ContentStrategyContext {
    return buildContentStrategyContext(input);
  }
}
