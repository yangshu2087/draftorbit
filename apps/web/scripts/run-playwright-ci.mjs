#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const isCi = process.env.CI === 'true';
const port = Number(process.env.WEB_PLAYWRIGHT_PORT ?? 3300);
const baseURL = process.env.WEB_PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const targetSeconds = Number(process.env.WEB_PLAYWRIGHT_REPORTER_TARGET_SECONDS ?? 10);
const hardBudgetSeconds = Number(
  process.env.WEB_PLAYWRIGHT_REPORTER_HARD_BUDGET_SECONDS ?? process.env.WEB_PLAYWRIGHT_REPORTER_BUDGET_SECONDS ?? 12
);
const appBootstrapTargetSeconds = Number(process.env.WEB_PLAYWRIGHT_APP_BOOTSTRAP_TARGET_SECONDS ?? 2.5);
const enforceBudget = process.env.WEB_PLAYWRIGHT_ENFORCE_BUDGET === '1';
const trendFile = process.env.WEB_PLAYWRIGHT_TREND_FILE;
const trendHistoryLimit = Number(process.env.WEB_PLAYWRIGHT_TREND_HISTORY_LIMIT ?? 12);
const warmupPaths = (
  process.env.WEB_PLAYWRIGHT_WARMUP_PATHS ?? '/,/app,/projects,/v4,/pricing,/connect?intent=connect_x_self,/queue?intent=confirm_publish'
)
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const defaultPlaywrightWorkers = process.env.WEB_PLAYWRIGHT_WORKERS ?? (isCi ? '3' : '2');
const defaultFullyParallel = process.env.WEB_PLAYWRIGHT_FULLY_PARALLEL ?? '1';

const timings = [];
const startedAt = Date.now();
let serverProcess;

function seconds(ms) {
  return (ms / 1000).toFixed(2);
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      ...options
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
    child.on('error', (error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      resolve({ code: 1, output });
    });
  });
}

async function waitForServer(timeoutMs = 90_000) {
  const start = Date.now();
  let lastError = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(baseURL, { redirect: 'manual' });
      if (response.status < 500) {
        timings.push(['next dev ready', seconds(Date.now() - start)]);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next dev server did not become ready at ${baseURL}: ${lastError}`);
}

async function warmup() {
  for (const path of warmupPaths) {
    const start = Date.now();
    const url = new URL(path, baseURL).toString();
    const response = await fetch(url, { redirect: 'manual' });
    timings.push([`warm ${path}`, `${seconds(Date.now() - start)}s / HTTP ${response.status}`]);
    if (response.status >= 500) {
      throw new Error(`Warmup request failed for ${url}: HTTP ${response.status}`);
    }
  }
}

function parseReporterSeconds(output) {
  const matches = [...output.matchAll(/\b\d+\s+passed\s+\((\d+(?:\.\d+)?)s\)/gu)];
  const last = matches.at(-1);
  return last ? Number(last[1]) : null;
}

function parsePerfDurations(output, regex) {
  return [...output.matchAll(regex)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readTrendState(filePath) {
  if (!filePath) return null;
  try {
    const raw = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeTrendState(filePath, state) {
  if (!filePath || !state) return;
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function appendRecentSeries(previousValues, currentValue) {
  const previous = Array.isArray(previousValues) ? previousValues.map((item) => toFiniteNumber(item)).filter((item) => item != null) : [];
  const withCurrent = currentValue == null ? previous : [...previous, currentValue];
  const keep = Number.isFinite(trendHistoryLimit) && trendHistoryLimit > 0 ? trendHistoryLimit : 12;
  return withCurrent.slice(-keep);
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDelta(value) {
  if (value == null) return 'n/a';
  if (value === 0) return '0.00s';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}s`;
}

function buildTrendSnapshot(previousState, reporterSeconds, appBootstrapMaxSeconds) {
  const previousReporterSeconds = toFiniteNumber(previousState?.lastReporterSeconds);
  const previousAppBootstrapMaxSeconds = toFiniteNumber(previousState?.lastAppBootstrapMaxSeconds);
  const reporterDelta = previousReporterSeconds == null || reporterSeconds == null ? null : reporterSeconds - previousReporterSeconds;
  const appBootstrapDelta =
    previousAppBootstrapMaxSeconds == null || appBootstrapMaxSeconds == null
      ? null
      : appBootstrapMaxSeconds - previousAppBootstrapMaxSeconds;
  const recentReporter = appendRecentSeries(previousState?.recentReporterSeconds, reporterSeconds);
  const recentAppBootstrap = appendRecentSeries(previousState?.recentAppBootstrapMaxSeconds, appBootstrapMaxSeconds);
  const reporterRollingAverage = average(recentReporter);
  const appBootstrapRollingAverage = average(recentAppBootstrap);
  const reporterStableUnderTarget = recentReporter.length ? recentReporter.every((value) => value <= targetSeconds) : null;
  return {
    previousReporterSeconds,
    previousAppBootstrapMaxSeconds,
    reporterDelta,
    appBootstrapDelta,
    reporterRollingAverage,
    appBootstrapRollingAverage,
    reporterStableUnderTarget,
    recentReporterCount: recentReporter.length,
    recentAppBootstrapCount: recentAppBootstrap.length
  };
}

function buildNextTrendState(previousState, reporterSeconds, appBootstrapMaxSeconds) {
  const previousRuns = Number(previousState?.totalRuns ?? 0);
  const previousBestReporter = toFiniteNumber(previousState?.bestReporterSeconds);
  const previousBestBootstrap = toFiniteNumber(previousState?.bestAppBootstrapMaxSeconds);
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    totalRuns: Number.isFinite(previousRuns) ? previousRuns + 1 : 1,
    lastReporterSeconds: reporterSeconds,
    lastAppBootstrapMaxSeconds: appBootstrapMaxSeconds,
    bestReporterSeconds:
      reporterSeconds == null
        ? previousBestReporter
        : previousBestReporter == null
          ? reporterSeconds
          : Math.min(previousBestReporter, reporterSeconds),
    bestAppBootstrapMaxSeconds:
      appBootstrapMaxSeconds == null
        ? previousBestBootstrap
        : previousBestBootstrap == null
          ? appBootstrapMaxSeconds
          : Math.min(previousBestBootstrap, appBootstrapMaxSeconds),
    recentReporterSeconds: appendRecentSeries(previousState?.recentReporterSeconds, reporterSeconds),
    recentAppBootstrapMaxSeconds: appendRecentSeries(previousState?.recentAppBootstrapMaxSeconds, appBootstrapMaxSeconds)
  };
}

