type NumericLike = number | string | null | undefined;

export type UsageSummaryLike = {
  counters: {
    generations: number;
    publishJobs: number;
    replyJobs: number;
    usageEvents: number;
  };
  billing?: {
    remainingCredits?: NumericLike;
  } | null;
  funnel: {
    drafts: number;
    pendingApproval: number;
    approved: number;
    queued: number;
    published: number;
    publishSucceeded: number;
    replies: number;
  };
  modelRouting: {
    fallbackRate?: number;
    avgQualityScore?: number;
  };
};

export type UsageOverviewGuidanceInput = {
  degraded: boolean;
  summary?: UsageSummaryLike | null;
};

export type UsageGuidance = {
  nextAction: string;
  blockingReason: string | null;
};

function toNumber(value: NumericLike): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function deriveUsageOverviewGuidance(
  input: UsageOverviewGuidanceInput
): UsageGuidance {
  if (!input.summary) {
    return {
      nextAction: 'retry_usage_overview',
      blockingReason: input.degraded ? 'USAGE_SUMMARY_UNAVAILABLE' : null
    };
  }

  const remainingCredits = toNumber(input.summary.billing?.remainingCredits);
  if (remainingCredits !== null && remainingCredits <= 0) {
    return {
      nextAction: 'top_up_credits',
      blockingReason: 'NO_USAGE_CREDITS'
    };
  }

  if (input.summary.counters.generations <= 0) {
    return {
      nextAction: 'run_first_generation',
      blockingReason: null
    };
  }

  if (input.summary.funnel.pendingApproval > 0) {
    return {
      nextAction: 'review_pending_drafts',
      blockingReason: null
    };
  }

  if (input.summary.funnel.approved > input.summary.funnel.publishSucceeded) {
    return {
      nextAction: 'queue_approved_drafts',
      blockingReason: null
    };
  }

  if ((input.summary.modelRouting.avgQualityScore ?? 0) > 0 && (input.summary.modelRouting.avgQualityScore ?? 0) < 68) {
    return {
      nextAction: 'improve_prompt_quality',
      blockingReason: null
    };
  }

  if ((input.summary.modelRouting.fallbackRate ?? 0) >= 0.4) {
    return {
      nextAction: 'review_model_routing',
      blockingReason: null
    };
  }

  if (input.degraded) {
    return {
      nextAction: 'inspect_usage_segments',
      blockingReason: 'DEGRADED_DATA'
    };
  }

  return {
    nextAction: 'monitor_usage',
    blockingReason: null
  };
}
