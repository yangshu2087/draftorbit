'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import {
  AuthRecovery,
  WorkspaceRecovery,
  isAuthMissing,
  isWorkspaceMissing,
  normalizeErrorMessage
} from '../../components/ui/workspace-recovery';
import { fetchDashboardOverview } from '../../lib/queries';

type DashboardData = {
  workspaceId: string;
  workspace: Record<string, unknown> | null;
  counters: {
    topics: number;
    drafts: number;
    publishJobs: number;
    replyJobs: number;
  };
  usage: Record<string, any> | null;
  audit: Record<string, any> | null;
  queues: Record<string, any>;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const overview = await fetchDashboardOverview();
      setData(overview.data);
      if (overview.degraded) {
        const labels = overview.errors
          .map((item) => item.segment)
          .filter(Boolean)
          .join('、');
        setWarning(
          labels
            ? `部分运营模块暂不可用（${labels}），页面已展示可加载的数据。`
            : '部分运营模块暂不可用，页面已展示可加载的数据。'
        );
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
          extra={
            isAuthMissing(error) ? (
              <AuthRecovery />
            ) : isWorkspaceMissing(error) ? (
              <WorkspaceRecovery onRecovered={load} />
            ) : undefined
          }
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
            <Card title="选题总数" value={String(data.counters?.topics ?? 0)} subtitle="准备阶段" />
            <Card title="草稿总数" value={String(data.counters?.drafts ?? 0)} subtitle="生产阶段" />
            <Card title="发布任务" value={String(data.counters?.publishJobs ?? 0)} subtitle="执行阶段" />
            <Card title="回复任务" value={String(data.counters?.replyJobs ?? 0)} subtitle="互动阶段" />
            <Card
              title="本周期用量事件"
              value={String(data.usage?.counters?.usageEvents ?? 0)}
              subtitle="计费统计"
            />
            <Card title="可用额度" value={String(data.usage?.billing?.remainingCredits ?? 0)} subtitle="额度" />
            <Card title="近 24h 操作" value={String(data.audit?.last24h ?? 0)} subtitle="日志" />
            <Card
              title="漏斗：发布成功"
              value={String(data.usage?.funnel?.publishSucceeded ?? 0)}
              subtitle="草稿→审批→发布"
            />
            <Card
              title="免费模型命中率"
              value={`${(((data.usage?.modelRouting?.freeHitRate ?? 0) as number) * 100).toFixed(1)}%`}
              subtitle="free-first 路由"
            />
            <Card
              title="升档率"
              value={`${(((data.usage?.modelRouting?.qualityFallbackRate ?? 0) as number) * 100).toFixed(1)}%`}
              subtitle="质量兜底"
            />
            <Card
              title="平均请求成本"
              value={`$${Number(data.usage?.modelRouting?.avgRequestCostUsd ?? 0).toFixed(4)}`}
              subtitle="模型层"
            />
          </div>

          <div className="do-panel p-4">
            <p className="do-section-title">运营漏斗（本周期）</p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
              <Card title="草稿" value={String(data.usage?.funnel?.drafts ?? 0)} />
              <Card title="待审批" value={String(data.usage?.funnel?.pendingApproval ?? 0)} />
              <Card title="已审批" value={String(data.usage?.funnel?.approved ?? 0)} />
              <Card title="已入队" value={String(data.usage?.funnel?.queued ?? 0)} />
              <Card title="已发布" value={String(data.usage?.funnel?.published ?? 0)} />
              <Card title="互动回复" value={String(data.usage?.funnel?.replies ?? 0)} />
            </div>
          </div>

          <div className="do-panel p-4">
            <p className="do-section-title">队列健康</p>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries((data.queues ?? {}) as Record<string, any>).map(([name, stats]) => (
                <div key={name} className="do-card-compact bg-slate-50/65">
                  <p className="text-xs font-semibold text-slate-700">{name}</p>
                  <p className="mt-1 text-xs text-slate-500">排队 {stats.waiting} · 执行 {stats.active}</p>
                  <p className="text-xs text-slate-500">失败 {stats.failed} · 延迟 {stats.delayed}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2.5 pt-1 sm:grid-cols-2 xl:grid-cols-4">
            <QuickLink href="/x-accounts" label="管理 X 账号" />
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
