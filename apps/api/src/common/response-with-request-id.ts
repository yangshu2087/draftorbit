import { getRequestId } from './request-id';

export function withRequestId<T>(req: any, payload: T): T & { requestId: string } {
  const requestId = getRequestId(req);

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      ...(payload as Record<string, unknown>),
      requestId
    } as unknown as T & { requestId: string };
  }

  return {
    requestId,
    data: payload
  } as unknown as T & { requestId: string };
}
