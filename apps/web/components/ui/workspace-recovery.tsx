'use client';

import { AppError, getErrorMessage, isAppError } from '../../lib/api';
import { bootstrapWorkspace } from '../../lib/queries';
import { Button } from './button';
import { useToast } from './toast';
import Link from 'next/link';

export function isWorkspaceMissing(error: unknown): boolean {
  if (!isAppError(error)) return false;
  return error.code === 'WORKSPACE_NOT_FOUND' || error.message.includes('工作区');
}

export function isAuthMissing(error: unknown): boolean {
  if (!isAppError(error)) return false;
  return error.code === 'UNAUTHORIZED' || error.statusCode === 401;
}

export function WorkspaceRecovery(props: { onRecovered?: () => Promise<void> | void }) {
  const { pushToast } = useToast();

  const recover = async () => {
    try {
      await bootstrapWorkspace();
      pushToast({ title: '已创建默认工作区', variant: 'success' });
      await props.onRecovered?.();
    } catch (error) {
      pushToast({ title: '创建工作区失败', description: getErrorMessage(error), variant: 'error' });
    }
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/85 p-4">
      <p className="text-sm font-semibold text-amber-800">当前账号还没有可用工作区</p>
      <p className="mt-1 text-sm leading-6 text-amber-700">点击下方按钮自动补建一个默认工作区，继续后续操作。</p>
      <Button size="sm" className="mt-3 bg-amber-600 hover:bg-amber-700" onClick={recover}>
        立即创建工作区
      </Button>
    </div>
  );
}

export function normalizeErrorMessage(error: unknown) {
  if (error instanceof AppError) {
    if (error.requestId) {
      return `${error.message}（请求ID: ${error.requestId}）`;
    }
    return error.message;
  }
  return getErrorMessage(error);
}

export function AuthRecovery() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/85 p-4">
      <p className="text-sm font-semibold text-amber-800">登录状态已失效</p>
      <p className="mt-1 text-sm leading-6 text-amber-700">
        请先返回首页重新完成登录，再继续当前流程。
      </p>
      <Button asChild size="sm" className="mt-3 bg-amber-600 hover:bg-amber-700">
        <Link href="/">返回首页登录</Link>
      </Button>
    </div>
  );
}

export function buildRecoveryExtra(
  error: unknown,
  onRecovered?: () => Promise<void> | void
) {
  if (isAuthMissing(error)) {
    return <AuthRecovery />;
  }
  if (isWorkspaceMissing(error)) {
    return <WorkspaceRecovery onRecovered={onRecovered} />;
  }
  return undefined;
}
