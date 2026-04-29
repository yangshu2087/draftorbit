import { expect, test, type Page, type Route } from '@playwright/test';

const API_PREFIX = '/__api';
const appPort = Number(process.env.WEB_PLAYWRIGHT_PORT ?? 3300);
const APP_ORIGIN = new URL(process.env.WEB_PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${appPort}`).origin;

function base64Url(input: string) {
  return Buffer.from(input).toString('base64url');
}

const localToken = [
  base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' })),
  base64Url(JSON.stringify({ userId: 'user_ci', handle: 'local_user', plan: 'PRO' })),
  'signature'
].join('.');

const bootstrap = {
  requestId: 'req_bootstrap_ci',
  user: { id: 'user_ci', handle: 'local_user', plan: 'PRO' },
  workspaceId: 'workspace_ci',
  defaultXAccount: null,
  counts: { xAccounts: 0, sources: 1 },
  sourceEvidence: ['本地 UAT fixture'],
  profile: { ready: true, styleSummary: '表达直接、重判断、少模板。', sourceCount: 1 },
  suggestedAction: 'connect_x_self'
};

const profile = {
  requestId: 'req_profile_ci',
  styleSummary: '表达直接、重判断、少模板。',
  styleSampleCount: 12,
  styleLastAnalyzedAt: '2026-04-17T08:00:00.000Z',
  sourceEvidence: ['本地 UAT fixture'],
  sources: [
    {
      id: 'source_ci',
      sourceType: 'url',
      sourceRef: 'https://example.com/source',
      connector: 'baoyu-url-to-markdown',
      createdAt: '2026-04-17T08:00:00.000Z'
    }
  ],
  xAccounts: []
};

const queue = {
  requestId: 'req_queue_ci',
  review: [
    {
      runId: 'run_review_ci',
      format: 'tweet',
      text: '这条内容等待你确认后再发出。',
      qualityScore: 86,
      riskFlags: [],
      createdAt: '2026-04-17T08:00:00.000Z',
      nextAction: 'confirm_publish'
    }
  ],
  queued: [],
  published: [],
  failed: []
};

const usageSummary = {
  requestId: 'req_usage_ci',
  workspaceId: 'workspace_ci',
  periodStart: '2026-04-01T00:00:00.000Z',
  counters: {
    usageEvents: 68,
    generations: 31,
    publishJobs: 8,
    replyJobs: 4
  },
  modelRouting: {
    totalCalls: 31,
    freeHitRate: 0.23,
    fallbackRate: 0.19,
    qualityFallbackRate: 0.42,
    avgRequestCostUsd: 0.0012,
    totalRequestCostUsd: 0.0372,
    avgQualityScore: 84.5,
    profile: 'local_quality',
    healthProbe: {
      enabled: true,
      windowMs: 300000,
      minSamples: 3,
      failureRateThreshold: 0.6,
      consecutiveFailureThreshold: 2,
      cooldownMs: 45000
    },
    providerHealth: [
      {
        provider: 'codex-local',
        sampleSize: 8,
        failureRate: 0.125,
        consecutiveFailures: 0,
        healthy: true,
        coolingDown: false,
        cooldownUntilMs: null,
        lastFailureAt: '2026-04-17T08:12:00.000Z',
        lastSuccessAt: '2026-04-17T08:20:00.000Z'
      },
      {
        provider: 'openai',
        sampleSize: 6,
        failureRate: 0,
        consecutiveFailures: 0,
        healthy: true,
        coolingDown: false,
        cooldownUntilMs: null,
        lastFailureAt: null,
        lastSuccessAt: '2026-04-17T08:20:00.000Z'
      },
      {
        provider: 'openrouter',
        sampleSize: 7,
        failureRate: 0.28,
        consecutiveFailures: 1,
        healthy: true,
        coolingDown: false,
        cooldownUntilMs: null,
        lastFailureAt: '2026-04-17T08:19:00.000Z',
        lastSuccessAt: '2026-04-17T08:20:00.000Z'
      },
      {
        provider: 'ollama',
        sampleSize: 4,
        failureRate: 0.25,
        consecutiveFailures: 0,
        healthy: true,
        coolingDown: false,
        cooldownUntilMs: null,
        lastFailureAt: '2026-04-17T08:18:00.000Z',
        lastSuccessAt: '2026-04-17T08:20:00.000Z'
      }
    ],
    fallbackHotspots: [
      { lane: 'generation:openrouter', eventType: 'GENERATION', provider: 'openrouter', totalCalls: 12, fallbackHits: 3, fallbackRate: 0.25 },
      { lane: 'image:ollama', eventType: 'IMAGE', provider: 'ollama', totalCalls: 6, fallbackHits: 1, fallbackRate: 0.1667 }
    ]
  },
  nextAction: 'monitor_usage',
  blockingReason: null
};

const billingPlans = {
  currency: 'USD',
  trialDays: 3,
  plans: [
    {
      key: 'STARTER',
      name: 'Starter',
      monthly: { usd: 19, usdCents: 1900 },
      yearly: { usd: 182, usdCents: 18200 },
      features: ['基础图文导出'],
      limits: { daily: 20, monthly: 500 }
    },
    {
      key: 'PRO',
      name: 'Pro',
      monthly: { usd: 49, usdCents: 4900 },
      yearly: { usd: 470, usdCents: 47000 },
      features: ['高级图文导出', '队列与确认流'],
      limits: { daily: 80, monthly: 2000 }
    },
    {
      key: 'PREMIUM',
      name: 'Premium',
      monthly: { usd: 149, usdCents: 14900 },
      yearly: { usd: 1430, usdCents: 143000 },
      features: ['多账号运营'],
      limits: { daily: 200, monthly: 5000 }
    }
  ]
};

type RunKind = 'tweet' | 'thread' | 'article' | 'diagram' | 'source-failed' | 'retryable-visual';
type RunState = { runId: string; format: 'tweet' | 'thread' | 'article'; kind: RunKind; intent: string; contentProjectId?: string };

type ApiResponse = Record<string, unknown> | string | Buffer;

async function fulfillJson(route: Route, body: ApiResponse, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  });
}

async function fulfillText(route: Route, body: string, contentType = 'text/plain; charset=utf-8') {
  await route.fulfill({ status: 200, contentType, body });
}

function visualAsset(runId: string, id: string, kind: string, cue: string, exportFormat: 'svg' | 'html' | 'markdown' = 'svg') {
  const extension = exportFormat === 'html' ? 'html' : exportFormat === 'markdown' ? 'md' : 'svg';
  return {
    id,
    kind,
    status: 'ready',
    renderer: 'template-svg',
    provider: exportFormat === 'svg' ? 'codex-local-svg' : 'template-svg',
    model: 'codex-local/quick',
    skill: exportFormat === 'svg' ? 'baoyu-imagine' : 'baoyu-markdown-to-html',
    exportFormat,
    textLayer: exportFormat === 'svg' ? 'app-rendered' : 'none',
    width: exportFormat === 'svg' ? 1200 : undefined,
    height: exportFormat === 'svg' ? 900 : undefined,
    checksum: `sha256-${id}-ci`,
    signedAssetUrl: `/v3/chat/runs/${runId}/assets/${id}.${extension}?token=ci-token-${id}`,
    promptPath: `/artifacts/baoyu-runtime/${runId}/visual/${id}.prompt.md`,
    specPath: exportFormat === 'svg' ? `/artifacts/baoyu-runtime/${runId}/visual/${id}.spec.json` : undefined,
    cue,
    reason: exportFormat === 'svg' ? '用具体场景承载判断，避免模板感。' : '安全导出，便于手动发布和归档。'
  };
}

function failedVisualAsset(runId: string) {
  return {
    id: '01-cover-failed',
    kind: 'cover',
    status: 'failed',
    renderer: 'template-svg',
    provider: 'codex-local-svg',
    exportFormat: 'svg',
    promptPath: `/artifacts/baoyu-runtime/${runId}/visual/01-cover.prompt.md`,
    cue: '团队在发布前发现封面文字溢出，选择只重试图文资产。',
    reason: '覆盖 retry 交互，不把失败图片展示成可发布成品。',
    error: 'overflow_rejected'
  };
}

function resultText(kind: RunKind) {
  if (kind === 'thread') {
    return [
      '1/4\nAI 产品更新不要先讲功能名，先讲用户昨天卡在哪。',
      '2/4\n比如运营同学每次发布前都要打开三份文档，最后还是漏掉图文检查。',
      '3/4\n这次把来源、正文、图文和确认收成一条链路，少掉来回切工具。',
      '4/4\n你会先把哪一步交给系统固定下来？'
    ].join('\n\n');
  }

  if (kind === 'article') {
    return [
      'AI 内容最大的问题，不是缺观点，是缺例子',
      '导语',
      '一篇长文如果只有判断，读者会觉得你说得对，但不知道它发生在哪个真实场景里。',
      '一、判断必须落到具体动作',
      '比如“内容像模板”太抽象；改成“开头先介绍背景，第三段才说观点”，读者就能马上看到问题。',
      '二、图文资产也要服务判断',
      '封面负责让读者停下来，信息图负责把判断拆成可复述的结构。',
      '结尾',
      '下一版内容，先补一个真实场景，再补一句判断。'
    ].join('\n\n');
  }

  if (kind === 'diagram') {
    return 'DraftOrbit 的流程很简单：输入一句话，先确认来源，再生成正文和图文，最后由你手动确认是否发布。';
  }

  return '别再靠灵感写推文。真正能稳定更新的人，靠的是把输入、生成、图文和确认变成固定流程。';
}

function makeRunDetail(state: RunState, overrideReadyAsset = false) {
  const { runId, format, kind } = state;
  if (kind === 'source-failed') {
    return {
      requestId: `req_${runId}`,
      runId,
      contentProjectId: state.contentProjectId ?? null,
      status: 'DONE',
      format,
      result: {
        text: '',
        variants: [],
        imageKeywords: [],
        qualityScore: null,
        riskFlags: [],
        requestCostUsd: null,
        whySummary: [],
        evidenceSummary: [],
        visualAssets: [],
        sourceArtifacts: [],
        qualityGate: {
          status: 'failed',
          safeToDisplay: false,
          hardFails: ['source_not_configured'],
          sourceRequired: true,
          sourceStatus: 'not_configured',
          recoveryAction: 'add_source',
          judgeNotes: ['需要可靠来源，不能编造最新事实']
        }
      },
      publish: [],
      stages: []
    };
  }

  const primaryKind = kind === 'thread' ? 'cards' : kind === 'diagram' ? 'diagram' : 'cover';
  const readyAssets =
    kind === 'thread'
      ? [1, 2, 3, 4].map((index) => visualAsset(runId, `0${index}-card`, 'cards', `第 ${index} 张卡片：把产品更新写成具体场景。`))
      : [visualAsset(runId, kind === 'diagram' ? '01-diagram' : '01-cover', primaryKind, kind === 'diagram' ? '输入→来源→正文→图文→确认' : '把一句判断放进真实发布场景。')];
  const articleExtras =
    kind === 'article'
      ? [
          visualAsset(runId, '02-infographic', 'infographic', '把“判断→例子→图文”拆成信息图。'),
          visualAsset(runId, '03-illustration', 'illustration', '用编辑台场景表现长文配图。')
        ]
      : [];
  const exportAssets = [
    visualAsset(runId, '98-markdown', 'markdown', 'Markdown 导出', 'markdown'),
    visualAsset(runId, '99-html', 'html', 'HTML 导出', 'html')
  ];
  const retryAssets = kind === 'retryable-visual' && !overrideReadyAsset ? [failedVisualAsset(runId)] : [visualAsset(runId, '01-cover', 'cover', '重试后封面文字不再溢出。')];
  const visualAssets = kind === 'retryable-visual' ? retryAssets.concat(exportAssets) : readyAssets.concat(articleExtras, exportAssets);

  return {
    requestId: `req_${runId}`,
    runId,
    contentProjectId: state.contentProjectId ?? null,
    status: 'DONE',
    format,
    result: {
      text: resultText(kind),
      variants: [],
      imageKeywords: ['固定流程', '图文资产', '手动确认'],
      qualityScore: 88,
      riskFlags: [],
      requestCostUsd: null,
      whySummary: ['已根据你的目标整理成可发版本。'],
      evidenceSummary: kind === 'article' ? ['来源已抓取'] : [],
      qualitySignals: {
        hookStrength: 90,
        specificity: 87,
        evidenceDensity: 84,
        humanLikeness: 83,
        conversationalFlow: 82,
        visualizability: 91,
        ctaNaturalness: 80
      },
      visualPlan: {
        primaryAsset: primaryKind,
        visualizablePoints: ['把输入到确认做成一条可见链路', '不把失败图当成成品'],
        keywords: ['DraftOrbit', '图文包', 'SVG 图文资产'],
        items: [
          {
            kind: primaryKind,
            priority: 'primary',
            type: 'svg',
            layout: kind === 'diagram' ? 'flow' : 'balanced',
            style: 'draftorbit',
            palette: 'draftorbit',
            cue: primaryKind === 'diagram' ? '输入→来源→正文→图文→确认' : '把一句判断放进真实发布场景。',
            reason: '用普通用户能理解的视觉锚点解释产物。'
          }
        ]
      },
      visualAssets,
      visualAssetsBundleUrl: `/v3/chat/runs/${runId}/assets.zip?token=ci-bundle`,
      sourceArtifacts:
        kind === 'article'
          ? [
              {
                kind: 'url',
                url: 'https://example.com/source',
                title: '来源文章',
                markdownPath: `/artifacts/baoyu-runtime/${runId}/source/source.md`,
                capturedAt: '2026-04-17T08:00:00.000Z',
                status: 'ready',
                evidenceUrl: 'https://example.com/source'
              }
            ]
          : [],
      runtime: { engine: 'baoyu-skills', commit: '9977ff520c49', skills: ['baoyu-imagine', 'baoyu-markdown-to-html'] },
      derivativeReadiness: {
        html: { ready: true, score: 91, reason: 'HTML export ready' },
        markdown: { ready: true, score: 93, reason: 'Markdown export ready' },
        cards: { ready: kind === 'thread', score: kind === 'thread' ? 90 : 72, reason: 'Cards evaluated' },
        infographic: { ready: kind === 'article', score: kind === 'article' ? 89 : 70, reason: 'Infographic evaluated' }
      },
      qualityGate: {
        status: 'passed',
        safeToDisplay: true,
        hardFails: [],
        visualHardFails: [],
        sourceRequired: kind === 'article',
        sourceStatus: 'ready',
        judgeNotes: []
      }
    },
    publish: [],
    stages: []
  };
}

function classifyRun(format: 'tweet' | 'thread' | 'article', intent: string, visualMode?: string): RunKind {
  if (/最新的?\s*Hermes|最新 Hermes/u.test(intent) && !/https?:\/\//u.test(intent)) return 'source-failed';
  if (/失败图片|重试图文/u.test(intent)) return 'retryable-visual';
  if (visualMode === 'diagram' || /流程图|diagram|输入→来源/u.test(intent)) return 'diagram';
  if (format === 'thread') return 'thread';
  if (format === 'article') return 'article';
  return 'tweet';
}

async function mockDraftOrbitApi(page: Page) {
  const runs = new Map<string, RunState>();
  const projects: any[] = [];
  const projectRunIds = new Map<string, string[]>();
  let runCounter = 0;
  for (const origin of new Set(['http://127.0.0.1:3300', 'http://127.0.0.1:3310', APP_ORIGIN])) {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  }
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.startsWith(API_PREFIX) ? (url.pathname.slice(API_PREFIX.length) || '/') : url.pathname;

    if (!apiPath.startsWith('/auth/') && !apiPath.startsWith('/v3/') && !apiPath.startsWith('/v4/') && !apiPath.startsWith('/usage/')) {
      await route.continue();
      return;
    }

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
      return;
    }

    if (apiPath === '/auth/local/session' && request.method() === 'POST') {
      await fulfillJson(route, { token: localToken, user: { id: 'user_ci', handle: 'local_user', plan: 'PRO' } });
      return;
    }

    if (apiPath === '/v3/session/bootstrap') {
      await fulfillJson(route, bootstrap);
      return;
    }
    if (apiPath === '/v3/profile') {
      await fulfillJson(route, profile);
      return;
    }
    if (apiPath === '/usage/summary') {
      await fulfillJson(route, usageSummary);
      return;
    }
    if (apiPath.startsWith('/v3/queue')) {
      await fulfillJson(route, queue);
      return;
    }
    if (apiPath === '/v3/billing/plans') {
      await fulfillJson(route, billingPlans);
      return;
    }
    if (apiPath === '/v3/billing/checkout') {
      await fulfillJson(route, { url: 'https://checkout.example.test/session' });
      return;
    }
    if (apiPath === '/v3/projects' && request.method() === 'GET') {
      await fulfillJson(route, { requestId: 'req_projects_ci', workspaceId: 'workspace_ci', projects });
      return;
    }
    if (apiPath === '/v3/projects' && request.method() === 'POST') {
      const body = request.postDataJSON() as { name: string; description?: string; preset?: 'generic_x_ops' | 'skilltrust_x_ops' };
      const preset = body.preset ?? 'generic_x_ops';
      const isSkillTrust = preset === 'skilltrust_x_ops';
      const project = {
        id: `project_ci_${projects.length + 1}`,
        name: body.name,
        description: body.description ?? null,
        preset,
        metadata: {
          preset,
          objective: isSkillTrust ? '把 SkillTrust 做成中文 AI 用户安装 Agent skill 前的判断系统。' : '围绕一个项目持续产出可信的 X 内容。',
          audience: isSkillTrust ? '中文 AI 用户与 Agent builders。' : '项目关注者与中文 X 用户。',
          contentPillars: isSkillTrust ? ['审计演示', '风险教育', '工作流方法', '发布日志', '数据洞察'] : ['观点短推', '经验复盘', '产品更新'],
          sourceUrls: [],
          visualDefaults: { mode: isSkillTrust ? 'cards' : 'auto', style: isSkillTrust ? 'blueprint' : 'draftorbit', layout: isSkillTrust ? 'flow' : 'balanced', palette: 'draftorbit', aspect: '16:9', exportHtml: true },
          publishChecklist: ['发布前必须人工确认', '不自动发帖', '无来源不编造最新事实']
        },
        objective: isSkillTrust ? '把 SkillTrust 做成中文 AI 用户安装 Agent skill 前的判断系统。' : '围绕一个项目持续产出可信的 X 内容。',
        audience: isSkillTrust ? '中文 AI 用户与 Agent builders。' : '项目关注者与中文 X 用户。',
        contentPillars: isSkillTrust ? ['审计演示', '风险教育', '工作流方法', '发布日志', '数据洞察'] : ['观点短推', '经验复盘', '产品更新'],
        sourceUrls: [],
        visualDefaults: { mode: isSkillTrust ? 'cards' : 'auto', style: isSkillTrust ? 'blueprint' : 'draftorbit', layout: isSkillTrust ? 'flow' : 'balanced', palette: 'draftorbit', aspect: '16:9', exportHtml: true },
        publishChecklist: ['发布前必须人工确认', '不自动发帖', '无来源不编造最新事实'],
        defaultFormat: 'thread',
        safetyCopy: '发布前人工确认，不自动发帖。',
        createdAt: '2026-04-25T09:00:00.000Z',
        updatedAt: '2026-04-25T09:00:00.000Z'
      };
      projects.unshift(project);
      projectRunIds.set(project.id, []);
      await fulfillJson(route, { requestId: 'req_project_created_ci', project });
      return;
    }
    const projectGenerateMatch = apiPath.match(/^\/v3\/projects\/([^/]+)\/generate$/u);
    if (projectGenerateMatch && request.method() === 'POST') {
      const projectId = projectGenerateMatch[1];
      const body = request.postDataJSON() as { intent: string; format?: 'tweet' | 'thread' | 'article'; visualRequest?: { mode?: string } };
      runCounter += 1;
      const runId = `run_project_ci_${runCounter}`;
      const format = body.format ?? 'thread';
      runs.set(runId, { runId, format, kind: classifyRun(format, body.intent, body.visualRequest?.mode), intent: body.intent, contentProjectId: projectId });
      projectRunIds.set(projectId, [runId, ...(projectRunIds.get(projectId) ?? [])]);
      await fulfillJson(route, {
        requestId: `req_${runId}`,
        runId,
        projectId,
        stage: 'research',
        nextAction: 'watch_generation',
        blockingReason: null,
        streamUrl: `${API_PREFIX}/v3/chat/runs/${runId}/stream`
      });
      return;
    }
    const projectDetailMatch = apiPath.match(/^\/v3\/projects\/([^/]+)$/u);
    if (projectDetailMatch && request.method() === 'GET') {
      const projectId = projectDetailMatch[1];
      const project = projects.find((item) => item.id === projectId);
      if (!project) {
        await fulfillJson(route, { code: 'PROJECT_NOT_FOUND', message: '项目不存在' }, 404);
        return;
      }
      const recentRuns = (projectRunIds.get(projectId) ?? []).map((runId) => {
        const detail = makeRunDetail(runs.get(runId) ?? { runId, format: 'thread' as const, kind: 'thread' as const, intent: '' }) as any;
        return {
          runId,
          status: 'DONE',
          format: detail.format,
          text: detail.result.text,
          visualAssetCount: detail.result.visualAssets.length,
          bundleReady: true,
          qualityScore: 88,
          publishPrepStatus: 'needs_review',
          createdAt: '2026-04-25T09:05:00.000Z',
          nextAction: 'confirm_publish'
        };
      });
      await fulfillJson(route, { requestId: 'req_project_detail_ci', project, recentRuns, drafts: { count: 0 }, assetsSummary: { visualAssetCount: recentRuns.reduce((sum, run) => sum + run.visualAssetCount, 0), bundleReadyCount: recentRuns.length }, queueSummary: { needsReview: recentRuns.length, queued: 0 } });
      return;
    }
    if (apiPath === '/v4/studio/capabilities') {
      await fulfillJson(route, {
        version: 'v4-creator-studio',
        defaultRouting: { primary: 'codex-local', oauth: 'Codex local adapter via codex exec', ollamaDefault: 'disabled', publishMode: 'manual-confirm' },
        formats: ['tweet', 'thread', 'article', 'diagram', 'social_pack'],
        skillMatrix: [
          { skill: 'baoyu-imagine', productCapability: 'visual specs', usedByDraftOrbit: true },
          { skill: 'baoyu-diagram', productCapability: 'diagram SVG', usedByDraftOrbit: true },
          { skill: 'baoyu-post-to-x', productCapability: 'safe publish prep', usedByDraftOrbit: true, safeMode: 'manual-confirm' }
        ],
        exportFormats: ['markdown', 'html', 'bundle'],
        safety: { latestFacts: 'source-required-fail-closed', xPosting: 'prepare/manual-confirm only' }
      });
      return;
    }
    if (apiPath === '/v4/studio/run' && request.method() === 'POST') {
      runCounter += 1;
      const body = request.postDataJSON() as { prompt: string; format: 'tweet' | 'thread' | 'article' | 'diagram' | 'social_pack'; visualRequest?: { mode?: string } };
      const v3Format = body.format === 'article' ? 'article' : body.format === 'thread' || body.format === 'social_pack' ? 'thread' : 'tweet';
      const runId = `run_v4_ci_${runCounter}`;
      runs.set(runId, { runId, format: v3Format, kind: classifyRun(v3Format, body.prompt, body.visualRequest?.mode), intent: body.prompt });
      await fulfillJson(route, {
        requestId: `req_${runId}`,
        runId,
        stage: 'queued',
        nextAction: 'watch_generation',
        blockingReason: null,
        streamUrl: `${API_PREFIX}/v3/chat/runs/${runId}/stream`,
        studio: { version: 'v4-creator-studio', format: body.format, contract: { mode: 'codex-oauth-first' } },
        publishPreparation: { mode: 'manual-confirm', label: '准备发布 / 手动确认', canAutoPost: false },
        usageEvidence: { primaryProvider: 'codex-local' }
      });
      return;
    }
    const v4RunMatch = apiPath.match(/^\/v4\/studio\/runs\/([^/]+)$/u);
    if (v4RunMatch) {
      const runId = v4RunMatch[1];
      const state = runs.get(runId) ?? { runId, format: 'tweet' as const, kind: 'tweet' as const, intent: '' };
      const detail = makeRunDetail(state) as any;
      await fulfillJson(route, {
        requestId: `req_${runId}`,
        runId,
        status: 'DONE',
        textResult: { format: state.kind === 'diagram' ? 'diagram' : detail.format, content: detail.result.text, variants: [] },
        visualAssets: (detail.result.visualAssets ?? []).map((asset: any) => ({ ...asset, provenanceLabel: asset.provider === 'codex-local-svg' ? 'SVG 图文资产' : '导出资产' })),
        sourceArtifacts: detail.result.sourceArtifacts ?? [],
        qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [] },
        publishPreparation: { mode: 'manual-confirm', label: '准备发布 / 手动确认', canAutoPost: false },
        usageEvidence: { primaryProvider: 'codex-local', model: 'codex-local/quick', fallbackDepth: 0 }
      });
      return;
    }
    if (apiPath === '/v3/connections/x-self') {
      await fulfillJson(route, { url: 'https://x.com/i/oauth2/authorize?state=ci', state: 'ci', redirectUri: 'http://127.0.0.1:3310/x-accounts/oauth/callback' });
      return;
    }

    if (apiPath === '/v3/chat/run' && request.method() === 'POST') {
      const body = request.postDataJSON() as { intent: string; format: 'tweet' | 'thread' | 'article'; visualRequest?: { mode?: string } };
      runCounter += 1;
      const runId = `run_ci_${runCounter}`;
      runs.set(runId, { runId, format: body.format, kind: classifyRun(body.format, body.intent, body.visualRequest?.mode), intent: body.intent });
      await fulfillJson(route, {
        requestId: `req_${runId}`,
        runId,
        stage: 'research',
        nextAction: 'watch_generation',
        blockingReason: null,
        streamUrl: `${API_PREFIX}/v3/chat/runs/${runId}/stream`
      });
      return;
    }

    const streamMatch = apiPath.match(/^\/v3\/chat\/runs\/([^/]+)\/stream$/u);
    if (streamMatch) {
      const body = [
        { stage: 'research', label: '正在确认来源', status: 'done', summary: '已确认来源策略' },
        { stage: 'draft', label: '正在生成正文', status: 'done', summary: '正文已生成' },
        { stage: 'media', label: '正在生成图文', status: 'done', summary: '图文资产已生成' },
        { stage: 'publish_prep', label: '正在准备发布确认', status: 'done', summary: '结果已整理' }
      ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join('');
      await fulfillText(route, body, 'text/event-stream; charset=utf-8');
      return;
    }

    const retryMatch = apiPath.match(/^\/v3\/chat\/runs\/([^/]+)\/assets\/retry$/u);
    if (retryMatch && request.method() === 'POST') {
      const runId = retryMatch[1];
      const state = runs.get(runId) ?? { runId, format: 'tweet' as const, kind: 'retryable-visual' as const, intent: '' };
      await fulfillJson(route, makeRunDetail(state, true));
      return;
    }

    const assetMatch = apiPath.match(/^\/v3\/chat\/runs\/([^/]+)\/assets\/([^/]+)$/u);
    if (assetMatch) {
      const assetName = assetMatch[2];
      if (assetName.endsWith('.html')) {
        await fulfillText(route, '<article><h1>DraftOrbit HTML export</h1></article>', 'text/html; charset=utf-8');
        return;
      }
      if (assetName.endsWith('.md')) {
        await fulfillText(route, '# DraftOrbit Markdown export\n\n可手动发布。', 'text/markdown; charset=utf-8');
        return;
      }
      await fulfillText(
        route,
        `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="1200" height="900" fill="#0f172a"/><text x="80" y="140" fill="white" font-size="48">DraftOrbit CI Asset</text></svg>`,
        'image/svg+xml; charset=utf-8'
      );
      return;
    }

    const zipMatch = apiPath.match(/^\/v3\/chat\/runs\/([^/]+)\/assets\.zip$/u);
    if (zipMatch) {
      await route.fulfill({ status: 200, contentType: 'application/zip', body: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]) });
      return;
    }

    const runMatch = apiPath.match(/^\/v3\/chat\/runs\/([^/]+)$/u);
    if (runMatch) {
      const runId = runMatch[1];
      const state = runs.get(runId) ?? { runId, format: 'tweet' as const, kind: 'tweet' as const, intent: '' };
      await fulfillJson(route, makeRunDetail(state));
      return;
    }

    await fulfillJson(route, { code: 'NOT_MOCKED', message: `No CI mock for ${request.method()} ${apiPath}` }, 500);
  });
}

async function seedSession(page: Page) {
  await page.addInitScript((token) => {
    window.localStorage.setItem('draftorbit_token', token as string);
  }, localToken);
}

async function openApp(page: Page, options?: { assertRoutingPanelHidden?: boolean }) {
  const assertRoutingPanelHidden = options?.assertRoutingPanelHidden === true;
  const bootstrapStart = Date.now();
  await seedSession(page);
  await page.goto('/app');
  await expect(page.getByRole('button', { name: /开始生成/u })).toBeVisible();
  if (assertRoutingPanelHidden) {
    await expect(page.getByText('模型路由观测')).toHaveCount(0);
  }
  const durationSeconds = ((Date.now() - bootstrapStart) / 1000).toFixed(2);
  console.log(
    assertRoutingPanelHidden
      ? `[ci-perf] app bootstrap (keeps routing debug hidden) completed in ${durationSeconds}s`
      : `[ci-perf] app bootstrap (core shell) completed in ${durationSeconds}s`
  );
}

type GenerationScenario = {
  name: string;
  prompt: string;
  format?: 'tweet' | 'thread' | 'article';
  visualMode?: string;
  expected: RegExp[];
};

async function ensureAdvancedOptionsOpen(page: Page) {
  const visualModeSelect = page.locator('select[name="visualMode"]');
  if (await visualModeSelect.isVisible()) return;
  await page.getByText('高级选项').click();
  await expect(visualModeSelect).toBeVisible();
}

async function startGenerationInOpenApp(page: Page, input: { prompt: string; format?: 'tweet' | 'thread' | 'article'; visualMode?: string }) {
  await ensureAdvancedOptionsOpen(page);
  if (input.format && input.format !== 'tweet') {
    const label = input.format === 'thread' ? '串推' : '长文';
    await page.getByRole('button', { name: new RegExp(label, 'u') }).click();
  }
  if (input.visualMode) {
    await page.locator('select[name="visualMode"]').selectOption(input.visualMode);
  }
  await page.locator('textarea').first().fill(input.prompt);
  await page.getByRole('button', { name: /^开始生成$/u }).click();
  await expect(page.getByText('结果区', { exact: true })).toBeVisible();
}

async function runGenerationScenario(page: Page, scenario: GenerationScenario) {
  const scenarioStart = Date.now();
  await startGenerationInOpenApp(page, scenario);
  for (const expected of scenario.expected) {
    await expect(page.getByText(expected).first()).toBeVisible();
  }

  if (scenario.name.includes('thread')) {
    await expect(page.getByRole('img', { name: /卡片组/u }).first()).toBeVisible();
  }

  if (scenario.name.includes('article')) {
    await page.getByText('查看依据与配图建议').click();
    await expect(page.getByText('来源已抓取').first()).toBeVisible();
  }

  const bundleLink = page.getByRole('link', { name: /下载全部图文资产|下载导出包/u }).first();
  await expect(bundleLink).toHaveAttribute('href', /token=/u);
  await expect(page.getByRole('button', { name: /只重试图片\/图文资产/u })).toBeDisabled();
  const durationSeconds = ((Date.now() - scenarioStart) / 1000).toFixed(2);
  console.log(`[ci-perf] generation scenario "${scenario.name}" completed in ${durationSeconds}s`);
}

test.beforeEach(async ({ page }) => {
  await mockDraftOrbitApi(page);
});

test('ordinary user can enter the app from home local CTA and see safe app gates', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');

  await expect(page.getByRole('heading', { name: '登录您的账户' })).toBeVisible();
  await expect(page.getByRole('button', { name: /使用 X 登录，免费试用/u })).toBeVisible();
  await expect(page.getByText('风格学习')).toBeVisible();
  await expect(page.getByText('推理生成')).toBeVisible();
  await expect(page.getByText('发布执行')).toBeVisible();
  await expect(page.getByRole('link', { name: /V4 图文工作台/u })).toHaveAttribute('href', '/v4');

  const localCta = page.getByRole('button', { name: '本机快速体验' });
  await expect(localCta).toBeVisible();

  await localCta.click();
  await expect(page).toHaveURL(/\/app$/u);
  await expect(page.getByRole('button', { name: /开始生成/u })).toBeVisible();
  await expect(page.getByText('未连接 X 账号 · 仍可先生成')).toBeVisible();
  await expect(page.getByRole('link', { name: '项目运营工作台' })).toHaveAttribute('href', '/projects');
});

const generationScenariosFast: GenerationScenario[] = [
  {
    name: 'tweet cover assets and safe publish gate',
    prompt: '别再靠灵感写推文，给我一条更像真人的冷启动判断句。',
    expected: [/生成结果/u, /封面图/u, /下载全部图文资产/u, /连接 X 后才能发布/u]
  },
  {
    name: 'thread card series',
    prompt: '把一个 AI 产品新功能写成 4 条 thread，不要像建议模板。',
    format: 'thread' as const,
    expected: [/1\/4/u, /4\/4/u, /下载导出包/u]
  }
];

const generationScenariosRich: GenerationScenario[] = [
  {
    name: 'article with cover infographic illustration and exports',
    prompt: '根据这篇来源写一篇关于最新 Hermes Agent 的 X 长文：https://example.com/source',
    format: 'article' as const,
    expected: [/标题/u, /导语/u, /信息图/u, /章节插图/u, /导出 HTML/u, /复制到 X 文章编辑器/u]
  },
  {
    name: 'diagram visual mode',
    prompt: '用一条短推解释 DraftOrbit 从输入一句话到手动确认发布的 5 步流程，并配一个流程图：输入→来源→正文→图文→确认。',
    format: 'tweet' as const,
    visualMode: 'diagram',
    expected: [/流程图/u, /输入→来源→正文→图文→确认/u, /下载 SVG/u]
  }
];

test('app generation covers tweet cover output with minimal page churn', async ({ page }) => {
  await openApp(page, { assertRoutingPanelHidden: true });
  await runGenerationScenario(page, generationScenariosFast[0]);
});

test('app generation covers thread card output with minimal page churn', async ({ page }) => {
  await openApp(page, { assertRoutingPanelHidden: true });
  await runGenerationScenario(page, generationScenariosFast[1]);
});

test('project ops workbench creates SkillTrust preset and generates a linked thread with assets', async ({ page }) => {
  await seedSession(page);
  await page.goto('/app');
  await expect(page.getByRole('link', { name: '项目运营工作台' })).toBeVisible();
  await page.getByRole('link', { name: '项目运营工作台' }).click();

  await expect(page).toHaveURL(/\/projects$/u);
  await expect(page.getByRole('heading', { name: /按项目持续生成 X 线程和图文资产/u })).toBeVisible();
  await expect(page.getByText('SkillTrust 推特/X 运营').first()).toBeVisible();

  await page.locator('div').filter({ hasText: /^SkillTrustSkillTrust 推特\/X 运营/ }).getByRole('button', { name: /创建项目/u }).click();
  await expect(page.locator('h2').filter({ hasText: 'SkillTrust 推特/X 运营' })).toBeVisible();
  await expect(page.getByText('审计演示').first()).toBeVisible();
  await expect(page.getByText('发布前必须人工确认').first()).toBeVisible();

  await page.locator('textarea').fill('生成一组 SkillTrust 安装前审计 demo thread，强调不自动发帖。');
  await page.getByRole('button', { name: /生成 thread \+ 图文资产/u }).click();

  await expect(page.getByText(/项目内容已生成/u)).toBeVisible();
  await expect(page.getByText('已关联到 SkillTrust 推特/X 运营')).toBeVisible();
  await expect(page.getByText(/1\/4/u).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /下载 bundle/u })).toHaveAttribute('href', /token=ci-bundle/u);
  await expect(page.getByRole('link', { name: /进入人工确认/u })).toHaveAttribute('href', /\/queue\?highlight=run_project_ci_/u);
  await expect(page.getByText(/个视觉资产/u).first()).toBeVisible();
});

test('app generation covers article and diagram visual outputs with minimal page churn', async ({ page }) => {
  await openApp(page);
  for (const scenario of generationScenariosRich) {
    await test.step(scenario.name, async () => {
      await runGenerationScenario(page, scenario);
    });
  }
});

test('app handles retry-only visual recovery and latest-source fail-closed path in one user session', async ({ page }) => {
  await openApp(page);
  await startGenerationInOpenApp(page, { prompt: '重试图文：生成一条带失败图片的短推，用来验证只重试图文资产。' });

  await expect(page.getByText('部分图片资产没有达到可发布标准')).toBeVisible();
  const retryButton = page.getByRole('button', { name: /只重试图片\/图文资产/u });
  await expect(retryButton).toBeEnabled();
  await retryButton.click();
  await expect(page.getByText('图片已重新生成')).toBeVisible();
  await expect(page.getByText('重试后封面文字不再溢出').first()).toBeVisible();

  await page.getByRole('button', { name: '复制 Markdown' }).click();
  await expect(page.getByText('Markdown 已复制')).toBeVisible();
  await startGenerationInOpenApp(page, { prompt: '生成关于最新的 Hermes 的文章', format: 'article' });

  await expect(page.getByText('需要可靠来源，不能编造最新事实', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '粘贴来源 URL 再生成' })).toBeVisible();
  await expect(page.getByRole('button', { name: '改成非最新主题再生成' })).toBeVisible();
  await expect(page.getByRole('button', { name: '未达标，不能发布' })).toBeDisabled();
  await expect(page.getByText('这版未达到可发布标准，图文资产不会展示')).toBeVisible();
  await expect(page.getByText('可以直接进入确认')).toHaveCount(0);

  await page.getByRole('button', { name: '粘贴来源 URL 再生成' }).click();
  await expect(page.locator('textarea').first()).toHaveValue(/来源 URL：/u);
});

test('V4 Creator Studio route supports simplified preview, export actions, and safe gates', async ({ page }) => {
  await seedSession(page);
  await page.goto('/v4');

  await expect(page.getByRole('heading', { name: /一句话生成可发布的图文包/u })).toBeVisible();
  await expect(page.getByText('后台自动完成策略、正文和图文资产')).toBeVisible();
  await expect(page.getByRole('link', { name: /查看队列/u })).toHaveAttribute('href', '/queue');
  await expect(page.getByRole('link', { name: /连接 X/u })).toHaveAttribute('href', '/connect');
  await expect(page.getByRole('link', { name: /查看套餐/u })).toHaveAttribute('href', '/pricing');

  await page.getByRole('button', { name: /Diagram/u }).click();
  await page.locator('#v4-prompt').fill('用流程图解释：输入→来源→正文→图文→手动确认发布。');
  await page.getByRole('button', { name: /^生成 V4 图文包$/u }).click();

  await expect(page.getByText(/生成任务已开始|生成已完成|生成任务仍在后台处理/u)).toBeVisible();
  await expect(page.getByText('SVG 图文资产').first()).toBeVisible();
  await expect(page.getByText(/准备发布 \/ 手动确认/u).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /复制 Markdown/u })).toBeEnabled();
  await expect(page.getByRole('button', { name: /结果完成后可下载导出包|下载导出包/u })).toBeDisabled();
  await expect(page.getByText('结果完成后可下载导出包').first()).toBeVisible();

  await page.locator('#v4-prompt').fill('生成关于最新 Hermes Agent 的文章');
  await page.getByRole('button', { name: /Article/u }).click();
  await expect(page.getByText('最新事实需要来源')).toBeVisible();
  await page.getByRole('button', { name: /^生成 V4 图文包$/u }).click();
  await expect(page.getByText('需要来源后再生成').first()).toBeVisible();
});
