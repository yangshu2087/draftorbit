'use client';

import { Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { cn } from '../../lib/utils';

const TYPE_LABELS: Record<string, string> = {
  TWEET: '单条',
  THREAD: '串',
  LONG: '长文'
};

export type HistoryItem = {
  id: string;
  prompt: string;
  type: string;
  createdAt: string;
  status?: string;
};

type HistoryListProps = {
  items: HistoryItem[];
  loading?: boolean;
  activeId?: string | null;
  onSelect: (id: string) => void;
  className?: string;
};

export function HistoryList({ items, loading, activeId, onSelect, className }: HistoryListProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
        <Clock className="h-3.5 w-3.5" />
        历史记录
      </div>
      <div className="flex max-h-[calc(100vh-8rem)] flex-col gap-2 overflow-y-auto pr-1">
        {loading && (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {!loading && items.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-slate-400">暂无记录</p>
        )}
        {!loading &&
          items.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onSelect(h.id)}
              className={cn(
                'rounded-xl border px-3 py-3 text-left text-sm transition-all',
                activeId === h.id
                  ? 'border-slate-900/20 bg-slate-100/80 shadow-sm'
                  : 'border-slate-900/8 bg-white shadow-sm hover:border-slate-900/12 hover:bg-slate-50/70'
              )}
            >
              <p className="line-clamp-2 text-slate-800">{h.prompt}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>
                  {format(new Date(h.createdAt), 'M月d日 HH:mm', { locale: zhCN })}
                </span>
                <span className="rounded-md border border-slate-900/10 bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                  {TYPE_LABELS[h.type] ?? h.type}
                </span>
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}
