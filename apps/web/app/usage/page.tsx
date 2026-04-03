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

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, e, trend] = await Promise.all([
        fetchUsageSummary(),
        fetchUsageEvents(50),
        fetchUsageTrends(14)
      ]);
      setSummary(s);
      setEvents(e);
      setPoints(trend.points);
    } catch (err) {
      setError(err);
      setSummary(null);
      setEvents([]);
      setPoints([]);
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

          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-semibold">近 14 日用量趋势</p>
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
            <p className="text-sm font-semibold">近期事件</p>
            {events.map((event) => (
              <div key={String(event.id)} className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm">
                  {String(event.eventType)} · {String(event.model ?? 'N/A')}
                </p>
                <p className="text-xs text-gray-500">
                  input={String(event.inputTokens ?? 0)} output={String(event.outputTokens ?? 0)} cost={String(event.costUsd ?? 0)}
                </p>
              </div>
            ))}
            {events.length === 0 ? <p className="text-sm text-gray-500">暂无用量事件</p> : null}
          </div>
        </>
      ) : null}
    </WorkbenchShell>
  );
}

function MetricCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs text-gray-500">{props.title}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{props.value}</p>
    </div>
  );
}
