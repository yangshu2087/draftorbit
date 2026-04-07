'use client';

import { CheckCircle2, Copy, Eye, RefreshCw, Send, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { XLogo } from '../icons/x-logo';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export type PackageResult = {
  tweet: string;
  charCount: number;
  imageKeywords: string[];
  variants: { tone: string; text: string }[];
  quality?: {
    readability: number;
    density: number;
    platformFit: number;
    aiTrace: number;
    total: number;
  };
  routing?: {
    trialMode: boolean;
    primaryModel: string;
    routingTier: string;
  };
  budget?: {
    ratio: number;
    conservativeMode: boolean;
  };
  stepLatencyMs?: Record<
    'research' | 'outline' | 'draft' | 'humanize' | 'media' | 'package',
    number | null
  >;
  stepExplain?: Record<'research' | 'outline' | 'draft' | 'humanize' | 'media' | 'package', string>;
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

function qualityBadge(score?: number) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return { label: '未知', tone: 'bg-slate-100 text-slate-600' };
  }
  if (score >= 82) return { label: '优秀', tone: 'bg-emerald-100 text-emerald-800' };
  if (score >= 72) return { label: '可发布', tone: 'bg-blue-100 text-blue-800' };
  if (score >= 60) return { label: '需润色', tone: 'bg-amber-100 text-amber-800' };
  return { label: '建议重写', tone: 'bg-red-100 text-red-700' };
}

function formatLatency(ms: number | null | undefined) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(ms > 8000 ? 0 : 1)}s`;
}

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
  const quality = result.quality;
  const qualityState = qualityBadge(quality?.total);
  const latencyRows = Object.entries(result.stepLatencyMs ?? {}) as Array<
    [keyof NonNullable<PackageResult['stepLatencyMs']>, number | null]
  >;
  const bottleneck = latencyRows
    .filter(([, value]) => typeof value === 'number')
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];

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
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
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
                  ? 'border-slate-900/30 bg-slate-100 text-slate-900'
                  : 'border-slate-900/10 bg-white text-slate-600 hover:bg-slate-50'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="do-panel p-5 transition-shadow hover:shadow-lg">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-500">
            <Eye className="h-4 w-4" />
            <XLogo className="h-3.5 w-3.5" />
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
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-900">{displayText}</p>

        {(result.quality || result.routing || result.budget) && (
          <div className="mt-5 grid gap-3 border-t border-slate-900/8 pt-4 sm:grid-cols-2">
            {result.quality ? (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500">质量评分</p>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[11px] font-medium',
                      qualityState.tone
                    )}
                  >
                    {qualityState.label}
                  </span>
                </div>
                <div className="text-xl font-bold text-slate-900">{result.quality.total.toFixed(1)}</div>
                <p className="mt-1 text-xs text-slate-500">
                  可读性 {result.quality.readability.toFixed(0)} · 观点密度{' '}
                  {result.quality.density.toFixed(0)} · 平台适配 {result.quality.platformFit.toFixed(0)}
                </p>
              </div>
            ) : null}

            {(result.routing || result.budget) && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-500">模型与成本</p>
                {result.routing ? (
                  <p className="mt-1 text-xs text-slate-700">
                    路由层级：{result.routing.routingTier} · 模型：{result.routing.primaryModel}
                    {result.routing.trialMode ? ' · 试用高阶策略' : ''}
                  </p>
                ) : null}
                {result.budget ? (
                  <p className="mt-1 text-xs text-slate-700">
                    月预算占用：{Math.max(0, result.budget.ratio * 100).toFixed(1)}%
                    {result.budget.conservativeMode ? ' · 已启用保守路由' : ''}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}

        {latencyRows.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Timer className="h-4 w-4 text-slate-500" />
              <p className="text-xs font-semibold text-slate-500">步骤耗时</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {latencyRows.map(([step, ms]) => (
                <span
                  key={step}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                >
                  {step}: {formatLatency(ms)}
                </span>
              ))}
            </div>
            {bottleneck ? (
              <p className="mt-2 text-xs text-slate-500">
                当前瓶颈：{bottleneck[0]}（{formatLatency(bottleneck[1])}）
              </p>
            ) : null}
          </div>
        )}

        {result.imageKeywords?.length > 0 && (
          <div className="mt-5 border-t border-slate-900/8 pt-4">
            <p className="mb-2 text-xs font-semibold text-slate-500">配图关键词</p>
            <div className="flex flex-wrap gap-2">
              {result.imageKeywords.map((k) => (
                <span
                  key={k}
                  className="rounded-md border border-slate-900/8 bg-slate-100 px-2 py-1 text-xs text-slate-700"
                >
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
          下一步建议：
          {over
            ? ' 当前字数超过 280，建议切换“推文串”或先精简再发布。'
            : (result.quality?.total ?? 100) < 72
              ? ' 质量分偏低，建议点击“重新生成”获得更优版本后再发布。'
              : ' 已满足发布门槛，建议人工确认后发布。'}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="flex-1 gap-2" onClick={copy}>
            {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            复制推文
          </Button>
          <Button
            type="button"
            className="flex-1 gap-2"
            onClick={async () => {
              if (over) {
                showToast('字数超过 280，建议改为推文串后再发布');
                return;
              }
              if (!window.confirm('确认发布到 X？建议先人工复核内容和账号。')) {
                return;
              }
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
