export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const DEFAULT_API_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? 12000);

const PUBLIC_API_PREFIXES = new Set([
  '/billing/plans',
  '/auth/x/authorize',
  '/auth/google/authorize',
  '/auth/local/session'
]);

export type AppErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  statusCode?: number;
};

export class AppError extends Error {
  code: string;
  statusCode: number;
  requestId?: string;
  details?: unknown;
  raw?: unknown;

  constructor(input: {
    message: string;
    code?: string;
    statusCode?: number;
    requestId?: string;
    details?: unknown;
    raw?: unknown;
  }) {
    super(input.message);
    this.name = 'AppError';
    this.code = input.code ?? 'UNKNOWN_ERROR';
    this.statusCode = input.statusCode ?? 500;
    this.requestId = input.requestId;
    this.details = input.details;
    this.raw = input.raw;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function getErrorMessage(error: unknown, fallback = '请求失败，请稍后重试'): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('draftorbit_token');
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('draftorbit_token', token);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('draftorbit_token');
}

export function getUserFromToken(): { userId: string; handle: string; plan: string } | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return { userId: payload.userId, handle: payload.handle, plan: payload.plan };
  } catch {
    return null;
  }
}

function normalizeTimeoutMs(input?: number): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return DEFAULT_API_TIMEOUT_MS;
  return Math.min(Math.max(Math.round(input), 1000), 60000);
}

function normalizePath(path: string): string {
  const withoutQuery = path.split('?')[0] ?? path;
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}

function isPublicApiPath(path: string): boolean {
  return PUBLIC_API_PREFIXES.has(normalizePath(path));
}

function isAbortLikeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { name?: string; message?: string };
  return maybe.name === 'AbortError' || maybe.message?.toLowerCase().includes('aborted') === true;
}

function toAppError(status: number, body: unknown, fallbackMessage: string): AppError {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    const message =
      typeof obj.message === 'string'
        ? obj.message
        : Array.isArray(obj.message)
          ? obj.message.join('；')
          : fallbackMessage;

    return new AppError({
      message,
      code: typeof obj.code === 'string' ? obj.code : undefined,
      statusCode: typeof obj.statusCode === 'number' ? obj.statusCode : status,
      requestId: typeof obj.requestId === 'string' ? obj.requestId : undefined,
      details: obj.details,
      raw: body
    });
  }

  if (typeof body === 'string') {
    return new AppError({
      message: body || fallbackMessage,
      statusCode: status,
      raw: body
    });
  }

  return new AppError({
    message: fallbackMessage,
    statusCode: status,
    raw: body
  });
}

type ApiFetchInit = RequestInit & {
  timeoutMs?: number;
};

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const token = getToken();
  if (!token && !isPublicApiPath(path)) {
    throw new AppError({
      message: '未登录，请先回首页完成登录后再继续。',
      code: 'UNAUTHORIZED',
      statusCode: 401
    });
  }

  const headers = new Headers(init?.headers ?? {});
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  if (!headers.has('Content-Type') && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const timeoutMs = normalizeTimeoutMs(init?.timeoutMs);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    const { timeoutMs: _ignoredTimeout, ...fetchInit } = init ?? {};
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchInit,
      headers,
      cache: 'no-store',
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);
    if (isAbortLikeError(error)) {
      throw new AppError({
        message: `请求超时（>${timeoutMs}ms），请稍后重试`,
        code: 'REQUEST_TIMEOUT',
        statusCode: 408,
        raw: error
      });
    }

    throw new AppError({
      message: '网络连接失败，请检查服务是否启动',
      code: 'NETWORK_ERROR',
      statusCode: 0,
      raw: error
    });
  } finally {
    clearTimeout(timer);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await response.json().catch(() => null) : await response.text().catch(() => '');

  if (!response.ok) {
    const requestId = response.headers.get('x-request-id') ?? undefined;
    const appError = toAppError(response.status, body, `请求失败（${response.status}）`);
    if (!appError.requestId && requestId) {
      appError.requestId = requestId;
    }
    throw appError;
  }

  if (!isJson) {
    return body as T;
  }

  return body as T;
}

export function sseUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
