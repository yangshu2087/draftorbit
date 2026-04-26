import test from 'node:test';
import assert from 'node:assert/strict';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  buildProjectGenerationIntent,
  buildProjectPresetMetadata,
  normalizeProjectPreset,
  summarizeProjectRun
} from '../src/modules/v3/v3-projects';
import { V3CreateProjectDto, V3ProjectGenerateDto, V3RunChatDto } from '../src/modules/v3/v3.dto';

test('SkillTrust preset stores the project ops playbook and manual publish boundary', () => {
  const metadata = buildProjectPresetMetadata('skilltrust_x_ops');

  assert.equal(metadata.preset, 'skilltrust_x_ops');
  assert.equal(metadata.defaultFormat, 'thread');
  assert.match(metadata.objective, /SkillTrust/);
  assert.deepEqual(metadata.contentPillars, ['审计演示', '风险教育', '工作流方法', '发布日志', '数据洞察']);
  assert.equal(metadata.visualDefaults.mode, 'cards');
  assert.equal(metadata.visualDefaults.style, 'blueprint');
  assert.ok(metadata.publishChecklist.some((item) => /人工确认/.test(item)));
  assert.ok(metadata.publishChecklist.some((item) => /不自动发帖/.test(item)));
});

test('generic preset stays reusable and does not hard-code SkillTrust as the only project', () => {
  const metadata = buildProjectPresetMetadata('generic_x_ops');

  assert.equal(metadata.preset, 'generic_x_ops');
  assert.equal(metadata.defaultFormat, 'thread');
  assert.doesNotMatch(metadata.objective, /SkillTrust/);
  assert.ok(metadata.contentPillars.includes('观点短推'));
  assert.equal(metadata.visualDefaults.style, 'draftorbit');
});

test('project generation intent injects context without leaking provider internals', () => {
  const metadata = buildProjectPresetMetadata('skilltrust_x_ops');
  const intent = buildProjectGenerationIntent({
    project: {
      name: 'SkillTrust 推特/X 运营',
      description: '让用户安装 skill 前先知道风险。',
      metadata
    },
    userIntent: '写一组关于 skill 安装前审计的 thread',
    sourceUrls: ['https://example.com/skilltrust-audit']
  });

  assert.match(intent, /项目：SkillTrust 推特\/X 运营/);
  assert.match(intent, /目标：.*SkillTrust/);
  assert.match(intent, /受众：/);
  assert.match(intent, /内容支柱：审计演示、风险教育、工作流方法、发布日志、数据洞察/);
  assert.match(intent, /本次任务：写一组关于 skill 安装前审计的 thread/);
  assert.match(intent, /https:\/\/example\.com\/skilltrust-audit/);
  assert.match(intent, /发布前必须人工确认/);
  assert.doesNotMatch(intent, /Codex|Ollama|OpenAI|provider|fallback/i);
});

test('project DTOs validate presets, metadata, source URLs, and linked chat runs', () => {
  const createDto = plainToInstance(V3CreateProjectDto, {
    name: 'SkillTrust 推特/X 运营',
    preset: 'skilltrust_x_ops',
    metadata: { sourceUrls: ['https://example.com/a'] }
  });
  assert.deepEqual(validateSync(createDto), []);

  const generateDto = plainToInstance(V3ProjectGenerateDto, {
    intent: '生成本周审计 demo thread',
    format: 'thread',
    withImage: true,
    sourceUrls: ['https://example.com/a'],
    visualRequest: { mode: 'cards', style: 'blueprint', layout: 'flow' }
  });
  assert.deepEqual(validateSync(generateDto), []);

  const chatDto = plainToInstance(V3RunChatDto, {
    intent: '从项目里生成一条短推',
    format: 'tweet',
    withImage: true,
    contentProjectId: 'project_123'
  });
  assert.deepEqual(validateSync(chatDto), []);
});

test('project DTO rejects unknown preset names and bad source URLs', () => {
  const dto = plainToInstance(V3CreateProjectDto, {
    name: 'Bad project',
    preset: 'skilltrust_only_forever'
  });
  assert.ok(validateSync(dto).some((error) => error.property === 'preset'));

  const generateDto = plainToInstance(V3ProjectGenerateDto, {
    intent: '生成 thread',
    format: 'thread',
    withImage: true,
    sourceUrls: ['not-a-url']
  });
  assert.ok(validateSync(generateDto).some((error) => error.property === 'sourceUrls'));
});

test('normalizeProjectPreset and summarizeProjectRun produce stable API-facing values', () => {
  assert.equal(normalizeProjectPreset(undefined), 'generic_x_ops');
  assert.equal(normalizeProjectPreset('skilltrust_x_ops'), 'skilltrust_x_ops');
  assert.throws(() => normalizeProjectPreset('bad' as never), /INVALID_PROJECT_REQUEST/);

  const summary = summarizeProjectRun({
    id: 'run_1',
    status: 'DONE',
    type: 'THREAD',
    createdAt: new Date('2026-04-25T12:00:00Z'),
    result: {
      tweet: '正文',
      visualAssets: [{ id: '01-cover', status: 'ready' }],
      quality: { total: 88 }
    },
    publishJobs: []
  });

  assert.deepEqual(summary, {
    runId: 'run_1',
    status: 'DONE',
    format: 'thread',
    text: '正文',
    visualAssetCount: 1,
    bundleReady: true,
    qualityScore: 88,
    publishPrepStatus: 'needs_review',
    createdAt: '2026-04-25T12:00:00.000Z',
    nextAction: 'confirm_publish'
  });
});
