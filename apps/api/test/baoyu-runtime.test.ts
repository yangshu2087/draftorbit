import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BaoyuRuntimeService,
  BAOYU_SKILLS_COMMIT,
  type BaoyuCommandResult
} from '../src/modules/generate/baoyu-runtime.service';
import type { VisualPlan } from '../src/modules/generate/visual-planning.service';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'draftorbit-baoyu-runtime-'));
}

function makeVisualPlan(): VisualPlan {
  return {
    primaryAsset: 'cover',
    visualizablePoints: ['周一谁都在等灵感，周三还没发。'],
    keywords: ['内容流程', '周一', '周三'],
    items: [
      {
        kind: 'cover',
        priority: 'primary',
        type: 'thread-cover',
        layout: '第一条封面 + 核心 promise',
        style: 'thread 首图',
        palette: '深色底 + 品牌强调色',
        cue: '周一谁都在等灵感，周三还没发。',
        reason: '真实团队节奏摩擦'
      },
      {
        kind: 'cards',
        priority: 'primary',
        type: 'story-cards',
        layout: '2 张推进卡',
        style: '步骤卡组',
        palette: '品牌主色 + 白底正文',
        cue: '改成固定的“判断→例子→问题”节奏，周会前就能排出来。',
        reason: '适合拆成卡片'
      }
    ]
  };
}

class FakeBaoyuRuntimeService extends BaoyuRuntimeService {
  async runSkill(_skill: unknown, args: string[] = []): Promise<BaoyuCommandResult> {
    const batchPath = args[args.indexOf('--batchfile') + 1] ?? path.join(this.getArtifactsRoot(), 'run_live', 'visual', 'batch.json');
    const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8')) as {
      tasks: Array<{ image: string }>;
    };
    for (const task of batch.tasks) {
      const outputPath = path.join(path.dirname(batchPath), task.image);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, 'provider-image-bytes');
    }
    return {
      ok: true,
      exitCode: 0,
      stdout: '{"success":true}',
      stderr: '',
      timedOut: false,
      durationMs: 10
    };
  }
}

test('BaoyuRuntimeService builds pinned skill commands with npx bun fallback', () => {
  const service = new BaoyuRuntimeService({
    skillsDir: '/repo/vendor/baoyu-skills',
    artifactsRoot: '/tmp/draftorbit-artifacts',
    runtimeCommand: { command: 'npx', args: ['-y', 'bun'] }
  });

  const command = service.buildSkillCommand('baoyu-imagine', ['--batchfile', 'batch.json', '--json']);

  assert.equal(command.command, 'npx');
  assert.deepEqual(command.args.slice(0, 2), ['-y', 'bun']);
  assert.match(command.args[2] ?? '', /vendor\/baoyu-skills\/skills\/baoyu-imagine\/scripts\/main\.ts$/u);
  assert.deepEqual(command.args.slice(-2), ['batch.json', '--json']);
  assert.equal(command.skill, 'baoyu-imagine');
  assert.equal(command.commit, BAOYU_SKILLS_COMMIT);
});


test('BaoyuRuntimeService is pinned to the audited upstream baoyu-skills main revision', () => {
  assert.equal(BAOYU_SKILLS_COMMIT, '8c17d77209b030a97d1746928ae348c99fefa775');

  const ensureScript = fs.readFileSync(path.join(repoRoot, 'scripts', 'ensure-baoyu-skills-runtime.mjs'), 'utf8');
  assert.match(ensureScript, new RegExp(`const commit = '${BAOYU_SKILLS_COMMIT}'`));
});

test('BaoyuRuntimeService resolves relative BAOYU_SKILLS_DIR from repo root', () => {
  const previous = process.env.BAOYU_SKILLS_DIR;
  process.env.BAOYU_SKILLS_DIR = 'vendor/baoyu-skills';
  try {
    const service = new BaoyuRuntimeService();
    assert.equal(
      service.getSkillsDir(),
      path.join(repoRoot, 'vendor', 'baoyu-skills')
    );
  } finally {
    if (previous === undefined) {
      delete process.env.BAOYU_SKILLS_DIR;
    } else {
      process.env.BAOYU_SKILLS_DIR = previous;
    }
  }
});

