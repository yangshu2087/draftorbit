import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BAOYU_PRODUCT_SKILL_MATRIX,
  ORDINARY_USER_BAOYU_SYNC_CASES,
  ORDINARY_USER_ROUTE_AUDIT_TARGETS,
  assertOrdinaryUserCaseEvidence,
  buildOrdinaryUserBaoyuSyncReport,
  buildOrdinaryUserBaoyuOutputPaths,
  buildOrdinaryUserEvidenceNotes,
  findPromptWrapperLeaks
} from '../../../scripts/ordinary-user-baoyu-sync';

test('ordinary-user baoyu sync suite covers tweet thread and article with the real regression prompt', () => {
  assert.equal(ORDINARY_USER_BAOYU_SYNC_CASES.length, 7);
  assert.deepEqual(
    ORDINARY_USER_BAOYU_SYNC_CASES.map((item) => item.format),
    ['tweet', 'thread', 'article', 'article', 'tweet', 'article', 'article']
  );
  assert.ok(
    ORDINARY_USER_BAOYU_SYNC_CASES.some((item) =>
      item.prompt.includes('别再靠灵感写推文，给我一条更像真人的冷启动判断句。')
    )
  );
  assert.ok(ORDINARY_USER_BAOYU_SYNC_CASES.some((item) => item.id === 'latest-hermes-source' && item.sourceExpectation === 'ready_or_blocked'));
  assert.ok(ORDINARY_USER_BAOYU_SYNC_CASES.some((item) => item.id === 'latest-hermes-agent-url-source' && item.sourceExpectation === 'ready'));
  assert.ok(ORDINARY_USER_BAOYU_SYNC_CASES.some((item) => item.id === 'article-generic-scaffold-gate' && item.acceptQualityBlocked));
  assert.ok(ORDINARY_USER_BAOYU_SYNC_CASES.some((item) => item.id === 'diagram-process-prompt' && item.visualMode === 'diagram'));
});

test('baoyu ordinary-user report matrix covers product-relevant skills and blocks real X publishing', () => {
  assert.deepEqual(
    BAOYU_PRODUCT_SKILL_MATRIX.map((item) => item.skill),
    [
      'baoyu-url-to-markdown',
      'baoyu-danger-x-to-markdown',
      'baoyu-format-markdown',
      'baoyu-imagine',
      'baoyu-image-gen',
      'baoyu-image-cards',
      'baoyu-cover-image',
      'baoyu-infographic',
      'baoyu-article-illustrator',
      'baoyu-diagram',
      'baoyu-compress-image',
      'baoyu-markdown-to-html',
      'baoyu-post-to-x'
    ]
  );
  const imageGen = BAOYU_PRODUCT_SKILL_MATRIX.find((item) => item.skill === 'baoyu-image-gen');
  assert.match(imageGen?.gapOrReason ?? '', /deprecated|baoyu-imagine|migrated/iu);
  const markdownToHtml = BAOYU_PRODUCT_SKILL_MATRIX.find((item) => item.skill === 'baoyu-markdown-to-html');
  assert.equal(markdownToHtml?.status, 'runtime_integrated');
  const xPublish = BAOYU_PRODUCT_SKILL_MATRIX.find((item) => item.skill === 'baoyu-post-to-x');
  assert.equal(xPublish?.status, 'blocked_external_action');
  assert.match(xPublish?.draftOrbitUsage ?? '', /prepare|manual|blocked|沙箱|阻断/iu);
});

test('ordinary-user baoyu output paths keep screenshots ignored and copy markdown reports into tracked report folder', () => {
  const paths = buildOrdinaryUserBaoyuOutputPaths('/repo', '2026-04-14_10-30-00');
  assert.equal(paths.evidenceDir, '/repo/output/playwright/ordinary-user-baoyu-sync-2026-04-14_10-30-00');
  assert.equal(paths.evidenceReportPath, `${paths.evidenceDir}/BAOYU-ORDINARY-USER-SYNC.md`);
  assert.equal(paths.trackedReportDir, '/repo/output/reports/uat-full');
  assert.equal(paths.trackedReportPath, '/repo/output/reports/uat-full/BAOYU-ORDINARY-USER-SYNC-2026-04-14_10-30-00.md');
});

