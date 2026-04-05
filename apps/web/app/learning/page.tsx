'use client';

import { FormEvent, useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { buildRecoveryExtra, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { createLearningSource, fetchLearningSources, runLearningSource } from '../../lib/queries';

const SOURCE_OPTIONS = [
  { value: 'X_TIMELINE', label: 'X 时间线' },
  { value: 'X_BOOKMARKS', label: 'X 收藏夹' },
  { value: 'IMPORT_CSV', label: 'CSV 导入' },
  { value: 'URL', label: '网页链接' }
] as const;

const SOURCE_REF_PRESETS: Record<string, string[]> = {
  X_TIMELINE: ['@OpenAI', '@xai', '@vercel'],
  X_BOOKMARKS: ['bookmarks://default', 'bookmarks://weekly-ai'],
  IMPORT_CSV: ['csv://kol-watchlist', 'csv://historical-posts'],
  URL: ['https://openai.com/news', 'https://x.com/explore/tabs/trending']
};

export default function LearningPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [sourceType, setSourceType] = useState<(typeof SOURCE_OPTIONS)[number]['value']>('X_TIMELINE');
  const [sourceRef, setSourceRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchLearningSources());
    } catch (e) {
      setRows([]);
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSourceRef(SOURCE_REF_PRESETS[sourceType]?.[0] ?? '');
  }, [sourceType]);

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!sourceRef.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createLearningSource({ sourceType, sourceRef: sourceRef.trim() });
      pushToast({ title: '学习来源已添加', variant: 'success' });
      await load();
    } catch (e) {
      pushToast({ title: '添加失败', description: normalizeErrorMessage(e), variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const runOnce = async (id: string) => {
    setRunningId(id);
    try {
      await runLearningSource(id);
      pushToast({ title: '已触发学习任务', variant: 'success' });
    } catch (e) {
      pushToast({ title: '触发失败', description: normalizeErrorMessage(e), variant: 'error' });
    } finally {
      setRunningId(null);
    }
  };

  return (
    <WorkbenchShell title="学习来源" description="优先选择来源类型与预设来源，快速完成风格学习准备。">
      <form className="do-panel grid gap-2.5 p-4" onSubmit={submit}>
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value as (typeof SOURCE_OPTIONS)[number]['value'])}>
            {SOURCE_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select value={sourceRef} onChange={(e) => setSourceRef(e.target.value)}>
            {(SOURCE_REF_PRESETS[sourceType] ?? []).map((ref) => (
              <option key={ref} value={ref}>
                {ref}
              </option>
            ))}
          </select>
        </div>

        <input
          placeholder="或粘贴自定义来源（仅这一项支持手工输入）"
          value={sourceRef}
          onChange={(e) => setSourceRef(e.target.value)}
          disabled={submitting}
        />

        <button className="w-fit rounded-xl bg-slate-900 px-3.5 py-2 text-sm text-white disabled:opacity-60" disabled={submitting || !sourceRef.trim()}>
          {submitting ? '添加中...' : '添加学习来源'}
        </button>
      </form>

      {loading ? <LoadingState label="正在加载学习来源..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="学习来源加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="暂无学习来源" description="先添加一个来源，后续可触发学习任务。" />
      ) : null}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="do-card-compact flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{row.sourceType}</p>
              <p className="text-xs text-slate-500">{row.sourceRef}</p>
            </div>
            <button
              className="rounded-lg border border-slate-900/12 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => void runOnce(row.id)}
              disabled={runningId === row.id}
            >
              {runningId === row.id ? '执行中...' : '触发学习'}
            </button>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}
