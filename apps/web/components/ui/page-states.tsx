import { ReactNode } from 'react';
import { Button } from './button';

export function LoadingState(props: { label?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
      {props.label ?? '加载中...'}
    </div>
  );
}

export function EmptyState(props: {
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
      <p className="text-sm font-semibold text-gray-900">{props.title}</p>
      {props.description ? <p className="mt-1 text-sm text-gray-500">{props.description}</p> : null}
      {props.onAction && props.actionText ? (
        <Button className="mt-4" size="sm" onClick={props.onAction}>
          {props.actionText}
        </Button>
      ) : null}
      {props.extra ? <div className="mt-3">{props.extra}</div> : null}
    </div>
  );
}

export function ErrorState(props: {
  title?: string;
  message: string;
  actionText?: string;
  onAction?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-700">{props.title ?? '操作失败'}</p>
      <p className="mt-1 text-sm text-red-700">{props.message}</p>
      {props.onAction && props.actionText ? (
        <Button variant="outline" size="sm" className="mt-3 border-red-300 bg-white" onClick={props.onAction}>
          {props.actionText}
        </Button>
      ) : null}
      {props.extra ? <div className="mt-3">{props.extra}</div> : null}
    </div>
  );
}
