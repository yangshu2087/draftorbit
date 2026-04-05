'use client';

import { useEffect, useState } from 'react';
import type { AuditLogEntity } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { buildRecoveryExtra, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { fetchAuditLogs, fetchAuditSummary } from '../../lib/queries';

export default function AuditPage() {
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const [logs, setLogs] = useState<AuditLogEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, l] = await Promise.all([fetchAuditSummary(), fetchAuditLogs(100)]);
      setSummary(s);
      setLogs(l);
    } catch (e) {
      setError(e);
      setSummary(null);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <WorkbenchShell title="审计日志" description="关键动作追踪（发布、回复、学习、工作流）。">
      {loading ? <LoadingState label="正在加载审计日志..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="审计日志加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {summary ? (
        <div className="do-card-compact text-sm">
          总计 {summary?.total ?? 0} · 24h {summary?.last24h ?? 0}
        </div>
      ) : null}

      {!loading && !error && logs.length === 0 ? (
        <EmptyState title="暂无审计记录" description="系统执行关键动作后会自动写入日志。" />
      ) : null}

      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="do-card-compact">
            <p className="text-sm font-medium">
              {log.action} · {log.resourceType}
            </p>
            <p className="text-xs text-slate-500">
              {new Date(log.createdAt).toLocaleString('zh-CN')} · resourceId={log.resourceId || '-'}
            </p>
            <pre className="mt-1 overflow-auto rounded-lg border border-slate-900/8 bg-slate-50/80 p-2 text-xs text-slate-600">
              {JSON.stringify(log.payload, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}
