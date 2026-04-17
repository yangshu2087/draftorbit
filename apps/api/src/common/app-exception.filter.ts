import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import { getRequestId } from './request-id';
import { CodexLocalServiceError } from './codex-local.service';

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

function hasVisualRequestValidationError(input: unknown): boolean {
  if (!Array.isArray(input)) return false;
  return input.some((item) => typeof item === 'string' && /visualRequest|mode must be|style must be|layout must be|aspect must be|palette must be/iu.test(item));
}

function statusForCodexLocalError(error: CodexLocalServiceError): number {
  if (error.code === 'CODEX_LOCAL_BUSY') return HttpStatus.TOO_MANY_REQUESTS;
  if (error.code === 'CODEX_LOCAL_TIMEOUT') return HttpStatus.GATEWAY_TIMEOUT;
  return 424;
}

@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<any>();
    const request = ctx.getRequest<any>();

    const status =
      exception instanceof CodexLocalServiceError
        ? statusForCodexLocalError(exception)
        : exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const rawObject =
      rawResponse && typeof rawResponse === 'object' ? (rawResponse as Record<string, unknown>) : null;

    const responseCode =
      exception instanceof CodexLocalServiceError
        ? exception.code
        : typeof rawObject?.code === 'string'
          ? rawObject.code
          : undefined;
    const code =
      responseCode ??
      (status === HttpStatus.BAD_REQUEST && hasVisualRequestValidationError(rawObject?.message)
        ? 'INVALID_VISUAL_REQUEST'
        : exception instanceof HttpException
          ? defaultCodeByStatus(status)
          : 'INTERNAL_SERVER_ERROR');

    const message = normalizeMessage(
      rawObject?.message ?? (typeof rawResponse === 'string' ? rawResponse : undefined) ??
        (exception instanceof Error ? exception.message : undefined)
    );

    const details =
      (exception instanceof CodexLocalServiceError ? exception.details : undefined) ??
      rawObject?.details ??
      (rawObject && 'message' in rawObject && Array.isArray(rawObject.message)
        ? { validationErrors: rawObject.message }
        : undefined);

    const requestId = getRequestId(request);

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
