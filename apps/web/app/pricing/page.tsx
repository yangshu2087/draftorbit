'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { createCheckout, fetchBillingPlans, startXOAuth } from '../../lib/queries';
import { getToken, getUserFromToken } from '../../lib/api';

type PlanItem = {
  key: 'PRO' | 'PREMIUM';
  name: string;
  priceMonthlyUsd: number;
  priceMonthlyUsdCents: number;
  features: string[];
};

const faqItems = [
  {
    q: '试用结束后会怎样？',
    a: '试用期为 7 天。到期后会按你选择的方案自动转为月付订阅，随时可在账单页取消。'
  },
  {
    q: '支持哪些付款方式？',
    a: '默认通过 PayPal 结账；当 Stripe 通道已配置时，也支持 Stripe Checkout（信用卡/Apple Pay/Google Pay）。'
  },
  {
    q: '可以随时取消吗？',
    a: '可以。取消后当前计费周期内仍可继续使用，到期后不再续费。'
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
  trialDays: number;
  recommended?: boolean;
  loading: boolean;
  onCheckout: (plan: 'PRO' | 'PREMIUM') => Promise<void>;
}) {
  const plan = props.plan;
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
        ${plan.priceMonthlyUsd}
        <span className="ml-1 text-base font-medium text-slate-500">/月</span>
      </p>
      <p className="mt-2 text-sm text-slate-500">先试用 {props.trialDays} 天，再开始订阅。</p>
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
        onClick={() => void props.onCheckout(plan.key)}
      >
        {props.loading ? '跳转结账中…' : `开始 ${props.trialDays} 天试用`}
      </Button>
    </section>
  );
}

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [checkoutLoading, setCheckoutLoading] = useState<'PRO' | 'PREMIUM' | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [trialDays, setTrialDays] = useState(7);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchBillingPlans();
        setPlans(data.plans);
        setTrialDays(data.trialDays);
      } catch {
        setPlans([
          {
            key: 'PRO',
            name: 'Pro',
            priceMonthlyUsd: 19,
            priceMonthlyUsdCents: 1900,
            features: ['每月 300 次内容生成', '完整生产与发布链路', 'X 账号运营工作台']
          },
          {
            key: 'PREMIUM',
            name: 'Premium',
            priceMonthlyUsd: 59,
            priceMonthlyUsdCents: 5900,
            features: ['不限量内容生成', '全链路运营能力', '优先处理与高级分析']
          }
        ]);
        setTrialDays(7);
      } finally {
        setLoadingPlans(false);
      }
    })();
  }, []);

  const orderedPlans = useMemo(() => {
    const score = { PRO: 1, PREMIUM: 2 } as const;
    return [...plans].sort((a, b) => score[a.key] - score[b.key]);
  }, [plans]);

  const goCheckout = useCallback(async (plan: 'PRO' | 'PREMIUM') => {
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
      const { url } = await createCheckout(plan);
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
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">按月订阅，统一美元计费</h1>
          <p className="mt-3 text-slate-600">不再提供永久免费版，仅提供 7 天试用后转订阅。</p>
        </div>

        {loadingPlans ? (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-3xl border border-slate-900/10 bg-white" />
            ))}
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {orderedPlans.map((plan, i) => (
              <PriceCard
                key={plan.key}
                plan={plan}
                trialDays={trialDays}
                recommended={i === 0}
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
