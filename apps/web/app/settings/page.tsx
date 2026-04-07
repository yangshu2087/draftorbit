'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  analyzeStyle,
  cancelSubscription,
  connectLocalKnowledgeFiles,
  connectObsidianVault,
  createRefund,
  fetchMe,
  fetchOpsDashboard,
  fetchStyle,
  fetchSubscription,
  fetchUsage,
  importKnowledgeUrls,
  rebuildStyleProfile
} from '../../lib/queries';
import { clearToken, getToken, getUserFromToken } from '../../lib/api';

function TopNav() {
  const token = typeof window !== 'undefined' ? getToken() : null;
  const brief = token ? getUserFromToken() : null;

  return (
    <header className="border-b border-slate-900/10 bg-white">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/chat" className="text-lg font-semibold text-slate-900">
          DraftOrbit
        </Link>
        {brief?.handle ? (
          <span className="text-sm text-slate-600">@{brief.handle}</span>
        ) : (
          <Link href="/pricing" className="text-sm text-slate-700 hover:text-slate-900">
            定价
          </Link>
        )}
      </div>
    </header>
  );
}

function planLabel(plan: string) {
  switch (plan) {
    case 'STARTER':
      return 'Starter';
    case 'PRO':
      return 'Growth';
    case 'PREMIUM':
      return 'Max';
    default:
      return '试用';
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const refundDrillEnabled = process.env.NEXT_PUBLIC_BILLING_REFUND_DRILL_ENABLED === 'true';
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [style, setStyle] = useState<any | null>(undefined);
  const [loading, setLoading] = useState(true);
  const [styleBusy, setStyleBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [knowledgeBusy, setKnowledgeBusy] = useState(false);
  const [knowledgeNotice, setKnowledgeNotice] = useState<string | null>(null);
  const [obsidianPath, setObsidianPath] = useState('');
  const [localPathsText, setLocalPathsText] = useState('');
  const [knowledgeUrlsText, setKnowledgeUrlsText] = useState('');
  const [opsGuidance, setOpsGuidance] = useState<{
    nextAction?: string;
    blockingReason?: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [me, sub, use, ops] = await Promise.all([
        fetchMe(),
        fetchSubscription(),
        fetchUsage(),
        fetchOpsDashboard()
      ]);
      setUser(me);
      setSubscription(sub);
      setUsage(use);
      setOpsGuidance({
        nextAction: (ops as Record<string, unknown>).nextAction as string | undefined,
        blockingReason: (ops as Record<string, unknown>).blockingReason as string | null | undefined
      });
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

  const onRebuildStyle = async () => {
    setStyleBusy(true);
    setError(null);
    try {
      await rebuildStyleProfile();
      const s = await fetchStyle();
      setStyle(s);
      setKnowledgeNotice('已触发风格画像重建，后续生成将自动应用。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '重建失败');
    } finally {
      setStyleBusy(false);
    }
  };

  const normalizeLines = (text: string) =>
    text
      .split('\n')
      .map((row) => row.trim())
      .filter(Boolean);

  const onConnectObsidian = async () => {
    if (!obsidianPath.trim()) {
      setError('请先输入 Obsidian Vault 路径');
      return;
    }
    setKnowledgeBusy(true);
    setKnowledgeNotice(null);
    setError(null);
    try {
      const result = await connectObsidianVault({
        vaultPath: obsidianPath.trim(),
        autoLearn: true
      });
      const sourceId = (result as Record<string, unknown>)?.source
        ? ((result as Record<string, any>).source.id as string | undefined)
        : undefined;
      setKnowledgeNotice(`Obsidian 已接入${sourceId ? `（source: ${sourceId}）` : ''}。`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '接入 Obsidian 失败');
    } finally {
      setKnowledgeBusy(false);
    }
  };

  const onConnectLocalFiles = async () => {
    const paths = normalizeLines(localPathsText);
    if (paths.length === 0) {
      setError('请至少输入一个本地文件路径');
      return;
    }
    setKnowledgeBusy(true);
    setKnowledgeNotice(null);
    setError(null);
    try {
      await connectLocalKnowledgeFiles({ paths, autoLearn: true });
      setKnowledgeNotice(`已接入 ${paths.length} 个本地文件源。`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '接入本地文件失败');
    } finally {
      setKnowledgeBusy(false);
    }
  };

  const onImportUrls = async () => {
    const urls = normalizeLines(knowledgeUrlsText);
    if (urls.length === 0) {
      setError('请至少输入一个 URL');
      return;
    }
    setKnowledgeBusy(true);
    setKnowledgeNotice(null);
    setError(null);
    try {
      await importKnowledgeUrls({ urls, autoLearn: true });
      setKnowledgeNotice(`已导入 ${urls.length} 个链接源。`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入链接失败（请确认是合法 URL）');
    } finally {
      setKnowledgeBusy(false);
    }
  };

  const onCancelAtPeriodEnd = async () => {
    if (!window.confirm('确认在当前计费周期结束时取消订阅？')) return;
    setBillingBusy(true);
    setError(null);
    try {
      await cancelSubscription('AT_PERIOD_END');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '取消订阅失败');
    } finally {
      setBillingBusy(false);
    }
  };

  const onCancelImmediate = async () => {
    if (!window.confirm('确认立即取消订阅？这会立刻结束当前订阅。')) return;
    setBillingBusy(true);
    setError(null);
    try {
      await cancelSubscription('IMMEDIATE');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '立即取消失败');
    } finally {
      setBillingBusy(false);
    }
  };

  const onPartialRefund = async () => {
    const raw = window.prompt('请输入部分退款金额（USD）', '1');
    if (!raw) return;
    const amountUsd = Number(raw);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setError('请输入有效退款金额');
      return;
    }
    if (!window.confirm(`确认发起部分退款 USD ${amountUsd.toFixed(2)}？`)) return;
    setBillingBusy(true);
    setError(null);
    try {
      await createRefund({ mode: 'PARTIAL', amountUsd, reason: 'requested_by_customer' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '部分退款失败');
    } finally {
      setBillingBusy(false);
    }
  };

  const onFullRefund = async () => {
    if (!window.confirm('确认发起全额退款？')) return;
    setBillingBusy(true);
    setError(null);
    try {
      await createRefund({ mode: 'FULL', reason: 'requested_by_customer' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '全额退款失败');
    } finally {
      setBillingBusy(false);
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
      <div className="flex min-h-screen items-center justify-center bg-white text-slate-600">跳转中…</div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <TopNav />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-900">设置</h1>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : null}

        {loading ? (
          <p className="text-slate-500">加载中…</p>
        ) : (
          <>
            <section className="do-panel rounded-3xl p-6">
              <h2 className="text-lg font-semibold text-slate-900">账号信息</h2>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    width={64}
                    height={64}
                    className="h-16 w-16 rounded-full border border-slate-900/10 object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-900/10 bg-slate-100 text-slate-400">无</div>
                )}
                <div>
                  <p className="text-sm text-slate-500">显示名称</p>
                  <p className="font-medium text-slate-900">{user?.displayName ?? '—'}</p>
                  <p className="mt-2 text-sm text-slate-500">X 账号</p>
                  <p className="font-medium text-slate-900">@{user?.handle ?? '—'}</p>
                </div>
              </div>
              <Button variant="outline" className="mt-6" onClick={onLogout}>
                退出登录
              </Button>
            </section>

            <section className="do-panel rounded-3xl p-6">
              <h2 className="text-lg font-semibold text-slate-900">订阅管理</h2>
              {subscription?.isTrialing ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  当前处于试用期，将在{' '}
                  {subscription?.trialEndsAt
                    ? new Date(subscription.trialEndsAt).toLocaleString('zh-CN')
                    : '—'}{' '}
                  结束。
                </div>
              ) : null}
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">当前方案</dt>
                  <dd className="font-medium text-slate-900">
                    {planLabel(subscription?.plan ?? 'PRO')}
                    {subscription?.isTrialing ? '（试用中）' : ''}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">计费币种</dt>
                  <dd className="text-slate-900">{subscription?.currency ?? 'USD'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">计费周期</dt>
                  <dd className="text-slate-900">
                    {subscription?.billingInterval === 'YEARLY'
                      ? '年付'
                      : subscription?.billingInterval === 'MONTHLY'
                        ? '月付'
                        : '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">今日用量</dt>
                  <dd className="text-slate-900">
                    {usage?.dailyCount ?? 0} / {usage?.limits?.daily ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">本月用量</dt>
                  <dd className="text-slate-900">
                    {usage?.monthlyCount ?? 0} / {usage?.limits?.monthly ?? '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">当前周期结束</dt>
                  <dd className="text-slate-900">
                    {subscription?.currentPeriodEnd
                      ? new Date(subscription.currentPeriodEnd).toLocaleString('zh-CN')
                      : '—'}
                  </dd>
                </div>
              </dl>
              <Button asChild className="mt-6">
                <Link href="/pricing">{subscription?.isTrialing ? '选择订阅方案' : '变更订阅方案'}</Link>
              </Button>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={billingBusy} onClick={onCancelAtPeriodEnd}>
                  {billingBusy ? '处理中…' : '到期取消订阅'}
                </Button>
                <Button variant="outline" size="sm" disabled={billingBusy} onClick={onCancelImmediate}>
                  {billingBusy ? '处理中…' : '立即取消订阅'}
                </Button>
              </div>

              {refundDrillEnabled ? (
                <>
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    退款按钮仅用于测试租户演练；如提示未开启，请在 API 环境变量中启用
                    <span className="font-semibold"> BILLING_SELF_SERVICE_REFUND_ENABLED=true</span>。
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" disabled={billingBusy} onClick={onPartialRefund}>
                      {billingBusy ? '处理中…' : '部分退款演练'}
                    </Button>
                    <Button variant="outline" size="sm" disabled={billingBusy} onClick={onFullRefund}>
                      {billingBusy ? '处理中…' : '全额退款演练'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  退款演练接口当前未开放（按运营策略关闭）。如需演练，请由运营在测试窗口临时开启并验收后关闭。
                </div>
              )}
            </section>

            <section className="do-panel rounded-3xl p-6">
              <h2 className="text-lg font-semibold text-slate-900">风格分析</h2>
              <p className="mt-1 text-xs text-slate-500">
                系统会自动应用风格画像；如你新增了学习资料，可执行重建。
              </p>
              {style === null ? (
                <div className="mt-4">
                  <p className="text-sm text-slate-600">尚未分析你的推文风格，点击下方按钮开始。</p>
                  <Button className="mt-4" disabled={styleBusy} onClick={onAnalyze}>
                    {styleBusy ? '分析中…' : '分析我的推文风格'}
                  </Button>
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-slate-500">分析摘要</p>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-900/8 bg-slate-50 p-3 text-xs text-slate-800">
                    {styleSummary || '—'}
                  </pre>
                  <p className="mt-3 text-sm text-slate-600">
                    样本条数：{style.sampleCount ?? '—'}；最近分析：
                    {style.lastAnalyzedAt ? new Date(style.lastAnalyzedAt).toLocaleString('zh-CN') : '—'}
                  </p>
                  <Button variant="secondary" className="mt-4" disabled={styleBusy} onClick={onAnalyze}>
                    {styleBusy ? '分析中…' : '重新分析'}
                  </Button>
                  <Button variant="outline" className="ml-2 mt-4" disabled={styleBusy} onClick={onRebuildStyle}>
                    {styleBusy ? '处理中…' : '重建 Style DNA'}
                  </Button>
                </div>
              )}
            </section>

            <section className="do-panel rounded-3xl p-6">
              <h2 className="text-lg font-semibold text-slate-900">知识接入（自动学习）</h2>
              <p className="mt-1 text-xs text-slate-500">
                接入完成后，系统会自动学习风格与爆文结构特征，无需你手动配置细项。
              </p>

              {opsGuidance?.nextAction || opsGuidance?.blockingReason ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  当前系统建议：{opsGuidance?.nextAction ?? '—'}
                  {opsGuidance?.blockingReason ? ` · 阻塞：${opsGuidance.blockingReason}` : ''}
                </div>
              ) : null}

              {knowledgeNotice ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  {knowledgeNotice}
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate-900">Obsidian Vault</p>
                  <input
                    value={obsidianPath}
                    onChange={(e) => setObsidianPath(e.target.value)}
                    placeholder="/Users/you/Documents/ObsidianVault"
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <Button className="mt-3 w-full" disabled={knowledgeBusy} onClick={onConnectObsidian}>
                    {knowledgeBusy ? '处理中…' : '接入并自动学习'}
                  </Button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-medium text-slate-900">本地文件</p>
                  <textarea
                    value={localPathsText}
                    onChange={(e) => setLocalPathsText(e.target.value)}
                    placeholder={'/path/to/one.md\\n/path/to/two.pdf'}
                    className="mt-2 min-h-[96px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <Button className="mt-3 w-full" disabled={knowledgeBusy} onClick={onConnectLocalFiles}>
                    {knowledgeBusy ? '处理中…' : '导入文件并学习'}
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-900">X 链接 / 参考 URL</p>
                <textarea
                  value={knowledgeUrlsText}
                  onChange={(e) => setKnowledgeUrlsText(e.target.value)}
                  placeholder={'https://x.com/xxx/status/123\\nhttps://example.com/post'}
                  className="mt-2 min-h-[96px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <Button className="mt-3" disabled={knowledgeBusy} onClick={onImportUrls}>
                  {knowledgeBusy ? '处理中…' : '导入链接并学习'}
                </Button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
