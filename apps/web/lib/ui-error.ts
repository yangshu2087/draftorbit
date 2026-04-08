import { AppError, isAppError } from './api';

export type UiError = {
  message: string;
  requestId?: string;
  nextAction?: string;
  blockingReason?: string;
};

function extractStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function toUiError(error: unknown, fallback = '请求失败，请稍后重试'): UiError {
  if (isAppError(error)) {
    const details = error.details && typeof error.details === 'object'
      ? (error.details as Record<string, unknown>)
      : null;
    return {
      message: error.message || fallback,
      requestId: error.requestId,
      nextAction: details ? extractStringField(details, 'nextAction') : undefined,
      blockingReason: details ? extractStringField(details, 'blockingReason') : undefined
    };
  }

  if (error instanceof Error) {
    return { message: error.message || fallback };
  }

  return { message: fallback };
}

export function toErrorSummary(error: UiError | null): string | null {
  if (!error) return null;
  const chunks = [error.message];
  if (error.requestId) chunks.push(`requestId: ${error.requestId}`);
  if (error.blockingReason) chunks.push(`阻塞原因: ${error.blockingReason}`);
  return chunks.join(' · ');
}
