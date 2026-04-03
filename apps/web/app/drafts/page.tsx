'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { DraftEntity } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { WorkspaceRecovery, isWorkspaceMissing, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { approveDraft, createDraft, fetchDrafts, publishDraft, qualityCheckDraft } from '../../lib/queries';

export default function DraftsPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<DraftEntity[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [qualityMap, setQualityMap] = useState<
    Record<
      string,
      {
        passed: boolean;
        score: number;
        blockers: Array<{ code: string; message: string }>;
        warnings: Array<{ code: string; message: string }>;
      }
    >
  >({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchDrafts({ pageSize: 200 }));
    } catch (e) {
      setError(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      await createDraft({ title: title.trim(), content: content.trim(), language: 'zh' });
      setTitle('');
      setContent('');
      pushToast({ title: '草稿保存成功', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '保存失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const runQualityCheck = async (draftId: string) => {
    setActionBusyId(draftId);
    try {
      const report = await qualityCheckDraft(draftId);
      setQualityMap((prev) => ({
        ...prev,
        [draftId]: {
          passed: report.passed,
          score: report.score,
          blockers: report.blockers,
          warnings: report.warnings
        }
      }));
      pushToast({
        title: report.passed ? '质量检查通过' : '质量检查未通过',
        description: `质量分 ${report.score}`,
        variant: report.passed ? 'success' : 'error'
      });
    } catch (err) {
      pushToast({ title: '质量检查失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const approve = async (draftId: string) => {
    setActionBusyId(draftId);
    try {
      await approveDraft(draftId);
      pushToast({ title: '审批通过', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '审批失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const enqueuePublish = async (draftId: string) => {
    setActionBusyId(draftId);
    try {
      await publishDraft({ draftId });
      pushToast({ title: '已加入发布队列', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '入队失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <WorkbenchShell title="草稿工坊" description="草稿创建、质量检查、审批与发布入队。">
      <form onSubmit={submit} className="grid gap-2 rounded-lg border border-gray-200 p-3">
        <input
          placeholder="草稿标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
        />
        <textarea
          rows={4}
          placeholder="草稿正文"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={saving}
        />
        <button
          className="w-fit rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving || !title.trim() || !content.trim()}
        >
          {saving ? '保存中...' : '保存草稿'}
        </button>
      </form>

      {loading ? <LoadingState label="正在加载草稿..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="草稿加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={isWorkspaceMissing(error) ? <WorkspaceRecovery onRecovered={load} /> : undefined}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="还没有草稿" description="先创建第一条草稿，然后进行审批发布。" />
      ) : null}

      <div className="space-y-2">
        {rows.map((row) => {
          const busy = actionBusyId === row.id;
          const report = qualityMap[row.id];
          return (
            <div key={row.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{row.title || '无标题'}</p>
                  <p className="text-xs text-gray-500">
                    状态：{row.status} · 版本：{row.currentVersion} · 语言：{row.language}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
                    onClick={() => void runQualityCheck(row.id)}
                    disabled={busy}
                  >
                    质量检查
                  </button>
                  <button
                    className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
                    onClick={() => void approve(row.id)}
                    disabled={busy}
                  >
                    {busy ? '处理中...' : '审批通过'}
                  </button>
                  <button
                    className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
                    onClick={() => void enqueuePublish(row.id)}
                    disabled={busy}
                  >
                    入发布队列
                  </button>
                </div>
              </div>

              {report ? (
                <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 text-xs">
                  <p className="font-semibold">质量分：{report.score}</p>
                  {report.blockers.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-red-600">
                      {report.blockers.map((b) => (
                        <li key={b.code}>{b.message}</li>
                      ))}
                    </ul>
                  ) : null}
                  {report.warnings.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-600">
                      {report.warnings.map((w) => (
                        <li key={w.code}>{w.message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-600">{row.latestContent || '无内容'}</pre>
            </div>
          );
        })}
      </div>
    </WorkbenchShell>
  );
}
