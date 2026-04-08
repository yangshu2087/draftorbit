'use client';

import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from './button';
import type { UiError } from '../../lib/ui-error';

function nextActionLabel(nextAction?: string) {
  if (!nextAction) return null;
  const mapping: Record<string, string> = {
    connect_x_self: '先连接自己的 X 账号',
    connect_learning_source: '先补充学习来源',
    run_first_generation: '先运行一次生成',
    watch_generation: '等待当前生成完成后再试',
    confirm_publish: '确认账号后继续发布',
    open_queue: '前往 Queue 查看状态'
  };
  return mapping[nextAction] ?? nextAction;
}

export function LoadingState(props: { title?: string; description?: string }) {
  return (
    <div className="do-panel rounded-2xl p-5 text-sm text-slate-600">
      <div className="flex items-center gap-2 font-medium text-slate-800">
        <Loader2 className="h-4 w-4 animate-spin" />
        {props.title ?? '正在加载'}
      </div>
      {props.description ? <p className="mt-2 text-xs text-slate-500">{props.description}</p> : null}
    </div>
  );
}

export function EmptyState(props: { title: string; description: string; actionLabel?: string; actionHref?: string }) {
  return (
    <div className="do-panel rounded-2xl border-dashed p-5 text-sm text-slate-700">
      <div className="font-semibold text-slate-900">{props.title}</div>
      <p className="mt-2 text-xs text-slate-500">{props.description}</p>
      {props.actionLabel && props.actionHref ? (
        <Button asChild size="sm" className="mt-3">
          <Link href={props.actionHref}>{props.actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState(props: {
  error: UiError;
  onRetry?: () => void;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">操作未完成</p>
          <p className="mt-1 break-words text-xs leading-5">
            {props.error.message}
            {props.error.requestId ? `（requestId: ${props.error.requestId}）` : ''}
          </p>
          {props.error.blockingReason ? (
            <p className="mt-1 text-xs">阻塞原因：{props.error.blockingReason}</p>
          ) : null}
          {props.error.nextAction ? (
            <p className="mt-1 text-xs">建议下一步：{nextActionLabel(props.error.nextAction)}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {props.onRetry ? (
              <Button size="sm" variant="destructive" onClick={props.onRetry}>
                立即重试
              </Button>
            ) : null}
            {props.actionHref && props.actionLabel ? (
              <Button asChild size="sm" variant="outline">
                <Link href={props.actionHref}>{props.actionLabel}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SuccessNotice(props: { message: string }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        <span>{props.message}</span>
      </div>
    </div>
  );
}
