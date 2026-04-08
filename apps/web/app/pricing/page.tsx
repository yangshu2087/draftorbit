'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { AppShell, planLabel } from '../../components/v3/shell';
import { Button } from '../../components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/state-feedback';
import {
  createCheckout,
  createLocalSession,
  fetchBillingPlans,
  startXOAuth,
  type BillingCycle,
  type BillingPlanKey,
  type BillingPlanView
} from '../../lib/queries';
import { getToken, getUserFromToken, setToken } from '../../lib/api';
import { toUiError, type UiError } from '../../lib/ui-error';

const planMeta: Record<BillingPlanKey, { headline: string; bullets: string[] }> = {
  STARTER: {
    headline: '适合先把一句话生成与待确认流程跑通',
    bullets: ['1 个 X 账号', '500 次生成 / 月', '1 个知识空间']
  },
  PRO: {
    headline: '适合已经稳定更新、需要更高频率的账号',
    bullets: ['3 个 X 账号', '2000 次生成 / 月', '支持更多学习样本']
  },
  PREMIUM: {
    headline: '适合多账号运营与高频内容生产',
    bullets: ['10 个 X 账号', '5000 次生成 / 月', '更高推理预算']
  }
};

function PriceCard(props: {
  plan: BillingPlanView;
  cycle: BillingCycle;
  trialDays: number;
  recommended?: boolean;
  loading: boolean;
  onCheckout: (plan: BillingPlanKey, cycle: BillingCycle) => Promise<void>;
}) {
  const { plan, cycle, trialDays } = props;
  const meta = planMeta[plan.key];
  const isYearly = cycle === 'YEARLY';
  const price = isYearly ? plan.yearly.usd : plan.monthly.usd;
  const displayPrice = Number.isInteger(price) ? String(price) : price.toFixed(2);

  return (
    <section
      className={`relative flex flex-col rounded-[28px] border bg-white p-6 shadow-sm ${
        props.recommended ? 'border-slate-950 ring-1 ring-slate-950/10' : 'border-slate-900/10'
      }`}
    >
      {props.recommended ? (
        <span className="absolute right-4 top-4 rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
          推荐
        </span>
      ) : null}
      <p className="text-sm font-semibold text-slate-500">{plan.name}</p>
      <p className="mt-4 text-5xl font-semibold tracking-tight text-slate-950">
        ${displayPrice}
        <span className="ml-1 text-base font-medium text-slate-400">/{isYearly ? '年' : '月'}</span>
      </p>
      <p className="mt-3 text-sm leading-6 text-slate-600">{meta.headline}</p>
      <p className="mt-3 text-xs text-slate-500">
        {trialDays > 0 ? `含 ${trialDays} 天试用。到期后自动转订阅，可随时取消。` : '支付后立即生效。'}
      </p>
      <p className="mt-2 text-xs text-slate-500">配额：每日 {plan.limits.daily} 次 / 每月 {plan.limits.monthly} 次</p>

      <ul className="mt-6 space-y-2 text-sm text-slate-700">
        {meta.bullets.concat(plan.features).map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-400" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        className="mt-6 w-full"
        variant={props.recommended ? 'default' : 'outline'}
        disabled={props.loading}
        onClick={() => void props.onCheckout(plan.key, cycle)}
      >
        {props.loading ? '正在跳转结账…' : trialDays > 0 ? `开始 ${trialDays} 天试用` : '继续结账'}
      </Button>
    </section>
  );
}

export default function PricingPage() {
  const [plans, setPlans] = useState<BillingPlanView[]>([]);
  const [trialDays, setTrialDays] = useState(3);
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const [checkoutLoading, setCheckoutLoading] = useState<BillingPlanKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<UiError | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const data = await fetchBillingPlans();
      setPlans(data.plans);
      setTrialDays(data.trialDays);
    } catch (error) {
      setPageError(toUiError(error, '加载订阅方案失败，请稍后重试。'));
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const orderedPlans = useMemo(() => {
    const score = { STARTER: 1, PRO: 2, PREMIUM: 3 } as const;
    return [...plans].sort((a, b) => score[a.key] - score[b.key]);
  }, [plans]);

  const goCheckout = useCallback(async (plan: BillingPlanKey, selectedCycle: BillingCycle) => {
    setCheckoutLoading(plan);
    setPageError(null);
    try {
      if (!getToken()) {
        const allowLocal = process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN === 'true';
        if (allowLocal) {
          const { token } = await createLocalSession();
          setToken(token);
        } else {
          const { url } = await startXOAuth();
          window.location.href = url;
          return;
        }
      }
      const { url } = await createCheckout(plan, selectedCycle);
      window.location.href = url;
    } catch (error) {
      setPageError(toUiError(error, '创建结账失败，请稍后重试。'));
      setCheckoutLoading(null);
      return;
    }
    setCheckoutLoading(null);
  }, []);

  const user = getUserFromToken();

  return (
    <AppShell
      publicMode={!user}
      eyebrow="升级与结账"
      title="只在需要升级时，才看这里"
      description="平时直接回到生成器写一句话。只有在升级、额度不足或结账前，才需要打开这个页面。"
      actions={
        <Button asChild variant="outline">
          <Link href={user ? '/app' : '/'}>
            {user ? '返回生成器' : '先回首页开始'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      }
    >
      <section className="do-panel-soft p-4 text-sm text-slate-700">
        这里只处理升级和结账，不打断日常生成流程。
      </section>

      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm ${cycle === 'MONTHLY' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setCycle('MONTHLY')}
          >
            月付
          </button>
          <button
            type="button"
            className={`rounded-full px-4 py-2 text-sm ${cycle === 'YEARLY' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-900'}`}
            onClick={() => setCycle('YEARLY')}
          >
            年付（省 20%）
          </button>
        </div>
      </div>

      {pageError ? <ErrorState error={pageError} onRetry={() => void loadPlans()} actionHref={user ? '/app' : '/'} actionLabel={user ? '返回生成器' : '返回首页'} /> : null}

      {loading ? (
        <LoadingState title="正在加载套餐" description="拉取最新套餐与试用配置。" />
      ) : orderedPlans.length === 0 ? (
        <EmptyState title="暂无可用套餐" description="可能是网络波动或支付配置异常，请稍后重试。" actionHref="/pricing" actionLabel="刷新套餐页" />
      ) : (
        <section className="grid gap-6 lg:grid-cols-3">
          {orderedPlans.map((plan) => (
            <PriceCard
              key={plan.key}
              plan={plan}
              cycle={cycle}
              trialDays={trialDays}
              recommended={plan.key === 'PRO'}
              loading={checkoutLoading === plan.key}
              onCheckout={goCheckout}
            />
          ))}
        </section>
      )}

      {user ? (
        <section className="do-panel p-5 text-sm text-slate-700">
          当前方案：<span className="font-semibold text-slate-950">{planLabel(user.plan)}</span>
        </section>
      ) : null}
    </AppShell>
  );
}
