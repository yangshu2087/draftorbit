'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Copy, Loader2, PencilLine, RefreshCcw, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getToken } from '../../lib/api';
import { fetchRunStream, type V3StreamEvent } from '../../lib/sse-stream';
import {
  confirmPublish,
  connectLocalKnowledgeFiles,
  connectObsidianVault,
  connectSelfX,
  connectTargetX,
  fetchBootstrap,
  fetchProfile,
  fetchQueue,
  fetchRun,
  importKnowledgeUrls,
  preparePublish,
  rebuildProfile,
  runChat,
  type V3BootstrapResponse,
  type V3Format,
  type V3ProfileResponse,
  type V3QueueResponse,
  type V3RunResponse
} from '../../lib/queries';
import { buildAppTaskHref, getTaskPanelMeta } from '../../lib/v3-ui';
import { normalizeStageSummary, summarizeWhySummary } from '../../lib/v3-result-copy';
import { toUiError, type UiError } from '../../lib/ui-error';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, LoadingState, SuccessNotice } from '../ui/state-feedback';
import { useToast } from '../ui/toast';
import OperatorTaskPanel from './operator-task-panel';
import { AppShell } from './shell';

const formatOptions: Array<{ value: V3Format; label: string; description: string }> = [
  { value: 'tweet', label: '短推', description: '单条观点、日常表达、产品动态' },
  { value: 'thread', label: '串推', description: '连续论述、案例拆解、观点展开' },
  { value: 'article', label: '长文', description: '先出长文，再拆成帖子或线程' }
];

const quickPrompts = [
  '帮我发一条关于 AI 产品冷启动的观点短推',
  '参考我最近的风格，写一条更容易引发讨论的 thread',
  '把今天的产品更新整理成一条适合 X 的发布文案'
];

const stageOrder = [
  { key: 'research', title: '研究' },
  { key: 'strategy', title: '结构' },
  { key: 'draft', title: '草稿' },
  { key: 'voice', title: '文风' },
  { key: 'media', title: '配图' },
  { key: 'publish_prep', title: '发布前检查' }
] as const;

function qualityLabel(score?: number | null) {
  if (typeof score !== 'number') return '待评分';
  if (score >= 85) return '可以直接进入确认';
  if (score >= 72) return '建议快速审一下';
  return '建议再来一版';
}

