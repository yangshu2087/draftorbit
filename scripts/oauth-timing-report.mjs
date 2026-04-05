#!/usr/bin/env node

import fs from 'node:fs';

const logFile = process.argv[2] ?? '/tmp/draftorbit-api.log';

if (!fs.existsSync(logFile)) {
  console.error(`log file not found: ${logFile}`);
  process.exit(1);
}

const lines = fs.readFileSync(logFile, 'utf8').split('\n');

const rowRegex = /\[auth:(x|google)\]\s+([a-z-]+)\s+\+(\d+)ms/;
const neededSteps = [
  'oauth-state-ok',
  'x-token-exchanged',
  'google-token-exchanged',
  'user-upserted',
  'workspace-ready',
  'identity-and-subscription-ready',
  'done'
];

/** @type {Record<'x' | 'google', Array<Record<string, number>>>} */
const attempts = { x: [], google: [] };
/** @type {Record<'x' | 'google', Record<string, number>>} */
let current = { x: {}, google: {} };

for (const line of lines) {
  const m = line.match(rowRegex);
  if (!m) continue;
  const flow = /** @type {'x'|'google'} */ (m[1]);
  const step = m[2];
  const ms = Number(m[3]);
  if (!Number.isFinite(ms)) continue;
  if (!neededSteps.includes(step)) continue;

  current[flow][step] = ms;

  if (step === 'done') {
    attempts[flow].push({ ...current[flow] });
    current[flow] = {};
  }
}

function stat(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.floor((sorted.length - 1) * q)];
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return {
    avg: Number(avg.toFixed(2)),
    p50: Number(pick(0.5).toFixed(2)),
    p95: Number(pick(0.95).toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2))
  };
}

function summarize(flow, rows) {
  if (!rows.length) return { flow, count: 0, segments: {} };

  const tokenStep = flow === 'x' ? 'x-token-exchanged' : 'google-token-exchanged';

  const tokenExchange = [];
  const userWrite = [];
  const workspaceInit = [];
  const finalOps = [];
  const response = [];
  const total = [];

  for (const r of rows) {
    if (
      Number.isFinite(r['oauth-state-ok']) &&
      Number.isFinite(r[tokenStep]) &&
      Number.isFinite(r['user-upserted']) &&
      Number.isFinite(r['workspace-ready']) &&
      Number.isFinite(r['identity-and-subscription-ready']) &&
      Number.isFinite(r.done)
    ) {
      tokenExchange.push(r[tokenStep] - r['oauth-state-ok']);
      userWrite.push(r['user-upserted'] - r[tokenStep]);
      workspaceInit.push(r['workspace-ready'] - r['user-upserted']);
      finalOps.push(r['identity-and-subscription-ready'] - r['workspace-ready']);
      response.push(r.done - r['identity-and-subscription-ready']);
      total.push(r.done);
    }
  }

  return {
    flow,
    count: total.length,
    segments: {
      tokenExchange: stat(tokenExchange),
      userWrite: stat(userWrite),
      workspaceInit: stat(workspaceInit),
      finalOps: stat(finalOps),
      response: stat(response),
      total: stat(total)
    }
  };
}

const report = {
  logFile,
  generatedAt: new Date().toISOString(),
  x: summarize('x', attempts.x),
  google: summarize('google', attempts.google)
};

console.log(JSON.stringify(report, null, 2));

