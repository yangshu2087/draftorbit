'use client';

import { FormEvent, useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { buildRecoveryExtra, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { createPlaybook, fetchPlaybooks } from '../../lib/queries';

const PLAYBOOK_PRESETS = [
  {
    key: 'steady-growth',
    name: '稳定增长节奏',
    rules: { publishFrequency: 'daily', ctaStyle: 'soft', language: 'zh' }
  },
  {
    key: 'launch-week',
    name: '产品发布周',
    rules: { publishFrequency: 'high', ctaStyle: 'strong', language: 'zh' }
  },
  {
    key: 'community-first',
    name: '社区互动优先',
    rules: { publishFrequency: 'daily', ctaStyle: 'question', language: 'zh' }
  }
] as const;

export default function PlaybooksPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [presetKey, setPresetKey] = useState<(typeof PLAYBOOK_PRESETS)[number]['key']>('steady-growth');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchPlaybooks());
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
    if (submitting) return;
    const selected = PLAYBOOK_PRESETS.find((item) => item.key === presetKey);
    if (!selected) return;

    setSubmitting(true);
    try {
      await createPlaybook({
        name: selected.name,
        rules: selected.rules
      });
      pushToast({ title: '运营手册已创建', variant: 'success' });
      await load();
    } catch (e) {
      pushToast({ title: '创建失败', description: normalizeErrorMessage(e), variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WorkbenchShell title="运营手册" description="优先使用内置运营手册模板，减少手工配置。">
      <form className="do-panel grid gap-2.5 p-4" onSubmit={submit}>
        <select value={presetKey} onChange={(e) => setPresetKey(e.target.value as (typeof PLAYBOOK_PRESETS)[number]['key'])}>
          {PLAYBOOK_PRESETS.map((item) => (
            <option key={item.key} value={item.key}>
              {item.name}
            </option>
          ))}
        </select>

        <button className="w-fit rounded-xl bg-slate-900 px-3.5 py-2 text-sm text-white disabled:opacity-60" disabled={submitting}>
          {submitting ? '创建中...' : '应用手册模板'}
        </button>
      </form>

      {loading ? <LoadingState label="正在加载运营手册..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="运营手册加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="暂无运营手册" description="先选择一个模板并创建。" />
      ) : null}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="do-card-compact">
            <p className="text-sm font-medium">{row.name}</p>
            <pre className="mt-1 overflow-auto rounded-xl border border-slate-900/8 bg-slate-50 p-2 text-xs text-slate-600">
              {JSON.stringify(row.rules, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}