test('ordinary-user route audit covers the restored public app queue connect and pricing surfaces', () => {
  assert.deepEqual(
    ORDINARY_USER_ROUTE_AUDIT_TARGETS.map((item) => item.path),
    ['/', '/app', '/connect?intent=connect_x_self', '/queue?intent=confirm_publish', '/pricing']
  );
  assert.ok(ORDINARY_USER_ROUTE_AUDIT_TARGETS.find((item) => item.id === 'connect')?.expectedCopy.includes('连接 X 账号'));
  assert.ok(ORDINARY_USER_ROUTE_AUDIT_TARGETS.find((item) => item.id === 'queue')?.expectedCopy.includes('当前待确认内容'));
  assert.ok(ORDINARY_USER_ROUTE_AUDIT_TARGETS.find((item) => item.id === 'pricing')?.notes.join(' ').includes('payment'));
});

test('ordinary-user evidence notes do not count missing model-key route-only runs as baoyu quality evidence', () => {
  const notes = buildOrdinaryUserEvidenceNotes({ DRAFTORBIT_SEARCH_PROVIDER: 'none' }, 0);
  assert.ok(notes.some((note) => note.includes('No real OPENAI_API_KEY/OPENROUTER_API_KEY')));
  assert.ok(notes.some((note) => note.includes('No live generation cases were selected')));
  assert.ok(notes.some((note) => note.includes('fail closed')));
});

test('findPromptWrapperLeaks catches prompt-wrapper words in text, visual plan and visual assets', () => {
  const leaks = findPromptWrapperLeaks({
    text: '给我一条更像真人的冷启动判断句：内容团队不要从空白页开始。',
    visualPlan: {
      primaryAsset: 'cover',
      visualizablePoints: ['周一谁都在等灵感'],
      keywords: [],
      items: [
        {
          kind: 'cover',
          priority: 'primary',
          type: 'scene',
          layout: 'single-card',
          style: 'editorial',
          palette: 'slate',
          cue: '给我一条更像真人的冷启动判断句',
          reason: '复读 prompt'
        }
      ]
    },
    visualAssets: [
      {
        id: '01-cover',
        kind: 'cover',
        status: 'ready',
        assetUrl: '/v3/chat/runs/run/assets/01-cover',
        cue: '空荡荡的输入框'
      }
    ]
  });

  assert.ok(leaks.some((item) => item.includes('text:给我一条')));
  assert.ok(leaks.some((item) => item.includes('visualPlan.items[0].cue:给我一条')));
  assert.ok(leaks.some((item) => item.includes('visualAssets[0].cue:空荡荡的输入框')));
});

test('assertOrdinaryUserCaseEvidence rejects heuristic, free and placeholder evidence', () => {
  assert.throws(
    () =>
      assertOrdinaryUserCaseEvidence({
        caseDef: ORDINARY_USER_BAOYU_SYNC_CASES[0],
        finalPayload: {
          runId: 'run-bad',
          status: 'DONE',
          format: 'tweet',
          result: {
            text: '内容团队不要从空白页开始。',
            routing: { primaryModel: 'draftorbit/heuristic', routingTier: 'free_first', profile: 'test_high' },
            runtime: { engine: 'baoyu-skills', commit: 'dcd0f8143349', skills: ['baoyu-imagine'] },
            qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [], judgeNotes: [] },
            visualPlan: { primaryAsset: 'cover', visualizablePoints: ['周一谁都在等灵感'], keywords: [], items: [] },
            visualAssets: [
              {
                id: '01-cover',
                kind: 'cover',
                status: 'ready',
                assetUrl: '/placeholder.png',
                cue: '周一谁都在等灵感'
              }
            ]
          }
        },
        bodyText: '连接 X 后才能发布\n图文资产\n只重试图片\n主视觉方向\n已生成',
        consoleErrors: [],
        screenshotPath: '/tmp/screenshot.png',
        finalJsonPath: '/tmp/final.json'
      }),
    /heuristic|free_first|placeholder/u
  );
});

