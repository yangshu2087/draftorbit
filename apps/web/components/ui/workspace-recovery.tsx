'use client';

import { AppError, getErrorMessage, isAppError } from '../../lib/api';
import { bootstrapWorkspace } from '../../lib/queries';
import { Button } from './button';
import { useToast } from './toast';

export function isWorkspaceMissing(error: unknown): boolean {
  if (!isAppError(error)) return false;
  return error.code === 'WORKSPACE_NOT_FOUND' || error.message.includes('工作区');
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
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-800">当前账号还没有可用工作区</p>
      <p className="mt-1 text-sm text-amber-700">点击下方按钮自动补建一个默认工作区，继续后续操作。</p>
      <Button size="sm" className="mt-3 bg-amber-600 hover:bg-amber-700" onClick={recover}>
        立即创建工作区
      </Button>
    </div>
  );
}

export function normalizeErrorMessage(error: unknown) {
  if (error instanceof AppError) return error.message;
  return getErrorMessage(error);
}
