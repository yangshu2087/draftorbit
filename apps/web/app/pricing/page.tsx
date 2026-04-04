'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { createCheckout, fetchBillingPlans, startXOAuth } from '../../lib/queries';
import { getToken, getUserFromToken } from '../../lib/api';

type PlanKey = 'STARTER' | 'PRO' | 'PREMIUM';
type BillingCycle = 'MONTHLY' | 'YEARLY';

type PlanItem = {
  key: PlanKey;
  name: string;
  monthly: {
    usd: number;
    usdCents: number;
  };
  yearly: {
    usd: number;
    usdCents: number;
  };
  features: string[];
  limits: {
    daily: number;
    monthly: number;
  };
};

const faqItems = [
  {
    q: '试用结束后会怎样？',
    a: '默认试用期为 3 天。试用到期后会按你选择的月付或年付方案自动转为订阅，随时可在账单页取消。'
  },
  {
    q: '支持哪些付款方式？',
    a: '统一通过 Stripe Checkout（信用卡/Apple Pay/Google Pay）进行 USD 结算。'
  },
  {
    q: '为什么推荐年付？',
    a: '年付按月付总价 8 折，适合需要稳定内容产能和持续运营的团队。'
  }
];

function TopNav() {
  const token = typeof window !== 'undefined' ? getToken() : null;
  const brief = token ? getUserFromToken() : null;

  return (
    <header className="border-b border-white/60 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight text-slate-900">
          DraftOrbit
        </Link>
        {brief?.handle ? (
          <Link href="/settings" className="text-sm text-slate-600 hover:text-slate-900">
            @{brief.handle}
          </Link>
        ) : (
          <Link href="/" className="text-sm text-slate-600 hover:text-slate-900">
            返回登录
          </Link>
        )}
      </div>
    </header>
  );
}

function PriceCard(props: {
  plan: PlanItem;
  cycle: BillingCycle;
  trialDays: number;
  recommended?: boolean;
  loading: boolean;
  onCheckout: (plan: PlanKey, cycle: BillingCycle) => Promise<void>;
}) {
  const { plan, cycle, trialDays } = props;
  const isYearly = cycle === 'YEARLY';
  const price = isYearly ? plan.yearly.usd : plan.monthly.usd;
  const displayPrice = Number.isInteger(price) ? String(price) : price.toFixed(2);
  const hasTrial = trialDays > 0;

  return (
    <section
      className={`relative flex flex-col rounded-3xl border bg-white p-6 shadow-sm ${
        props.recommended ? 'border-slate-900 ring-1 ring-slate-900/10' : 'border-slate-900/10'
      }`}
    >
      {props.recommended ? (
        <span className="absolute right-4 top-4 rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">推荐</span>
      ) : null}
      <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
      <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900">
        ${displayPrice}
        <span className="ml-1 text-base font-medium text-slate-500">/{isYearly ? '年' : '月'}</span>
      </p>
      {isYearly ? (
        <p className="mt-2 text-xs text-emerald-700">年付对比月付节省 20%</p>
      ) : null}
      <p className="mt-2 text-sm text-slate-500">
        {hasTrial ? `先试用 ${trialDays} 天，再开始订阅。` : '立即订阅，支付后立即生效。'}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        配额：每日 {plan.limits.daily} 次 / 每月 {plan.limits.monthly} 次
      </p>

      <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm text-slate-600">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
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
        {props.loading ? '跳转结账中…' : hasTrial ? `开始 ${trialDays} 天试用` : '立即订阅'}
      </Button>
    </section>
  );
}

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [checkoutLoading, setCheckoutLoading] = useState<PlanKey | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [trialDays, setTrialDays] = useState(3);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchBillingPlans();
        setPlans(data.plans);
        setTrialDays(data.trialDays);
      } catch {
        setPlans([
          {
            key: 'STARTER',
            name: 'Starter',
            monthly: { usd: 19, usdCents: 1900 },
            yearly: { usd: 182.4, usdCents: 18240 },
            features: ['每月 500 次内容生成', 'X 内容生产与发布主链路', '基础审批与发布队列'],
            limits: { daily: 80, monthly: 500 }
          },
          {
            key: 'PRO',
            name: 'Growth',
            monthly: { usd: 49, usdCents: 4900 },
            yearly: { usd: 470.4, usdCents: 47040 },
            features: ['每月 2000 次内容生成', '风格学习 + 自然化 + 自动配图', '回复助手与审批流增强'],
            limits: { daily: 300, monthly: 2000 }
          },
          {
            key: 'PREMIUM',
            name: 'Max',
            monthly: { usd: 99, usdCents: 9900 },
            yearly: { usd: 950.4, usdCents: 95040 },
            features: ['每月 5000 次内容生成', '高级自动化与多工作流编排', '优先支持与高优先级队列'],
            limits: { daily: 1000, monthly: 5000 }
          }
        ]);
        setTrialDays(3);
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, []);

  const orderedPlans = useMemo(() => {
    const score = { STARTER: 1, PRO: 2, PREMIUM: 3 } as const;
    return [...plans].sort((a, b) => score[a.key] - score[b.key]);
  }, [plans]);

  const goCheckout = useCallback(async (plan: PlanKey, selectedCycle: BillingCycle) => {
    if (!getToken()) {
      try {
        const { url } = await startXOAuth();
        window.location.href = url;
      } catch {
        alert('请先登录后再继续。');
      }
      return;
    }
    setCheckoutLoading(plan);
    try {
      const { url } = await createCheckout(plan, selectedCycle);
      window.location.href = url;
    } catch (e) {
      alert(e instanceof Error ? e.message : '创建结账失败，请稍后重试。');
    } finally {
      setCheckoutLoading(null);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fdf8f5_0,#f6f7fb_45%,#f3f5fb_100%)] text-slate-900">
      <TopNav />

      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">按月或年订阅，统一 USD 计费</h1>
          <p className="mt-3 text-slate-600">三档方案覆盖从创作者到团队的 X 内容运营需求。</p>

          <div className="mt-6 inline-flex items-center rounded-full border border-slate-200 bg-white p-1">
            <button
              type="button"
              className={`rounded-full px-4 py-1.5 text-sm ${
                cycle === 'MONTHLY' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setCycle('MONTHLY')}
            >
              月付
            </button>
            <button
              type="button"
              className={`rounded-full px-4 py-1.5 text-sm ${
                cycle === 'YEARLY' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
              onClick={() => setCycle('YEARLY')}
            >
              年付（省 20%）
            </button>
          </div>
        </div>

        {loadingPlans ? (
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-3xl border border-slate-900/10 bg-white" />
            ))}
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-3">
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
          </div>
        )}

        <section className="mt-12 rounded-3xl border border-slate-900/10 bg-white p-5">
          <h2 className="text-xl font-semibold text-slate-900">常见问题</h2>
          <div className="mt-4 space-y-2">
            {faqItems.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className="rounded-2xl border border-slate-900/10 bg-slate-50/70">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-900"
                    onClick={() => setOpenFaq(open ? null : i)}
                  >
                    {item.q}
                    <span className="text-slate-400">{open ? '−' : '+'}</span>
                  </button>
                  {open ? <p className="border-t border-slate-900/10 px-4 py-3 text-sm text-slate-600">{item.a}</p> : null}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
