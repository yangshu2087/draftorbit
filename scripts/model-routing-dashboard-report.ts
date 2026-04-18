import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Provider = 'openai' | 'openrouter' | 'ollama' | 'codex-local';

type AttemptRecord = {
  attempt?: number;
  provider?: Provider;
  model?: string;
  tier?: string;
  status?: 'ok' | 'error';
  durationMs?: number;
  errorCode?: string;
  error?: string;
};

type ProviderHealthRecord = {
  provider?: Provider;
  sampleSize?: number;
  failureRate?: number;
  consecutiveFailures?: number;
  healthy?: boolean;
  coolingDown?: boolean;
  cooldownUntilMs?: number | null;
  lastFailureAt?: string | null;
  lastSuccessAt?: string | null;
};

type GatewayEvent = {
  at?: string;
  status?: 'ok' | 'failed';
  profile?: string;
  taskType?: string;
  contentFormat?: string;
  candidatePoolSize?: number;
  maxCandidates?: number;
  skippedProvidersByHealth?: Provider[];
  requestDurationMs?: number;
  selected?: {
    provider?: Provider;
    model?: string;
    tier?: string;
    modelUsed?: string;
    routingTier?: string;
    fallbackDepth?: number;
  };
  attempts?: AttemptRecord[];
  providerHealth?: ProviderHealthRecord[];
  error?: string;
};

type ProviderAggregate = {
  attempts: number;
  ok: number;
  error: number;
  durations: number[];
  topModels: Map<string, number>;
  topErrors: Map<string, number>;
};

type RouteAggregate = {
  count: number;
  ok: number;
  failed: number;
  fallbackHits: number;
  durations: number[];
};

function repoRootFromScript(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function stampForNow(now = new Date()): string {
  return now.toISOString().replace(/[:.]/gu, '-').replace('T', '_').slice(0, 19);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : fallback;
}

function readDefaultLogPath(repoRoot: string): string {
  return process.env.MODEL_GATEWAY_OBSERVABILITY_LOG_PATH?.trim() || path.join(repoRoot, 'artifacts', 'model-gateway', 'model-gateway-events.ndjson');
}

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * pct) - 1));
  return sorted[idx] ?? 0;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function topN(map: Map<string, number>, n = 3): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

function cleanCell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\n/gu, ' ').trim();
}

async function readGatewayEvents(logPath: string): Promise<GatewayEvent[]> {
  const raw = await fs.readFile(logPath, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as GatewayEvent;
      } catch {
        return null;
      }
    })
    .filter((item): item is GatewayEvent => Boolean(item));
}

function buildDashboard(input: { events: GatewayEvent[]; sinceIso: string; logPath: string }) {
  const providerAgg = new Map<Provider, ProviderAggregate>();
  const routeAgg = new Map<string, RouteAggregate>();
  const skippedByHealth = new Map<string, number>();
  const topErrors = new Map<string, number>();

  let total = 0;
  let ok = 0;
  let failed = 0;
  let fallbackHits = 0;
  const totalDurations: number[] = [];
  let latestHealthSnapshot: ProviderHealthRecord[] = [];

  for (const event of input.events) {
    total += 1;
    if (event.status === 'ok') ok += 1;
    else failed += 1;

    const requestDuration = Number(event.requestDurationMs ?? 0);
    if (requestDuration > 0) totalDurations.push(requestDuration);

    const fallbackDepth = Number(event.selected?.fallbackDepth ?? 0);
    if (fallbackDepth > 0) fallbackHits += 1;

    const routeKey = `${event.taskType ?? 'unknown'} / ${event.contentFormat ?? 'generic'}`;
    const route = routeAgg.get(routeKey) ?? { count: 0, ok: 0, failed: 0, fallbackHits: 0, durations: [] };
    route.count += 1;
    if (event.status === 'ok') route.ok += 1;
    else route.failed += 1;
    if (fallbackDepth > 0) route.fallbackHits += 1;
    if (requestDuration > 0) route.durations.push(requestDuration);
    routeAgg.set(routeKey, route);

    for (const provider of event.skippedProvidersByHealth ?? []) {
      skippedByHealth.set(provider, (skippedByHealth.get(provider) ?? 0) + 1);
    }

    if (event.error) {
      topErrors.set(event.error, (topErrors.get(event.error) ?? 0) + 1);
    }

    for (const attempt of event.attempts ?? []) {
      const provider = attempt.provider;
      if (!provider) continue;
      const current = providerAgg.get(provider) ?? {
        attempts: 0,
        ok: 0,
        error: 0,
        durations: [],
        topModels: new Map<string, number>(),
        topErrors: new Map<string, number>()
      };
      current.attempts += 1;
      if (attempt.status === 'ok') current.ok += 1;
      else current.error += 1;

      const duration = Number(attempt.durationMs ?? 0);
      if (duration > 0) current.durations.push(duration);

      const model = (attempt.model ?? '').trim();
      if (model) current.topModels.set(model, (current.topModels.get(model) ?? 0) + 1);

      const errorKey = (attempt.errorCode ?? attempt.error ?? '').trim();
      if (errorKey) current.topErrors.set(errorKey, (current.topErrors.get(errorKey) ?? 0) + 1);

      providerAgg.set(provider, current);
    }

    if (Array.isArray(event.providerHealth) && event.providerHealth.length > 0) {
      latestHealthSnapshot = event.providerHealth;
    }
  }

  return {
    summary: {
      total,
      ok,
      failed,
      successRate: total > 0 ? ok / total : 0,
      fallbackHits,
      fallbackRate: total > 0 ? fallbackHits / total : 0,
      avgDurationMs: avg(totalDurations),
      p95DurationMs: percentile(totalDurations, 0.95)
    },
    providerAgg,
    routeAgg,
    skippedByHealth,
    topErrors,
    latestHealthSnapshot,
    meta: {
      sinceIso: input.sinceIso,
      logPath: input.logPath
    }
  };
}

