#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const isCi = process.env.CI === 'true';
const port = Number(process.env.WEB_PLAYWRIGHT_PORT ?? 3300);
const baseURL = process.env.WEB_PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const targetSeconds = Number(process.env.WEB_PLAYWRIGHT_REPORTER_TARGET_SECONDS ?? 10);
const hardBudgetSeconds = Number(
  process.env.WEB_PLAYWRIGHT_REPORTER_HARD_BUDGET_SECONDS ?? process.env.WEB_PLAYWRIGHT_REPORTER_BUDGET_SECONDS ?? 12
);
const enforceBudget = process.env.WEB_PLAYWRIGHT_ENFORCE_BUDGET === '1';
const warmupPaths = (process.env.WEB_PLAYWRIGHT_WARMUP_PATHS ?? '/,/app,/pricing,/connect?intent=connect_x_self,/queue?intent=confirm_publish')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

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

function writeSummary({ commandCode, reporterSeconds, playwrightWallSeconds, targetOk, budgetOk }) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const rows = [
    ['Next/web warmup + Playwright wall time', `${playwrightWallSeconds.toFixed(2)}s`],
    ['Playwright reporter time', reporterSeconds == null ? 'not parsed' : `${reporterSeconds.toFixed(2)}s`],
    ['Reporter target', `${targetSeconds.toFixed(2)}s`],
    ['Reporter hard budget', `${hardBudgetSeconds.toFixed(2)}s`],
    ['Target status', targetOk ? 'pass' : 'watch'],
    ['Required-check budget status', budgetOk ? 'pass' : 'fail'],
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
    NEXT_PUBLIC_ENABLE_LOCAL_LOGIN: process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN ?? 'true'
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
  const targetOk = reporterSeconds != null && reporterSeconds <= targetSeconds;
  const budgetOk = reporterSeconds != null && reporterSeconds <= hardBudgetSeconds;
  writeSummary({ commandCode: result.code, reporterSeconds, playwrightWallSeconds, targetOk, budgetOk });

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