test('assertOrdinaryUserCaseEvidence rejects visual quality hard fails from the API gate', () => {
  assert.throws(
    () =>
      assertOrdinaryUserCaseEvidence({
        caseDef: ORDINARY_USER_BAOYU_SYNC_CASES[1],
        finalPayload: {
          runId: 'run-visual-hard-fail',
          status: 'DONE',
          format: 'thread',
          result: {
            text: '1/4\nAI 产品更新写成建议模板，用户不会继续看。\n\n2/4\n比如只说效率提升，读者不知道省的是哪一步。\n\n3/4\n改成一个具体动作：上传录音后 3 分钟拿到纪要。\n\n4/4\n如果只改第一条，你会先补哪个真实场景？',
            routing: { primaryModel: 'x-ai/grok-4.20', routingTier: 'quality_fallback', profile: 'test_high' },
            runtime: { engine: 'baoyu-skills', commit: 'dcd0f8143349', skills: ['baoyu-imagine'] },
            qualityGate: {
              status: 'passed',
              safeToDisplay: true,
              hardFails: [],
              visualHardFails: ['thread_visual_cards_missing'],
              judgeNotes: []
            },
            visualPlan: { primaryAsset: 'cover', visualizablePoints: ['上传录音后 3 分钟拿到纪要'], keywords: [], items: [] },
            visualAssets: [
              {
                id: '01-cover',
                kind: 'cover',
                status: 'ready',
                renderer: 'template-svg',
                textLayer: 'app-rendered',
                aspectRatio: '1:1',
                assetUrl: '/v3/chat/runs/run/assets/01-cover',
                cue: '上传录音后 3 分钟拿到纪要',
                promptPath: '/artifacts/baoyu-runtime/run/visual/prompts/01-cover.md'
              }
            ]
          }
        },
        bodyText: '结果已生成\n连接 X 后才能发布\n图文资产\n只重试图片\n下载全部图文资产\n主视觉方向\n已生成',
        consoleErrors: [],
        screenshotPath: '/tmp/screenshot.png',
        finalJsonPath: '/tmp/final.json'
      }),
    /visual qualityGate failed|thread 缺少 ready cards/u
  );
});

test('assertOrdinaryUserCaseEvidence accepts source-required failures only when the UI blocks with recoverable source copy', () => {
  const sourceCase = ORDINARY_USER_BAOYU_SYNC_CASES.find((item) => item.id === 'latest-hermes-source');
  assert.ok(sourceCase);

  const summary = assertOrdinaryUserCaseEvidence({
    caseDef: sourceCase,
    finalPayload: {
      runId: 'run-source-blocked',
      status: 'DONE',
      format: 'article',
      result: {
        text: '',
        routing: { primaryModel: 'source-blocked', routingTier: 'source-blocked', profile: 'test_high' },
        qualityGate: {
          status: 'failed',
          safeToDisplay: false,
          hardFails: ['source_ambiguous'],
          sourceRequired: true,
          sourceStatus: 'ambiguous',
          judgeNotes: []
        },
        sourceArtifacts: [
          {
            kind: 'search',
            status: 'skipped',
            title: 'Hermès luxury brand news',
            url: 'https://www.hermes.com/story',
            markdownPath: '/tmp/source.md'
          }
        ],
        visualAssets: []
      }
    },
    bodyText: '结果已生成\n需要可靠来源，不能编造最新事实\n粘贴来源 URL 再生成\n改成非最新主题再生成',
    consoleErrors: [],
    screenshotPath: '/tmp/source.png',
    finalJsonPath: '/tmp/source.json'
  });

  assert.equal(summary.pass, true);
  assert.equal(summary.sourcePass, true);
  assert.equal(summary.sourceStatus, 'ambiguous');
});

