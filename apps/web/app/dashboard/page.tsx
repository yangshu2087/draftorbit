'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  usage: Record<string, any>;
  audit: Record<string, any>;
  queue: Record<string, any>;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const load = async () => {
    if (!getToken()) {
      setError(new Error('未登录，请先回首页完成登录。'));
      setWarning(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const [workspaceResult, topicsResult, draftsResult, publishJobsResult, replyJobsResult, usageResult, auditResult] =
        await Promise.allSettled([
        fetchWorkspace(),
        fetchTopics({ pageSize: 200 }),
        fetchDrafts({ pageSize: 200 }),
        fetchPublishJobs({ pageSize: 50 }),
        fetchReplyJobs({ pageSize: 50 }),
        fetchUsageSummary(),
          fetchAuditSummary()
        ]);

      const workspace = workspaceResult.status === 'fulfilled' ? workspaceResult.value : null;
      const usage = usageResult.status === 'fulfilled' ? usageResult.value : {};

      if (!workspace && usageResult.status === 'rejected') {
        throw usageResult.reason;
      }

      setData({
        workspace,
        topicsCount: topicsResult.status === 'fulfilled' ? topicsResult.value.length : 0,
        draftsCount: draftsResult.status === 'fulfilled' ? draftsResult.value.length : 0,
        publishCount: publishJobsResult.status === 'fulfilled' ? publishJobsResult.value.length : 0,
        replyCount: replyJobsResult.status === 'fulfilled' ? replyJobsResult.value.length : 0,
        usage,
        audit: auditResult.status === 'fulfilled' ? auditResult.value : {},
        queue: { queues: {} }
      });

      const failedSegments = [
        topicsResult,
        draftsResult,
        publishJobsResult,
        replyJobsResult,
        auditResult
      ].filter((result) => result.status === 'rejected').length;

      if (failedSegments > 0) {
        setWarning('部分运营模块暂时不可用，页面已展示可加载的数据。');
      }

      try {
        const queue = await fetchQueueHealth();
        setData((prev) => (prev ? { ...prev, queue } : prev));
      } catch {
        setWarning('队列健康暂不可用，页面已展示其余运营数据。');
      }
    } catch (e) {
      setError(e);
      setData(null);
      setWarning(null);
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

      {!loading && !error && warning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {warning}
        </div>
      ) : null}

      {!loading && !error && !data ? (
        <EmptyState title="暂无可展示数据" description="请先创建选题与草稿，系统会自动汇总运营指标。" />
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="当前工作区" value={String(data.workspace?.name ?? '-')} subtitle={String(data.workspace?.slug ?? '')} />
            <Card title="选题总数" value={String(data.topicsCount)} subtitle="准备阶段" />
            <Card title="草稿总数" value={String(data.draftsCount)} subtitle="生产阶段" />
            <Card title="发布任务" value={String(data.publishCount)} subtitle="执行阶段" />
            <Card title="回复任务" value={String(data.replyCount)} subtitle="互动阶段" />
            <Card
              title="本周期用量事件"
              value={String(data.usage?.counters?.usageEvents ?? 0)}
              subtitle="计费统计"
            />
            <Card title="可用额度" value={String(data.usage?.billing?.remainingCredits ?? 0)} subtitle="额度" />
            <Card title="近 24h 操作" value={String(data.audit?.last24h ?? 0)} subtitle="日志" />
          </div>

          <div className="do-panel p-4">
            <p className="do-section-title">队列健康</p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries((data.queue?.queues ?? {}) as Record<string, any>).map(([name, stats]) => (
                <div key={name} className="do-card-compact bg-slate-50/65">
                  <p className="text-xs font-semibold text-slate-700">{name}</p>
                  <p className="mt-1 text-xs text-slate-500">排队 {stats.waiting} · 执行 {stats.active}</p>
                  <p className="text-xs text-slate-500">失败 {stats.failed} · 延迟 {stats.delayed}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2.5 pt-1 sm:grid-cols-2 xl:grid-cols-4">
            <QuickLink href="/topics" label="创建选题" />
            <QuickLink href="/drafts" label="编写草稿" />
            <QuickLink href="/publish-queue" label="查看发布队列" />
            <QuickLink href="/reply-queue" label="处理回复互动" />
            <QuickLink href="/workflow" label="使用运营模板" />
            <QuickLink href="/usage" label="查看成本趋势" />
            <QuickLink href="/audit" label="查看操作日志" />
          </div>
        </>
      ) : null}
    </WorkbenchShell>
  );
}

function Card(props: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="do-card-compact bg-slate-50/70">
      <p className="do-kpi-label">{props.title}</p>
      <p className="do-kpi-value text-lg">{props.value}</p>
      {props.subtitle ? <p className="text-xs text-slate-500">{props.subtitle}</p> : null}
    </div>
  );
}

function QuickLink(props: { href: string; label: string }) {
  return (
    <Link
      href={props.href}
      className="do-card-compact text-sm text-slate-700 transition hover:bg-slate-50/80"
    >
      {props.label}
    </Link>
  );
}
