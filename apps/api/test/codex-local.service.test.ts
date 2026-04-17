import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  CodexLocalService,
  CodexLocalServiceError,
  buildCodexExecArgs,
  type CodexLocalRunner
} from '../src/common/codex-local.service';

function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'draftorbit-codex-local-test-'));
}

test('buildCodexExecArgs uses ephemeral read-only sandbox and output-last-message', () => {
  const args = buildCodexExecArgs({
    prompt: 'Return JSON only',
    outputPath: '/tmp/last-message.txt',
    profile: 'quick'
  });

  assert.deepEqual(args.slice(0, 7), ['exec', '--ephemeral', '--sandbox', 'read-only', '--profile', 'quick', '--output-last-message']);
  assert.equal(args[7], '/tmp/last-message.txt');
  assert.equal(args.at(-1), 'Return JSON only');
  assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
});

test('CodexLocalService parses only --output-last-message file and ignores noisy stdout', async () => {
  const root = await tempRoot();
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner: CodexLocalRunner = async ({ command, args, outputPath }) => {
    calls.push({ command, args });
    await fs.writeFile(outputPath, '{"answer":"ok from last message"}', 'utf8');
    return { exitCode: 0, stdout: 'NOISY STDOUT SHOULD NOT BE USED', stderr: '', timedOut: false, durationMs: 12 };
  };
  const service = new CodexLocalService({ enabled: true, tempRoot: root, runner, profile: 'quick' });

  const result = await service.chatWithRouting([{ role: 'user', content: 'Say ok' }], { taskType: 'draft' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, 'codex');
  assert.equal(result.content, '{"answer":"ok from last message"}');
  assert.equal(result.provider, 'codex-local');
  assert.equal(result.modelUsed, 'codex-local/quick');
  assert.equal(result.costUsd, 0);
});

test('CodexLocalService fail-closes disabled, busy, timeout and missing last-message states', async () => {
  await assert.rejects(
    () => new CodexLocalService({ enabled: false }).chatWithRouting([{ role: 'user', content: 'hi' }]),
    (error: unknown) => error instanceof CodexLocalServiceError && error.code === 'CODEX_LOCAL_UNAVAILABLE'
  );

  const root = await tempRoot();
  let release!: () => void;
  let entered!: () => void;
  const runnerEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blockingRunner: CodexLocalRunner = async ({ outputPath }) => {
    entered();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await fs.writeFile(outputPath, 'ok', 'utf8');
    return { exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 20 };
  };
  const busyService = new CodexLocalService({ enabled: true, tempRoot: root, runner: blockingRunner, maxConcurrency: 1 });
  const first = busyService.chatWithRouting([{ role: 'user', content: 'first' }]);
  await runnerEntered;
  await assert.rejects(
    () => busyService.chatWithRouting([{ role: 'user', content: 'second' }]),
    (error: unknown) => error instanceof CodexLocalServiceError && error.code === 'CODEX_LOCAL_BUSY'
  );
  release();
  await first;

  const timeoutService = new CodexLocalService({
    enabled: true,
    tempRoot: await tempRoot(),
    runner: async () => ({ exitCode: null, stdout: '', stderr: 'timed out with private details', timedOut: true, durationMs: 90_000 })
  });
  await assert.rejects(
    () => timeoutService.chatWithRouting([{ role: 'user', content: 'timeout' }]),
    (error: unknown) => error instanceof CodexLocalServiceError && error.code === 'CODEX_LOCAL_TIMEOUT'
  );

  const missingService = new CodexLocalService({
    enabled: true,
    tempRoot: await tempRoot(),
    runner: async () => ({ exitCode: 0, stdout: 'stdout only', stderr: '', timedOut: false, durationMs: 1 })
  });
  await assert.rejects(
    () => missingService.chatWithRouting([{ role: 'user', content: 'missing' }]),
    (error: unknown) => error instanceof CodexLocalServiceError && error.code === 'VISUAL_PROVIDER_FAILED'
  );
});
