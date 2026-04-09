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
import { fetchAuditSummary, fetchQueueHealth, fetchUsageSummary, fetchWorkspace } from '../../lib/queries';

type SnapshotData = {
  workspace: Record<string, unknown> | null;
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
      const [workspace, usage, audit, ops] = await Promise.all([
        fetchWorkspace(),
        fetchUsageSummary(),
        fetchAuditSummary(),
        fetchQueueHealth()
      ]);
      setData({ workspace, usage, audit, ops });
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

  const workspace = useMemo(() => {
    if (!data?.workspace) return null;
    const raw = data.workspace as Record<string, unknown>;
    const members = Array.isArray(raw.members) ? raw.members : [];
    return {
      name: typeof raw.name === 'string' ? raw.name : '当前工作区',
      slug: typeof raw.slug === 'string' ? raw.slug : '-',
      memberCount: members.length,
      ownerId: typeof raw.ownerId === 'string' ? raw.ownerId : null
    };
  }, [data]);

  const redactionSummary = useMemo(() => {
    if (!data) return [];
    const items: string[] = [];

    if (data.usage.visibility.redactedFields.length > 0) {
      items.push(`Usage 隐藏 ${data.usage.visibility.redactedFields.length} 个字段`);
    }
    if (data.audit.hiddenTotal > 0) {
      items.push(`Audit 隐藏 ${data.audit.hiddenTotal} 条记录`);
    }
    if (data.audit.visibility.payloadAccess === 'NONE') {
      items.push('Audit payload 已隐藏');
    }
    if (data.ops.visibility.redactedFields.length > 0) {
      items.push(`Ops 隐藏 ${data.ops.visibility.redactedFields.length} 类字段`);
    }
    if (data.ops.hiddenQueueCount > 0) {
      items.push(`Ops 隐藏 ${data.ops.hiddenQueueCount} 个队列明细`);
    }

    return items;
  }, [data]);

  const anomalies = useMemo(() => {
    if (!data) return [];
    const items: Array<{
      title: string;
      detail: string;
      severity: 'neutral' | 'amber' | 'red';
      href?: string;
    }> = [];

    const remainingCredits = data.usage.billing?.remainingCredits ?? 0;
    const monthlyQuota = data.usage.billing?.monthlyQuota ?? 0;
    const lowCreditThreshold = Math.max(10, Math.ceil(monthlyQuota * 0.25));

    if (remainingCredits <= lowCreditThreshold) {
      items.push({
        title: '额度偏低',
        detail: `当前仅剩 ${remainingCredits} credits，已低于管理阈值 ${lowCreditThreshold}。`,
        severity: remainingCredits <= 5 ? 'red' : 'amber',
        href: '/usage'
      });
    }

    const failed = data.ops.summary.failed ?? 0;
    const delayed = data.ops.summary.delayed ?? 0;
    if (failed > 0 || delayed > 0) {
      items.push({
        title: '队列存在异常积压',
        detail: `failed ${failed} · delayed ${delayed}。建议进入队列健康页进一步排查。`,
        severity: failed > 0 ? 'red' : 'amber',
        href: '/ops'
      });
    }

    if (data.audit.hiddenLast24h > 0 || data.audit.hiddenTotal > 0) {
      items.push({
        title: '审计可见域存在受限记录',
        detail: `24h 内隐藏 ${data.audit.hiddenLast24h} 条，累计隐藏 ${data.audit.hiddenTotal} 条。`,
        severity: 'amber',
        href: '/audit'
      });
    }

    if (items.length === 0) {
      items.push({
        title: '暂无显著异常',
        detail: '当前没有检测到额度告警、队列失败或新的受限审计异常。',
        severity: 'neutral'
      });
    }

    return items.slice(0, 3);
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
          <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-blue-50 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xl font-semibold text-gray-900">{workspace?.name ?? '当前工作区'}</p>
                  <RoleBadge role={posture.role} />
                </div>
                <p className="text-sm text-gray-600">
                  slug: <span className="font-medium text-gray-900">{workspace?.slug ?? '-'}</span>
                  {workspace?.memberCount ? ` · 成员 ${workspace.memberCount}` : ''}
                  {workspace?.ownerId ? ` · owner ${workspace.ownerId.slice(0, 8)}` : ''}
                </p>
                <p className="text-sm text-gray-500">
                  快照时间：{new Date(data.ops.now).toLocaleString('zh-CN')} · 该页面向管理层，用于快速判断工作区是否需要介入。
                </p>
              </div>

              <div className="grid min-w-[280px] gap-2 sm:grid-cols-2">
                <MiniStat label="Usage tier" value={tierLabel(posture.usageTier)} />
                <MiniStat label="Audit scope" value={auditScopeLabel(posture.auditScope)} />
                <MiniStat label="Ops tier" value={tierLabel(posture.opsTier)} />
                <MiniStat label="Redaction items" value={String(redactionSummary.length)} />
              </div>
            </div>
          </div>

          <VisibilityPanel
            title="Batch-17 总览"
            description={`${roleLabel(posture.role)} · Usage ${tierLabel(posture.usageTier)} · Audit ${auditScopeLabel(
              posture.auditScope
            )} · Ops ${tierLabel(posture.opsTier)}`}
            extra="该页面不引入新的后端契约，而是统一聚合已受 Batch-17 权限分级控制的 usage / audit / ops 接口。"
          />

          <RedactionBanner items={redactionSummary} />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="剩余额度" value={String(data.usage.billing?.remainingCredits ?? 0)} />
            <MetricCard
              title="估算成本"
              value={data.usage.visibility.canViewCosts ? `$${Number(data.usage.tokenCost?.costUsd ?? 0).toFixed(4)}` : '受限'}
            />
            <MetricCard title="24h 审计记录" value={String(data.audit.last24h)} />
            <MetricCard title="队列 waiting" value={String(data.ops.summary.waiting)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">最近异常点</p>
              <p className="text-xs text-gray-500">按当前角色可见域聚合</p>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              {anomalies.map((item) => (
                <AnomalyCard
                  key={`${item.title}-${item.detail}`}
                  title={item.title}
                  detail={item.detail}
                  severity={item.severity}
                  href={item.href}
                />
              ))}
            </div>
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

function RedactionBanner(props: { items: string[] }) {
  if (props.items.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        当前角色可查看完整管理快照，没有额外字段被 Batch-17 策略隐藏。
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-900">Redaction summary</p>
      <p className="mt-1 text-sm text-amber-800">
        当前管理视图受角色分级控制，以下信息已被裁剪或限制：
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
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

function MiniStat(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white/80 p-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{props.label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{props.value}</p>
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

function RoleBadge(props: { role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' }) {
  const tone =
    props.role === 'OWNER'
      ? 'bg-purple-100 text-purple-800 border-purple-200'
      : props.role === 'ADMIN'
        ? 'bg-blue-100 text-blue-800 border-blue-200'
        : props.role === 'EDITOR'
          ? 'bg-amber-100 text-amber-800 border-amber-200'
          : 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      {roleLabel(props.role)}
    </span>
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

function AnomalyCard(props: {
  title: string;
  detail: string;
  severity: 'neutral' | 'amber' | 'red';
  href?: string;
}) {
  const tone =
    props.severity === 'red'
      ? 'border-red-200 bg-red-50 text-red-900'
      : props.severity === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-emerald-200 bg-emerald-50 text-emerald-900';

  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{props.title}</p>
          <p className="mt-2 text-sm opacity-90">{props.detail}</p>
        </div>
        {props.href ? (
          <Link href={props.href} className="text-xs font-medium underline-offset-2 hover:underline">
            查看
          </Link>
        ) : null}
      </div>
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