test('assertOrdinaryUserCaseEvidence accepts generic quality failures only with recoverable user copy', () => {
  const qualityCase = ORDINARY_USER_BAOYU_SYNC_CASES.find((item) => item.id === 'article-generic-scaffold-gate');
  assert.ok(qualityCase);

  const summary = assertOrdinaryUserCaseEvidence({
    caseDef: qualityCase,
    finalPayload: {
      runId: 'run-quality-blocked',
      status: 'DONE',
      format: 'article',
      result: {
        text: '',
        routing: { primaryModel: 'anthropic/claude-sonnet-4.6', routingTier: 'quality_fallback', profile: 'test_high' },
        runtime: { engine: 'baoyu-skills', commit: 'dcd0f8143349', skills: ['baoyu-imagine'] },
        qualityGate: {
          status: 'failed',
          safeToDisplay: false,
          hardFails: ['article_generic_scaffold'],
          userMessage: '内容还像大纲或写作过程，已拦截。',
          recoveryAction: 'retry',
          judgeNotes: ['article_generic_scaffold']
        },
        visualAssets: []
      }
    },
    bodyText: '结果已生成\n这版还没达到可发布标准\nDraftOrbit 已拦截坏稿\n再来一版\n回到输入框调整\n质量未通过，不能复制\n质量未通过，不能发布',
    consoleErrors: [],
    screenshotPath: '/tmp/quality.png',
    finalJsonPath: '/tmp/quality.json'
  });

  assert.equal(summary.pass, true);
  assert.equal(summary.visualAssetsReady, 0);
});

test('assertOrdinaryUserCaseEvidence accepts source-ready URL artifacts for latest source cases', () => {
  const sourceCase = ORDINARY_USER_BAOYU_SYNC_CASES.find((item) => item.id === 'latest-hermes-agent-url-source');
  assert.ok(sourceCase);

  const summary = assertOrdinaryUserCaseEvidence({
    caseDef: sourceCase,
    finalPayload: {
      runId: 'run-source-ready',
      status: 'DONE',
      format: 'article',
      result: {
        text: [
          'Hermes Agent 爆火，真正值得写的不是“又一个新工具”',
          '导语',
          '这篇来源里最有传播价值的点，是它把用户对 OpenClaw 的焦虑放到了一个具体参照里：两个月、四万多星、以及“下一个龙虾”的讨论。',
          '一、先看具体摩擦',
          '很多读者看到 Hermes Agent，不是在问它是不是更强，而是在问自己原来那套工作流会不会被替换。',
          '二、再看可执行动作',
          '写这类内容时，先把来源里的增长数字和对比对象讲清楚，再补一个用户迁移前后的场景。',
          '三、最后收束成判断',
          '如果只写“它很火”，文章就停在资讯；如果写清楚谁为什么开始试用它，读者才会继续看。',
          '结尾',
          '你更关心 Hermes Agent 的增长速度，还是它会不会改掉现有工具链？'
        ].join('\n\n'),
        routing: { primaryModel: 'anthropic/claude-sonnet-4.6', routingTier: 'quality_fallback', profile: 'test_high' },
        runtime: { engine: 'baoyu-skills', commit: 'dcd0f8143349', skills: ['baoyu-url-to-markdown'] },
        qualityGate: {
          status: 'passed',
          safeToDisplay: true,
          hardFails: [],
          sourceRequired: true,
          sourceStatus: 'ready',
          judgeNotes: []
        },
        sourceArtifacts: [
          {
            kind: 'url',
            status: 'ready',
            title: '取代龙虾的是爱马仕？狂揽4万星的Hermes Agent',
            url: 'https://tech.ifeng.com/c/8sDHJq3vKxM',
            markdownPath: '/tmp/hermes-agent.md'
          }
        ],
        visualAssets: [
          {
            kind: 'cover',
            status: 'ready',
            renderer: 'template-svg',
            textLayer: 'app-rendered',
            assetUrl: '/v3/chat/runs/run-source-ready/assets/cover.svg',
            promptPath: '/tmp/cover.md',
            cue: '两个月四万多星的增长数字'
          },
          {
            kind: 'infographic',
            status: 'ready',
            renderer: 'template-svg',
            textLayer: 'app-rendered',
            assetUrl: '/v3/chat/runs/run-source-ready/assets/infographic.svg',
            promptPath: '/tmp/infographic.md',
            cue: '用户从原有工具链迁移到新 agent 的前后对比'
          }
        ]
      }
    },
    bodyText: '结果已生成\n图文资产\n只重试图片\n下载全部图文资产\n主视觉方向\n已生成',
    consoleErrors: [],
    screenshotPath: '/tmp/source-ready.png',
    finalJsonPath: '/tmp/source-ready.json'
  });

  assert.equal(summary.pass, true);
  assert.equal(summary.sourcePass, true);
  assert.equal(summary.sourceStatus, 'ready');
});


