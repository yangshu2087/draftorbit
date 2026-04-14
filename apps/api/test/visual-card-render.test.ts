import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  VisualCardRenderService,
  renderDeterministicVisualAsset
} from '../src/modules/generate/visual-card-render.service';

function tmpSvgPath(name: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'draftorbit-visual-card-'));
  return path.join(dir, name);
}

test('VisualCardRenderService renders tweet cover as app-rendered svg without prompt wrapper text', () => {
  const service = new VisualCardRenderService();

  const result = service.render({
    format: 'tweet',
    focus: '推文写作冷启动',
    text: '内容团队最容易卡住的，不是没人有灵感，而是每次都从空白页开始。比如周一谁都在等灵感，周三还没发；改成固定的“判断→例子→问题”节奏，周会前就能把内容排出来。',
    item: {
      kind: 'cover',
      priority: 'primary',
      type: 'single-card',
      layout: '判断 + 场景',
      style: '社交卡片',
      palette: '深色底 + 品牌强调色',
      cue: '周一谁都在等灵感，周三还没发。',
      reason: '真实团队节奏摩擦'
    }
  });

  assert.equal(result.metadata.renderer, 'template-svg');
  assert.equal(result.metadata.textLayer, 'app-rendered');
  assert.equal(result.metadata.aspectRatio, '1:1');
  assert.equal(result.diagnostics.overflow, false);
  assert.match(result.svg, /<svg/u);
  assert.match(result.svg, /周一谁都在等灵感/u);
  assert.doesNotMatch(result.svg, /给我一条|更像真人|冷启动判断句|prompt-wrapper/u);
});

test('renderDeterministicVisualAsset writes thread card SVG with safe metadata', async () => {
  const assetPath = tmpSvgPath('thread-cards.svg');

  const result = await renderDeterministicVisualAsset({
    format: 'thread',
    focus: 'AI 产品新功能上线',
    text: [
      '1/4\n一次 AI 功能上线最怕的，不是信息不够，而是第一条就写成功能清单。',
      '2/4\n这次上线别先列六个新功能，只讲“昨晚录一段语音，今天早上它已经帮你整理好跟进清单”这种使用场景。',
      '3/4\n我会只保留一个动作：把功能清单改成“录音→跟进清单”的使用场景，再把其余卖点放到后续卡片，别一上来就列功能。',
      '4/4\n如果这次上线只能先讲一个场景，你会先讲哪一个？'
    ].join('\n\n'),
    item: {
      kind: 'cards',
      priority: 'primary',
      type: 'story-cards',
      layout: '2–4 张卡片拆分推进点',
      style: '步骤卡组',
      palette: '品牌主色 + 白底正文',
      cue: '把功能清单改成“录音→跟进清单”的使用场景。',
      reason: '适合拆成卡片'
    },
    assetPath
  });

  assert.equal(result.metadata.renderer, 'template-svg');
  assert.equal(result.metadata.textLayer, 'app-rendered');
  assert.equal(result.metadata.aspectRatio, '1:1');
  assert.equal(result.diagnostics.overflow, false);
  assert.equal(fs.existsSync(assetPath), true);
  const svg = fs.readFileSync(assetPath, 'utf8');
  assert.match(svg, /DraftOrbit · thread cards/u);
  assert.match(svg, /录音→跟进清单/u);
  assert.doesNotMatch(svg, /更像真人|冷启动判断句/u);
});
