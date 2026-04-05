'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { DraftEntity } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { naturalizePreview, fetchDrafts } from '../../lib/queries';

const TONE_OPTIONS = ['专业清晰', '口语亲和', '观点锋利'] as const;
const STRICTNESS_OPTIONS = [
  { value: 'low', label: '轻润色' },
  { value: 'medium', label: '标准' },
  { value: 'high', label: '强去 AI 味' }
] as const;

export default function NaturalizationPage() {
  const [rows, setRows] = useState<DraftEntity[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualText, setManualText] = useState('');
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number]>('专业清晰');
  const [strictness, setStrictness] = useState<(typeof STRICTNESS_OPTIONS)[number]['value']>('medium');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const draftRows = await fetchDrafts({ pageSize: 50 });
        setRows(draftRows);
        const first = draftRows.find((item) => Boolean(item.latestContent)) ?? draftRows[0];
        if (first) {
          setSelectedDraftId(first.id);
        }
      } catch {
        setRows([]);
      }
    })();
  }, []);

  const selectedDraftText = useMemo(() => {
    const found = rows.find((item) => item.id === selectedDraftId);
    return found?.latestContent?.trim() ?? '';
  }, [rows, selectedDraftId]);

  const textForPreview = useMemo(() => {
    const fromManual = manualText.trim();
    if (advancedOpen && fromManual) return fromManual;
    return selectedDraftText;
  }, [advancedOpen, manualText, selectedDraftText]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!textForPreview) return;
    setLoading(true);
    try {
      const data = await naturalizePreview({
        text: textForPreview,
        tone,
        strictness
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <WorkbenchShell title="自然润色" description="优先选择草稿来源与润色强度，再执行去 AI 味处理。">
      <form onSubmit={submit} className="do-panel grid gap-2.5 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={selectedDraftId}
            onChange={(e) => setSelectedDraftId(e.target.value)}
            disabled={loading || rows.length === 0}
          >
            {rows.length === 0 ? <option value="">暂无可选草稿</option> : null}
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                来源草稿：{row.title || row.id.slice(0, 8)}
              </option>
            ))}
          </select>

          <select value={tone} onChange={(e) => setTone(e.target.value as (typeof TONE_OPTIONS)[number])} disabled={loading}>
            {TONE_OPTIONS.map((item) => (
              <option key={item} value={item}>
                语气：{item}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {STRICTNESS_OPTIONS.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`rounded-full border px-3 py-1 text-xs transition ${
                strictness === item.value
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
              }`}
              onClick={() => setStrictness(item.value)}
              disabled={loading}
            >
              {item.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="w-fit text-xs font-medium text-slate-600 underline underline-offset-2"
          onClick={() => setAdvancedOpen((v) => !v)}
          disabled={loading}
        >
          {advancedOpen ? '收起高级输入' : '展开高级输入（可选手工文本）'}
        </button>

        {advancedOpen ? (
          <textarea
            rows={5}
            placeholder="可选：手工粘贴需要润色的文本。留空时使用所选草稿内容。"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            disabled={loading}
          />
        ) : null}

        <div className="rounded-xl border border-slate-900/10 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          当前输入来源：{advancedOpen && manualText.trim() ? '高级手工文本' : '所选草稿'}
        </div>

        <button className="w-fit rounded-xl bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60" disabled={loading || !textForPreview}>
          {loading ? '处理中...' : '执行自然化'}
        </button>
      </form>

      {result ? (
        <div className="grid gap-2">
          <Result label="规则预处理" value={result.normalized} />
          <Result label="自然化输出" value={result.rewritten} />
          <Result label="润色模式" value={String(result.mode ?? '标准润色')} />
        </div>
      ) : null}
    </WorkbenchShell>
  );
}

function Result(props: { label: string; value: string }) {
  return (
    <div className="do-card-compact">
      <p className="text-xs text-slate-500">{props.label}</p>
      <pre className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{props.value}</pre>
    </div>
  );
}
