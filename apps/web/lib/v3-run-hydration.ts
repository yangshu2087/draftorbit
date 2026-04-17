import type { V3RunResponse } from './queries';
import type { V3StreamEvent } from './sse-stream';

export function shouldHydrateRunDetail(event: V3StreamEvent): boolean {
  const stage = String(event.stage ?? '').toLowerCase();
  const status = String(event.status ?? '').toLowerCase();
  const summary = String(event.summary ?? '').toLowerCase();

  if (status !== 'done') return false;
  if (stage === 'publish_prep' || stage === 'package' || stage === 'done' || stage === 'completed') return true;
  return summary.includes('结果已准备好') || summary.includes('结果包已就绪') || summary.includes('result ready');
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function hydrateRunDetailUntilReady(
  fetchRunDetail: (runId: string) => Promise<V3RunResponse>,
  runId: string,
  options?: { timeoutMs?: number; intervalsMs?: number[] }
): Promise<V3RunResponse | null> {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const intervals = options?.intervalsMs ?? [0, 1_000, 2_000, 2_000, 3_000, 4_000, 4_000];
  const startedAt = Date.now();
  let lastDetail: V3RunResponse | null = null;

  for (const delay of intervals) {
    if (delay > 0) await wait(delay);
    lastDetail = await fetchRunDetail(runId);
    if (lastDetail?.result) return lastDetail;
    if (Date.now() - startedAt >= timeoutMs) break;
  }

  if (lastDetail) return lastDetail;
  return null;
}