test('BaoyuRuntimeService prepares baoyu-style prompt files and image batch without prompt leakage', async () => {
  const artifactsRoot = makeTempDir();
  const service = new BaoyuRuntimeService({
    skillsDir: '/repo/vendor/baoyu-skills',
    artifactsRoot,
    imageProvider: 'openrouter',
    imageModel: 'black-forest-labs/flux.2-pro'
  });

  const prepared = await service.prepareVisualArtifacts({
    runId: 'run_123',
    format: 'thread',
    focus: '推文写作冷启动',
    text:
      '内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。比如周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。',
    visualPlan: makeVisualPlan(),
    withImage: true
  });

  assert.equal(prepared.runtime.engine, 'baoyu-skills');
  assert.equal(prepared.runtime.commit, BAOYU_SKILLS_COMMIT);
  assert.equal(prepared.assets.length, 2);
  assert.equal(prepared.assets[0]?.status, 'generating');
  assert.ok(prepared.assets.every((asset) => asset.promptPath && fs.existsSync(asset.promptPath)));
  assert.ok(prepared.assets.every((asset) => asset.specPath && fs.existsSync(asset.specPath)));
  assert.ok(prepared.assets.every((asset) => asset.exportFormat === 'svg'));
  assert.ok(fs.existsSync(prepared.batchFilePath));

  const firstPrompt = fs.readFileSync(prepared.assets[0]!.promptPath!, 'utf8');
  assert.match(firstPrompt, /baoyu-skills compatible visual prompt/u);
  assert.match(firstPrompt, /周一谁都在等灵感，周三还没发/u);
  assert.match(firstPrompt, /do NOT render readable text/u);
  assert.match(firstPrompt, /Reference approved copy for semantics only; do NOT render it as text/u);
  assert.doesNotMatch(firstPrompt, /给我一条|更像真人|冷启动判断句/u);

  const batch = JSON.parse(fs.readFileSync(prepared.batchFilePath, 'utf8')) as {
    jobs: number;
    tasks: Array<{ provider: string; model: string; promptFiles: string[]; image: string }>;
  };
  assert.equal(batch.jobs, 1);
  assert.equal(batch.tasks.length, 2);
  assert.equal(batch.tasks[0]?.provider, 'openrouter');
  assert.equal(batch.tasks[0]?.model, 'black-forest-labs/flux.2-pro');
  assert.match(batch.tasks[0]?.image ?? '', /01-cover\.provider\.png$/u);
  assert.match(prepared.assets[0]?.assetPath ?? '', /01-cover\.svg$/u);
  assert.match(prepared.assets[0]?.providerArtifactPath ?? '', /01-cover\.provider\.png$/u);
  const spec = JSON.parse(fs.readFileSync(prepared.assets[0]!.specPath!, 'utf8')) as Record<string, unknown>;
  assert.equal(spec.kind, 'cover');
  assert.equal(spec.provider, 'template-svg');
});

test('BaoyuRuntimeService renders crisp deterministic svg assets after provider artifact succeeds', async () => {
  const artifactsRoot = makeTempDir();
  const skillsDir = makeTempDir();
  const service = new FakeBaoyuRuntimeService({
    skillsDir,
    artifactsRoot,
    imageProvider: 'openrouter',
    imageModel: 'black-forest-labs/flux.2-pro'
  });

  const result = await service.generateVisualArtifacts({
    runId: 'run_live',
    format: 'thread',
    focus: 'AI 产品新功能上线',
    text: [
      '1/4\n一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
      '2/4\n这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景。',
      '3/4\n我会只保留一个动作：把功能清单改成“录音→跟进清单”的使用场景。',
      '4/4\n如果这次上线只能先讲一个场景，你会先讲哪一个？'
    ].join('\n\n'),
    visualPlan: makeVisualPlan(),
    withImage: true
  });

  assert.equal(result.assets[0]?.status, 'ready');
  assert.match(result.assets[0]?.assetPath ?? '', /01-cover\.svg$/u);
  assert.ok(result.assets[0]?.providerArtifactPath && fs.existsSync(result.assets[0].providerArtifactPath));
  const svg = fs.readFileSync(result.assets[0]!.assetPath!, 'utf8');
  assert.match(svg, /<svg/u);
  assert.match(svg, /AI 产品新功能上线|周一谁都在等灵感/u);
  assert.doesNotMatch(svg, /prompt-wrapper|更像真人/u);
});



test('BaoyuRuntimeService produces local SVG assets without requiring external raster provider keys', async () => {
  const artifactsRoot = makeTempDir();
  const service = new BaoyuRuntimeService({
    skillsDir: '/repo/vendor/baoyu-skills-does-not-exist',
    artifactsRoot,
    imageProvider: 'openrouter',
    imageModel: 'black-forest-labs/flux.2-pro'
  });

  const result = await service.generateVisualArtifacts({
    runId: 'run_local_svg',
    format: 'thread',
    focus: 'AI 产品新功能上线',
    text: [
      '1/4\n一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
      '2/4\n这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景。',
      '3/4\n我会只保留一个动作：把功能清单改成“录音→跟进清单”的使用场景。',
      '4/4\n如果这次上线只能先讲一个场景，你会先讲哪一个？'
    ].join('\n\n'),
    visualPlan: makeVisualPlan(),
    withImage: true
  });

  assert.equal(result.assets.every((asset) => asset.status === 'ready'), true);
  assert.equal(result.assets.every((asset) => asset.provider === 'template-svg'), true);
  assert.equal(result.assets.every((asset) => asset.exportFormat === 'svg'), true);
  assert.ok(result.assets.every((asset) => asset.checksum && asset.checksum.length >= 16));
  assert.ok(result.assets.every((asset) => asset.width && asset.height));
  assert.ok(result.assets.every((asset) => asset.specPath && fs.existsSync(asset.specPath)));
  assert.match(fs.readFileSync(result.assets[0]!.assetPath!, 'utf8'), /<svg/u);
});
