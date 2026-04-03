'use client';

import { FormEvent, useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { createLearningSource, fetchLearningSources, runLearningSource } from '../../lib/queries';

export default function LearningPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [sourceType, setSourceType] = useState('X_TIMELINE');
  const [sourceRef, setSourceRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setRows(await fetchLearningSources());
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!sourceRef.trim()) return;
    await createLearningSource({ sourceType, sourceRef: sourceRef.trim() });
    setSourceRef('');
    await load();
  };

  return (
    <WorkbenchShell title="Learning Sources" description="学习源管理 + 风格学习任务触发">
      <form className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-3" onSubmit={submit}>
        <select
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
        >
          <option value="X_TIMELINE">X_TIMELINE</option>
          <option value="X_BOOKMARKS">X_BOOKMARKS</option>
          <option value="IMPORT_CSV">IMPORT_CSV</option>
          <option value="URL">URL</option>
        </select>
        <input
          className="min-w-[280px] flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="输入 URL / 账号 / CSV 标识"
          value={sourceRef}
          onChange={(e) => setSourceRef(e.target.value)}
        />
        <button className="rounded bg-gray-900 px-3 py-2 text-sm text-white">新增学习源</button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3">
            <div>
              <p className="text-sm font-medium">{row.sourceType}</p>
              <p className="text-xs text-gray-500">{row.sourceRef}</p>
            </div>
            <button
              className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100"
              onClick={async () => {
                await runLearningSource(row.id);
              }}
            >
              触发学习任务
            </button>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-gray-500">暂无学习源</p> : null}
      </div>
    </WorkbenchShell>
  );
}