function buildScenarioMetrics(output) {
  const matches = [...output.matchAll(/\[ci-perf\]\s+generation scenario\s+"([^"]+)"\s+completed in\s+(\d+(?:\.\d+)?)s/gu)];
  const parsed = matches
    .map((match) => ({
      name: match[1],
      durationSeconds: Number(match[2])
    }))
    .filter((item) => Number.isFinite(item.durationSeconds));
  if (!parsed.length) {
    return {
      count: 0,
      averageSeconds: null,
      slowest: null
    };
  }
  const total = parsed.reduce((sum, item) => sum + item.durationSeconds, 0);
  const slowest = [...parsed].sort((a, b) => b.durationSeconds - a.durationSeconds)[0];
  return {
    count: parsed.length,
    averageSeconds: total / parsed.length,
    slowest
  };
}

function writeSummary({
  commandCode,
  reporterSeconds,
  playwrightWallSeconds,
  playwrightWorkers,
  fullyParallel,
  targetOk,
  budgetOk,
  appBootstrapAverageSeconds,
  appBootstrapMaxSeconds,
  appBootstrapTargetOk,
  scenarioMetrics,
  trendSnapshot,
  trendState
}) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const rows = [
    ['Next/web warmup + Playwright wall time', `${playwrightWallSeconds.toFixed(2)}s`],
    ['Playwright reporter time', reporterSeconds == null ? 'not parsed' : `${reporterSeconds.toFixed(2)}s`],
    ['Playwright workers', playwrightWorkers],
    ['Playwright fully parallel', fullyParallel],
    ['Reporter target', `${targetSeconds.toFixed(2)}s`],
    ['Reporter hard budget', `${hardBudgetSeconds.toFixed(2)}s`],
    ['Target status', targetOk ? 'pass' : 'watch'],
    ['Required-check budget status', budgetOk ? 'pass' : 'fail'],
    ['App bootstrap target', `${appBootstrapTargetSeconds.toFixed(2)}s`],
    ['App bootstrap average', appBootstrapAverageSeconds == null ? 'not parsed' : `${appBootstrapAverageSeconds.toFixed(2)}s`],
    ['App bootstrap max', appBootstrapMaxSeconds == null ? 'not parsed' : `${appBootstrapMaxSeconds.toFixed(2)}s`],
    ['App bootstrap status', appBootstrapTargetOk == null ? 'watch' : appBootstrapTargetOk ? 'pass' : 'watch'],
    ['Generation scenarios observed', String(scenarioMetrics.count)],
    ['Generation scenario avg', scenarioMetrics.averageSeconds == null ? 'not parsed' : `${scenarioMetrics.averageSeconds.toFixed(2)}s`],
    [
      'Generation slowest scenario',
      scenarioMetrics.slowest ? `${scenarioMetrics.slowest.name} (${scenarioMetrics.slowest.durationSeconds.toFixed(2)}s)` : 'not parsed'
    ],
    ['Trend samples kept', String(trendSnapshot.recentReporterCount)],
    ['Reporter vs previous run', formatDelta(trendSnapshot.reporterDelta)],
    ['Reporter rolling avg', trendSnapshot.reporterRollingAverage == null ? 'n/a' : `${trendSnapshot.reporterRollingAverage.toFixed(2)}s`],
    ['Reporter trend status', trendSnapshot.reporterStableUnderTarget == null ? 'watch' : trendSnapshot.reporterStableUnderTarget ? 'pass' : 'watch'],
    ['App bootstrap max vs previous run', formatDelta(trendSnapshot.appBootstrapDelta)],
    ['App bootstrap rolling avg', trendSnapshot.appBootstrapRollingAverage == null ? 'n/a' : `${trendSnapshot.appBootstrapRollingAverage.toFixed(2)}s`],
    ['Trend total runs tracked', String(trendState?.totalRuns ?? 0)],
    ['Playwright exit code', String(commandCode)]
  ];
  const warmupRows = timings.map(([name, value]) => `| ${name} | ${value} |`).join('\n');
  appendFileSync(
    summaryPath,
    [
      '### Web Playwright performance',
      '',
      '| metric | value |',
      '| --- | ---: |',
      ...rows.map(([name, value]) => `| ${name} | ${value} |`),
      '',
      '### Next dev server warmup',
      '',
      '| step | duration / status |',
      '| --- | ---: |',
      warmupRows || '| none | n/a |',
      ''
    ].join('\n') + '\n'
  );
}

