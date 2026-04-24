import { getToken, sseUrl } from './api';

export type V3StreamEvent = {
  stage: string;
  label: string;
  status: 'running' | 'done' | 'failed';
  summary?: string;
  requestId?: string;
};

export async function fetchRunStream(
  runId: string,
  onEvent: (data: V3StreamEvent) => void,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('未登录');

  const res = await fetch(sseUrl(`/v3/chat/runs/${runId}/stream`), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream'
    },
    cache: 'no-store',
    signal: options?.signal
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `流连接失败: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('无法读取响应流');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of block.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const raw = trimmed.slice(5).trim();
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as V3StreamEvent;
          onEvent(parsed);
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }
}
