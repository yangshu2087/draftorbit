'use client';

import { FormEvent, useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { fetchMediaAssets, generateMediaPlaceholder, uploadMediaPlaceholder } from '../../lib/queries';

export default function MediaPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [prompt, setPrompt] = useState('');
  const [url, setUrl] = useState('');

  const load = async () => {
    setRows(await fetchMediaAssets());
  };

  useEffect(() => {
    void load();
  }, []);

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    await generateMediaPlaceholder({ prompt: prompt.trim() });
    setPrompt('');
    await load();
  };

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    await uploadMediaPlaceholder({ sourceUrl: url.trim() });
    setUrl('');
    await load();
  };

  return (
    <WorkbenchShell title="Image & Media Center" description="上传媒体与 AI 配图生成占位">
      <form onSubmit={generate} className="flex flex-wrap gap-2 rounded-lg border border-gray-200 p-3">
        <input
          className="min-w-[280px] flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="输入配图 prompt（如：科技感太空轨道插画）"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button className="rounded bg-gray-900 px-3 py-2 text-sm text-white">生成占位图任务</button>
      </form>

      <form onSubmit={upload} className="flex flex-wrap gap-2 rounded-lg border border-gray-200 p-3">
        <input
          className="min-w-[280px] flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="粘贴外部图片 URL（http://localhost 可用）"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="rounded border border-gray-300 px-3 py-2 text-sm">上传占位资源</button>
      </form>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm font-medium">{row.name || row.id}</p>
            <p className="text-xs text-gray-500">
              {row.sourceType} · {row.status}
            </p>
            <p className="mt-1 break-all text-xs text-gray-600">{row.outputUrl || row.sourceUrl || '—'}</p>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}