function stageTone(status?: string) {
  if (status === 'done' || status === 'SUCCEEDED') return 'done';
  if (status === 'running' || status === 'queued' || status === 'QUEUED' || status === 'RUNNING') return 'active';
  if (status === 'failed' || status === 'FAILED' || status === 'CANCELED') return 'danger';
  return 'idle';
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [runStart, setRunStart] = useState<{ runId: string; streamUrl: string } | null>(null);
  const [runDetail, setRunDetail] = useState<V3RunResponse | null>(null);
  const [stageEvents, setStageEvents] = useState<Record<string, V3StreamEvent>>({});
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<UiError | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualDraft, setManualDraft] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);

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
        fetchQueue(12)
      ]);

      setBoot(bootPayload);
      setProfile(profilePayload);
      setQueue(queuePayload);
      setSelectedXAccountId((current) => current || bootPayload.defaultXAccount?.id || profilePayload.xAccounts[0]?.id || '');
    } catch (error) {
      setPageError(toUiError(error, '加载生成器失败，请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const from = searchParams.get('from');
    if (from === 'auth-login') setEntryNotice('登录完成。现在直接写一句话就能开始生成。');
    if (from === 'google-login') setEntryNotice('Google 登录完成。现在直接写一句话就能开始生成。');
  }, [searchParams]);

  const activeTaskAction = searchParams.get('nextAction');
  const activeTaskMeta = useMemo(() => getTaskPanelMeta(activeTaskAction), [activeTaskAction]);
  const activeTaskHref = useMemo(() => buildAppTaskHref(runError?.nextAction ?? boot?.suggestedAction), [boot?.suggestedAction, runError?.nextAction]);
  const activeTaskMetaFromError = useMemo(() => getTaskPanelMeta(runError?.nextAction ?? boot?.suggestedAction), [boot?.suggestedAction, runError?.nextAction]);

  const selectedAccount = useMemo(
    () => profile?.xAccounts.find((item) => item.id === selectedXAccountId) ?? null,
    [profile?.xAccounts, selectedXAccountId]
  );

  const currentStageLabel = useMemo(() => {
    const active = [...Object.values(stageEvents)].reverse().find((event) => event.status === 'running');
    if (active) return active.label;
    if (runLoading) return '正在生成结果…';
    if (runDetail?.result) return '结果已生成';
    if (boot?.suggestedAction && getTaskPanelMeta(boot.suggestedAction)) {
      return getTaskPanelMeta(boot.suggestedAction)?.title ?? '继续当前任务';
    }
    return '写一句话，然后点击开始生成。';
  }, [boot?.suggestedAction, runDetail?.result, runLoading, stageEvents]);

  const activeFormat = useMemo(
    () => formatOptions.find((item) => item.value === format) ?? formatOptions[0],
    [format]
  );

  const stageProgress = useMemo(
    () =>
      stageOrder.map((stage) => ({
        ...stage,
        event: stageEvents[stage.key],
        summary: normalizeStageSummary(stageEvents[stage.key]?.summary),
        tone: stageTone(stageEvents[stage.key]?.status)
      })),
    [stageEvents]
  );

  const cleanedWhySummary = useMemo(
    () => summarizeWhySummary(runDetail?.result?.whySummary ?? []),
    [runDetail?.result?.whySummary]
  );

  const runPipeline = useCallback(async (customIntent?: string) => {
    const finalIntent = (customIntent ?? intent).trim();
    if (!finalIntent) {
      setRunError({ message: '先写一句你想发的内容目标。' });
      return;
    }

    setRunLoading(true);
    setRunError(null);
    setRunDetail(null);
    setRunStart(null);
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

  const handleQueueAction = useCallback(async () => {
    if (!runDetail?.runId) return;

    setBusyAction('queue-result');
    setRunError(null);

    try {
      if (safeMode) {
        const preview = await preparePublish({
          runId: runDetail.runId,
          xAccountId: selectedXAccountId || undefined,
          safeMode: true
        });

        if (preview.blockingReason) {
          throw new Error(preview.blockingReason === 'NO_ACTIVE_X_ACCOUNT' ? '当前没有可用 X 账号，请先完成连接。' : preview.blockingReason);
        }

        await loadPage();
        const href = buildAppTaskHref('open_queue', { highlight: runDetail.runId });
        if (href) router.replace(href);
        return;
      }

      await confirmPublish({
        runId: runDetail.runId,
        xAccountId: selectedXAccountId || undefined,
        safeMode: false
      });
      await loadPage();
      const href = buildAppTaskHref('open_queue', { published: runDetail.runId });
      if (href) router.replace(href);
    } catch (error) {
      setRunError(toUiError(error, '加入队列失败，请稍后重试。'));
    } finally {
      setBusyAction(null);
    }
  }, [loadPage, router, runDetail?.runId, safeMode, selectedXAccountId]);

  const runTaskAction = useCallback(async (action: () => Promise<void>, busyKey: string, errorMessage: string) => {
    setBusyAction(busyKey);
    setRunError(null);
    try {
      await action();
    } catch (error) {
      setRunError(toUiError(error, errorMessage));
      throw error;
    } finally {
      setBusyAction(null);
    }
  }, []);

  const connectSelfAction = useCallback(
    async () =>
      runTaskAction(async () => {
        const { url } = await connectSelfX();
        window.location.href = url;
      }, 'x-self', '拉起 X 连接失败，请稍后重试。'),
    [runTaskAction]
  );

  const rebuildProfileAction = useCallback(
    async () =>
      runTaskAction(async () => {
        await rebuildProfile();
        await loadPage();
        pushToast({ title: '画像已更新', description: '现在可以回到主界面继续生成。', variant: 'success' });
        router.replace('/app');
      }, 'rebuild-profile', '重建画像失败，请稍后重试。'),
    [loadPage, pushToast, router, runTaskAction]
  );

  const connectTargetAction = useCallback(
    async (value: string) =>
      runTaskAction(async () => {
        await connectTargetX(value);
        await loadPage();
        pushToast({ title: '学习样本已补充', description: '返回主界面后，下一条会优先参考这份样本。', variant: 'success' });
        router.replace('/app');
      }, 'x-target', '补充学习样本失败，请稍后重试。'),
    [loadPage, pushToast, router, runTaskAction]
  );

  const importUrlsAction = useCallback(
    async (urls: string[]) =>
      runTaskAction(async () => {
        await importKnowledgeUrls({ urls });
        await loadPage();
        pushToast({ title: '链接已导入', description: '现在可以回到主界面继续生成。', variant: 'success' });
        router.replace('/app');
      }, 'urls', '导入链接失败，请稍后重试。'),
    [loadPage, pushToast, router, runTaskAction]
  );

  const connectObsidianAction = useCallback(
    async (vaultPath: string) =>
      runTaskAction(async () => {
        await connectObsidianVault({ vaultPath });
        await loadPage();
        pushToast({ title: 'Obsidian 已接入', description: '现在可以回到主界面继续生成。', variant: 'success' });
        router.replace('/app');
      }, 'obsidian', '接入 Obsidian 失败，请稍后重试。'),
    [loadPage, pushToast, router, runTaskAction]
  );

  const connectLocalFilesAction = useCallback(
    async (paths: string[]) =>
      runTaskAction(async () => {
        await connectLocalKnowledgeFiles({ paths });
        await loadPage();
        pushToast({ title: '本地文件已导入', description: '现在可以回到主界面继续生成。', variant: 'success' });
        router.replace('/app');
      }, 'local-files', '导入本地文件失败，请稍后重试。'),
    [loadPage, pushToast, router, runTaskAction]
  );

  const confirmQueueItemAction = useCallback(
    async (runId: string) =>
      runTaskAction(async () => {
        await confirmPublish({ runId, safeMode: false });
        await loadPage();
        const href = buildAppTaskHref('open_queue', { published: runId });
        if (href) router.replace(href);
      }, `confirm-${runId}`, '确认发布失败，请稍后重试。'),
    [loadPage, router, runTaskAction]
  );

  if (loading) {
    return (
      <AppShell
        eyebrow="生成器"
        title="你说一句话，DraftOrbit 帮你产出可发的 X 内容"
        description="默认先生成，再由你决定是否发出去。"
      >
        <LoadingState title="正在加载生成器" description="读取账号、画像和待处理状态。" />
      </AppShell>
    );
  }

  if (pageError) {
    return (
      <AppShell
        eyebrow="生成器"
        title="你说一句话，DraftOrbit 帮你产出可发的 X 内容"
        description="默认先生成，再由你决定是否发出去。"
      >
        <ErrorState error={pageError} onRetry={() => void loadPage()} actionHref="/" actionLabel="返回首页" />
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="生成器"
      title="你说一句话，DraftOrbit 帮你产出可发的 X 内容"
      description="写一句话即可。默认先生成，再由你决定是否发出去。"
    >
      {entryNotice ? <SuccessNotice message={entryNotice} /> : null}

      {runError ? (
        <ErrorState
          error={runError}
          onRetry={() => void runPipeline()}
          actionHref={activeTaskHref ?? undefined}
          actionLabel={activeTaskMetaFromError?.primaryLabel}
        />
      ) : null}

      <section className="mx-auto w-full max-w-4xl space-y-6">
        {boot?.suggestedAction && getTaskPanelMeta(boot.suggestedAction) ? (
          <div className="do-panel-soft flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">先补这一项</p>
              <p className="mt-1 text-sm text-slate-700">{getTaskPanelMeta(boot.suggestedAction)?.title}</p>
            </div>
            {buildAppTaskHref(boot.suggestedAction) ? (
              <Button asChild size="sm" variant="outline">
                <Link href={buildAppTaskHref(boot.suggestedAction) ?? '/app'}>
                  {getTaskPanelMeta(boot.suggestedAction)?.primaryLabel}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        <article className="do-panel p-6 sm:p-8">
          <div className="flex flex-wrap gap-2">
            <span className="do-chip">{selectedAccount?.handle ? `当前账号 @${selectedAccount.handle}` : '未连接 X 账号'}</span>
            <span className="do-chip">{safeMode ? '默认先确认' : '直接发已开启'}</span>
            <span className="do-chip">待确认 {queue?.review.length ?? 0}</span>
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
            placeholder="例如：参考我最近的风格，写一条关于 AI 产品冷启动的观点短推。"
            className="mt-5 min-h-[180px] w-full rounded-[24px] border border-slate-900/10 bg-white px-5 py-4 text-base leading-7 text-slate-900 shadow-inner shadow-slate-100/80 placeholder:text-slate-400"
          />

          <details className="mt-4 rounded-2xl border border-slate-900/10 bg-slate-50 p-4" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">高级选项</summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-900/10 bg-white p-4">
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

              <div className="grid gap-4">
                <label className="rounded-2xl border border-slate-900/10 bg-white p-4 text-sm text-slate-700">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">配图</span>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">生成配图建议</p>
                      <p className="text-xs leading-5 text-slate-500">会额外输出关键词与配图 brief</p>
                    </div>
                    <input type="checkbox" checked={withImage} onChange={(event) => setWithImage(event.target.checked)} className="h-4 w-4" />
                  </div>
                </label>

                <label className="rounded-2xl border border-slate-900/10 bg-white p-4 text-sm text-slate-700">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">安全模式</span>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">先人工确认</p>
                      <p className="text-xs leading-5 text-slate-500">关闭后会在通过检查后直接进入发布队列</p>
                    </div>
                    <input type="checkbox" checked={safeMode} onChange={(event) => setSafeMode(event.target.checked)} className="h-4 w-4" />
                  </div>
                </label>

                <label className="rounded-2xl border border-slate-900/10 bg-white p-4 text-sm text-slate-700">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">发布账号</span>
                  <select value={selectedXAccountId} onChange={(event) => setSelectedXAccountId(event.target.value)} className="w-full">
                    {profile?.xAccounts.length ? (
                      profile.xAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          @{account.handle} · {account.status}
                          {account.isDefault ? ' · 默认' : ''}
                        </option>
                      ))
                    ) : (
                      <option value="">未连接 X 账号</option>
                    )}
                  </select>
                </label>
              </div>
            </div>
          </details>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button size="lg" disabled={runLoading} onClick={() => void runPipeline()}>
              {runLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {runLoading ? '正在生成…' : '开始生成'}
            </Button>
            <Button size="lg" variant="outline" disabled={runLoading || !intent.trim()} onClick={() => void runPipeline(intent)}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              再来一版
            </Button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            现在：{currentStageLabel}
          </div>

          {(runLoading || Object.keys(stageEvents).length > 0) ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {stageProgress.map((stage) => (
                <div
                  key={stage.key}
                  className={cn(
                    'rounded-2xl border px-3 py-3 text-sm',
                    stage.tone === 'done' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                    stage.tone === 'active' && 'border-sky-200 bg-sky-50 text-sky-800',
                    stage.tone === 'danger' && 'border-red-200 bg-red-50 text-red-700',
                    stage.tone === 'idle' && 'border-slate-900/10 bg-white text-slate-500'
                  )}
                >
                  <p className="font-medium">{stage.title}</p>
                  <p className="mt-1 text-xs leading-5">{stage.summary ?? (stage.tone === 'idle' ? '等待中' : stage.event?.label ?? '处理中')}</p>
                </div>
              ))}
            </div>
          ) : null}
        </article>

        <article className="do-panel p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">结果区</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">生成结果</h2>
            </div>
            {runStart?.runId ? (
              <span className="rounded-full border border-slate-900/10 bg-slate-100 px-3 py-1 text-xs text-slate-600">
                runId: {runStart.runId.slice(0, 8)}…
              </span>
            ) : null}
          </div>

          {!runDetail?.result ? (
            runLoading ? (
              <LoadingState title="正在生成结果" description="完成后会直接出现在这里，你无需切换页面。" />
            ) : (
              <EmptyState title="结果会出现在这里" description="先写一句话并点击“开始生成”，结果准备好后会直接显示。" />
            )
          ) : (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">质量分</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{runDetail.result.qualityScore ?? '—'}</p>
                  <p className="mt-2 text-xs text-slate-500">{qualityLabel(runDetail.result.qualityScore)}</p>
                </div>
                <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">这一版重点</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cleanedWhySummary.length ? cleanedWhySummary.map((item) => (
                      <span key={item} className="rounded-full border border-slate-900/10 bg-white px-3 py-1.5 text-xs text-slate-600">{item}</span>
                    )) : <span className="text-sm text-slate-500">这次主要按你输入的这句话直接生成。</span>}
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-900/10 bg-slate-950 p-5 text-white shadow-inner shadow-slate-900/30">
                {manualMode ? (
                  <textarea
                    value={manualDraft}
                    onChange={(event) => setManualDraft(event.target.value)}
                    className="min-h-[220px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-white placeholder:text-slate-400"
                  />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-50">{runDetail.result.text}</pre>
                )}
              </div>

              {runDetail.result.riskFlags.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">风险提醒</p>
                  <ul className="mt-3 space-y-2 text-sm text-amber-900">
                    {runDetail.result.riskFlags.map((flag) => (
                      <li key={flag} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>当前没有明显风险，可以进入下一步。</span>
                  </div>
                </div>
              )}

              <details className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">查看依据与配图建议</summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">这次参考了什么</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {runDetail.result.evidenceSummary.length ? runDetail.result.evidenceSummary.map((item) => (
                        <span key={item} className="rounded-full border border-slate-900/10 bg-white px-3 py-1 text-xs text-slate-600">{item}</span>
                      )) : <span className="text-xs text-slate-500">本次主要基于你的意图完成生成。</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">配图建议</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {runDetail.result.imageKeywords.length ? runDetail.result.imageKeywords.map((keyword) => (
                        <span key={keyword} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">{keyword}</span>
                      )) : <span className="text-xs text-slate-500">本次没有请求配图，或暂不需要配图建议。</span>}
                    </div>
                  </div>
                </div>
              </details>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => setManualMode((prev) => !prev)}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  {manualMode ? '回看原结果' : '手动编辑'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(manualMode ? manualDraft : runDetail.result?.text ?? '');
                    pushToast({ title: '已复制结果文本', variant: 'success' });
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  复制文本
                </Button>
                <Button disabled={busyAction === 'queue-result'} onClick={() => void handleQueueAction()}>
                  {busyAction === 'queue-result' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : safeMode ? (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {safeMode ? '加入待确认' : '进入发布队列'}
                </Button>
              </div>
            </div>
          )}
        </article>
      </section>

      {activeTaskAction && activeTaskMeta ? (
        <OperatorTaskPanel
          action={activeTaskAction}
          meta={activeTaskMeta}
          profile={profile}
          queue={queue}
          busyAction={busyAction}
          xbind={searchParams.get('xbind')}
          highlight={searchParams.get('highlight')}
          published={searchParams.get('published')}
          onClose={() => router.replace('/app')}
          onConnectSelfX={connectSelfAction}
          onConnectTargetX={connectTargetAction}
          onImportUrls={importUrlsAction}
          onConnectObsidian={connectObsidianAction}
          onConnectLocalFiles={connectLocalFilesAction}
          onRebuildProfile={rebuildProfileAction}
          onConfirmPublish={confirmQueueItemAction}
        />
      ) : null}
    </AppShell>
  );
}