function buildDashboardMarkdown(input: {
  stamp: string;
  sinceIso: string;
  logPath: string;
  summary: ReturnType<typeof buildDashboard>['summary'];
  providerAgg: Map<Provider, ProviderAggregate>;
  routeAgg: Map<string, RouteAggregate>;
  skippedByHealth: Map<string, number>;
  topErrors: Map<string, number>;
  latestHealthSnapshot: ProviderHealthRecord[];
}): string {
  const lines: string[] = [];
  lines.push(`# Model routing dashboard (${input.stamp})`);
  lines.push('');
  lines.push(`- Source log: \`${input.logPath}\``);
  lines.push(`- Window start (inclusive): \`${input.sinceIso}\``);
  lines.push('- Focus: format+taskType layered routing, health-probe-driven fallback, and routing observability.');
  lines.push('');
  lines.push('## 1) Executive summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | ---: |');
  lines.push(`| Requests | ${input.summary.total} |`);
  lines.push(`| Success | ${input.summary.ok} |`);
  lines.push(`| Failed | ${input.summary.failed} |`);
  lines.push(`| Success rate | ${(input.summary.successRate * 100).toFixed(1)}% |`);
  lines.push(`| Fallback hits | ${input.summary.fallbackHits} |`);
  lines.push(`| Fallback rate | ${(input.summary.fallbackRate * 100).toFixed(1)}% |`);
  lines.push(`| Avg request latency | ${input.summary.avgDurationMs.toFixed(0)}ms |`);
  lines.push(`| P95 request latency | ${input.summary.p95DurationMs.toFixed(0)}ms |`);

  lines.push('');
  lines.push('## 2) Provider lane');
  lines.push('');
  lines.push('| Provider | Attempts | Success | Error | Success rate | Avg latency | P95 latency | Top models | Top errors |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |');

  const providers: Provider[] = ['codex-local', 'openai', 'openrouter', 'ollama'];
  for (const provider of providers) {
    const agg = input.providerAgg.get(provider);
    if (!agg) {
      lines.push(`| ${provider} | 0 | 0 | 0 | 0.0% | 0ms | 0ms | n/a | n/a |`);
      continue;
    }
    const successRate = agg.attempts > 0 ? (agg.ok / agg.attempts) * 100 : 0;
    const topModels = topN(agg.topModels).map((item) => `${item.key} (${item.count})`).join('<br>') || 'n/a';
    const topProviderErrors = topN(agg.topErrors).map((item) => `${item.key} (${item.count})`).join('<br>') || 'n/a';
    lines.push(
      `| ${provider} | ${agg.attempts} | ${agg.ok} | ${agg.error} | ${successRate.toFixed(1)}% | ${avg(agg.durations).toFixed(0)}ms | ${percentile(agg.durations, 0.95).toFixed(0)}ms | ${cleanCell(topModels)} | ${cleanCell(topProviderErrors)} |`
    );
  }

  lines.push('');
  lines.push('## 3) Route lane (taskType × contentFormat)');
  lines.push('');
  lines.push('| Lane | Requests | Success rate | Fallback rate | Avg latency |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');

  for (const [lane, agg] of [...input.routeAgg.entries()].sort((a, b) => b[1].count - a[1].count)) {
    const successRate = agg.count > 0 ? (agg.ok / agg.count) * 100 : 0;
    const fallbackRate = agg.count > 0 ? (agg.fallbackHits / agg.count) * 100 : 0;
    lines.push(`| ${cleanCell(lane)} | ${agg.count} | ${successRate.toFixed(1)}% | ${fallbackRate.toFixed(1)}% | ${avg(agg.durations).toFixed(0)}ms |`);
  }

  lines.push('');
  lines.push('## 4) Health probe outcome');
  lines.push('');
  if (input.skippedByHealth.size === 0) {
    lines.push('- No provider was skipped by health cooldown in this window.');
  } else {
    lines.push('| Provider | Skipped count |');
    lines.push('| --- | ---: |');
    for (const [provider, count] of [...input.skippedByHealth.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${provider} | ${count} |`);
    }
  }

  lines.push('');
  lines.push('## 5) Latest provider health snapshot');
  lines.push('');
  if (!input.latestHealthSnapshot.length) {
    lines.push('- Health snapshot unavailable in this window.');
  } else {
    lines.push('| Provider | Healthy | Cooling down | Sample size | Failure rate | Consecutive failures | Last success | Last failure |');
    lines.push('| --- | --- | --- | ---: | ---: | ---: | --- | --- |');
    for (const row of input.latestHealthSnapshot) {
      lines.push(
        `| ${row.provider ?? 'unknown'} | ${row.healthy ? 'yes' : 'no'} | ${row.coolingDown ? 'yes' : 'no'} | ${Number(row.sampleSize ?? 0)} | ${(Number(row.failureRate ?? 0) * 100).toFixed(1)}% | ${Number(row.consecutiveFailures ?? 0)} | ${row.lastSuccessAt ?? 'n/a'} | ${row.lastFailureAt ?? 'n/a'} |`
      );
    }
  }

  lines.push('');
  lines.push('## 6) Top request-level errors');
  lines.push('');
  const globalErrors = topN(input.topErrors, 10);
  if (!globalErrors.length) {
    lines.push('- none');
  } else {
    for (const item of globalErrors) {
      lines.push(`- ${item.count} × ${item.key}`);
    }
  }

  lines.push('');
  lines.push('## 7) Runbook template');
  lines.push('');
  lines.push('- Trigger this report after UAT/CI routing changes or provider incidents.');
  lines.push('- Compare `Provider lane` success/latency and `Route lane` fallback rate before vs after release.');
  lines.push('- If a provider enters repeated cooldown, inspect env keys + timeout + provider logs, then rerun this report.');
  lines.push('');
  lines.push('```bash');
  lines.push('MODEL_GATEWAY_OBSERVABILITY_ENABLED=1 \\');
  lines.push('MODEL_GATEWAY_OBSERVABILITY_LOG_PATH=artifacts/model-gateway/model-gateway-events.ndjson \\');
  lines.push('npm_config_cache=/tmp/draftorbit-npm-cache npx pnpm@10.23.0 report:model-routing');
  lines.push('```');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const repoRoot = repoRootFromScript();
  const logPath = readDefaultLogPath(repoRoot);
  const hours = parsePositiveInt(process.env.MODEL_ROUTER_DASHBOARD_HOURS, 24);
  const now = Date.now();
  const sinceMs = now - hours * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  let events = await readGatewayEvents(logPath);
  events = events.filter((event) => {
    const atMs = Date.parse(String(event.at ?? ''));
    if (!Number.isFinite(atMs)) return true;
    return atMs >= sinceMs;
  });

  const dashboard = buildDashboard({ events, sinceIso, logPath });
  const stamp = stampForNow();
  const reportDir = path.join(repoRoot, 'output', 'reports', 'observability');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `MODEL-ROUTING-DASHBOARD-${stamp}.md`);
  const markdown = buildDashboardMarkdown({
    stamp,
    sinceIso,
    logPath,
    summary: dashboard.summary,
    providerAgg: dashboard.providerAgg,
    routeAgg: dashboard.routeAgg,
    skippedByHealth: dashboard.skippedByHealth,
    topErrors: dashboard.topErrors,
    latestHealthSnapshot: dashboard.latestHealthSnapshot
  });
  await fs.writeFile(reportPath, markdown, 'utf8');

  console.log(
    JSON.stringify(
      {
        logPath,
        reportPath,
        hours,
        requestCount: dashboard.summary.total,
        successRate: Number((dashboard.summary.successRate * 100).toFixed(2)),
        fallbackRate: Number((dashboard.summary.fallbackRate * 100).toFixed(2))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[model-routing-dashboard-report] failed: ${message}`);
  process.exitCode = 1;
});
