'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  PencilLine,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getToken } from '../../lib/api';
import { fetchRunStream, type V3StreamEvent } from '../../lib/sse-stream';
import {
  confirmPublish,
  fetchBootstrap,
  fetchProfile,
  fetchQueue,
  fetchRun,
  preparePublish,
  runChat,
  type V3BootstrapResponse,
  type V3Format,
  type V3ProfileResponse,
  type V3QueueResponse,
  type V3RunResponse
} from '../../lib/queries';
import { toUiError, type UiError } from '../../lib/ui-error';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, LoadingState, SuccessNotice } from '../ui/state-feedback';
import { useToast } from '../ui/toast';
import { AppShell } from './shell';

const formatOptions: Array<{ value: V3Format; label: string; description: string }> = [
  { value: 'tweet', label: '短推', description: '适合单条观点、互动话题和产品动态' },
  { value: 'thread', label: '串推', description: '适合完整论述、案例拆解与连续叙事' },
  { value: 'article', label: '长文', description: '适合先生成长文，再拆成 X 线程或长帖' }
];

const quickPrompts = [
  '帮我发一条关于 AI 产品冷启动的观点短推',
  '参考我最近的风格，写一条更容易引发讨论的 thread',
  '学习这个竞争对手账号后，给我一条差异化表达',
  '把今天的产品更新整理成一条适合 X 的发布文案'
];

const stageOrder = [
  { key: 'research', title: '研究语境' },
  { key: 'strategy', title: '规划结构' },
  { key: 'draft', title: '生成草稿' },
  { key: 'voice', title: '匹配文风' },
  { key: 'media', title: '整理配图' },
  { key: 'publish_prep', title: '准备发布' }
] as const;

function suggestedActionLabel(action?: string) {
  const mapping: Record<string, string> = {
    connect_x_self: '先连接你的 X 账号',
    rebuild_profile: '先重建风格画像，让文风更贴近你',
    connect_learning_source: '补充知识源或目标账号，让内容更有依据',
    run_first_generation: '一句话开始第一条内容',
    watch_generation: '等待生成阶段完成',
    open_queue: '去队列确认发布',
    confirm_publish: '确认账号后入发布队列'
  };
  if (!action) return '一句话开始生成';
  return mapping[action] ?? action;
}

function nextActionButtonLabel(action?: string) {
  const mapping: Record<string, string> = {
    connect_x_self: '前往 Connect',
    connect_learning_source: '前往 Connect',
    rebuild_profile: '前往 Connect 重建画像',
    open_queue: '前往 Queue',
    confirm_publish: '前往 Queue'
  };
  if (!action) return '执行建议动作';
  return mapping[action] ?? '执行建议动作';
}

function nextActionTargetPath(
  action?: string | null,
  params?: { highlight?: string | null; published?: string | null; xbind?: string | null }
): string | null {
  if (!action) return null;

  if (action === 'connect_x_self' || action === 'connect_learning_source' || action === 'rebuild_profile') {
    const query = new URLSearchParams({ from: 'app', intent: action });
    if (params?.xbind) query.set('xbind', params.xbind);
    return `/connect?${query.toString()}`;
  }

  if (action === 'open_queue' || action === 'confirm_publish') {
    const query = new URLSearchParams({ from: 'app', intent: action });
    if (params?.highlight) query.set('highlight', params.highlight);
    if (params?.published) query.set('published', params.published);
    return `/queue?${query.toString()}`;
  }

  return null;
}

function nextActionDeepLink(
  action?: string | null,
  params?: { highlight?: string | null; published?: string | null; xbind?: string | null }
): { href: string; label: string } | null {
  if (!action) return null;
  const target = nextActionTargetPath(action, params);
  if (!target) return null;
  const query = new URLSearchParams({ nextAction: action });
  if (params?.highlight) query.set('highlight', params.highlight);
  if (params?.published) query.set('published', params.published);
  if (params?.xbind) query.set('xbind', params.xbind);
  return { href: `/app?${query.toString()}`, label: nextActionButtonLabel(action) };
}

