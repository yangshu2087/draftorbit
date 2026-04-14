import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  SourceCaptureService,
  type SourceSearchProvider,
  type SourceSearchResult
} from '../src/modules/generate/source-capture.service';
import type { BaoyuRuntimeService, BaoyuSkillName } from '../src/modules/generate/baoyu-runtime.service';

class FakeBaoyuRuntime {
  readonly calls: Array<{ skill: BaoyuSkillName; args: string[] }> = [];

  constructor(
    private readonly rootDir: string,
    private readonly options: { failCapture?: boolean } = {}
  ) {}

  getArtifactsRoot() {
    return path.join(this.rootDir, 'artifacts');
  }

  getSkillsDir() {
    return path.join(this.rootDir, 'skills');
  }

  async runSkill(skill: BaoyuSkillName, args: string[]) {
    this.calls.push({ skill, args });
    const outputPath = args[args.findIndex((arg) => arg === '--output' || arg === '-o') + 1];
    if (this.options.failCapture || !outputPath) {
      return { ok: false, exitCode: 1, stdout: '', stderr: 'capture failed', timedOut: false, durationMs: 1 };
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `# Captured ${args[0]}\n\nThis is cleaned markdown source.`, 'utf8');
    return { ok: true, exitCode: 0, stdout: 'ok', stderr: '', timedOut: false, durationMs: 1 };
  }
}

class FakeSearchProvider implements SourceSearchProvider {
  readonly calls: Array<{ query: string; maxResults: number }> = [];

  constructor(private readonly results: SourceSearchResult[]) {}

  async search(input: { query: string; maxResults: number }) {
    this.calls.push(input);
    return this.results;
  }
}

async function makeRuntime(options?: { failCapture?: boolean }) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'draftorbit-source-capture-'));
  await fs.mkdir(path.join(rootDir, 'skills'), { recursive: true });
  return new FakeBaoyuRuntime(rootDir, options);
}

test('SourceCaptureService routes URL inputs to the right baoyu capture skills', () => {
  const service = new SourceCaptureService();

  assert.equal(
    service.selectSkillForUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').skill,
    'baoyu-youtube-transcript'
  );
  assert.equal(
    service.selectSkillForUrl('https://x.com/example/status/123456789').skill,
    'baoyu-danger-x-to-markdown'
  );
  assert.equal(
    service.selectSkillForUrl('https://example.com/blog/post').skill,
    'baoyu-url-to-markdown'
  );
});

test('SourceCaptureService fail-closes freshness prompts when no URL or search provider exists', async () => {
  const service = new SourceCaptureService({ searchProvider: null });

  const analysis = service.analyzeIntent('把今天的 AI 产品更新写成一条像真人发出来的中文推文，不要像 changelog。');

  assert.equal(analysis.requiresFreshSource, true);
  assert.deepEqual(analysis.urls, []);
  assert.ok(analysis.hardFails.includes('source_not_configured'));

  const result = await service.captureFromIntent({
    runId: 'source-not-configured',
    intent: '生成关于最新的 Hermes 的文章'
  });

  assert.equal(result.sourceRequired, true);
  assert.equal(result.sourceStatus, 'not_configured');
  assert.ok(result.hardFails.includes('source_not_configured'));
});

test('SourceCaptureService does not treat ordinary evergreen prompts as freshness failures', () => {
  const service = new SourceCaptureService({ searchProvider: null });

  const analysis = service.analyzeIntent('别再靠灵感写推文，给我一条更像真人的冷启动判断句。');

  assert.equal(analysis.requiresFreshSource, false);
  assert.deepEqual(analysis.hardFails, []);
});

test('SourceCaptureService treats generic product update copywriting as evergreen when no temporal signal is present', () => {
  const service = new SourceCaptureService({ searchProvider: null });

  const analysis = service.analyzeIntent('把一次 AI 产品更新写成一条像真人发出来的中文推文，不要像 changelog。');

  assert.equal(analysis.requiresFreshSource, false);
  assert.deepEqual(analysis.hardFails, []);
});

