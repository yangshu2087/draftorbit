#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const runtimeDir = path.join(repoRoot, 'vendor', 'baoyu-skills');
const remote = 'https://github.com/JimLiu/baoyu-skills.git';
const commit = 'dcd0f81433490d85f72a0eae557a710ab34bc9b1';

fs.mkdirSync(path.dirname(runtimeDir), { recursive: true });

if (!fs.existsSync(path.join(runtimeDir, '.git'))) {
  if (fs.existsSync(runtimeDir)) {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
  execFileSync('git', ['clone', '--depth', '1', remote, runtimeDir], { stdio: 'inherit' });
}

execFileSync('git', ['fetch', '--depth', '1', 'origin', commit], { cwd: runtimeDir, stdio: 'inherit' });
execFileSync('git', ['checkout', '--detach', commit], { cwd: runtimeDir, stdio: 'inherit' });

const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: runtimeDir, encoding: 'utf8' }).trim();
if (actual !== commit) {
  throw new Error(`baoyu-skills runtime checkout mismatch: expected ${commit}, got ${actual}`);
}

for (const relativeDir of [
  'skills/baoyu-url-to-markdown/scripts',
  'skills/baoyu-danger-x-to-markdown/scripts',
  'skills/baoyu-format-markdown/scripts'
]) {
  const installDir = path.join(runtimeDir, relativeDir);
  if (!fs.existsSync(path.join(installDir, 'package.json'))) continue;
  if (fs.existsSync(path.join(installDir, 'node_modules'))) continue;
  execFileSync('npx', ['-y', 'bun', 'install'], { cwd: installDir, stdio: 'inherit' });
}

console.log(JSON.stringify({ runtimeDir, commit: actual }, null, 2));