test('assertOrdinaryUserCaseEvidence rejects stray quote copy fragments in thread text and visual cues', () => {
  assert.throws(
    () =>
      assertOrdinaryUserCaseEvidence({
        caseDef: ORDINARY_USER_BAOYU_SYNC_CASES[1],
        finalPayload: {
          runId: 'run-dirty-thread',
          status: 'DONE',
          format: 'thread',
          result: {
            text: '1/4\n一次 AI 功能上线最怕的是功能清单。\n\n2/4\n比如只讲一个真实使用场景。\n\n3/4\n”\n\n现在第一屏直接给他预置了 6 个行业场景。\n\n4/4\n如果只能讲一个场景，你会先讲哪一个？',
            routing: { primaryModel: 'x-ai/grok-4.20', routingTier: 'quality_fallback', profile: 'test_high' },
            runtime: { engine: 'baoyu-skills', commit: 'dcd0f8143349', skills: ['baoyu-imagine'] },
            qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [], judgeNotes: [] },
            visualPlan: {
              primaryAsset: 'cover',
              visualizablePoints: ['3/4 ” 现在第一屏直接给他预置了 6 个行业场景。'],
              keywords: [],
              items: [
                {
                  kind: 'infographic',
                  priority: 'primary',
                  type: 'before-after',
                  layout: 'split',
                  style: 'editorial',
                  palette: 'slate',
                  cue: '3/4 ” 现在第一屏直接给他预置了 6 个行业场景。',
                  reason: '残留孤立引号'
                }
              ]
            },
            visualAssets: [
              {
                id: '03-infographic',
                kind: 'infographic',
                status: 'ready',
                assetUrl: '/v3/chat/runs/run/assets/03-infographic',
                cue: '3/4 ” 现在第一屏直接给他预置了 6 个行业场景。',
                promptPath: '/artifacts/baoyu-runtime/run/visual/prompts/03-infographic.md'
              }
            ]
          }
        },
        bodyText: '结果已生成\n连接 X 后才能发布\n主视觉方向\n已生成',
        consoleErrors: [],
        screenshotPath: '/tmp/screenshot.png',
        finalJsonPath: '/tmp/final.json'
      }),
    /stray quote/u
  );
});

