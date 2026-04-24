import test from 'node:test';
import assert from 'node:assert/strict';
import {
  V4_FORMAT_OPTIONS,
  buildV4BundleDownloadUrl,
  buildV4StudioRunRequest,
  buildV4StudioPreview,
  hydrateV4StudioRunUntilReady,
  shouldHydrateV4StudioFromStream,
  shouldUseV4LocalPreviewFallback,
  getV4ErrorCopy,
  getV4ProviderLabel
} from '../lib/v4-studio';

const expectedApiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

test('V4 Studio exposes tweet/thread/article/diagram/social pack creator formats', () => {
  assert.deepEqual(V4_FORMAT_OPTIONS.map((item) => item.value), ['tweet', 'thread', 'article', 'diagram', 'social_pack']);
  assert.ok(V4_FORMAT_OPTIONS.every((item) => item.visualMode && item.baoyuSkill));
});

test('buildV4StudioRunRequest normalizes diagram into Codex-first visual request', () => {
  const request = buildV4StudioRunRequest({
    prompt: '把输入→来源→正文→图文→确认做成流程图',
    format: 'diagram',
    sourceUrl: '',
    controls: { style: 'blueprint', layout: 'flow', palette: 'mono', aspect: '16:9', exportHtml: true }
  });

  assert.equal(request.prompt, '把输入→来源→正文→图文→确认做成流程图');
  assert.equal(request.format, 'diagram');
  assert.equal(request.visualRequest.mode, 'diagram');
  assert.equal(request.visualRequest.style, 'blueprint');
  assert.equal(request.visualRequest.exportHtml, true);
  assert.deepEqual(request.exportRequest, { markdown: true, html: true, bundle: true });
});

test('V4 preview copy labels Codex SVG assets and never presents failed assets as real', () => {
  const preview = buildV4StudioPreview({
    textResult: { format: 'article', content: '标题\n\n导语', variants: [] },
    visualAssets: [
      { id: 'cover', kind: 'cover', status: 'ready', provider: 'codex-local-svg', exportFormat: 'svg', provenanceLabel: 'Codex 本机 SVG', signedAssetUrl: '/asset.svg' },
      { id: 'failed', kind: 'infographic', status: 'failed', provider: 'template-svg', exportFormat: 'svg', provenanceLabel: '模板渲染' }
    ],
    sourceArtifacts: [],
    qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [] },
    publishPreparation: { mode: 'manual-confirm', label: '准备发布 / 手动确认', canAutoPost: false },
    usageEvidence: { primaryProvider: 'codex-local', model: 'codex-local/quick', fallbackDepth: 0 }
  });

  assert.equal(preview.readyAssets.length, 1);
  assert.equal(preview.failedAssets.length, 1);
  assert.equal(preview.readyAssets[0]?.providerLabel, 'Codex 本机 SVG');
  assert.match(preview.publishCopy, /手动确认/u);
});

test('V4 error copy is fail-closed and user-recoverable for latest source gaps', () => {
  assert.deepEqual(getV4ErrorCopy('SOURCE_REQUIRED'), {
    title: '需要来源后再生成',
    description: '这类最新事实不能靠模型猜。请粘贴 URL，或先配置搜索 provider。',
    primaryAction: '粘贴来源 URL',
    tone: 'warning'
  });
});

test('V4 provider labels distinguish Codex OAuth from Ollama/local fallbacks', () => {
  assert.equal(getV4ProviderLabel('codex-local-svg'), 'Codex 本机 SVG');
  assert.equal(getV4ProviderLabel('ollama-text'), '本地低内存模型');
  assert.equal(getV4ProviderLabel('template-svg'), '安全模板渲染');
});

