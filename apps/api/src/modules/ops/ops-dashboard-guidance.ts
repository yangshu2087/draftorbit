type NumericLike = number | string | null | undefined;

type BillingLike = {
  remainingCredits?: NumericLike;
} | null | undefined;

export type OpsDashboardGuidanceInput = {
  degraded: boolean;
  workspace?: unknown | null;
  counters: {
    topics: number;
    drafts: number;
    publishJobs: number;
    replyJobs: number;
    activeXAccounts?: number;
  };
  usage?: {
    billing?: BillingLike;
  } | null;
};

export type DashboardGuidance = {
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

export function deriveOpsDashboardGuidance(
  input: OpsDashboardGuidanceInput
): DashboardGuidance {
  if (!input.workspace) {
    return {
      nextAction: 'create_workspace',
      blockingReason: 'NO_DEFAULT_WORKSPACE'
    };
  }

  if ((input.counters.activeXAccounts ?? 0) <= 0) {
    return {
      nextAction: 'bind_x_account',
      blockingReason: 'NO_ACTIVE_X_ACCOUNT'
    };
  }

  const remainingCredits = toNumber(input.usage?.billing?.remainingCredits);
  if (remainingCredits !== null && remainingCredits <= 0) {
    return {
      nextAction: 'top_up_credits',
      blockingReason: 'NO_USAGE_CREDITS'
    };
  }

  if (input.counters.topics <= 0) {
    return {
      nextAction: 'create_topic',
      blockingReason: null
    };
  }

  if (input.counters.drafts <= 0) {
    return {
      nextAction: 'run_generation',
      blockingReason: null
    };
  }

  if (input.counters.publishJobs <= 0) {
    return {
      nextAction: 'approve_or_publish_drafts',
      blockingReason: null
    };
  }

  if (input.counters.replyJobs <= 0) {
    return {
      nextAction: 'sync_mentions',
      blockingReason: null
    };
  }

  if (input.degraded) {
    return {
      nextAction: 'inspect_degraded_segments',
      blockingReason: 'DEGRADED_DATA'
    };
  }

  return {
    nextAction: 'monitor_operations',
    blockingReason: null
  };
}
