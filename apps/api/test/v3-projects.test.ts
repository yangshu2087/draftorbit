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
import { buildDraftPayloadFallback, extractIntentFocus } from '../src/modules/generate/content-strategy';

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


test('SkillTrust project intent carries publishable thread and visual quality rules', () => {
  const metadata = buildProjectPresetMetadata('skilltrust_x_ops');
  const intent = buildProjectGenerationIntent({
    project: {
      name: 'SkillTrust 推特/X 运营',
      description: '安装 Agent skill 前的判断系统。',
      metadata
    },
    userIntent: '写一组关于安装前审计的 thread'
  });

  assert.match(intent, /证据型锋利/);
  assert.match(intent, /证据卡/);
  assert.match(intent, /6-8 条/);
  assert.match(intent, /4 图卡片/);
  assert.match(intent, /封面.*风险.*证据.*行动/s);
  assert.match(intent, /评论区丢.*Skill/);
  assert.match(intent, /不承诺.*绝对安全|不是安全担保/);
  assert.match(intent, /禁止.*全网最大|禁用表述/);
  assert.doesNotMatch(intent, /已自动发布|自动发帖成功/);
});



test('SkillTrust project intent keeps the user topic as the generation focus', () => {
  const metadata = buildProjectPresetMetadata('skilltrust_x_ops');
  const intent = buildProjectGenerationIntent({
    project: {
      name: 'SkillTrust 质量 UAT 2026-04-26',
      description: '3 组内容质量验收',
      metadata
    },
    userIntent: '写一组关于安装前审计的 thread，提醒用户先看来源、权限和 token 风险'
  });
  const firstLine = intent.split('\n')[0];
  assert.match(firstLine, /安装前审计/);
  assert.doesNotMatch(firstLine, /项目：SkillTrust 质量 UAT/);
  assert.match(extractIntentFocus(`用户意图：${intent}`), /安装前审计/);
  assert.doesNotMatch(extractIntentFocus(`用户意图：${intent}`), /质量 UAT/);
});



test('SkillTrust fallback thread stays on audit risk instead of generic skill examples', () => {
  const fallback = buildDraftPayloadFallback({
    format: 'thread',
    focus: '写一组风险教育 thread：AI skill 不是 prompt 文案，它可能是可执行工作流入口',
    hook: 'AI skill 最容易被误判的地方，不是功能，而是它可能碰到执行边界。',
    body: ['安装前先看来源', '再看命令、文件读写、联网和 token', '最后人工决定是否安装'],
    cta: '评论区丢一个 Skill 链接或描述，我挑几个做公开审计'
  });
  const text = fallback.thread?.join('\n\n') ?? '';
  assert.match(text, /来源|权限|命令|联网|token|文件/u);
  assert.match(text, /SkillTrust|Skill/u);
  assert.doesNotMatch(text, /每天整理 10 条用户反馈|重复动作做成 skill|读者看完还是不知道/u);
});



test('SkillTrust fallback threads vary by audit, risk education, and workflow scenario', () => {
  const cases = [
    ['audit', '写一组 #SkillTrust审计第1期 thread：提醒用户安装任何 Codex/Claude skill 前，先看来源、安装命令、文件读写、联网和 token 风险', /Codex|Claude|安装命令/],
    ['risk', '写一组风险教育 thread：AI skill 不是 prompt 文案，它可能是可执行工作流入口', /prompt|工作流入口|执行边界/],
    ['workflow', '写一组工作流方法 thread：从看到很香的 skill 到用 SkillTrust 搜索、比较、看证据、人工决定', /搜索|比较|人工决定/]
  ] as const;

  const rendered = cases.map(([, focus, expected]) => {
    const text = buildDraftPayloadFallback({
      format: 'thread',
      focus,
      hook: focus,
      body: ['来源', '权限', '行动'],
      cta: '评论区丢一个 Skill 链接或描述，我挑几个做公开审计'
    }).thread?.join('\n\n') ?? '';
    assert.match(text, expected);
    assert.match(text, /SkillTrust|AI skill/i);
    assert.doesNotMatch(text, /每天整理 10 条用户反馈|只改开头这一处|重复动作做成 skill/u);
    return text;
  });

  assert.notEqual(rendered[0], rendered[1]);
  assert.notEqual(rendered[1], rendered[2]);
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
