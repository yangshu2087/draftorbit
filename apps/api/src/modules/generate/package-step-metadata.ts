export type PackageStepAlias =
  | 'research'
  | 'outline'
  | 'draft'
  | 'humanize'
  | 'media'
  | 'package';

export type GenerationStepTimingInput = {
  step: string;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type PackageStepMetadata = {
  stepLatencyMs: Record<PackageStepAlias, number | null>;
  stepExplain: Record<PackageStepAlias, string>;
};

const STEP_ALIAS_MAP: Record<string, PackageStepAlias> = {
  HOTSPOT: 'research',
  OUTLINE: 'outline',
  DRAFT: 'draft',
  HUMANIZE: 'humanize',
  IMAGE: 'media',
  PACKAGE: 'package'
};

const STEP_EXPLAIN: Record<PackageStepAlias, string> = {
  research: 'Researched angles, hooks, and supporting points for the topic.',
  outline: 'Structured the post into a publishable outline with a hook and CTA.',
  draft: 'Expanded the outline into a draft suitable for the requested channel.',
  humanize: 'Smoothed the draft to reduce AI trace while keeping the original stance.',
  media: 'Prepared media concepts and search keywords to support publishing.',
  package: 'Packaged the final publish-ready result with variants and quality metadata.'
};

function diffMs(startedAt: Date | null, completedAt: Date | null): number | null {
  if (!(startedAt instanceof Date) || !(completedAt instanceof Date)) return null;
  const delta = completedAt.getTime() - startedAt.getTime();
  return Number.isFinite(delta) && delta >= 0 ? delta : null;
}

export function buildPackageStepMetadata(
  steps: GenerationStepTimingInput[]
): PackageStepMetadata {
  const stepLatencyMs: Record<PackageStepAlias, number | null> = {
    research: null,
    outline: null,
    draft: null,
    humanize: null,
    media: null,
    package: null
  };

  for (const step of steps) {
    const alias = STEP_ALIAS_MAP[step.step];
    if (!alias) continue;
    stepLatencyMs[alias] = diffMs(step.startedAt, step.completedAt);
  }

  return {
    stepLatencyMs,
    stepExplain: { ...STEP_EXPLAIN }
  };
}
