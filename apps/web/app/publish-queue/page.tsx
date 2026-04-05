'use client';

import { useEffect, useState } from 'react';
import type { PublishJobEntity } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { buildRecoveryExtra, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { fetchPublishJobs, retryPublishJob } from '../../lib/queries';

const STATUS_OPTIONS: Array<{ label: string; value: PublishJobEntity['status'] | 'ALL' }> = [
  { label: '全部状态', value: 'ALL' },
  { label: '排队中', value: 'QUEUED' },
  { label: '执行中', value: 'RUNNING' },
  { label: '成功', value: 'SUCCEEDED' },
  { label: '失败', value: 'FAILED' }
];

const STATUS_LABELS: Record<PublishJobEntity['status'], string> = {
  PENDING: '待处理',
  QUEUED: '排队中',
  RUNNING: '执行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
  CANCELED: '已取消'
};

export default function PublishQueuePage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<PublishJobEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]['value']>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublishJobs({
        pageSize: 100,
        status: status === 'ALL' ? undefined : status
      });
      setRows(data);
    } catch (e) {
      setRows([]);
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [status]);

  const onRetry = async (id: string) => {
    setBusyId(id);
    try {
      await retryPublishJob(id);
      pushToast({ title: '已重新入队', variant: 'success' });
      await load();
    } catch (e) {
      pushToast({ title: '重试失败', description: normalizeErrorMessage(e), variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const copyFallbackText = async (payload: Record<string, unknown>) => {
    const text = typeof payload.copyText === 'string' ? payload.copyText : '';
    if (!text) {
      pushToast({ title: '无可复制内容', variant: 'error' });
      return;
    }
    await navigator.clipboard.writeText(text);
    pushToast({ title: '已复制到剪贴板', description: '请手动发布到 X。', variant: 'success' });
  };

  return (
    <WorkbenchShell title="发布队列" description="审批后任务执行状态、失败重试与手动发布兜底。">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              status === option.value
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-900/12 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            onClick={() => setStatus(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingState label="正在加载发布任务..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="发布队列加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="暂无发布任务" description="通过草稿审批后即可加入发布队列。" />
      ) : null}

      <div className="space-y-2">
        {rows.map((row) => {
          const payload = (row.payload ?? {}) as Record<string, unknown>;
          const manualFallback = Boolean(payload.manualFallback);
          return (
            <div key={row.id} className="do-card-compact">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {row.channel} · <span className="font-semibold">{STATUS_LABELS[row.status]}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    账号 @{row.xAccount?.handle ?? '默认'} · 创建于 {new Date(row.createdAt).toLocaleString('zh-CN')} · 尝试 {row.attempts}/{row.maxAttempts}
                  </p>
                </div>
                <div className="flex gap-2">
                  {manualFallback ? (
                    <button
                      className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-50"
                      onClick={() => void copyFallbackText(payload)}
                    >
                      复制手动发布文案
                    </button>
                  ) : null}
                  <button
                    className="rounded-lg border border-slate-900/12 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => void onRetry(row.id)}
                    disabled={busyId === row.id}
                  >
                    {busyId === row.id ? '重试中...' : '重试'}
                  </button>
                </div>
              </div>

              {row.lastError ? <p className="mt-1 text-xs text-red-600">{row.lastError}</p> : null}
              {manualFallback ? (
                <p className="mt-1 text-xs text-amber-700">已进入人工发布兜底模式，建议复制文案后手动发布。</p>
              ) : null}

              <pre className="mt-2 overflow-auto rounded-lg border border-slate-900/8 bg-slate-50/80 p-2 text-xs text-slate-600">
                {JSON.stringify(row.payload, null, 2)}
              </pre>
            </div>
          );
        })}
      </div>
    </WorkbenchShell>
  );
}
