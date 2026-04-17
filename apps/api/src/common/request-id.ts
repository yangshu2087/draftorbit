import { randomUUID } from 'node:crypto';

type HeaderBag = Record<string, string | string[] | undefined>;

type RequestLike = {
  headers?: HeaderBag;
  requestId?: string;
};

type ResponseLike = {
  setHeader?: (name: string, value: string) => void;
};

function readRequestIdFromHeaders(headers?: HeaderBag): string | undefined {
  if (!headers) return undefined;
  const value = headers['x-request-id'] ?? headers['X-Request-Id'];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function ensureRequestId(req: RequestLike, res?: ResponseLike): string {
  const existing = req.requestId || readRequestIdFromHeaders(req.headers);
  const requestId = existing || randomUUID();
  req.requestId = requestId;
  res?.setHeader?.('x-request-id', requestId);
  return requestId;
}

export function getRequestId(req: RequestLike): string {
  if (req.requestId) return req.requestId;
  return ensureRequestId(req);
}

