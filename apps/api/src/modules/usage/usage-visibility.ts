import type {
  CreditLedgerSnapshot,
  UsageBillingSnapshot,
  UsageEventEntity,
  UsageTrendPoint,
  UsageVisibility,
  WorkspaceRoleValue
} from '@draftorbit/shared';

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

export function buildUsageVisibility(role: WorkspaceRoleValue): UsageVisibility {
  if (role === 'OWNER' || role === 'ADMIN') {
    return {
      role,
      accessTier: 'FULL',
      canViewCosts: true,
      canViewLedgerDetails: true,
      canManageCredits: true,
      redactedFields: []
    };
  }

  if (role === 'EDITOR') {
    return {
      role,
      accessTier: 'LIMITED',
      canViewCosts: true,
      canViewLedgerDetails: false,
      canManageCredits: false,
      redactedFields: ['billing.stripeCustomerId', 'latestLedgers']
    };
  }

  return {
    role,
    accessTier: 'OVERVIEW',
    canViewCosts: false,
    canViewLedgerDetails: false,
    canManageCredits: false,
    redactedFields: [
      'billing.stripeCustomerId',
      'tokenCost',
      'latestLedgers',
      'events.model',
      'events.inputTokens',
      'events.outputTokens',
      'events.costUsd',
      'trends.costUsd'
    ]
  };
}

export function sanitizeUsageBilling(
  billing:
    | {
        plan: string;
        status: string;
        monthlyQuota: number;
        remainingCredits: number;
        cycleStart: Date | string | null;
        cycleEnd: Date | string | null;
        stripeCustomerId?: string | null;
      }
    | null,
  visibility: UsageVisibility
): UsageBillingSnapshot | null {
  if (!billing) return null;

  const snapshot: UsageBillingSnapshot = {
    plan: billing.plan,
    status: billing.status,
    monthlyQuota: billing.monthlyQuota,
    remainingCredits: billing.remainingCredits,
    cycleStart: toIso(billing.cycleStart),
    cycleEnd: toIso(billing.cycleEnd)
  };

  if (visibility.accessTier === 'FULL') {
    snapshot.stripeCustomerId = billing.stripeCustomerId ?? null;
  }

  return snapshot;
}

export function sanitizeCreditLedger(
  ledger: {
    id: string;
    direction: string;
    amount: number;
    balanceAfter: number | null;
    reason: string;
    createdAt: Date | string;
    metadata?: unknown;
  },
  visibility: UsageVisibility
): CreditLedgerSnapshot {
  const snapshot: CreditLedgerSnapshot = {
    id: ledger.id,
    direction: ledger.direction,
    amount: ledger.amount,
    balanceAfter: ledger.balanceAfter ?? null,
    reason: ledger.reason,
    createdAt: toIso(ledger.createdAt) ?? new Date(0).toISOString()
  };

  if (visibility.canViewLedgerDetails) {
    snapshot.metadata =
      ledger.metadata && typeof ledger.metadata === 'object' && !Array.isArray(ledger.metadata)
        ? (ledger.metadata as Record<string, unknown>)
        : null;
  }

  return snapshot;
}

export function sanitizeUsageEvent(
  event: {
    id: string;
    eventType: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: unknown;
    createdAt: Date | string;
  },
  visibility: UsageVisibility
): UsageEventEntity {
  const canViewDetails = visibility.canViewCosts;

  return {
    id: event.id,
    eventType: event.eventType,
    model: canViewDetails ? event.model : null,
    inputTokens: canViewDetails ? event.inputTokens : null,
    outputTokens: canViewDetails ? event.outputTokens : null,
    costUsd: canViewDetails ? toNumber(event.costUsd) : null,
    createdAt: toIso(event.createdAt) ?? new Date(0).toISOString(),
    detailsRedacted: !canViewDetails
  };
}

export function sanitizeUsageTrendPoint(
  point: UsageTrendPoint,
  visibility: UsageVisibility
): UsageTrendPoint {
  return {
    ...point,
    costUsd: visibility.canViewCosts ? toNumber(point.costUsd) : null
  };
}
