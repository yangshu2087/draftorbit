'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { XAccountEntity } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { buildRecoveryExtra, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import {
  bindXAccountManual,
  deleteXAccount,
  fetchXAccounts,
  setDefaultXAccount,
  startXAccountOAuthBind,
  updateXAccountStatus
} from '../../lib/queries';
import { cn } from '../../lib/utils';

const STATUS_LABEL: Record<XAccountEntity['status'], string> = {
  ACTIVE: '可用',
  EXPIRED: '已过期',
  REVOKED: '已撤销',
  ERROR: '异常'
};

function looksLikePlaceholder(value: string | null): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return normalized.startsWith('stub-') || normalized.startsWith('your-') || normalized.includes('replace-with');
}

export default function XAccountsPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<XAccountEntity[]>([]);
  const [twitterUserId, setTwitterUserId] = useState('');
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [oauthBinding, setOauthBinding] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);

  const defaultAccount = useMemo(
    () => rows.find((row) => row.isDefault) ?? null,
    [rows]
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchXAccounts({ pageSize: 100 }));
    } catch (e) {
      setRows([]);
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!twitterUserId.trim() || !handle.trim() || saving) return;
    setSaving(true);
    try {
      await bindXAccountManual({
        twitterUserId: twitterUserId.trim(),
        handle: handle.trim().replace(/^@/, '')
      });
      setTwitterUserId('');
      setHandle('');
      pushToast({ title: 'X 账号绑定成功', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '绑定失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleOAuthBind = async () => {
    if (oauthBinding) return;
    setOauthBinding(true);
    try {
      const { url } = await startXAccountOAuthBind();
      const parsed = new URL(url);
      const clientId = parsed.searchParams.get('client_id');
      if (looksLikePlaceholder(clientId)) {
        throw new Error('X OAuth 尚未配置完成，请补齐 X_CLIENT_ID / X_CLIENT_SECRET。');
      }
      window.location.href = url;
    } catch (err) {
      setOauthBinding(false);
      pushToast({ title: '拉起 OAuth 失败', description: normalizeErrorMessage(err), variant: 'error' });
    }
  };

  const handleSetDefault = async (id: string) => {
    setBusyAccountId(id);
    try {
      await setDefaultXAccount(id);
      pushToast({ title: '已切换默认发布账号', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '切换失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleToggleStatus = async (row: XAccountEntity) => {
    setBusyAccountId(row.id);
    try {
      const next = row.status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE';
      await updateXAccountStatus(row.id, next);
      pushToast({
        title: next === 'ACTIVE' ? '账号已启用' : '账号已停用',
        variant: 'success'
      });
      await load();
    } catch (err) {
      pushToast({ title: '更新状态失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setBusyAccountId(null);
    }
  };

  const handleDelete = async (row: XAccountEntity) => {
    if (!window.confirm(`确认解绑 @${row.handle} ? 解绑后不会删除历史内容，但后续不会再使用该账号执行任务。`)) {
      return;
    }

    setBusyAccountId(row.id);
    try {
      await deleteXAccount(row.id);
      pushToast({ title: '账号已解绑', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '解绑失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setBusyAccountId(null);
    }
  };

  return (
    <WorkbenchShell title="X 账号管理" description="支持多账号绑定、默认账号切换与状态可视化。">
      <div className="do-panel-soft mb-3 flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">OAuth 绑定附加账号（推荐）</p>
          <p className="text-xs text-slate-600">登录账号与附加账号绑定链路已分离，支持同工作区多账号运营。</p>
        </div>
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-3.5 py-2 text-sm text-white disabled:opacity-50"
          disabled={oauthBinding}
          onClick={handleOAuthBind}
        >
          {oauthBinding ? '跳转授权中...' : '绑定附加 X 账号'}
        </button>
      </div>

      <div className="do-panel mb-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-slate-900">手动绑定（高级调试）</p>
            <p className="text-xs text-slate-600">默认折叠，通常仅用于迁移数据或应急录入。</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-900/12 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => setManualOpen((v) => !v)}
            aria-expanded={manualOpen}
            aria-controls="manual-x-bind-form"
          >
            {manualOpen ? '收起手动绑定' : '展开手动绑定'}
          </button>
        </div>

        {manualOpen ? (
          <form
            id="manual-x-bind-form"
            onSubmit={submit}
            className="mt-3 grid gap-2.5 border-t border-slate-900/8 pt-3 sm:grid-cols-3"
          >
            <input
              placeholder="Twitter User ID"
              value={twitterUserId}
              onChange={(e) => setTwitterUserId(e.target.value)}
              disabled={saving}
            />
            <input placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} disabled={saving} />
            <button
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={saving || !twitterUserId.trim() || !handle.trim()}
            >
              {saving ? '绑定中...' : '绑定账号'}
            </button>
          </form>
        ) : null}
      </div>

      {defaultAccount ? (
        <div className="do-card-compact mb-3 border border-indigo-200 bg-indigo-50/70">
          <p className="text-xs font-semibold text-indigo-700">默认发布账号</p>
          <p className="mt-0.5 text-sm text-indigo-900">@{defaultAccount.handle}</p>
        </div>
      ) : null}

      {loading ? <LoadingState label="正在加载账号列表..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="账号列表加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="还没有绑定账号" description="先完成 OAuth 绑定，再继续发布与回复流程。" />
      ) : null}

      <div className="space-y-2">
        {rows.map((row) => {
          const busy = busyAccountId === row.id;
          const canSetDefault = !row.isDefault && row.status === 'ACTIVE';

          return (
            <div key={row.id} className="do-card-compact">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    @{row.handle}
                    {row.isDefault ? (
                      <span className="ml-2 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">
                        默认
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">twitterUserId={row.twitterUserId}</p>
                  <p
                    className={cn(
                      'mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                      row.status === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-700'
                    )}
                  >
                    {STATUS_LABEL[row.status]}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canSetDefault || busy}
                    onClick={() => void handleSetDefault(row.id)}
                    className="rounded-lg border border-slate-900/12 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    设为默认
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggleStatus(row)}
                    className="rounded-lg border border-slate-900/12 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {row.status === 'ACTIVE' ? '停用' : '启用'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(row)}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    解绑
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </WorkbenchShell>
  );
}
