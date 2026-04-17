import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContentQualityGate } from '../src/modules/generate/content-quality-gate';

const passingThreadText = [
  '1/4\n一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
  '2/4\n这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景。',
  '3/4\n我会只保留一个动作：把功能清单改成“录音→跟进清单”的使用场景。',
  '4/4\n如果这次上线只能先讲一个场景，你会先讲哪一个？'
].join('\n\n');

test('buildContentQualityGate flags placeholder images without hiding otherwise safe text', () => {
  const gate = buildContentQualityGate({
    format: 'thread',
    focus: 'AI 产品新功能上线',
    text: passingThreadText,
    visualAssets: [
      {
        id: '01-cover',
        kind: 'cover',
        status: 'ready',
        assetUrl: '/placeholder/thread.png',
        assetPath: '/tmp/placeholder-thread.png',
        cue: '给我一条更像真人的冷启动判断句。',
        renderer: 'provider-image',
        textLayer: 'none',
        aspectRatio: '1:1'
      }
    ]
  });

  assert.equal(gate.status, 'passed');
  assert.equal(gate.safeToDisplay, true);
  assert.match(gate.visualHardFails?.join(',') ?? '', /visual_asset_placeholder|visual_asset_prompt_leakage/u);
});

test('buildContentQualityGate flags missing thread visual cards when images are requested', () => {
  const gate = buildContentQualityGate({
    format: 'thread',
    focus: 'AI 产品新功能上线',
    text: passingThreadText,
    visualAssets: [
      {
        id: '01-cover',
        kind: 'cover',
        status: 'ready',
        assetUrl: '/v3/chat/runs/run_123/assets/01-cover',
        assetPath: '/artifacts/baoyu-runtime/run_123/visual/images/01-cover.svg',
        cue: '一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
        renderer: 'template-svg',
        textLayer: 'app-rendered',
        aspectRatio: '1:1'
      }
    ],
    requireVisualAssets: true
  });

  assert.equal(gate.status, 'passed');
  assert.equal(gate.safeToDisplay, true);
  assert.match(gate.visualHardFails?.join(',') ?? '', /thread_visual_cards_missing/u);
});
