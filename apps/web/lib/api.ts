export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers ?? {});
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  if (!headers.has('Content-Type') && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      cache: 'no-store'
    });
  } catch (error) {
    throw new AppError({
      message: '网络连接失败，请检查 API 服务是否启动',
      code: 'NETWORK_ERROR',
      statusCode: 0,
      raw: error
    });
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await response.json().catch(() => null) : await response.text().catch(() => '');

  if (!response.ok) {
    throw toAppError(response.status, body, `请求失败（${response.status}）`);
  }

  if (!isJson) {
    return body as T;
  }

  return body as T;
}

export function sseUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
