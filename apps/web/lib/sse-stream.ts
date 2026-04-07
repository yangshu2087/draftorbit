import { getToken, sseUrl } from './api';

export async function fetchGenerationStream(
  generationId: string,
  onEvent: (data: { step: string; status: string; content?: string }) => void
): Promise<void> {
  const token = getToken();
  if (!token) throw new Error('未登录');

  const res = await fetch(sseUrl(`/v2/generate/${generationId}/stream`), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream'
    },
    cache: 'no-store'
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
          const parsed = JSON.parse(raw) as { step: string; status: string; content?: string };
          onEvent(parsed);
        } catch {
          // ignore malformed chunks
        }
      }
    }
  }
}
