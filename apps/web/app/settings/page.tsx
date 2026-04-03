'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { analyzeStyle, fetchMe, fetchStyle, fetchSubscription, fetchUsage } from '../../lib/queries';
import { clearToken, getToken, getUserFromToken } from '../../lib/api';

function TopNav() {
  const token = typeof window !== 'undefined' ? getToken() : null;
  const brief = token ? getUserFromToken() : null;

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold text-gray-900">
          DraftOrbit
        </Link>
        {brief?.handle ? (
          <span className="text-sm text-gray-600">@{brief.handle}</span>
        ) : (
          <Link href="/pricing" className="text-sm text-blue-600">
            定价
          </Link>
        )}
      </div>
    </header>
  );
}

function planLabel(plan: string) {
  switch (plan) {
    case 'PRO':
      return 'Pro';
    case 'PREMIUM':
      return 'Premium';
    default:
      return '免费版';
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [style, setStyle] = useState<any | null>(undefined);
  const [loading, setLoading] = useState(true);
  const [styleBusy, setStyleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [me, sub, use] = await Promise.all([fetchMe(), fetchSubscription(), fetchUsage()]);
      setUser(me);
      setSubscription(sub);
      setUsage(use);
      try {
        const s = await fetchStyle();
        setStyle(s);
      } catch {
        setStyle(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/pricing');
      return;
    }
    void load();
  }, [router, load]);

  const onLogout = () => {
    clearToken();
    router.replace('/');
  };

  const onAnalyze = async () => {
    setStyleBusy(true);
    setError(null);
    try {
      await analyzeStyle();
      const s = await fetchStyle();
      setStyle(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : '分析失败');
    } finally {
      setStyleBusy(false);
    }
  };

  const styleSummary =
    style?.analysisResult != null
      ? typeof style.analysisResult === 'string'
        ? style.analysisResult
        : JSON.stringify(style.analysisResult, null, 2)
      : '';

  if (!getToken()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-gray-600">跳转中…</div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <TopNav />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">设置</h1>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        {loading ? (
          <p className="text-gray-500">加载中…</p>
        ) : (
          <>
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">账号信息</h2>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-full border border-gray-200 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-gray-400">无</div>
                )}
                <div>
                  <p className="text-sm text-gray-500">显示名称</p>
                  <p className="font-medium text-gray-900">{user?.displayName ?? '—'}</p>
                  <p className="mt-2 text-sm text-gray-500">X 账号</p>
                  <p className="font-medium text-gray-900">@{user?.handle ?? '—'}</p>
                </div>
              </div>
              <Button variant="outline" className="mt-6" onClick={onLogout}>
                退出登录
              </Button>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">订阅管理</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">当前方案</dt>
                  <dd className="font-medium text-gray-900">{planLabel(subscription?.plan ?? 'FREE')}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">今日用量</dt>
                  <dd className="text-gray-900">
                    {usage?.dailyCount ?? 0} / {usage?.limits?.daily ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">本月用量</dt>
                  <dd className="text-gray-900">
                    {usage?.monthlyCount ?? 0} / {usage?.limits?.monthly ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">当前周期结束</dt>
                  <dd className="text-gray-900">
                    {subscription?.currentPeriodEnd
                      ? new Date(subscription.currentPeriodEnd).toLocaleString('zh-CN')
                      : '—'}
                  </dd>
                </div>
              </dl>
              {(subscription?.plan === 'FREE' || !subscription?.plan) && (
                <Button asChild className="mt-6">
                  <Link href="/pricing">升级订阅</Link>
                </Button>
              )}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">风格分析</h2>
              {style === null ? (
                <div className="mt-4">
                  <p className="text-sm text-gray-600">尚未分析你的推文风格，点击下方按钮开始。</p>
                  <Button className="mt-4" disabled={styleBusy} onClick={onAnalyze}>
                    {styleBusy ? '分析中…' : '分析我的推文风格'}
                  </Button>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-gray-500">分析摘要</p>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800">
                    {styleSummary || '—'}
                  </pre>
                  <p className="mt-3 text-sm text-gray-600">
                    样本条数：{style.sampleCount ?? '—'}；最近分析：
                    {style.lastAnalyzedAt ? new Date(style.lastAnalyzedAt).toLocaleString('zh-CN') : '—'}
                  </p>
                  <Button variant="secondary" className="mt-4" disabled={styleBusy} onClick={onAnalyze}>
                    {styleBusy ? '分析中…' : '重新分析'}
                  </Button>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
