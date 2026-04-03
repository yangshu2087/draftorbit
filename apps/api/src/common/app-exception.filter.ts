import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type ErrorEnvelope = {
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
  statusCode: number;
  timestamp: string;
  path: string;
};

function defaultCodeByStatus(status: number): string {
  if (status === HttpStatus.BAD_REQUEST) return 'BAD_REQUEST';
  if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED';
  if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN';
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (status === HttpStatus.CONFLICT) return 'CONFLICT';
  if (status === HttpStatus.TOO_MANY_REQUESTS) return 'TOO_MANY_REQUESTS';
  if (status >= 500) return 'INTERNAL_SERVER_ERROR';
  return 'UNKNOWN_ERROR';
}

function normalizeMessage(input: unknown): string {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    const joined = input.filter((x) => typeof x === 'string').join('；');
    return joined || '请求失败';
  }
  return '请求失败';
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<any>();
    const request = ctx.getRequest<any>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const rawObject =
      rawResponse && typeof rawResponse === 'object' ? (rawResponse as Record<string, unknown>) : null;

    const responseCode = typeof rawObject?.code === 'string' ? rawObject.code : undefined;
    const code =
      responseCode ??
      (exception instanceof HttpException ? defaultCodeByStatus(status) : 'INTERNAL_SERVER_ERROR');

    const message = normalizeMessage(
      rawObject?.message ?? (typeof rawResponse === 'string' ? rawResponse : undefined) ??
        (exception instanceof Error ? exception.message : undefined)
    );

    const details =
      rawObject?.details ??
      (rawObject && 'message' in rawObject && Array.isArray(rawObject.message)
        ? { validationErrors: rawObject.message }
        : undefined);

    const requestIdHeader = request.headers['x-request-id'];
    const requestId =
      (typeof requestIdHeader === 'string' && requestIdHeader) ||
      (Array.isArray(requestIdHeader) ? requestIdHeader[0] : '') ||
      randomUUID();

    response.setHeader('x-request-id', requestId);

    const payload: ErrorEnvelope = {
      code,
      message,
      details,
      requestId,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url
    };

    response.status(status).json(payload);
  }
}
