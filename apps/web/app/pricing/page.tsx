'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/button';
import { createCheckout, startXOAuth } from '../../lib/queries';
import { getToken, getUserFromToken } from '../../lib/api';

const faqItems = [
  {
    q: '可以随时取消吗？',
    a: '是的，随时可以取消订阅，当前计费周期结束前仍可使用已付费权益，具体以支付渠道规则为准。'
  },
  {
    q: '支持哪些支付方式？',
    a: '支持信用卡等 Stripe 支持的支付方式，结账页会显示你所在地区可用的选项。'
  },
  {
    q: '免费用户有什么限制？',
    a: '免费版每日可生成 3 次，适合体验核心能力；需要更高额度与发布能力可升级 Pro 或 Premium。'
  },
  {
    q: '升级后额度何时生效？',
    a: '支付成功后通常立即生效；若遇延迟，请刷新页面或稍后在「设置」中查看订阅状态。'
  }
];

function TopNav() {
  const token = typeof window !== 'undefined' ? getToken() : null;
  const brief = token ? getUserFromToken() : null;

  const onLogin = async () => {
    try {
      const { url } = await startXOAuth();
      window.location.href = url;
    } catch {
      alert('暂时无法发起登录，请稍后重试。');
    }
  };

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold text-gray-900">
          DraftOrbit
        </Link>
        {brief?.handle ? (
          <Link href="/settings" className="text-sm text-blue-600 hover:text-blue-700">
            @{brief.handle}
          </Link>
        ) : (
          <Button type="button" variant="ghost" size="sm" className="text-gray-700" onClick={onLogin}>
            登录
          </Button>
        )}
      </div>
    </header>
  );
}

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [checkoutLoading, setCheckoutLoading] = useState<'PRO' | 'PREMIUM' | null>(null);

  const goCheckout = useCallback(async (plan: 'PRO' | 'PREMIUM') => {
    if (!getToken()) {
      try {
        const { url } = await startXOAuth();
        window.location.href = url;
      } catch {
        alert('请先登录后再升级。');
      }
      return;
    }
    setCheckoutLoading(plan);
    try {
      const { url } = await createCheckout(plan);
      window.location.href = url;
    } catch (e) {
      alert(e instanceof Error ? e.message : '结账创建失败，请稍后重试。');
    } finally {
      setCheckoutLoading(null);
    }
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <TopNav />

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">选择适合你的方案</h1>
          <p className="mt-2 text-gray-600">AI 推文生成，按需订阅</p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <section className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Free</h2>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              ¥0<span className="text-base font-normal text-gray-500">/月</span>
            </p>
            <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-gray-600">
              <li>每日 3 次生成</li>
              <li>基础推文生成</li>
              <li>复制推文格式</li>
            </ul>
            <Button asChild variant="outline" className="mt-6 w-full">
              <Link href="/">免费开始</Link>
            </Button>
          </section>

          <section className="relative flex flex-col rounded-2xl border-2 border-blue-500 bg-blue-50/40 p-6 shadow-md">
            <span className="absolute right-4 top-4 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
              推荐
            </span>
            <h2 className="text-lg font-semibold text-gray-900">Pro</h2>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              ¥89<span className="text-base font-normal text-gray-500">/月</span>
            </p>
            <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-gray-600">
              <li>每月 100 次生成</li>
              <li>风格学习分析</li>
              <li>一键发布到 X</li>
              <li>多版本推文选择</li>
              <li>历史记录管理</li>
            </ul>
            <Button
              className="mt-6 w-full"
              disabled={checkoutLoading !== null}
              onClick={() => goCheckout('PRO')}
            >
              {checkoutLoading === 'PRO' ? '跳转中…' : '升级 Pro'}
            </Button>
          </section>

          <section className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Premium</h2>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              ¥299<span className="text-base font-normal text-gray-500">/月</span>
            </p>
            <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-gray-600">
              <li>无限次生成</li>
              <li>全部 Pro 功能</li>
              <li>优先模型通道</li>
              <li>API 接入能力</li>
              <li>专属客服支持</li>
            </ul>
            <Button
              className="mt-6 w-full bg-gray-900 hover:bg-gray-800"
              disabled={checkoutLoading !== null}
              onClick={() => goCheckout('PREMIUM')}
            >
              {checkoutLoading === 'PREMIUM' ? '跳转中…' : '升级 Premium'}
            </Button>
          </section>
        </div>

        <section className="mt-16 border-t border-gray-200 pt-10">
          <h2 className="text-xl font-semibold text-gray-900">常见问题</h2>
          <div className="mt-6 space-y-2">
            {faqItems.map((item, i) => {
              const open = openFaq === i;
              return (
                <div key={item.q} className="rounded-xl border border-gray-200 bg-gray-50/50">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-900"
                    onClick={() => setOpenFaq(open ? null : i)}
                  >
                    {item.q}
                    <span className="text-gray-400">{open ? '−' : '+'}</span>
                  </button>
                  {open ? <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-600">{item.a}</p> : null}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
