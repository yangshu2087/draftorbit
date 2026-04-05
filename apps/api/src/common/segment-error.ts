import { HttpException, HttpStatus } from '@nestjs/common';

export type SegmentError = {
  segment: string;
  code: string;
  message: string;
  statusCode: number;
};

function defaultCodeByStatus(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) return 'BAD_REQUEST';
  if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED';
  if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN';
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (status === HttpStatus.CONFLICT) return 'CONFLICT';
  if (status >= 500) return 'INTERNAL_SERVER_ERROR';
  return 'UNKNOWN_ERROR';
}

function normalizeMessage(input: unknown): string {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input.filter((x): x is string => typeof x === 'string').join('；') || '请求失败';
  }
  return '请求失败';
}

export function toSegmentError(segment: string, error: unknown): SegmentError {
  if (error instanceof HttpException) {
    const statusCode = error.getStatus();
    const response = error.getResponse();
    const responseObj =
      response && typeof response === 'object' ? (response as Record<string, unknown>) : null;
    const code =
      (typeof responseObj?.code === 'string' && responseObj.code) || defaultCodeByStatus(statusCode);
    const message = normalizeMessage(
      responseObj?.message ?? (typeof response === 'string' ? response : error.message)
    );
    return { segment, code, message, statusCode };
  }

  const fallbackMessage =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '请求失败';

  return {
    segment,
    code: 'INTERNAL_SERVER_ERROR',
    message: fallbackMessage,
    statusCode: 500
  };
}