test('V4 preview only enables bundle download when a real signed asset URL exists', () => {
  const localPreview = buildV4StudioPreview({
    textResult: { format: 'thread', content: '1/4 本地预览', variants: [] },
    visualAssets: [
      { id: 'local-card', kind: 'cards', status: 'ready', provider: 'codex-local-svg', exportFormat: 'svg', provenanceLabel: 'Codex 本机 SVG' }
    ],
    sourceArtifacts: [],
    qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [] },
    publishPreparation: { mode: 'manual-confirm', label: '准备发布 / 手动确认', canAutoPost: false },
    usageEvidence: { primaryProvider: 'codex-local', model: 'codex-local/quick', fallbackDepth: 0 }
  });
  assert.equal(localPreview.hasDownloadableAssets, false);
  assert.equal(localPreview.bundleActionCopy, '真实 run 完成后可下载 bundle');

  const runPreview = buildV4StudioPreview({
    textResult: { format: 'thread', content: '1/4 真实 run', variants: [] },
    visualAssetsBundleUrl: '/v3/chat/runs/run/assets.zip?token=signed-zip',
    visualAssets: [
      { id: 'card', kind: 'cards', status: 'ready', provider: 'codex-local-svg', exportFormat: 'svg', signedAssetUrl: '/v3/chat/runs/run/assets/card?token=signed', provenanceLabel: 'Codex 本机 SVG' }
    ],
    sourceArtifacts: [],
    qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [] },
    publishPreparation: { mode: 'manual-confirm', label: '准备发布 / 手动确认', canAutoPost: false },
    usageEvidence: { primaryProvider: 'codex-local', model: 'codex-local/quick', fallbackDepth: 0 }
  });
  assert.equal(runPreview.hasDownloadableAssets, true);
  assert.equal(runPreview.bundleUrl, `${expectedApiBaseUrl}/v3/chat/runs/run/assets.zip?token=signed-zip`);
  assert.equal(runPreview.bundleActionCopy, '下载 bundle');
});


test('V4 local preview fallback is used for queued runs without content or assets', () => {
  assert.equal(
    shouldUseV4LocalPreviewFallback({
      runId: 'run_queued',
      status: 'RUNNING',
      textResult: { format: 'thread', content: '', variants: [] },
      visualAssets: [],
      sourceArtifacts: [],
      qualityGate: { status: 'unknown', safeToDisplay: true, hardFails: [] },
      publishPreparation: { mode: 'manual-confirm', label: '准备发布 / 手动确认', canAutoPost: false },
      usageEvidence: { primaryProvider: 'unknown', model: null, fallbackDepth: 0 }
    }),
    true
  );

  assert.equal(
    shouldUseV4LocalPreviewFallback({
      runId: 'run_done',
      status: 'DONE',
      textResult: { format: 'thread', content: '1/4 可发布内容', variants: [] },
      visualAssets: [],
      sourceArtifacts: [],
      qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [] },
      publishPreparation: { mode: 'manual-confirm', label: '准备发布 / 手动确认', canAutoPost: false },
      usageEvidence: { primaryProvider: 'codex-local', model: 'codex-local/quick', fallbackDepth: 0 }
    }),
    false
  );
});

test('V4 stream hydration gates on publish/package done events', () => {
  assert.equal(shouldHydrateV4StudioFromStream({ stage: 'draft', status: 'done', summary: '草稿完成' }), false);
  assert.equal(shouldHydrateV4StudioFromStream({ stage: 'publish_prep', status: 'done', summary: '结果已准备好' }), true);
  assert.equal(shouldHydrateV4StudioFromStream({ stage: 'package', status: 'running', summary: '结果处理中' }), false);
});

test('V4 hydration polling returns real preview once text or ready assets exist', async () => {
  let calls = 0;
  const result = await hydrateV4StudioRunUntilReady(
    async () => {
      calls += 1;
      if (calls < 3) {
        return {
          runId: 'run_hydrating',
          status: 'RUNNING',
          textResult: { format: 'thread', content: '', variants: [] },
          visualAssets: [],
          sourceArtifacts: [],
          qualityGate: { status: 'unknown', safeToDisplay: true, hardFails: [] },
          publishPreparation: { mode: 'manual-confirm', label: '准备发布 / 手动确认', canAutoPost: false },
          usageEvidence: { primaryProvider: 'unknown', model: null, fallbackDepth: 0 }
        };
      }

      return {
        runId: 'run_hydrating',
        status: 'DONE',
        visualAssetsBundleUrl: '/v3/chat/runs/run_hydrating/assets.zip?token=signed',
        textResult: { format: 'thread', content: '1/4 真实结果', variants: [] },
        visualAssets: [
          { id: 'card', kind: 'cards', status: 'ready', provider: 'codex-local-svg', exportFormat: 'svg', signedAssetUrl: '/v3/chat/runs/run_hydrating/assets/card?token=signed' }
        ],
        sourceArtifacts: [],
        qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [] },
        publishPreparation: { mode: 'manual-confirm', label: '准备发布 / 手动确认', canAutoPost: false },
        usageEvidence: { primaryProvider: 'codex-local', model: 'codex-local/quick', fallbackDepth: 0 }
      };
    },
    'run_hydrating',
    { intervalsMs: [0, 0, 0], timeoutMs: 50 }
  );

  assert.equal(calls, 3);
  assert.equal(result?.textResult.content, '1/4 真实结果');
  assert.equal(buildV4BundleDownloadUrl(result), `${expectedApiBaseUrl}/v3/chat/runs/run_hydrating/assets.zip?token=signed`);
});
