'use client';

import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { WorkspaceRecovery, isWorkspaceMissing, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { fetchUsageEvents, fetchUsageSummary, fetchUsageTrends } from '../../lib/queries';

export default function UsagePage() {
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const [events, setEvents] = useState<Record<string, any>[]>([]);
  const [points, setPoints] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const s = await fetchUsageSummary();
      setSummary(s);
      setLoading(false);

      const [eventsResult, trendResult] = await Promise.allSettled([
        fetchUsageEvents(50),
        fetchUsageTrends(14)
      ]);

      let hasPartialFailure = false;

      if (eventsResult.status === 'fulfilled') {
        setEvents(eventsResult.value);
      } else {
        hasPartialFailure = true;
        setEvents([]);
      }

      if (trendResult.status === 'fulfilled') {
        setPoints(trendResult.value.points);
      } else {
        hasPartialFailure = true;
        setPoints([]);
      }

      if (hasPartialFailure) {
        setWarning('部分明细暂时不可用，已先展示可加载的数据。请稍后重试。');
      }
    } catch (err) {
      setError(err);
      setSummary(null);
      setEvents([]);
      setPoints([]);
      setWarning(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const totalCost = useMemo(
    () => points.reduce((sum, item) => sum + Number(item.costUsd ?? 0), 0),
    [points]
  );

  return (
    <WorkbenchShell title="用量与计费" description="查看用量趋势、模块分布与近期成本事件。">
      {loading ? <LoadingState label="正在加载用量数据..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="用量数据加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={isWorkspaceMissing(error) ? <WorkspaceRecovery onRecovered={load} /> : undefined}
        />
      ) : null}

      {!loading && !error && warning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {warning}
        </div>
      ) : null}

      {!loading && !error && !summary ? (
        <EmptyState title="暂无用量数据" description="系统开始生成与发布后，这里会展示趋势。" />
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="剩余额度" value={String(summary?.billing?.remainingCredits ?? 0)} />
            <MetricCard title="本期生成次数" value={String(summary?.counters?.generations ?? 0)} />
            <MetricCard title="本期发布任务" value={String(summary?.counters?.publishJobs ?? 0)} />
            <MetricCard title="14日估算成本" value={`$${totalCost.toFixed(4)}`} />
          </div>

          {summary?.isTrialing ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              当前账号处于试用期，结束时间：
              {summary?.trialEndsAt ? new Date(summary.trialEndsAt).toLocaleString('zh-CN') : '—'}
            </div>
          ) : null}

          <div className="do-panel p-4">
            <p className="do-section-title">近 14 日用量趋势</p>
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="generation" name="生成" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="publish" name="发布" stroke="#059669" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="reply" name="回复" stroke="#d97706" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-2">
            <p className="do-section-title">近期事件</p>
            {events.map((event) => (
              <div key={String(event.id)} className="do-card-compact">
                <p className="text-sm">{String(event.eventType)}</p>
                <p className="text-xs text-slate-500">
                  input={String(event.inputTokens ?? 0)} output={String(event.outputTokens ?? 0)} cost={String(event.costUsd ?? 0)}
                </p>
              </div>
            ))}
            {events.length === 0 ? <p className="text-sm text-slate-500">暂无用量事件</p> : null}
          </div>
        </>
      ) : null}
    </WorkbenchShell>
  );
}

function MetricCard(props: { title: string; value: string }) {
  return (
    <div className="do-card-compact bg-slate-50/70">
      <p className="do-kpi-label">{props.title}</p>
      <p className="do-kpi-value text-lg">{props.value}</p>
    </div>
  );
}
