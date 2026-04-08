'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCcw, Send } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, LoadingState, SuccessNotice } from '../ui/state-feedback';
import { useToast } from '../ui/toast';
import { confirmPublish, fetchQueue, type V3QueueResponse } from '../../lib/queries';
import { toUiError, type UiError } from '../../lib/ui-error';
import { cn } from '../../lib/utils';
import { AppShell } from './shell';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function SectionCard(props: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
  tone?: 'default' | 'success' | 'warning';
}) {
  return (
    <article
      className={cn(
        'do-panel p-5',
        props.tone === 'success' && 'border-emerald-200 bg-emerald-50/50',
        props.tone === 'warning' && 'border-amber-200 bg-amber-50/50'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{props.title}</p>
          <p className="mt-2 text-lg font-semibold text-slate-950">{props.count}</p>
          <p className="mt-1 text-sm text-slate-600">{props.description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-3">{props.children}</div>
    </article>
  );
}

export default function QueuePage() {
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const [queue, setQueue] = useState<V3QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<UiError | null>(null);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const highlight = searchParams.get('highlight');
  const published = searchParams.get('published');

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const payload = await fetchQueue(24);
      setQueue(payload);
    } catch (error) {
      setPageError(toUiError(error, '加载 Queue 失败，请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (highlight) setNotice('该内容已保留到待确认区。确认账号与风险后，再决定是否发布。');
    if (published) setNotice('内容已正式进入发布队列。你可以继续跟踪状态或等待任务完成。');
    if (!highlight && !published && searchParams.get('from') === 'app') {
      const intent = searchParams.get('intent');
      if (intent === 'confirm_publish') {
        setNotice('按建议动作进入 Queue：请优先处理待确认内容并确认发布。');
      } else if (intent === 'open_queue') {
        setNotice('按建议动作进入 Queue：统一查看待确认、排队与发布状态。');
      }
    }
  }, [highlight, published, searchParams]);

  const queueSummary = useMemo(
    () => ({
      review: queue?.review.length ?? 0,
      queued: queue?.queued.length ?? 0,
      published: queue?.published.length ?? 0,
      failed: queue?.failed.length ?? 0
    }),
    [queue]
  );

  if (loading) {
    return (
      <AppShell eyebrow="Queue" title="所有内容最终都在这里确认与追踪" description="待确认、已排队、已发布和失败任务统一收敛到一个地方。">
        <LoadingState title="正在加载 Queue" description="读取待确认内容与发布任务状态。" />
      </AppShell>
    );
  }

  if (pageError) {
    return (
      <AppShell eyebrow="Queue" title="所有内容最终都在这里确认与追踪" description="待确认、已排队、已发布和失败任务统一收敛到一个地方。">
        <ErrorState error={pageError} onRetry={() => void loadQueue()} actionHref="/app" actionLabel="返回 Operator" />
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="Queue"
      title="所有内容最终都在这里确认与追踪"
      description="DraftOrbit 默认把真实发帖动作放到最后一步。你先看结果、看账号、看风险，再决定是否发。"
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/app">继续生成</Link></Button>
          <Button variant="outline" onClick={() => void loadQueue()}><RefreshCcw className="mr-2 h-4 w-4" />刷新</Button>
        </div>
      }
    >
      {notice ? <SuccessNotice message={notice} /> : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <SectionCard title="待确认" description="这些内容还没有真正进入发布任务。适合先审稿、看风险，再点确认。" count={queueSummary.review} tone="warning">
          {queue?.review.length ? queue.review.map((item) => (
            <div
              key={item.runId}
              className={cn(
                'rounded-2xl border bg-white p-4',
                highlight === item.runId ? 'border-slate-950 ring-1 ring-slate-950/10' : 'border-slate-900/10'
              )}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">{formatDate(item.createdAt)} · {item.format}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{item.text ?? '结果包待刷新'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.riskFlags.length ? item.riskFlags.map((flag) => (
                      <span key={flag} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">{flag}</span>
                    )) : <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">可进入确认发布</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-2 md:w-[180px]">
                  <Button
                    disabled={busyRunId === item.runId}
                    onClick={() => {
                      void (async () => {
                        setBusyRunId(item.runId);
                        try {
                          await confirmPublish({ runId: item.runId, safeMode: false });
                          pushToast({ title: '已进入发布队列', description: '稍后可在“已排队”区查看进度。', variant: 'success' });
                          await loadQueue();
                        } catch (error) {
                          setPageError(toUiError(error, '确认发布失败，请稍后重试。'));
                        } finally {
                          setBusyRunId(null);
                        }
                      })();
                    }}
                  >
                    {busyRunId === item.runId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    确认发布
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/app">返回再改一版</Link>
                  </Button>
                </div>
              </div>
            </div>
          )) : <EmptyState title="没有待确认内容" description="在 Operator 生成后，结果会先来到这里等待你确认。" actionHref="/app" actionLabel="前往生成" />}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="已排队" description="已经创建发布任务，等待执行或正在执行中。" count={queueSummary.queued}>
            {queue?.queued.length ? queue.queued.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-900/10 bg-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.xAccountHandle ? `@${item.xAccountHandle}` : '默认账号'}</p>
                    <p className="mt-1 text-xs text-slate-500">任务 {item.id.slice(0, 8)}… · {formatDate(item.updatedAt)}</p>
                  </div>
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">{item.status}</span>
                </div>
                {item.lastError ? <p className="mt-3 text-xs text-red-600">最近错误：{item.lastError}</p> : null}
              </div>
            )) : <p className="text-sm text-slate-500">暂无已排队任务。</p>}
          </SectionCard>

          <SectionCard title="已发布" description="已经完成发布的任务。" count={queueSummary.published} tone="success">
            {queue?.published.length ? queue.published.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-900/10 bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.xAccountHandle ? `@${item.xAccountHandle}` : '默认账号'}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(item.updatedAt)} · postId: {item.externalPostId ?? '待回写'}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">暂无已发布任务。</p>}
          </SectionCard>

          <SectionCard title="失败待处理" description="需要人工排查的任务会落到这里。" count={queueSummary.failed} tone="warning">
            {queue?.failed.length ? queue.failed.map((item) => (
              <div key={item.id} className="rounded-2xl border border-red-200 bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.xAccountHandle ? `@${item.xAccountHandle}` : '默认账号'}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(item.updatedAt)} · {item.status}</p>
                  </div>
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <p className="mt-3 text-sm text-red-600">{item.lastError ?? '请检查账号状态或稍后重试。'}</p>
                <Button asChild variant="outline" className="mt-3">
                  <Link href="/app?nextAction=connect_x_self">执行建议动作</Link>
                </Button>
              </div>
            )) : <p className="text-sm text-slate-500">暂无失败任务。</p>}
          </SectionCard>
        </div>
      </section>
    </AppShell>
  );
}
