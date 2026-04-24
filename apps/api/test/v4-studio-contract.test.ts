import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { V4Controller } from '../src/modules/v4/v4.controller';
import { V4Module } from '../src/modules/v4/v4.module';
import {
  V4_STUDIO_FORMATS,
  V4_STUDIO_SKILL_MATRIX,
  buildV4PreviewFromV3Run,
  normalizeV4StudioRequest,
  resolveV4SourceRequirement
} from '../src/modules/v4/v4-studio.contract';

test('V4 Studio contract exposes creator-grade formats and baoyu parity skills', () => {
  assert.deepEqual(V4_STUDIO_FORMATS, ['tweet', 'thread', 'article', 'diagram', 'social_pack']);
  assert.ok(V4_STUDIO_SKILL_MATRIX.some((item) => item.skill === 'baoyu-imagine' && item.usedByDraftOrbit));
  assert.ok(V4_STUDIO_SKILL_MATRIX.some((item) => item.skill === 'baoyu-diagram' && item.usedByDraftOrbit));
  assert.ok(V4_STUDIO_SKILL_MATRIX.some((item) => item.skill === 'baoyu-post-to-x' && item.safeMode === 'manual-confirm'));
});

test('normalizeV4StudioRequest maps diagram/social pack into safe V3 visual generation requests', () => {
  const diagram = normalizeV4StudioRequest({
    prompt: '把输入→来源→正文→图文→确认做成流程图',
    format: 'diagram',
    visualRequest: { style: 'blueprint', layout: 'flow', palette: 'mono', aspect: '16:9' },
    exportRequest: { markdown: true, html: true, bundle: true }
  });

  assert.equal(diagram.v3.format, 'tweet');
  assert.equal(diagram.v3.withImage, true);
  assert.equal(diagram.v3.visualRequest.mode, 'diagram');
  assert.equal(diagram.v3.visualRequest.exportHtml, true);
  assert.doesNotMatch(diagram.v3.intent, /V4 Creator Studio|routing:|provider|Codex OAuth/u);
  assert.match(diagram.v3.intent, /流程图|架构图/u);

  const social = normalizeV4StudioRequest({
    prompt: '把这次版本更新做成一套社交图文包',
    format: 'social_pack',
    visualRequest: { mode: 'auto', style: 'bold-editorial' }
  });
  assert.equal(social.v3.format, 'thread');
  assert.equal(social.v3.visualRequest.mode, 'social_pack');
});

test('resolveV4SourceRequirement fails closed for latest/freshness prompts without source URL', () => {
  assert.deepEqual(resolveV4SourceRequirement({
    prompt: '写一篇关于最新 Hermes Agent 消息的长文',
    format: 'article'
  }), {
    blocked: true,
    code: 'SOURCE_REQUIRED',
    statusCode: 424,
    recoveryAction: 'add_source',
    message: '涉及最新事实但没有可靠来源。请粘贴 URL 或配置搜索 provider，DraftOrbit 不会编造最新信息。'
  });

  assert.equal(resolveV4SourceRequirement({
    prompt: '根据 https://example.com/source 写一篇关于最新 Hermes Agent 的长文',
    format: 'article',
    sourceUrl: 'https://example.com/source'
  }).blocked, false);
});

test('buildV4PreviewFromV3Run returns V4 result preview contract with provenance and safe publish prep', () => {
  const preview = buildV4PreviewFromV3Run({
    requestId: 'req_test',
    runId: 'run_test',
    status: 'DONE',
    format: 'thread',
    result: {
      text: '1/4 先讲场景\n\n2/4 再讲判断',
      visualAssets: [
        {
          id: '01-card',
          kind: 'cards',
          status: 'ready',
          provider: 'codex-local-svg',
          model: 'codex-local/quick',
          skill: 'baoyu-image-cards',
          exportFormat: 'svg',
          checksum: 'sha256-card',
          signedAssetUrl: '/v3/chat/runs/run_test/assets/01-card?token=signed',
          promptPath: '/artifacts/run_test/01-card.prompt.md',
          specPath: '/artifacts/run_test/01-card.spec.json',
          cue: '具体卡片场景'
        }
      ],
      visualAssetsBundleUrl: '/v3/chat/runs/run_test/assets.zip?token=signed-zip',
      sourceArtifacts: [],
      qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [], judgeNotes: [] },
      usage: [{ model: 'CODEX_LOCAL', modelUsed: 'codex-local/quick', routingTier: 'high', costUsd: 0 }]
    },
    publish: [],
    stages: []
  });

  assert.equal(preview.textResult.format, 'thread');
  assert.equal(preview.visualAssets[0]?.provider, 'codex-local-svg');
  assert.equal(preview.visualAssets[0]?.provenanceLabel, 'Codex 本机 SVG');
  assert.equal(preview.visualAssetsBundleUrl, '/v3/chat/runs/run_test/assets.zip?token=signed-zip');
  assert.equal(preview.qualityGate.safeToDisplay, true);
  assert.equal(preview.publishPreparation.mode, 'manual-confirm');
  assert.equal(preview.usageEvidence.primaryProvider, 'codex-local');
});

test('V4 Studio Nest module is mounted without replacing V3 rollback routes', () => {
  const appImports = Reflect.getMetadata('imports', AppModule) as unknown[];
  assert.ok(appImports.includes(V4Module));

  assert.equal(Reflect.getMetadata(PATH_METADATA, V4Controller), 'v4');
  const runHandler = Object.getOwnPropertyDescriptor(V4Controller.prototype, 'runStudio')?.value;
  assert.equal(Reflect.getMetadata(PATH_METADATA, runHandler), 'studio/run');
  assert.equal(Reflect.getMetadata(METHOD_METADATA, runHandler), RequestMethod.POST);
});
