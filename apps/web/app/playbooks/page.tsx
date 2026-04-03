'use client';

import { FormEvent, useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { createPlaybook, fetchPlaybooks } from '../../lib/queries';

export default function PlaybooksPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('');

  const load = async () => {
    setRows(await fetchPlaybooks());
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createPlaybook({
      name: name.trim(),
      rules: {
        language: 'zh',
        ctaStyle: 'soft'
      }
    });
    setName('');
    await load();
  };

  return (
    <WorkbenchShell title="Account Playbooks" description="账号运营规则与执行规范（V1 基础版）">
      <form className="flex gap-2 rounded-lg border border-gray-200 p-3" onSubmit={submit}>
        <input
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="Playbook 名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="rounded bg-gray-900 px-3 py-2 text-sm text-white">新增</button>
      </form>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium">{row.name}</p>
            <pre className="mt-1 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
              {JSON.stringify(row.rules, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}