async function main() {
  const env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? '1',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? '/__api',
    NEXT_PUBLIC_ENABLE_LOCAL_LOGIN: process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN ?? 'true',
    WEB_PLAYWRIGHT_WORKERS: defaultPlaywrightWorkers,
    WEB_PLAYWRIGHT_FULLY_PARALLEL: defaultFullyParallel
  };

  if (isCi || process.env.WEB_PLAYWRIGHT_MANAGE_SERVER === '1') {
    serverProcess = spawn('pnpm', ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    serverProcess.stdout.on('data', (chunk) => process.stdout.write(`[WebServer] ${chunk}`));
    serverProcess.stderr.on('data', (chunk) => process.stderr.write(`[WebServer] ${chunk}`));
    serverProcess.on('exit', (code, signal) => {
      if (code !== null && code !== 0) process.stderr.write(`[WebServer] exited with code ${code}\n`);
      if (signal) process.stderr.write(`[WebServer] exited with signal ${signal}\n`);
    });
    await waitForServer();
    await warmup();
    env.WEB_PLAYWRIGHT_SKIP_WEBSERVER = '1';
    env.WEB_PLAYWRIGHT_BASE_URL = baseURL;
  }

  const playwrightStart = Date.now();
  const result = await run('pnpm', ['exec', 'playwright', 'test', '--config', 'playwright.config.ts'], { env });
  const playwrightWallSeconds = (Date.now() - playwrightStart) / 1000;
  const reporterSeconds = parseReporterSeconds(result.output);
  const appBootstrapDurations = parsePerfDurations(
    result.output,
    /\[ci-perf\]\s+app bootstrap\s+\((?:includes \/usage\/summary panel|keeps routing debug hidden|core shell)\)\s+completed in\s+(\d+(?:\.\d+)?)s/gu
  );
  const appBootstrapAverageSeconds = appBootstrapDurations.length
    ? appBootstrapDurations.reduce((sum, value) => sum + value, 0) / appBootstrapDurations.length
    : null;
  const appBootstrapMaxSeconds = appBootstrapDurations.length
    ? Math.max(...appBootstrapDurations)
    : null;
  const appBootstrapTargetOk = appBootstrapMaxSeconds == null ? null : appBootstrapMaxSeconds <= appBootstrapTargetSeconds;
  const scenarioMetrics = buildScenarioMetrics(result.output);
  const targetOk = reporterSeconds != null && reporterSeconds <= targetSeconds;
  const budgetOk = reporterSeconds != null && reporterSeconds <= hardBudgetSeconds;
  const previousTrendState = readTrendState(trendFile);
  const trendSnapshot = buildTrendSnapshot(previousTrendState, reporterSeconds, appBootstrapMaxSeconds);
  const trendState = buildNextTrendState(previousTrendState, reporterSeconds, appBootstrapMaxSeconds);
  writeTrendState(trendFile, trendState);
  writeSummary({
    commandCode: result.code,
    reporterSeconds,
    playwrightWallSeconds,
    playwrightWorkers: env.WEB_PLAYWRIGHT_WORKERS,
    fullyParallel: env.WEB_PLAYWRIGHT_FULLY_PARALLEL,
    targetOk,
    budgetOk,
    appBootstrapAverageSeconds,
    appBootstrapMaxSeconds,
    appBootstrapTargetOk,
    scenarioMetrics,
    trendSnapshot,
    trendState
  });

  if (result.code !== 0) process.exit(result.code);
  if (enforceBudget && !budgetOk) {
    process.stderr.write(`Playwright reporter time hard budget failed: ${reporterSeconds ?? 'not parsed'}s > ${hardBudgetSeconds}s\n`);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  })
  .finally(() => {
    if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGTERM');
    const total = seconds(Date.now() - startedAt);
    process.stdout.write(`Web Playwright CI harness finished in ${total}s\n`);
  });
