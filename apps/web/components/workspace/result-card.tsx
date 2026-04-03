'use client';

import { CheckCircle2, Copy, Eye, RefreshCw, Send, Twitter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export type PackageResult = {
  tweet: string;
  charCount: number;
  imageKeywords: string[];
  variants: { tone: string; text: string }[];
};

type ResultCardProps = {
  result: PackageResult;
  generationId: string | null;
  onPublish: () => Promise<void>;
  onRegenerate: () => void;
  publishBusy?: boolean;
};

const TONE_LABELS: Record<string, string> = {
  formal: '正式版',
  casual: '随性版'
};

export function ResultCard({
  result,
  generationId,
  onPublish,
  onRegenerate,
  publishBusy
}: ResultCardProps) {
  const [tab, setTab] = useState<'main' | string>('main');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const displayText = useMemo(() => {
    if (tab === 'main') return result.tweet;
    const v = result.variants?.find((x) => x.tone === tab);
    return v?.text ?? result.tweet;
  }, [result, tab]);

  const count = [...displayText].length;
  const over = count > 280;

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2000);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(displayText);
      setCopied(true);
      showToast('已复制!');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast('复制失败');
    }
  };

  const pills: { id: 'main' | string; label: string }[] = [
    { id: 'main', label: '主版本' },
    ...(result.variants ?? []).map((v) => ({
      id: v.tone,
      label: TONE_LABELS[v.tone] ?? v.tone
    }))
  ];

  return (
    <div className="relative mt-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {pills.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {pills.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setTab(p.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                tab === p.id
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-md transition-shadow hover:shadow-lg">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-gray-500">
            <Eye className="h-4 w-4" />
            <Twitter className="h-4 w-4" />
            <span className="text-xs">预览</span>
          </div>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              over ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
            )}
          >
            {count} / 280
          </span>
        </div>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900">{displayText}</p>

        {result.imageKeywords?.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="mb-2 text-xs font-semibold text-gray-500">配图关键词</p>
            <div className="flex flex-wrap gap-2">
              {result.imageKeywords.map((k) => (
                <span
                  key={k}
                  className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="flex-1 gap-2" onClick={copy}>
            {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            复制推文
          </Button>
          <Button
            type="button"
            className="flex-1 gap-2"
            onClick={async () => {
              try {
                await onPublish();
                showToast('发布成功');
              } catch (e) {
                showToast(e instanceof Error ? e.message : '发布失败');
              }
            }}
            disabled={!generationId || publishBusy}
          >
            {publishBusy ? (
              <span className="text-xs">发布中…</span>
            ) : (
              <>
                <Send className="h-4 w-4" />
                一键发布到 X
              </>
            )}
          </Button>
          <Button type="button" variant="secondary" className="flex-1 gap-2" onClick={onRegenerate}>
            <RefreshCw className="h-4 w-4" />
            重新生成
          </Button>
        </div>
      </div>
    </div>
  );
}
