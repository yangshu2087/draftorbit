'use client';

import { FormEvent, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { naturalizePreview } from '../../lib/queries';

export default function NaturalizationPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    try {
      const data = await naturalizePreview({
        text: text.trim(),
        strictness: 'medium'
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <WorkbenchShell title="Naturalization Layer" description="规则 + 模型接口去 AI 味预览">
      <form onSubmit={submit} className="grid gap-2 rounded-lg border border-gray-200 p-3">
        <textarea
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          rows={6}
          placeholder="输入待自然化的草稿文本"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="w-fit rounded bg-gray-900 px-3 py-2 text-sm text-white">
          {loading ? '处理中...' : '执行自然化'}
        </button>
      </form>

      {result ? (
        <div className="grid gap-2">
          <Result label="规则预处理" value={result.normalized} />
          <Result label="自然化输出" value={result.rewritten} />
          <Result
            label="Provider"
            value={`${result.provider?.type ?? '-'} / ${result.provider?.model ?? '-'} / fallback=${String(result.provider?.fallbackUsed)}`}
          />
        </div>
      ) : null}
    </WorkbenchShell>
  );
}

function Result(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-gray-500">{props.label}</p>
      <pre className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{props.value}</pre>
    </div>
  );
}

