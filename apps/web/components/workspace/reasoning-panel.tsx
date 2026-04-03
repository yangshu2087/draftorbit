'use client';

import { CheckCircle2, ChevronDown, Loader2, Sparkles, XCircle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';

export const STEP_ORDER = [
  'HOTSPOT',
  'OUTLINE',
  'DRAFT',
  'HUMANIZE',
  'IMAGE',
  'PACKAGE'
] as const;

export type StepKey = (typeof STEP_ORDER)[number] | 'error';

export const STEP_LABELS: Record<string, string> = {
  HOTSPOT: '热点追踪',
  OUTLINE: '结构大纲',
  DRAFT: '草稿生成',
  HUMANIZE: '去AI痕迹',
  IMAGE: '配图建议',
  PACKAGE: '发布包',
  error: '错误'
};

export type StepRow = {
  step: StepKey;
  status: 'pending' | 'running' | 'done' | 'failed';
  content?: string;
};

type ReasoningPanelProps = {
  steps: StepRow[];
  isGenerating: boolean;
};

export function ReasoningPanel({ steps, isGenerating }: ReasoningPanelProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggle = (key: string) => {
    setOpen((o) => ({ ...o, [key]: !o[key] }));
  };

  if (!isGenerating && steps.length === 0) return null;

  return (
    <div className="mt-8 rounded-2xl border border-gray-100 bg-gray-50/50 p-6 shadow-sm transition-all">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
        <Sparkles className="h-4 w-4 text-blue-600" />
        推理过程
      </div>
      <ul className="space-y-2">
        {steps.map((row, i) => {
          const key = `${row.step}-${i}`;
          const label = STEP_LABELS[row.step] ?? row.step;
          const expanded = open[row.step] ?? false;
          const hasContent = Boolean(row.content?.trim());

          return (
            <li
              key={key}
              className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm transition-all duration-300 animate-do-fade-up"
              style={{ animationDelay: `${Math.min(i, 6) * 80}ms` }}
            >
              <button
                type="button"
                onClick={() => hasContent && toggle(row.step)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left text-sm',
                  hasContent && 'cursor-pointer hover:bg-gray-50'
                )}
                disabled={!hasContent}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {row.step === 'error' ? '⚠️' : '✦'}
                </span>
                <span className="flex-1 font-medium text-gray-900">{label}</span>
                <span className="flex items-center gap-2">
                  {row.status === 'running' && (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600" />
                      </span>
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                    </>
                  )}
                  {row.status === 'done' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                  {row.status === 'failed' && <XCircle className="h-5 w-5 text-red-500" />}
                  {row.status === 'pending' && (
                    <span className="h-2 w-2 rounded-full bg-gray-200" aria-hidden />
                  )}
                  {hasContent && (
                    <ChevronDown
                      className={cn('h-4 w-4 text-gray-400 transition-transform', expanded && 'rotate-180')}
                    />
                  )}
                </span>
              </button>
              {hasContent && expanded && (
                <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-3 text-xs leading-relaxed text-gray-600 whitespace-pre-wrap">
                  {row.content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