test('assertOrdinaryUserCaseEvidence rejects markdown thread labels that would pass basic card count', () => {
  assert.throws(
    () =>
      assertOrdinaryUserCaseEvidence({
        caseDef: ORDINARY_USER_BAOYU_SYNC_CASES[1],
        finalPayload: {
          runId: 'run-markdown-thread',
          status: 'DONE',
          format: 'thread',
          result: {
            text: '1/4\n内容团队最容易卡住。\n\n2/4\n比如周一谁都在等灵感，周三还没发。\n\n3/4\n**3/4**\n我带过的三个 AI 内容团队，把判断写成周会前动作。\n\n4/4\n如果只能固定一步，你会先固定哪一步？',
            routing: { primaryModel: 'x-ai/grok-4.20', routingTier: 'quality_fallback', profile: 'test_high' },
            runtime: { engine: 'baoyu-skills', commit: 'dcd0f8143349', skills: ['baoyu-imagine'] },
            qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [], judgeNotes: [] },
            visualPlan: { primaryAsset: 'cover', visualizablePoints: ['周一谁都在等灵感，周三还没发'], keywords: [], items: [] },
            visualAssets: [
              {
                id: '01-cover',
                kind: 'cover',
                status: 'ready',
                assetUrl: '/v3/chat/runs/run/assets/01-cover',
                cue: '周一谁都在等灵感，周三还没发',
                promptPath: '/artifacts/baoyu-runtime/run/visual/prompts/01-cover.md'
              }
            ]
          }
        },
        bodyText: '结果已生成\n连接 X 后才能发布\n主视觉方向\n已生成',
        consoleErrors: [],
        screenshotPath: '/tmp/screenshot.png',
        finalJsonPath: '/tmp/final.json'
      }),
    /markdown thread label/u
  );
});

test('assertOrdinaryUserCaseEvidence rejects card-number labels in visual cues', () => {
  assert.throws(
    () =>
      assertOrdinaryUserCaseEvidence({
        caseDef: ORDINARY_USER_BAOYU_SYNC_CASES[1],
        finalPayload: {
          runId: 'run-numbered-cue',
          status: 'DONE',
          format: 'thread',
          result: {
            text: '1/4\nAI 产品更新写成建议模板，用户不会继续看。\n\n2/4\n比如只说效率提升，读者不知道省的是哪一步。\n\n3/4\n改成一个具体动作：上传录音后 3 分钟拿到纪要。\n\n4/4\n如果只改第一条，你会先补哪个真实场景？',
            routing: { primaryModel: 'x-ai/grok-4.20', routingTier: 'quality_fallback', profile: 'test_high' },
            runtime: { engine: 'baoyu-skills', commit: 'dcd0f8143349', skills: ['baoyu-imagine'] },
            qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [], judgeNotes: [] },
            visualPlan: {
              primaryAsset: 'cover',
              visualizablePoints: ['1/4 AI 产品更新写成建议模板，用户不会继续看。'],
              keywords: [],
              items: [
                {
                  kind: 'cover',
                  priority: 'primary',
                  type: 'before-after',
                  layout: 'split',
                  style: 'editorial',
                  palette: 'slate',
                  cue: '2/4 上传录音后 3 分钟拿到纪要',
                  reason: 'numbered card label leaked'
                }
              ]
            },
            visualAssets: [
              {
                id: '01-cover',
                kind: 'cover',
                status: 'ready',
                assetUrl: '/v3/chat/runs/run/assets/01-cover',
                cue: '3/4 上传录音后 3 分钟拿到纪要',
                promptPath: '/artifacts/baoyu-runtime/run/visual/prompts/01-cover.md'
              }
            ]
          }
        },
        bodyText: '结果已生成\n连接 X 后才能发布\n主视觉方向\n已生成',
        consoleErrors: [],
        screenshotPath: '/tmp/screenshot.png',
        finalJsonPath: '/tmp/final.json'
      }),
    /card number label/u
  );
});

