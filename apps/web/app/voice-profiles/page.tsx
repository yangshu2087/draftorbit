'use client';

import { FormEvent, useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { buildRecoveryExtra, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { createVoiceProfile, fetchVoiceProfiles } from '../../lib/queries';

const PROFILE_PRESETS = [
  '专业解读型',
  '增长实战型',
  '产品发布型',
  '社区互动型'
] as const;

export default function VoiceProfilesPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [preset, setPreset] = useState<(typeof PROFILE_PRESETS)[number]>('专业解读型');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchVoiceProfiles());
    } catch (e) {
      setRows([]);
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setName((prev) => (prev.trim() ? prev : preset));
  }, [preset]);

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createVoiceProfile({ name: name.trim() });
      setName('');
      pushToast({ title: '文风画像已创建', variant: 'success' });
      await load();
    } catch (e) {
      pushToast({ title: '创建失败', description: normalizeErrorMessage(e), variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WorkbenchShell title="文风画像" description="优先选择预设风格，再微调名称并创建。">
      <form onSubmit={submit} className="do-panel grid gap-2.5 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={preset} onChange={(e) => setPreset(e.target.value as (typeof PROFILE_PRESETS)[number])}>
            {PROFILE_PRESETS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <input
            placeholder="画像名称（可按需调整）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
          />
        </div>

        <button className="w-fit rounded-xl bg-slate-900 px-3.5 py-2 text-sm text-white disabled:opacity-60" disabled={submitting || !name.trim()}>
          {submitting ? '创建中...' : '创建文风画像'}
        </button>
      </form>

      {loading ? <LoadingState label="正在加载文风画像..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="文风画像加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="暂无文风画像" description="先创建一个文风画像，用于草稿表达统一。" />
      ) : null}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="do-card-compact">
            <p className="text-sm font-medium">{row.name}</p>
            <p className="text-xs text-slate-500">
              样本：{row.sampleCount} · 最近学习：{row.lastLearnedAt ? new Date(row.lastLearnedAt).toLocaleString('zh-CN') : '—'}
            </p>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}
