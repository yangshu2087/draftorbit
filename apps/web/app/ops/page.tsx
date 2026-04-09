'use client';

import { useEffect, useState } from 'react';
import type { OpsQueuesResponse } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { WorkspaceRecovery, isWorkspaceMissing, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { fetchQueueHealth } from '../../lib/queries';

type QueueHealthResponse = OpsQueuesResponse & { ok: true; now: string };

export default function OpsPage() {
  const [data, setData] = useState<QueueHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchQueueHealth());
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <WorkbenchShell title="队列健康" description="查看运营队列快照，并根据角色看到不同层级的运维可见域。">
      {loading ? <LoadingState label="正在加载队列健康..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="队列健康加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={isWorkspaceMissing(error) ? <WorkspaceRecovery onRecovered={load} /> : undefined}
        />
      ) : null}

      {!loading && !error && !data ? (
        <EmptyState title="暂无队列健康数据" description="当后台队列初始化后，这里会显示各队列快照。" />
      ) : null}

      {data ? (
        <div className="space-y-3">
          <VisibilityPanel
            title="运维可见域"
            description={`${roleLabel(data.visibility.role)} · ${tierLabel(data.visibility.accessTier)} · ${
              data.visibility.canViewPerQueue ? '可查看队列明细' : '仅可查看总览'
            }`}
            extra={
              data.visibility.redactedFields.length
                ? `已隐藏字段：${data.visibility.redactedFields.join('、')}`
                : '当前角色可查看完整运维队列快照。'
            }
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard title="waiting" value={String(data.summary.waiting)} />
            <MetricCard title="active" value={String(data.summary.active)} />
            <MetricCard title="completed" value={String(data.summary.completed)} />
            <MetricCard title="failed" value={data.summary.failed == null ? '受限' : String(data.summary.failed)} />
            <MetricCard title="delayed" value={data.summary.delayed == null ? '受限' : String(data.summary.delayed)} />
            <MetricCard title="paused" value={data.summary.paused == null ? '受限' : String(data.summary.paused)} />
          </div>

          {data.queues ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {Object.entries(data.queues).map(([name, stats]) => (
                <div key={name} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-sm font-semibold text-gray-900">{name}</p>
                  <p className="mt-1 text-xs text-gray-500">waiting {stats.waiting} · active {stats.active}</p>
                  <p className="text-xs text-gray-500">
                    completed {stats.completed}
                    {stats.failed != null ? ` · failed ${stats.failed}` : ''}
                    {stats.delayed != null ? ` · delayed ${stats.delayed}` : ''}
                    {stats.paused != null ? ` · paused ${stats.paused}` : ''}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              当前角色仅可查看运维总览，{data.hiddenQueueCount} 个队列的逐队列明细已隐藏。
            </div>
          )}

          <p className="text-xs text-gray-500">快照时间：{new Date(data.now).toLocaleString('zh-CN')}</p>
        </div>
      ) : null}
    </WorkbenchShell>
  );
}

function VisibilityPanel(props: { title: string; description: string; extra?: string }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
      <p className="text-sm font-semibold text-blue-900">{props.title}</p>
      <p className="mt-1 text-sm text-blue-800">{props.description}</p>
      {props.extra ? <p className="mt-2 text-xs text-blue-700">{props.extra}</p> : null}
    </div>
  );
}

function MetricCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{props.title}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{props.value}</p>
    </div>
  );
}

function roleLabel(role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER') {
  const labels = {
    OWNER: 'Owner',
    ADMIN: 'Admin',
    EDITOR: 'Editor',
    VIEWER: 'Viewer'
  } as const;
  return labels[role] ?? role;
}

function tierLabel(tier: 'FULL' | 'LIMITED' | 'OVERVIEW') {
  if (tier === 'FULL') return '完整队列视图';
  if (tier === 'LIMITED') return '受限队列视图';
  return '概览队列视图';
}