test('assertOrdinaryUserCaseEvidence accepts real baoyu runtime evidence with visible publish gate', () => {
  const summary = assertOrdinaryUserCaseEvidence({
    caseDef: ORDINARY_USER_BAOYU_SYNC_CASES[1],
    finalPayload: {
      runId: 'run-good',
      status: 'DONE',
      format: 'thread',
      result: {
        text: '1/4\nAI 产品更新写成建议模板，用户不会继续看。\n\n2/4\n比如只说效率提升，读者不知道省的是哪一步。\n\n3/4\n改成一个具体动作：上传录音后 3 分钟拿到纪要。\n\n4/4\n如果只改第一条，你会先补哪个真实场景？',
        routing: { primaryModel: 'x-ai/grok-4.20', routingTier: 'quality_fallback', profile: 'test_high' },
        runtime: { engine: 'baoyu-skills', commit: 'dcd0f8143349', skills: ['baoyu-imagine'] },
        qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [], judgeNotes: [] },
        visualPlan: {
          primaryAsset: 'cover',
          visualizablePoints: ['上传录音后 3 分钟拿到纪要'],
          keywords: [],
          items: [
            {
              kind: 'cover',
              priority: 'primary',
              type: 'before-after',
              layout: 'split',
              style: 'editorial',
              palette: 'slate',
              cue: '上传录音后 3 分钟拿到纪要',
              reason: '具体 before/after'
            },
            {
              kind: 'cards',
              priority: 'primary',
              type: 'story-cards',
              layout: '2–4 张卡片',
              style: 'editorial',
              palette: 'slate',
              cue: '上传录音后 3 分钟拿到纪要',
              reason: 'thread cards'
            }
          ]
        },
        visualAssets: [
          {
            id: '01-cover',
            kind: 'cover',
            status: 'ready',
            renderer: 'template-svg',
            textLayer: 'app-rendered',
            aspectRatio: '1:1',
            assetUrl: '/v3/chat/runs/run-good/assets/01-cover',
            cue: '上传录音后 3 分钟拿到纪要',
            promptPath: '/artifacts/baoyu-runtime/run-good/visual/prompts/01-cover.md'
          },
          {
            id: '02-cards',
            kind: 'cards',
            status: 'ready',
            renderer: 'template-svg',
            textLayer: 'app-rendered',
            aspectRatio: '1:1',
            assetUrl: '/v3/chat/runs/run-good/assets/02-cards',
            cue: '上传录音后 3 分钟拿到纪要',
            promptPath: '/artifacts/baoyu-runtime/run-good/visual/prompts/02-cards.md'
          }
        ]
      }
    },
        bodyText: '结果已生成\n连接 X 后才能发布\n图文资产\n只重试图片\n下载全部图文资产\n主视觉方向\n已生成',
    consoleErrors: [],
    screenshotPath: '/tmp/screenshot.png',
    finalJsonPath: '/tmp/final.json'
  });

  assert.equal(summary.pass, true);
  assert.equal(summary.model, 'x-ai/grok-4.20');
  assert.equal(summary.visualAssetsReady, 2);
});

test('buildOrdinaryUserBaoyuSyncReport creates a side-by-side report with evidence paths and baoyu commit', () => {
  const report = buildOrdinaryUserBaoyuSyncReport({
    stamp: '2026-04-11_12-00-00',
    apiUrl: 'http://127.0.0.1:4310',
    webUrl: 'http://127.0.0.1:3200',
    baoyuCommit: 'dcd0f8143349',
    evidenceRoot: '/tmp/ordinary-user-baoyu-sync',
    cases: [
      {
        id: 'tweet-cold-start',
        format: 'tweet',
        prompt: '别再靠灵感写推文，给我一条更像真人的冷启动判断句。',
        pass: true,
        runId: 'run-1',
        model: 'x-ai/grok-4.20',
        routingTier: 'quality_fallback',
        runtimeEngine: 'baoyu-skills',
        screenshotPath: '/tmp/shot.png',
        finalJsonPath: '/tmp/final.json',
        visualAssetsReady: 1,
        visualAssetsFailed: 0,
        promptLeaks: [],
        notes: ['baoyu writer uses rubric reference; no direct writer CLI was faked']
      }
    ]
  });

  assert.match(report, /DraftOrbit × baoyu ordinary-user sync comparison/u);
  assert.match(report, /dcd0f8143349/u);
  assert.match(report, /baoyu writer uses rubric reference/u);
  assert.match(report, /\/tmp\/shot\.png/u);
});
