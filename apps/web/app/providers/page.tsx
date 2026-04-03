'use client';

import { FormEvent, useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { fetchProviders, routeProviderText, upsertProvider } from '../../lib/queries';

export default function ProvidersPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [name, setName] = useState('Default OpenRouter');
  const [apiKey, setApiKey] = useState('');
  const [prompt, setPrompt] = useState('请写一条关于 AI 内容运营的中文 X 推文。');
  const [routeResult, setRouteResult] = useState<any>(null);

  const load = async () => {
    setRows(await fetchProviders());
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await upsertProvider({
      name,
      providerType: 'OPENROUTER',
      apiKey: apiKey.trim() || undefined,
      isEnabled: true
    });
    setApiKey('');
    await load();
  };

  return (
    <WorkbenchShell title="Provider Hub" description="多 Provider 路由 + BYOK + 平台兜底">
      <form onSubmit={submit} className="grid gap-2 rounded-lg border border-gray-200 p-3">
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Provider 名称"
        />
        <input
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="BYOK API Key（可空，走平台兜底）"
        />
        <button className="w-fit rounded bg-gray-900 px-3 py-2 text-sm text-white">保存连接</button>
      </form>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium">
              {row.name} · {row.providerType}
            </p>
            <p className="text-xs text-gray-500">
              enabled={String(row.isEnabled)} · key={row.apiKeyMasked || '未配置'}
            </p>
          </div>
        ))}
      </div>

      <form
        className="grid gap-2 rounded-lg border border-gray-200 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await routeProviderText({
            prompt,
            taskType: 'generation'
          });
          setRouteResult(result);
        }}
      >
        <textarea
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="w-fit rounded border border-gray-300 px-3 py-2 text-sm">执行路由测试</button>
      </form>

      {routeResult ? (
        <pre className="overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
          {JSON.stringify(routeResult, null, 2)}
        </pre>
      ) : null}
    </WorkbenchShell>
  );
}

