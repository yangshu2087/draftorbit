'use client';

import { useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import {
  buildRecoveryExtra,
  normalizeErrorMessage
} from '../../components/ui/workspace-recovery';
import { fetchProviderByokStatus, fetchProviders } from '../../lib/queries';
import type { ProviderEntity } from '@draftorbit/shared';

type ByokStatus = {
  workspaceId: string;
  byokEnabled: boolean;
  enabledConnections: number;
  platformFallbackEnabled: boolean;
};

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderEntity[]>([]);
  const [status, setStatus] = useState<ByokStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [providerRows, byokStatus] = await Promise.all([
        fetchProviders(),
        fetchProviderByokStatus()
      ]);
      setProviders(providerRows);
      setStatus(byokStatus);
    } catch (err) {
      setError(err);
      setProviders([]);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <WorkbenchShell title="模型服务中心" description="查看模型连接状态、BYOK 启用情况与平台兜底能力。">
      {loading ? <LoadingState label="正在加载模型服务数据..." /> : null}

      {!loading && error ? (
        <ErrorState
          title="模型服务数据加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {!loading && !error ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="已启用连接数" value={String(status?.enabledConnections ?? 0)} />
            <MetricCard title="BYOK 状态" value={status?.byokEnabled ? '已启用' : '未启用'} />
            <MetricCard title="平台兜底" value={status?.platformFallbackEnabled ? '可用' : '未配置'} />
            <MetricCard title="工作区 ID" value={status?.workspaceId ? '已识别' : '未识别'} />
          </div>

          {providers.length === 0 ? (
            <EmptyState
              title="暂无模型连接"
              description="当前工作区还没有新增模型连接。你仍可使用平台默认路由（若已配置）。"
              actionText="刷新"
              onAction={() => void load()}
            />
          ) : (
            <div className="space-y-2">
              <p className="do-section-title">连接列表</p>
              {providers.map((row) => (
                <div key={row.id} className="do-card-compact">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">{row.name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        row.isEnabled
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {row.isEnabled ? '启用中' : '已停用'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    类型：{row.providerType} · Key：{row.apiKeyMasked ?? '未设置'}
                  </p>
                  <p className="text-xs text-slate-500">Base URL：{row.baseUrl || '默认'}</p>
                </div>
              ))}
            </div>
          )}
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