test('SourceCaptureService searches freshness prompts and captures Tavily results through baoyu markdown runtime', async () => {
  const runtime = await makeRuntime();
  const searchProvider = new FakeSearchProvider([
    {
      title: 'Nous Research releases latest Hermes model notes',
      url: 'https://example.com/nous-hermes-latest',
      content: 'Nous Research Hermes AI model release notes.'
    }
  ]);
  const service = new SourceCaptureService({
    runtime: runtime as unknown as BaoyuRuntimeService,
    searchProvider,
    maxSearchResults: 3
  });

  const result = await service.captureFromIntent({
    runId: 'search-capture-ready',
    intent: '生成关于最新的 Nous Hermes AI 模型的文章'
  });

  assert.equal(searchProvider.calls.length, 1);
  assert.equal(searchProvider.calls[0]?.query, '生成关于最新的 Nous Hermes AI 模型的文章');
  assert.equal(searchProvider.calls[0]?.maxResults, 3);
  assert.equal(runtime.calls.length, 1);
  assert.equal(runtime.calls[0]?.skill, 'baoyu-url-to-markdown');
  assert.equal(result.sourceRequired, true);
  assert.equal(result.sourceStatus, 'ready');
  assert.deepEqual(result.hardFails, []);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0]?.kind, 'search');
  assert.equal(result.artifacts[0]?.status, 'ready');
  assert.equal(result.artifacts[0]?.title, 'Nous Research releases latest Hermes model notes');
  assert.equal(result.artifacts[0]?.url, 'https://example.com/nous-hermes-latest');
  assert.equal(result.artifacts[0]?.evidenceUrl, 'https://example.com/nous-hermes-latest');
  assert.match(result.sourceContext, /Captured https:\/\/example\.com\/nous-hermes-latest/u);
});

test('SourceCaptureService marks Hermes results ambiguous when search mixes unrelated entities', async () => {
  const runtime = await makeRuntime();
  const searchProvider = new FakeSearchProvider([
    {
      title: 'Hermès luxury brand launches a new Birkin campaign',
      url: 'https://www.hermes.com/us/en/story/',
      content: 'Luxury fashion bag and scarf collection from Hermès.'
    },
    {
      title: 'Nous Research Hermes AI model release notes',
      url: 'https://huggingface.co/NousResearch/Hermes-4',
      content: 'LLM model checkpoint and AI benchmark details.'
    }
  ]);
  const service = new SourceCaptureService({
    runtime: runtime as unknown as BaoyuRuntimeService,
    searchProvider
  });

  const result = await service.captureFromIntent({
    runId: 'hermes-ambiguous',
    intent: '生成关于最新的 Hermes 的文章'
  });

  assert.equal(result.sourceRequired, true);
  assert.equal(result.sourceStatus, 'ambiguous');
  assert.ok(result.hardFails.includes('source_ambiguous'));
  assert.equal(runtime.calls.length, 0);
  assert.equal(result.artifacts.length, 2);
  assert.deepEqual(result.artifacts.map((artifact) => artifact.status), ['skipped', 'skipped']);
  assert.match(result.artifacts.map((artifact) => artifact.title).join('\n'), /Birkin/u);
  assert.match(result.artifacts.map((artifact) => artifact.title).join('\n'), /Hermes AI/u);
});

test('SourceCaptureService fails closed when search result markdown capture fails', async () => {
  const runtime = await makeRuntime({ failCapture: true });
  const service = new SourceCaptureService({
    runtime: runtime as unknown as BaoyuRuntimeService,
    searchProvider: new FakeSearchProvider([
      {
        title: 'Latest AI product update',
        url: 'https://example.com/ai-product-update',
        content: 'Release notes.'
      }
    ])
  });

  const result = await service.captureFromIntent({
    runId: 'search-capture-failed',
    intent: '把今天的 AI 产品更新写成一条像真人发出来的中文推文。'
  });

  assert.equal(result.sourceRequired, true);
  assert.equal(result.sourceStatus, 'failed');
  assert.ok(result.hardFails.includes('source_capture_failed'));
  assert.equal(result.artifacts[0]?.kind, 'search');
  assert.equal(result.artifacts[0]?.status, 'failed');
});