function statusTone(status: string) {
  if (status === 'done' || status === 'SUCCEEDED') return 'success';
  if (status === 'running' || status === 'queued' || status === 'QUEUED' || status === 'RUNNING') return 'active';
  if (status === 'failed' || status === 'FAILED' || status === 'CANCELED') return 'danger';
  return 'idle';
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function qualityLabel(score?: number | null) {
  if (typeof score !== 'number') return '待评分';
  if (score >= 85) return '可直接进入确认';
  if (score >= 72) return '建议快速审阅';
  return '建议自动重写一次';
}

export default function OperatorApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();

  const [boot, setBoot] = useState<V3BootstrapResponse | null>(null);
  const [profile, setProfile] = useState<V3ProfileResponse | null>(null);
  const [queue, setQueue] = useState<V3QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<UiError | null>(null);
  const [entryNotice, setEntryNotice] = useState<string | null>(null);

  const [intent, setIntent] = useState('');
  const [format, setFormat] = useState<V3Format>('tweet');
  const [withImage, setWithImage] = useState(false);
  const [safeMode, setSafeMode] = useState(true);
  const [selectedXAccountId, setSelectedXAccountId] = useState('');

  const [runStart, setRunStart] = useState<{ runId: string; streamUrl: string } | null>(null);
  const [runDetail, setRunDetail] = useState<V3RunResponse | null>(null);
  const [stageEvents, setStageEvents] = useState<Record<string, V3StreamEvent>>({});
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<UiError | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualDraft, setManualDraft] = useState('');
  const [publishBusy, setPublishBusy] = useState(false);

  const loadPage = useCallback(async () => {
    if (!getToken()) {
      setPageError({ message: '未登录，请先回首页完成登录。' });
      setLoading(false);
      return;
    }
    setLoading(true);
    setPageError(null);
    try {
      const [bootPayload, profilePayload, queuePayload] = await Promise.all([
        fetchBootstrap(),
        fetchProfile(),
        fetchQueue(6)
      ]);
      setBoot(bootPayload);
      setProfile(profilePayload);
      setQueue(queuePayload);
      setSelectedXAccountId(bootPayload.defaultXAccount?.id ?? profilePayload.xAccounts[0]?.id ?? '');
    } catch (error) {
      setPageError(toUiError(error, '加载 Operator 失败，请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const from = searchParams.get('from');
    if (from === 'auth-login') setEntryNotice('登录完成。现在只需要一句话，就能开始生成你的 X 内容。');
    if (from === 'google-login') setEntryNotice('Google 登录完成。建议先连接 X 账号，再开始生成。');
  }, [searchParams]);

  useEffect(() => {
    const nextAction = searchParams.get('nextAction');
    const target = nextActionTargetPath(nextAction, {
      highlight: searchParams.get('highlight'),
      published: searchParams.get('published'),
      xbind: searchParams.get('xbind')
    });
    if (!target) return;
    router.replace(target);
  }, [router, searchParams]);

  const activeNextActionLink = useMemo(
    () => nextActionDeepLink(runError?.nextAction ?? boot?.suggestedAction),
    [boot?.suggestedAction, runError?.nextAction]
  );

  const connectLearningLink = useMemo(() => nextActionDeepLink('connect_learning_source'), []);
  const queueLink = useMemo(() => nextActionDeepLink('open_queue'), []);

  const runPipeline = useCallback(async (customIntent?: string) => {
    const finalIntent = (customIntent ?? intent).trim();
    if (!finalIntent) {
      setRunError({ message: '先说一句你想在 X 上实现什么。' });
      return;
    }

    setRunLoading(true);
    setRunError(null);
    setRunDetail(null);
    setStageEvents({});
    setManualMode(false);

    try {
      const started = await runChat({
        intent: finalIntent,
        format,
        withImage,
        xAccountId: selectedXAccountId || undefined,
        safeMode
      });
      setRunStart({ runId: started.runId, streamUrl: started.streamUrl });
      await fetchRunStream(started.runId, (event) => {
        setStageEvents((prev) => ({ ...prev, [event.stage]: event }));
      });
      const detail = await fetchRun(started.runId);
      setRunDetail(detail);
      setManualDraft(detail.result?.text ?? '');
      await loadPage();
    } catch (error) {
      setRunError(toUiError(error, '生成失败，请稍后重试。'));
    } finally {
      setRunLoading(false);
    }
  }, [format, intent, loadPage, safeMode, selectedXAccountId, withImage]);

  const currentStageLabel = useMemo(() => {
    const active = [...Object.values(stageEvents)].reverse().find((event) => event.status === 'running');
    if (active) return active.label;
    if (runDetail?.result) return '结果包已准备完成';
    return suggestedActionLabel(boot?.suggestedAction);
  }, [boot?.suggestedAction, runDetail?.result, stageEvents]);

  const activeFormat = useMemo(
    () => formatOptions.find((item) => item.value === format) ?? formatOptions[0],
    [format]
  );

  const selectedAccount = useMemo(
    () => profile?.xAccounts.find((item) => item.id === selectedXAccountId) ?? null,
    [profile?.xAccounts, selectedXAccountId]
  );

  const handleQueueAction = useCallback(async () => {
    if (!runDetail?.runId) return;
    setPublishBusy(true);
    setRunError(null);
    try {
      if (safeMode) {
        const preview = await preparePublish({
          runId: runDetail.runId,
          xAccountId: selectedXAccountId || undefined,
          safeMode: true
        });
        if (preview.blockingReason) {
          throw new Error(preview.blockingReason === 'NO_ACTIVE_X_ACCOUNT' ? '当前没有可用 X 账号，请先去 Connect 连接。' : preview.blockingReason);
        }
        pushToast({
          title: '已保留到待确认队列',
          description: '安全模式已开启：本次不会自动发帖，请前往 Queue 人工确认。',
          variant: 'success'
        });
        router.push(`/app?nextAction=open_queue&highlight=${encodeURIComponent(runDetail.runId)}`);
        return;
      }

      await confirmPublish({
        runId: runDetail.runId,
        xAccountId: selectedXAccountId || undefined,
        safeMode: false
      });
      pushToast({
        title: '已进入发布队列',
        description: '可前往 Queue 查看任务状态与账号命中结果。',
        variant: 'success'
      });
      await loadPage();
      router.push(`/app?nextAction=open_queue&published=${encodeURIComponent(runDetail.runId)}`);
    } catch (error) {
      setRunError(toUiError(error, '加入队列失败，请稍后重试。'));
    } finally {
      setPublishBusy(false);
    }
  }, [loadPage, pushToast, router, runDetail?.runId, safeMode, selectedXAccountId]);

  if (loading) {
    return (
      <AppShell eyebrow="Operator" title="今天想在 X 上实现什么？" description="系统会自动完成推理、生成、检查与入队准备。">
        <LoadingState title="正在加载你的 Operator" description="读取默认账号、风格画像与待确认队列。" />
      </AppShell>
    );
  }

  if (pageError) {
    return (
      <AppShell eyebrow="Operator" title="今天想在 X 上实现什么？" description="系统会自动完成推理、生成、检查与入队准备。">
        <ErrorState error={pageError} onRetry={() => void loadPage()} actionHref="/" actionLabel="返回首页" />
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="Operator"
      title="今天想在 X 上实现什么？"
      description="只说你的目标。DraftOrbit 会自动研究话题、匹配文风、生成可发结果，并在发布前做 X 风险检查。"
      actions={
        activeNextActionLink ? (
          <Button asChild variant="outline">
            <Link href={activeNextActionLink.href}>{activeNextActionLink.label}</Link>
          </Button>
        ) : null
      }
    >
      {entryNotice ? <SuccessNotice message={entryNotice} /> : null}
      {runError ? (
        <ErrorState
          error={runError}
          onRetry={() => void runPipeline()}
          actionHref={activeNextActionLink?.href}
          actionLabel={activeNextActionLink?.label}
        />
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <article className="do-panel p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">当前流程</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">设置目标 → 生成 → 审核 → 入队</h2>
                <p className="mt-2 text-sm text-slate-600">下一步：{currentStageLabel}</p>
              </div>
              <div className="rounded-2xl border border-slate-900/10 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <div>默认账号：{selectedAccount?.handle ? `@${selectedAccount.handle}` : '未连接'}</div>
                <div className="mt-1">安全模式：{safeMode ? '开启（仅保留待确认）' : '关闭（可直接入队）'}</div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {stageOrder.map((stage) => {
                const event = stageEvents[stage.key];
                const tone = statusTone(event?.status ?? 'idle');
                return (
                  <div
                    key={stage.key}
                    className={cn(
                      'rounded-2xl border p-4 transition',
                      tone === 'success' && 'border-emerald-200 bg-emerald-50/80',
                      tone === 'active' && 'border-sky-200 bg-sky-50/80',
                      tone === 'danger' && 'border-red-200 bg-red-50/80',
                      tone === 'idle' && 'border-slate-900/10 bg-white'
                    )}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{stage.title}</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{event?.label ?? '等待触发'}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{event?.summary ?? 'DraftOrbit 会在后台自动处理这一阶段。'}</p>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="do-panel p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">一句话目标</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">告诉我你今天要在 X 上完成什么</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">默认不需要填写复杂 brief。Agent 会自动完成目标判断、hook 规划、文风适配和合规检查。</p>
              </div>
              <span className="rounded-full border border-slate-900/10 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">预计 30–75 秒</span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {quickPrompts.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="rounded-full border border-slate-900/10 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 transition hover:border-slate-900/20 hover:bg-slate-100"
                  onClick={() => setIntent(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <textarea
              value={intent}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="例如：参考我最近的风格，写一条关于 AI 产品冷启动的观点短推，并给我一个更容易引发讨论的版本。"
              className="mt-5 min-h-[164px] w-full rounded-[24px] border border-slate-900/10 bg-white px-5 py-4 text-base leading-7 text-slate-900 shadow-inner shadow-slate-100/80 placeholder:text-slate-400"
            />

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">输出形态</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {formatOptions.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={cn(
                        'rounded-2xl border px-3 py-3 text-left text-sm transition',
                        format === item.value
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-900/10 bg-white text-slate-700 hover:border-slate-900/20'
                      )}
                      onClick={() => setFormat(item.value)}
                    >
                      <span className="block font-medium">{item.label}</span>
                      <span className={cn('mt-1 block text-xs leading-5', format === item.value ? 'text-slate-300' : 'text-slate-500')}>
                        {item.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">配图</span>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">文 + 图</p>
                    <p className="text-xs leading-5 text-slate-500">自动给配图 brief 与素材建议</p>
                  </div>
                  <input type="checkbox" checked={withImage} onChange={(event) => setWithImage(event.target.checked)} className="h-4 w-4" />
                </div>
              </label>

              <label className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">安全模式</span>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">先人工确认</p>
                    <p className="text-xs leading-5 text-slate-500">开启后仅保留到 Queue，不直接入发布任务</p>
                  </div>
                  <input type="checkbox" checked={safeMode} onChange={(event) => setSafeMode(event.target.checked)} className="h-4 w-4" />
                </div>
              </label>
            </div>

            <details className="mt-4 rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">高级控制（默认无需填写）</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">发布账号</span>
                  <select value={selectedXAccountId} onChange={(event) => setSelectedXAccountId(event.target.value)} className="w-full">
                    {profile?.xAccounts.length ? (
                      profile.xAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          @{account.handle} · {account.status}{account.isDefault ? ' · 默认' : ''}
                        </option>
                      ))
                    ) : (
                      <option value="">未连接 X 账号</option>
                    )}
                  </select>
                </label>
                <div className="rounded-2xl border border-slate-900/10 bg-white p-4 text-xs leading-6 text-slate-600">
                  <p className="font-semibold text-slate-900">当前模式</p>
                  <p className="mt-2">{activeFormat.description}</p>
                  <p className="mt-2">{withImage ? '会额外生成配图 brief。' : '本次只输出文本结果包。'}</p>
                </div>
              </div>
            </details>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button size="lg" disabled={runLoading} onClick={() => void runPipeline()}>
                {runLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {runLoading ? '正在自动推理…' : '开始生成'}
              </Button>
              <Button size="lg" variant="outline" disabled={runLoading || !intent.trim()} onClick={() => void runPipeline(intent)}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                再来一版
              </Button>
              <p className="self-center text-sm text-slate-500">失败时会自动停止并给出可执行建议，不会让你继续填复杂表单。</p>
            </div>
          </article>

          <article className="do-panel p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">结果包</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">最终用户只需要审一下，再决定是否发</h3>
              </div>
              {runStart?.runId ? <span className="rounded-full border border-slate-900/10 bg-slate-100 px-3 py-1 text-xs text-slate-600">runId: {runStart.runId.slice(0, 8)}…</span> : null}
            </div>

            {!runDetail?.result ? (
              <EmptyState title="还没有结果包" description="输入一句话并点击“开始生成”，系统会自动走完整个生成链路。" />
            ) : (
              <div className="mt-5 space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">质量分</p>
                    <p className="mt-2 text-3xl font-semibold text-slate-950">{runDetail.result.qualityScore ?? '—'}</p>
                    <p className="mt-2 text-xs text-slate-500">{qualityLabel(runDetail.result.qualityScore)}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4 md:col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">为什么这样写</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {runDetail.result.whySummary.length ? runDetail.result.whySummary.map((item) => (
                        <span key={item} className="rounded-full border border-slate-900/10 bg-white px-3 py-1.5 text-xs text-slate-600">{item}</span>
                      )) : <span className="text-sm text-slate-500">本次未生成摘要。</span>}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-900/10 bg-slate-950 p-5 text-white shadow-inner shadow-slate-900/30">
                  {manualMode ? (
                    <textarea value={manualDraft} onChange={(event) => setManualDraft(event.target.value)} className="min-h-[220px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-white placeholder:text-slate-400" />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-50">{runDetail.result.text}</pre>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                  <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">证据与配图</p>
                    <div className="mt-3 space-y-3 text-sm text-slate-700">
                      <div>
                        <p className="font-medium text-slate-900">已应用的学习证据</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {runDetail.result.evidenceSummary.length ? runDetail.result.evidenceSummary.map((item) => (
                            <span key={item} className="rounded-full border border-slate-900/10 bg-white px-3 py-1 text-xs text-slate-600">{item}</span>
                          )) : <span className="text-xs text-slate-500">暂无外部证据，基于你的意图与 X 语境生成。</span>}
                        </div>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">配图建议</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {runDetail.result.imageKeywords.length ? runDetail.result.imageKeywords.map((keyword) => (
                            <span key={keyword} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">{keyword}</span>
                          )) : <span className="text-xs text-slate-500">本次未请求配图，或暂不需要配图建议。</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">风险与下一步</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {runDetail.result.riskFlags.length ? runDetail.result.riskFlags.map((flag) => (
                        <li key={flag} className="flex items-start gap-2">
                          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                          <span>{flag}</span>
                        </li>
                      )) : (
                        <li className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                          <span>未发现明显风险，可进入确认流程。</span>
                        </li>
                      )}
                    </ul>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <Button variant="outline" onClick={() => setManualMode((prev) => !prev)}>
                        <PencilLine className="mr-2 h-4 w-4" />
                        {manualMode ? '回看原始结果' : '手动编辑'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          void navigator.clipboard.writeText(manualMode ? manualDraft : runDetail.result?.text ?? '');
                          pushToast({ title: '已复制结果文本', variant: 'success' });
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />复制文本
                      </Button>
                      <Button disabled={publishBusy} onClick={() => void handleQueueAction()}>
                        {publishBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : safeMode ? <ShieldCheck className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}
                        {safeMode ? '加入待确认队列' : '直接入发布队列'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </article>
        </div>

        <aside className="space-y-6">
          <article className="do-panel p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Agent 已掌握</p>
            <div className="mt-4 space-y-4 text-sm text-slate-700">
              <div>
                <p className="font-medium text-slate-900">默认账号</p>
                <p className="mt-1 text-slate-600">{selectedAccount?.handle ? `@${selectedAccount.handle}` : '尚未连接，请执行建议动作完成账号绑定。'}</p>
              </div>
              <div>
                <p className="font-medium text-slate-900">风格画像</p>
                <p className="mt-1 text-slate-600">{boot?.profile.styleSummary ?? '尚未建立风格画像，请执行建议动作重建。'}</p>
              </div>
              <div>
                <p className="font-medium text-slate-900">学习来源</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {boot?.sourceEvidence.length ? boot.sourceEvidence.map((item) => (
                    <span key={item} className="rounded-full border border-slate-900/10 bg-slate-50 px-3 py-1 text-xs text-slate-600">{item}</span>
                  )) : <span className="text-xs text-slate-500">当前没有外部学习来源。</span>}
                </div>
              </div>
            </div>
            {connectLearningLink ? (
              <Button asChild variant="outline" className="mt-5 w-full">
                <Link href={connectLearningLink.href}>继续补充连接与学习</Link>
              </Button>
            ) : null}
          </article>

          <article className="do-panel p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">当前建议动作</p>
            <p className="mt-3 text-lg font-semibold text-slate-950">{suggestedActionLabel(boot?.suggestedAction)}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">Starter / Growth / Max 都会优先复用已学到的风格与知识，再决定是否触发更强的推理模型。</p>
          </article>

          <article className="do-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Queue 预览</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">待确认 {queue?.review.length ?? 0} · 已排队 {queue?.queued.length ?? 0}</p>
              </div>
              {queueLink ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={queueLink.href}>查看全部</Link>
                </Button>
              ) : null}
            </div>
            <div className="mt-4 space-y-3">
              {queue?.review.length ? queue.review.slice(0, 3).map((item) => (
                <div key={item.runId} className="rounded-2xl border border-slate-900/10 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{formatDate(item.createdAt)} · {item.format}</p>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-800">{item.text ?? '结果包待刷新'}</p>
                </div>
              )) : <EmptyState title="还没有待确认内容" description="第一条内容生成完成后，会自动出现在这里。" actionHref="/app" actionLabel="立即生成" />}
            </div>
          </article>
        </aside>
      </section>
    </AppShell>
  );
}
