'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AuditSummaryEntity, OpsQueuesResponse, UsageSummaryEntity } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { WorkspaceRecovery, isWorkspaceMissing, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { getToken } from '../../lib/api';
import {
  fetchAuditSummary,
  fetchDrafts,
  fetchPublishJobs,
  fetchQueueHealth,
  fetchReplyJobs,
  fetchTopics,
  fetchUsageSummary,
  fetchWorkspace
} from '../../lib/queries';

type DashboardData = {
  workspace: Record<string, unknown> | null;
  topicsCount: number;
  draftsCount: number;
  publishCount: number;
  replyCount: number;
  usage: UsageSummaryEntity;
  audit: AuditSummaryEntity;
  queue: OpsQueuesResponse & { ok: true; now: string };
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const load = async () => {
    if (!getToken()) {
      setError(new Error('未登录，请先回首页完成登录。'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [workspace, topics, drafts, publishJobs, replyJobs, usage, audit, queue] = await Promise.all([
        fetchWorkspace(),
        fetchTopics({ pageSize: 200 }),
        fetchDrafts({ pageSize: 200 }),
        fetchPublishJobs({ pageSize: 50 }),
        fetchReplyJobs({ pageSize: 50 }),
        fetchUsageSummary(),
        fetchAuditSummary(),
        fetchQueueHealth()
      ]);

      setData({
        workspace,
        topicsCount: topics.length,
        draftsCount: drafts.length,
        publishCount: publishJobs.length,
        replyCount: replyJobs.length,
        usage,
        audit,
        queue
      });
    } catch (e) {
      setError(e);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <WorkbenchShell title="运营总览" description="查看内容生产、发布、互动、队列与审计状态。">
      {loading ? <LoadingState label="正在加载运营数据..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="加载总览失败"
          message={normalizeErrorMessage(error)}
          actionText="重新加载"
          onAction={() => void load()}
          extra={isWorkspaceMissing(error) ? <WorkspaceRecovery onRecovered={load} /> : undefined}
        />
      ) : null}

      {!loading && !error && !data ? (
        <EmptyState title="暂无可展示数据" description="请先创建选题与草稿，系统会自动汇总运营指标。" />
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="当前工作区" value={String(data.workspace?.name ?? '-')} subtitle={String(data.workspace?.slug ?? '')} />
            <Card title="选题总数" value={String(data.topicsCount)} subtitle="Topic Center" />
            <Card title="草稿总数" value={String(data.draftsCount)} subtitle="Draft Studio" />
            <Card title="发布任务" value={String(data.publishCount)} subtitle="Publish Queue" />
            <Card title="回复任务" value={String(data.replyCount)} subtitle="Reply Queue" />
            <Card
              title="本周期用量事件"
              value={String(data.usage?.counters?.usageEvents ?? 0)}
              subtitle="Usage Events"
            />
            <Card title="可用额度" value={String(data.usage?.billing?.remainingCredits ?? 0)} subtitle="Credits" />
            <Card title="近 24h 审计" value={String(data.audit?.last24h ?? 0)} subtitle="Audit" />
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-900">队列健康</p>
            <p className="mt-1 text-xs text-gray-500">
              {roleLabel(data.queue.visibility.role)} · {tierLabel(data.queue.visibility.accessTier)}
              {data.queue.visibility.redactedFields.length
                ? ` · 已隐藏 ${data.queue.visibility.redactedFields.join('、')}`
                : ' · 当前角色可查看完整队列健康数据'}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {data.queue.queues ? (
                Object.entries(data.queue.queues).map(([name, stats]) => (
                  <div key={name} className="rounded border border-gray-200 bg-gray-50 p-2">
                    <p className="text-xs font-semibold text-gray-700">{name}</p>
                    <p className="mt-1 text-xs text-gray-500">waiting {stats.waiting} · active {stats.active}</p>
                    <p className="text-xs text-gray-500">
                      completed {stats.completed}
                      {stats.failed != null ? ` · failed ${stats.failed}` : ''}
                      {stats.delayed != null ? ` · delayed ${stats.delayed}` : ''}
                      {stats.paused != null ? ` · paused ${stats.paused}` : ''}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded border border-gray-200 bg-gray-50 p-3 sm:col-span-2 lg:col-span-4">
                  <p className="text-xs font-semibold text-gray-700">队列总览</p>
                  <p className="mt-1 text-xs text-gray-500">
                    waiting {data.queue.summary.waiting} · active {data.queue.summary.active} · completed {data.queue.summary.completed}
                  </p>
                  <p className="text-xs text-amber-700">
                    当前角色仅可查看总览，{data.queue.hiddenQueueCount} 个队列明细已隐藏。
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-2 pt-2 sm:grid-cols-2 xl:grid-cols-4">
            <QuickLink href="/snapshot" label="查看系统快照" />
            <QuickLink href="/topics" label="创建选题" />
            <QuickLink href="/drafts" label="编写草稿" />
            <QuickLink href="/publish-queue" label="查看发布队列" />
            <QuickLink href="/reply-queue" label="处理回复互动" />
            <QuickLink href="/workflow" label="使用运营模板" />
            <QuickLink href="/providers" label="检查模型路由" />
            <QuickLink href="/usage" label="查看成本趋势" />
            <QuickLink href="/audit" label="查看审计日志" />
            <QuickLink href="/ops" label="查看队列健康" />
          </div>
        </>
      ) : null}
    </WorkbenchShell>
  );
}

function Card(props: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{props.title}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{props.value}</p>
      {props.subtitle ? <p className="text-xs text-gray-500">{props.subtitle}</p> : null}
    </div>
  );
}

function QuickLink(props: { href: string; label: string }) {
  return (
    <Link
      href={props.href}
      className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
    >
      {props.label}
    </Link>
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
