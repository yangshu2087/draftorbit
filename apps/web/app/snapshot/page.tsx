'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type {
  AuditSummaryEntity,
  OpsQueuesResponse,
  UsageSummaryEntity
} from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { WorkspaceRecovery, isWorkspaceMissing, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { fetchAuditSummary, fetchQueueHealth, fetchUsageSummary } from '../../lib/queries';

type SnapshotData = {
  usage: UsageSummaryEntity;
  audit: AuditSummaryEntity;
  ops: OpsQueuesResponse & { ok: true; now: string };
};

export default function SnapshotPage() {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usage, audit, ops] = await Promise.all([
        fetchUsageSummary(),
        fetchAuditSummary(),
        fetchQueueHealth()
      ]);
      setData({ usage, audit, ops });
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

  const posture = useMemo(() => {
    if (!data) return null;
    return {
      role: data.usage.visibility.role,
      usageTier: data.usage.visibility.accessTier,
      auditScope: data.audit.visibility.scope,
      opsTier: data.ops.visibility.accessTier
    };
  }, [data]);

  return (
    <WorkbenchShell title="系统快照" description="把用量、审计、队列健康汇总成一个统一视图，并明确展示当前角色的可见域边界。">
      {loading ? <LoadingState label="正在生成系统快照..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="系统快照加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={isWorkspaceMissing(error) ? <WorkspaceRecovery onRecovered={load} /> : undefined}
        />
      ) : null}

      {!loading && !error && !data ? (
        <EmptyState title="暂无系统快照" description="当工作区开始产生运营数据后，这里会展示统一快照。" />
      ) : null}

      {data && posture ? (
        <div className="space-y-4">
          <VisibilityPanel
            title="Batch-17 总览"
            description={`${roleLabel(posture.role)} · Usage ${tierLabel(posture.usageTier)} · Audit ${auditScopeLabel(
              posture.auditScope
            )} · Ops ${tierLabel(posture.opsTier)}`}
            extra="该页面不引入新的后端契约，而是统一聚合已受 Batch-17 权限分级控制的 usage / audit / ops 接口。"
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="剩余额度" value={String(data.usage.billing?.remainingCredits ?? 0)} />
            <MetricCard
              title="估算成本"
              value={data.usage.visibility.canViewCosts ? `$${Number(data.usage.tokenCost?.costUsd ?? 0).toFixed(4)}` : '受限'}
            />
            <MetricCard title="24h 审计记录" value={String(data.audit.last24h)} />
            <MetricCard title="队列 waiting" value={String(data.ops.summary.waiting)} />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <SnapshotCard
              title="Usage Snapshot"
              tier={`${roleLabel(data.usage.visibility.role)} · ${tierLabel(data.usage.visibility.accessTier)}`}
              summary={[
                `周期开始：${new Date(data.usage.periodStart).toLocaleDateString('zh-CN')}`,
                `生成次数：${data.usage.counters.generations}`,
                `发布任务：${data.usage.counters.publishJobs}`,
                data.usage.visibility.canManageCredits ? '可调整额度' : '不可调整额度'
              ]}
              redactedFields={data.usage.visibility.redactedFields}
              href="/usage"
              hrefLabel="查看用量详情"
            />

            <SnapshotCard
              title="Audit Snapshot"
              tier={`${roleLabel(data.audit.visibility.role)} · ${auditScopeLabel(data.audit.visibility.scope)}`}
              summary={[
                `总计：${data.audit.total}`,
                `24h：${data.audit.last24h}`,
                `隐藏记录：${data.audit.hiddenTotal}`,
                data.audit.visibility.payloadAccess === 'FULL' ? 'payload 可见' : 'payload 已隐藏'
              ]}
              redactedFields={data.audit.hiddenTotal > 0 ? [`hiddenTotal=${data.audit.hiddenTotal}`] : []}
              href="/audit"
              hrefLabel="查看审计详情"
            />

            <SnapshotCard
              title="Ops Snapshot"
              tier={`${roleLabel(data.ops.visibility.role)} · ${tierLabel(data.ops.visibility.accessTier)}`}
              summary={[
                `waiting：${data.ops.summary.waiting}`,
                `active：${data.ops.summary.active}`,
                `completed：${data.ops.summary.completed}`,
                data.ops.queues ? `队列明细可见：${Object.keys(data.ops.queues).length}` : `隐藏队列：${data.ops.hiddenQueueCount}`
              ]}
              redactedFields={data.ops.visibility.redactedFields}
              href="/ops"
              hrefLabel="查看队列健康"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-semibold text-gray-900">下一步建议</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
              <li>需要完整账本或成本细节时，切到具备更高角色的工作区成员。</li>
              <li>如果 snapshot 与详细页不一致，优先检查对应详细页的 visibility 标记。</li>
              <li>快照时间：{new Date(data.ops.now).toLocaleString('zh-CN')}</li>
            </ul>
          </div>
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

function SnapshotCard(props: {
  title: string;
  tier: string;
  summary: string[];
  redactedFields: string[];
  href: string;
  hrefLabel: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{props.title}</p>
          <p className="mt-1 text-xs text-gray-500">{props.tier}</p>
        </div>
        <Link href={props.href} className="text-xs font-medium text-blue-700 hover:text-blue-800">
          {props.hrefLabel}
        </Link>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-gray-700">
        {props.summary.map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-gray-500">
        {props.redactedFields.length > 0
          ? `隐藏字段：${props.redactedFields.join('、')}`
          : '当前卡片对应视图无额外字段隐藏'}
      </p>
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
  if (tier === 'FULL') return '完整快照';
  if (tier === 'LIMITED') return '受限快照';
  return '概览快照';
}

function auditScopeLabel(scope: 'FULL_WORKSPACE' | 'OPERATIONS_ONLY') {
  return scope === 'FULL_WORKSPACE' ? '全工作区可见' : '仅可见运营域';
}
