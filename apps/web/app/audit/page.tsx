'use client';

import { useEffect, useState } from 'react';
import type { AuditLogsResponse, AuditSummaryEntity, AuditVisibilityDomain, AuditVisibilityScope, WorkspaceRoleValue } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { WorkspaceRecovery, isWorkspaceMissing, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { fetchAuditLogs, fetchAuditSummary } from '../../lib/queries';

export default function AuditPage() {
  const [summary, setSummary] = useState<AuditSummaryEntity | null>(null);
  const [logsResponse, setLogsResponse] = useState<AuditLogsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, l] = await Promise.all([fetchAuditSummary(), fetchAuditLogs(100)]);
      setSummary(s);
      setLogsResponse(l);
    } catch (e) {
      setError(e);
      setSummary(null);
      setLogsResponse(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const logs = logsResponse?.items ?? [];

  return (
    <WorkbenchShell title="审计日志" description="关键动作追踪（发布、回复、学习、工作流）。">
      {loading ? <LoadingState label="正在加载审计日志..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="审计日志加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={isWorkspaceMissing(error) ? <WorkspaceRecovery onRecovered={load} /> : undefined}
        />
      ) : null}

      {summary ? (
        <div className="space-y-3">
          <VisibilityPanel
            title="审计可见域"
            description={`${roleLabel(summary.visibility.role)} · ${scopeLabel(summary.visibility.scope)} · payload ${
              summary.visibility.payloadAccess === 'FULL' ? '可查看' : '已隐藏'
            }`}
            extra={
              summary.hiddenTotal > 0
                ? `当前还有 ${summary.hiddenTotal} 条审计记录位于受限域，工作区总计 ${summary.workspaceTotal} 条。`
                : '当前角色可见工作区内全部审计记录。'
            }
          />

          <div className="rounded-lg border border-gray-200 p-3 text-sm">
            总计 {summary.total} · 24h {summary.last24h}
            {summary.hiddenLast24h > 0 ? (
              <p className="mt-1 text-xs text-amber-700">
                过去 24 小时内另有 {summary.hiddenLast24h} 条记录因权限分级未展示。
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!loading && !error && logs.length === 0 ? (
        <EmptyState
          title="暂无可见审计记录"
          description={
            summary?.hiddenTotal
              ? '当前角色暂无可见记录，但工作区中存在受限审计域。'
              : '系统执行关键动作后会自动写入日志。'
          }
        />
      ) : null}

      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">
                {log.action} · {log.resourceType}
              </p>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                {domainLabel(log.visibilityDomain)}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              {new Date(log.createdAt).toLocaleString('zh-CN')} · resourceId={log.resourceId || '-'}
            </p>
            {log.payload ? (
              <pre className="mt-1 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
                {JSON.stringify(log.payload, null, 2)}
              </pre>
            ) : log.payloadRedacted ? (
              <p className="mt-2 rounded bg-amber-50 px-2 py-2 text-xs text-amber-700">
                当前角色仅可查看该记录的元信息，详细 payload 已按可见域策略隐藏。
              </p>
            ) : null}
          </div>
        ))}
      </div>
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

function roleLabel(role: WorkspaceRoleValue) {
  const labels: Record<WorkspaceRoleValue, string> = {
    OWNER: 'Owner',
    ADMIN: 'Admin',
    EDITOR: 'Editor',
    VIEWER: 'Viewer'
  };
  return labels[role] ?? role;
}

function scopeLabel(scope: AuditVisibilityScope) {
  return scope === 'FULL_WORKSPACE' ? '全工作区可见' : '仅可见运营域';
}

function domainLabel(domain?: AuditVisibilityDomain) {
  const labels: Record<AuditVisibilityDomain, string> = {
    CONTENT: '内容',
    LEARNING: '学习',
    MEDIA: '媒体',
    PUBLISHING: '发布',
    REPLY: '回复',
    WORKFLOW: '工作流',
    INTEGRATIONS: '集成',
    BILLING: '计费',
    WORKSPACE_ADMIN: '工作区管理',
    UNKNOWN: '未分类'
  };

  if (!domain) return '未分类';
  return labels[domain] ?? domain;
}
