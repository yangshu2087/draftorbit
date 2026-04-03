'use client';

import { FormEvent, useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { createVoiceProfile, fetchVoiceProfiles } from '../../lib/queries';

export default function VoiceProfilesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('');

  const load = async () => {
    setRows(await fetchVoiceProfiles());
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createVoiceProfile({ name: name.trim() });
    setName('');
    await load();
  };

  return (
    <WorkbenchShell title="Voice Profiles" description="账号语气画像（学习引擎输出）">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-3">
        <input
          className="min-w-[280px] flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="新建 Voice Profile 名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="rounded bg-gray-900 px-3 py-2 text-sm text-white">新建</button>
      </form>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium">{row.name}</p>
            <p className="text-xs text-gray-500">
              样本：{row.sampleCount} · 最近学习：{row.lastLearnedAt ? new Date(row.lastLearnedAt).toLocaleString('zh-CN') : '—'}
            </p>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}

