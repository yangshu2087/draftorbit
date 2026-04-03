'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { XAccountEntity } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { WorkspaceRecovery, isWorkspaceMissing, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { bindXAccountManual, fetchXAccounts, startXOAuth } from '../../lib/queries';

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
      const { url } = await startXOAuth();
      const parsed = new URL(url);
      const clientId = parsed.searchParams.get('client_id');
      const redirectUri = parsed.searchParams.get('redirect_uri');

      if (looksLikePlaceholder(clientId)) {
        throw new Error('X OAuth 仍是占位配置，请在 .env 填写真实 X_CLIENT_ID / X_CLIENT_SECRET 后重启服务。');
      }

      if (redirectUri && !decodeURIComponent(redirectUri).includes('/auth/callback')) {
        throw new Error('X_CALLBACK_URL 建议设置为 http://localhost:3000/auth/callback，避免授权回跳异常。');
      }

      window.location.href = url;
    } catch (err) {
      setOauthBinding(false);
      pushToast({ title: '拉起 OAuth 失败', description: normalizeErrorMessage(err), variant: 'error' });
    }
  };

  return (
    <WorkbenchShell title="X 账号管理" description="账号绑定、状态查看与后续发布账号准备。">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <button
          type="button"
          className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={oauthBinding}
          onClick={handleOAuthBind}
        >
          {oauthBinding ? '跳转授权中...' : 'OAuth 绑定 X（推荐）'}
        </button>
        <p className="text-xs text-gray-600">
          推荐先用 OAuth 绑定，自动写入令牌；手动绑定仅用于占位，不会写入真实访问令牌。
        </p>
      </div>

      <div className="mb-3 rounded-lg border border-gray-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-gray-900">手动绑定（高级/调试）</p>
            <p className="text-xs text-gray-600">默认折叠，通常仅在调试或迁移数据时使用。</p>
          </div>
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
            className="mt-3 grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-3"
          >
            <input
              placeholder="Twitter User ID"
              value={twitterUserId}
              onChange={(e) => setTwitterUserId(e.target.value)}
              disabled={saving}
            />
            <input placeholder="@handle" value={handle} onChange={(e) => setHandle(e.target.value)} disabled={saving} />
            <button
              className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={saving || !twitterUserId.trim() || !handle.trim()}
            >
              {saving ? '绑定中...' : '绑定账号'}
            </button>
          </form>
        ) : null}
      </div>

      {loading ? <LoadingState label="正在加载账号列表..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="账号列表加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={isWorkspaceMissing(error) ? <WorkspaceRecovery onRecovered={load} /> : undefined}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="还没有绑定账号" description="先手动绑定一个 X 账号，用于发布与回复流程。" />
      ) : null}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium">@{row.handle}</p>
            <p className="text-xs text-gray-500">
              twitterUserId={row.twitterUserId} · 状态={row.status}
            </p>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}
