import { BillingInterval, SubscriptionPlan } from '@draftorbit/db';

export const BILLING_CURRENCY = 'USD';
export const DEFAULT_BILLING_TRIAL_DAYS = 3;

export type BillingPlanKey = 'STARTER' | 'PRO' | 'PREMIUM';
export type BillingCycle = BillingInterval;

type PlanCatalogItem = {
  key: BillingPlanKey;
  displayName: string;
  publicName: string;
  monthlyUsdCents: number;
  yearlyUsdCents: number;
  features: string[];
  limits: {
    daily: number;
    monthly: number;
  };
  stripePriceEnv: Record<BillingCycle, string>;
};

const FALLBACK_LIMITS = {
  daily: 80,
  monthly: 500
} as const;

export const BILLING_PLAN_ORDER: BillingPlanKey[] = ['STARTER', 'PRO', 'PREMIUM'];

export const PLAN_CATALOG: Record<BillingPlanKey, PlanCatalogItem> = {
  STARTER: {
    key: 'STARTER',
    displayName: 'Starter',
    publicName: 'Starter',
    monthlyUsdCents: 1900,
    yearlyUsdCents: 18240,
    features: ['每月 500 次内容生成', 'X 内容生产与发布主链路', '基础审批与发布队列'],
    limits: {
      daily: 80,
      monthly: 500
    },
    stripePriceEnv: {
      MONTHLY: 'STRIPE_STARTER_MONTHLY_PRICE_ID',
      YEARLY: 'STRIPE_STARTER_YEARLY_PRICE_ID'
    }
  },
  PRO: {
    key: 'PRO',
    displayName: 'Growth',
    publicName: 'Growth',
    monthlyUsdCents: 4900,
    yearlyUsdCents: 47040,
    features: ['每月 2000 次内容生成', '风格学习 + 自然化 + 自动配图', '回复助手与审批流增强'],
    limits: {
      daily: 300,
      monthly: 2000
    },
    stripePriceEnv: {
      MONTHLY: 'STRIPE_PRO_MONTHLY_PRICE_ID',
      YEARLY: 'STRIPE_PRO_YEARLY_PRICE_ID'
    }
  },
  PREMIUM: {
    key: 'PREMIUM',
    displayName: 'Max',
    publicName: 'Max',
    monthlyUsdCents: 9900,
    yearlyUsdCents: 95040,
    features: ['每月 5000 次内容生成', '高级自动化与多工作流编排', '优先支持与高优先级队列'],
    limits: {
      daily: 1000,
      monthly: 5000
    },
    stripePriceEnv: {
      MONTHLY: 'STRIPE_PREMIUM_MONTHLY_PRICE_ID',
      YEARLY: 'STRIPE_PREMIUM_YEARLY_PRICE_ID'
    }
  }
};

export const LIVE_STRIPE_PRICE_ENV_KEYS = BILLING_PLAN_ORDER.flatMap((planKey) => {
  const env = PLAN_CATALOG[planKey].stripePriceEnv;
  return [env.MONTHLY, env.YEARLY];
});

export function parseBillingCycle(input: unknown): BillingCycle | null {
  if (input === BillingInterval.MONTHLY || input === BillingInterval.YEARLY) {
    return input;
  }
  return null;
}

export function parseBillingPlan(input: unknown): BillingPlanKey | null {
  if (input === 'STARTER' || input === 'PRO' || input === 'PREMIUM') {
    return input;
  }
  return null;
}

export function getBillingTrialDays(): number {
  const raw = (process.env.BILLING_TRIAL_DAYS ?? '').trim();
  if (!raw) return DEFAULT_BILLING_TRIAL_DAYS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_BILLING_TRIAL_DAYS;

  return Math.max(0, Math.floor(parsed));
}

export function planKeyFromSubscriptionPlan(plan: SubscriptionPlan): BillingPlanKey {
  switch (plan) {
    case SubscriptionPlan.PREMIUM:
      return 'PREMIUM';
    case SubscriptionPlan.PRO:
      return 'PRO';
    case SubscriptionPlan.STARTER:
      return 'STARTER';
    case SubscriptionPlan.FREE:
    default:
      return 'STARTER';
  }
}

export function subscriptionPlanFromPlanKey(planKey: BillingPlanKey): SubscriptionPlan {
  if (planKey === 'PREMIUM') return SubscriptionPlan.PREMIUM;
  if (planKey === 'PRO') return SubscriptionPlan.PRO;
  return SubscriptionPlan.STARTER;
}

export function planDisplayLabel(plan: SubscriptionPlan | BillingPlanKey | string): string {
  const key = typeof plan === 'string' ? plan.toUpperCase() : plan;
  if (key === SubscriptionPlan.PREMIUM || key === 'PREMIUM') return PLAN_CATALOG.PREMIUM.displayName;
  if (key === SubscriptionPlan.PRO || key === 'PRO') return PLAN_CATALOG.PRO.displayName;
  return PLAN_CATALOG.STARTER.displayName;
}

export function getPlanLimits(plan: SubscriptionPlan | BillingPlanKey): { daily: number; monthly: number } {
  const key =
    typeof plan === 'string' && (plan === 'STARTER' || plan === 'PRO' || plan === 'PREMIUM')
      ? plan
      : planKeyFromSubscriptionPlan(plan as SubscriptionPlan);

  return PLAN_CATALOG[key]?.limits ?? FALLBACK_LIMITS;
}

export function getPlanCatalogView() {
  return BILLING_PLAN_ORDER.map((key) => {
    const item = PLAN_CATALOG[key];
    return {
      key,
      name: item.displayName,
      monthly: {
        usd: Number((item.monthlyUsdCents / 100).toFixed(2)),
        usdCents: item.monthlyUsdCents
      },
      yearly: {
        usd: Number((item.yearlyUsdCents / 100).toFixed(2)),
        usdCents: item.yearlyUsdCents
      },
      features: item.features,
      limits: item.limits
    };
  });
}

export function stripePriceEnvKey(plan: BillingPlanKey, cycle: BillingCycle): string {
  return PLAN_CATALOG[plan].stripePriceEnv[cycle];
}

export function resolveStripePriceId(
  plan: BillingPlanKey,
  cycle: BillingCycle,
  source: Record<string, string | undefined> = process.env
): string | null {
  const key = stripePriceEnvKey(plan, cycle);
  const value = source[key];
  if (!value || !value.trim()) return null;
  return value.trim();
}
