import { chromium, request as playwrightRequest, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ContentFormat = 'tweet' | 'thread' | 'article';

export type BaoyuProductSkillMatrixItem = {
  skill: string;
  category: string;
  status: 'runtime_integrated' | 'rubric_or_prompt_reference' | 'safe_gap' | 'blocked_external_action';
  draftOrbitUsage: string;
  testEvidence: string;
  gapOrReason: string;
  repairResult: string;
};

export type OrdinaryUserBaoyuSyncCase = {
  id: string;
  format: ContentFormat;
  uiLabel: string;
  prompt: string;
  baoyuComparisonNote: string;
  visualMode?: 'auto' | 'cover' | 'cards' | 'infographic' | 'article_illustration' | 'diagram' | 'social_pack';
  visualLayout?: 'auto' | 'sparse' | 'balanced' | 'dense' | 'list' | 'comparison' | 'flow' | 'mindmap' | 'quadrant';
  exportHtml?: boolean;
  sourceExpectation?: 'none' | 'ready' | 'ready_or_blocked';
  acceptQualityBlocked?: boolean;
};

export type EvidenceSummary = {
  id: string;
  format: ContentFormat;
  prompt: string;
  pass: boolean;
  runId: string;
  model: string;
  routingTier: string;
  runtimeEngine: string;
  screenshotPath: string;
  responsiveScreenshotPaths: string[];
  finalJsonPath: string;
  visualAssetsReady: number;
  visualAssetsFailed: number;
  sourcePass?: boolean;
  sourceStatus?: string;
  promptLeaks: string[];
  actionChecks?: string[];
  notes: string[];
};

export type RouteAuditSummary = {
  id: string;
  path: string;
  finalUrl: string;
  pass: boolean;
  bodyPath: string;
  screenshotPaths: string[];
  checkedCopy: string[];
  consoleErrors: Array<{ type: string; text: string }>;
  notes: string[];
};

export type OrdinaryUserRouteAuditTarget = {
  id: string;
  path: string;
  expectedCopy: string[];
  notes: string[];
};

type VisualAssetLike = {
  id?: string;
  kind?: string;
  status?: string;
  renderer?: string;
  provider?: string;
  model?: string;
  skill?: string;
  exportFormat?: 'svg' | 'html' | 'markdown' | 'zip' | string;
  aspectRatio?: string;
  textLayer?: string;
  width?: number;
  height?: number;
  checksum?: string;
  assetUrl?: string;
  signedAssetUrl?: string;
  promptPath?: string;
  specPath?: string;
  cue?: string;
  reason?: string;
  error?: string;
};

type VisualPlanLike = {
  primaryAsset?: string;
  visualizablePoints?: string[];
  keywords?: string[];
  items?: Array<{
    kind?: string;
    cue?: string;
    reason?: string;
    type?: string;
    layout?: string;
    style?: string;
    palette?: string;
  }>;
};

type FinalRunPayload = {
  runId?: string;
  status?: string;
  format?: ContentFormat;
  result?: {
    text?: string;
    routing?: {
      primaryModel?: string;
      routingTier?: string;
      profile?: string;
    } | null;
    usage?: Array<{
      model?: string;
      modelUsed?: string;
      routingTier?: string | null;
    }>;
    runtime?: {
      engine?: string;
      commit?: string;
      skills?: string[];
    } | null;
    qualityGate?: {
      status?: string;
      safeToDisplay?: boolean;
      hardFails?: string[];
      visualHardFails?: string[];
      sourceRequired?: boolean;
      sourceStatus?: 'ready' | 'failed' | 'ambiguous' | 'not_configured';
      userMessage?: string;
      recoveryAction?: 'retry' | 'add_source' | 'narrow_topic';
      judgeNotes?: string[];
    } | null;
    visualPlan?: VisualPlanLike | null;
    visualAssets?: VisualAssetLike[];
    visualAssetsBundleUrl?: string | null;
    sourceArtifacts?: Array<{
      kind?: string;
      url?: string;
      title?: string;
      markdownPath?: string;
      capturedAt?: string;
      status?: string;
      evidenceUrl?: string;
      error?: string;
    }>;
  } | null;
};

type CaseEvidenceInput = {
  caseDef: OrdinaryUserBaoyuSyncCase;
  finalPayload: FinalRunPayload;
  bodyText: string;
  consoleErrors: Array<{ type: string; text: string }>;
  screenshotPath: string;
  responsiveScreenshotPaths?: string[];
  finalJsonPath: string;
};

const RESPONSIVE_VIEWPORTS = [
  { label: '375', width: 375, height: 1200 },
  { label: '768', width: 768, height: 1200 },
  { label: '1024', width: 1024, height: 1200 },
  { label: '1440', width: 1440, height: 1200 }
] as const;

export const BAOYU_PRODUCT_SKILL_MATRIX: BaoyuProductSkillMatrixItem[] = [
  {
    skill: 'baoyu-url-to-markdown',
    category: 'source capture',
    status: 'runtime_integrated',
    draftOrbitUsage:
      'Clear user-provided URLs are captured as markdown sourceArtifacts before latest/source-required article generation.',
    testEvidence:
      '`latest-hermes-agent-url-source` requires a ready `sourceArtifacts[].markdownPath` and rejects source-free latest-fact output.',
    gapOrReason: 'No remaining product gap for explicit URL capture in the ordinary-user UAT scope.',
    repairResult: 'Pinned runtime to audited upstream main and keeps source-ready assertions in the UAT script.'
  },
  {
    skill: 'baoyu-danger-x-to-markdown',
    category: 'source capture',
    status: 'runtime_integrated',
    draftOrbitUsage:
      'X/Twitter source URLs are routed through the baoyu source-capture runtime when the user supplies social-source evidence.',
    testEvidence:
      'Source cases assert fail-closed behavior unless a captured markdown artifact is present; dangerous login/posting actions are not invoked.',
    gapOrReason: 'Only capture/export is in scope; no reverse-engineered login flow is allowed in DraftOrbit.',
    repairResult: 'Documented as safe source capture only, with latest/source ambiguity blocked for ordinary users.'
  },
  {
    skill: 'baoyu-format-markdown',
    category: 'markdown formatting',
    status: 'rubric_or_prompt_reference',
    draftOrbitUsage:
      'Article readability and markdown hygiene are enforced through DraftOrbit result gates and ordinary-user copy assertions.',
    testEvidence:
      'Article cases reject generic scaffold output, title repetition, method-framework title tone and prompt-wrapper leaks.',
    gapOrReason: 'Not exposed as a separate user action; used as formatting/rubric parity rather than a standalone CLI button.',
    repairResult: 'Report marks this as rubric parity, not falsely as a direct DraftOrbit runtime call.'
  },
  {
    skill: 'baoyu-imagine',
    category: 'visual runtime',
    status: 'runtime_integrated',
    draftOrbitUsage:
      'Visual plans produce prompt files and app-rendered SVG artifacts with baoyu runtime provenance while avoiding placeholder/mock images.',
    testEvidence:
      'Tweet/thread/article cases require ready visualAssets, promptPath, template-svg renderer, app-rendered textLayer and no prompt leaks.',
    gapOrReason: 'External image-provider keys may be absent locally; UAT treats mock/placeholder artifacts as failures for quality evidence.',
    repairResult: 'Pinned runtime and ordinary-user UAT keep the provider/mock distinction explicit.'
  },
  {
    skill: 'baoyu-image-gen',
    category: 'visual runtime',
    status: 'rubric_or_prompt_reference',
    draftOrbitUsage:
      'Deprecated upstream alias is migrated to the `baoyu-imagine` provider seam; DraftOrbit does not call it as an active runtime entry.',
    testEvidence: 'Runtime smoke and UAT reports mark `baoyu-image-gen` as deprecated and require `baoyu-imagine` for actual visual generation.',
    gapOrReason: '`baoyu-image-gen` is deprecated/migrated to `baoyu-imagine`, so direct invocation would be stale product behavior.',
    repairResult: 'Documented as deprecated alias only; active visual runtime uses `baoyu-imagine` plus local SVG rendering.'
  },
  {
    skill: 'baoyu-image-cards',
    category: 'visual export',
    status: 'rubric_or_prompt_reference',
    draftOrbitUsage:
      'Thread generation must produce a ready `cards` asset and responsive gallery evidence for ordinary users.',
    testEvidence: '`thread-product-update` rejects runs missing a ready cards asset or leaking card number labels into visual cues.',
    gapOrReason: 'The upstream skill is prompt/reference-oriented in this pin, so DraftOrbit validates card deliverables rather than calling a CLI.',
    repairResult: 'Kept a hard UAT assertion for thread cards.'
  },
  {
    skill: 'baoyu-cover-image',
    category: 'visual export',
    status: 'rubric_or_prompt_reference',
    draftOrbitUsage: 'Tweet and article outputs require cover-style visual artifacts with visible ordinary-user gallery state.',
    testEvidence: 'Visual UAT requires ready cover assets for article cases and visible “主视觉方向/图文资产” UI copy.',
    gapOrReason: 'No separate cover-image CLI is invoked from DraftOrbit in this recovery pass.',
    repairResult: 'Report identifies the gap as intentional product-surface consolidation.'
  },
  {
    skill: 'baoyu-infographic',
    category: 'visual export',
    status: 'rubric_or_prompt_reference',
    draftOrbitUsage: 'Article outputs require a summary visual asset: infographic or illustration.',
    testEvidence: 'Article cases reject runs without a ready cover plus infographic/illustration asset.',
    gapOrReason: 'No separate infographic CLI is invoked from the current ordinary-user UI.',
    repairResult: 'Kept artifact-level assertion instead of adding an unplanned feature.'
  },
  {
    skill: 'baoyu-article-illustrator',
    category: 'visual export',
    status: 'rubric_or_prompt_reference',
    draftOrbitUsage: 'Article result previews require a section visual path through illustration or infographic assets.',
    testEvidence: 'Article UAT accepts ready illustration/infographic evidence and rejects missing summary/section visuals.',
    gapOrReason: 'Upstream exposes batch helper scripts, but DraftOrbit keeps article illustration behind its restored visual pipeline.',
    repairResult: 'Documented as parity-through-artifact instead of direct CLI execution.'
  },
  {
    skill: 'baoyu-diagram',
    category: 'visual export',
    status: 'runtime_integrated',
    draftOrbitUsage:
      'Diagram intent and explicit diagram mode produce a standalone process/flow SVG asset with local renderer provenance.',
    testEvidence:
      'Diagram prompts and visualRequest.mode=`diagram` are expected to produce a ready `diagram` asset with SVG metadata and quality-gate coverage.',
    gapOrReason: 'Raster diagram providers remain optional; default pass uses safe local SVG diagrams rather than external services.',
    repairResult: 'Added diagram to visual planning, renderer, parity matrix and ordinary-user UAT scope.'
  },
  {
    skill: 'baoyu-compress-image',
    category: 'delivery/export',
    status: 'safe_gap',
    draftOrbitUsage: 'Current DraftOrbit can download generated assets but does not promise a separate compression workflow.',
    testEvidence: 'UAT checks “下载全部图文资产” state and leaves large image/provider artifacts local-only.',
    gapOrReason: 'Compression is a future delivery hardening gap, not a restored active UI feature.',
    repairResult: 'Kept out of runtime; report flags it for a future safe delivery pass.'
  },
  {
    skill: 'baoyu-markdown-to-html',
    category: 'delivery/export',
    status: 'runtime_integrated',
    draftOrbitUsage: 'Article and export-enabled runs create Markdown and HTML files in the local artifact bundle with download links.',
    testEvidence: 'Article visualRequest.exportHtml requires markdown/html export assets and a signed bundle URL in the result preview.',
    gapOrReason: 'No real CMS publish is performed; HTML is a local safe export package for manual reuse.',
    repairResult: 'Integrated safe Markdown→HTML export artifacts into the visual pipeline and report matrix.'
  },
  {
    skill: 'baoyu-post-to-x',
    category: 'publish',
    status: 'blocked_external_action',
    draftOrbitUsage:
      'DraftOrbit only prepares/queues/manual-confirms publish state; real X posting is blocked unless a safe explicit integration exists.',
    testEvidence: 'Tweet/thread UAT requires “连接 X 后才能发布” visibility and never executes a real post.',
    gapOrReason: 'Real external posting and reverse-engineered login flows are intentionally out of scope for this local audit.',
    repairResult: 'Kept as sandbox/manual publish-prep only and documented in the report matrix.'
  }
];

export const ORDINARY_USER_ROUTE_AUDIT_TARGETS: OrdinaryUserRouteAuditTarget[] = [
  {
    id: 'home',
    path: '/',
    expectedCopy: ['你说一句话，DraftOrbit 帮你产出可发的 X 内容', '进入生成器'],
    notes: ['ordinary landing page entry path']
  },
  {
    id: 'app',
    path: '/app',
    expectedCopy: ['开始生成', '高级选项', '未连接 X 账号 · 仍可先生成'],
    notes: ['local quick experience generator shell']
  },
  {
    id: 'connect',
    path: '/connect?intent=connect_x_self',
    expectedCopy: ['连接 X 账号后再发布会更顺', '连接 X 账号'],
    notes: ['connect route redirects into the app task panel instead of exposing a dead page']
  },
  {
    id: 'queue',
    path: '/queue?intent=confirm_publish',
    expectedCopy: ['确认这条内容是否发出', '当前待确认内容'],
    notes: ['queue route redirects into the app task panel instead of a separate backstage UI']
  },
  {
    id: 'pricing',
    path: '/pricing',
    expectedCopy: ['升级与结账', '月付'],
    notes: ['billing entry does not trigger real payment until the user clicks checkout']
  }
];

export const ORDINARY_USER_BAOYU_SYNC_CASES: OrdinaryUserBaoyuSyncCase[] = [
  {
    id: 'tweet-cold-start',
    format: 'tweet',
    uiLabel: '短推',
    prompt: '别再靠灵感写推文，给我一条更像真人的冷启动判断句。',
    baoyuComparisonNote:
      'baoyu 没有直接 tweet writer CLI；本 case 用 baoyu runtime visual artifacts + fixed/adversarial rubric 判定，不伪造 baoyu 文本直出。'
  },
  {
    id: 'thread-product-update',
    format: 'thread',
    uiLabel: '串推',
    prompt: '把一个 AI 产品新功能写成 4 条 thread，不要像建议模板。',
    baoyuComparisonNote:
      'baoyu 没有直接 thread writer CLI；本 case 重点对照 thread/card 结构、visual prompt files 与 baoyu-imagine artifact。'
  },
  {
    id: 'article-judgement-without-examples',
    format: 'article',
    uiLabel: '长文',
    prompt: '写一篇关于 AI 内容全是判断没有例子的 X 长文，标题不要方法论味。',
    acceptQualityBlocked: true,
    baoyuComparisonNote:
      'baoyu 没有直接 article writer CLI；本 case 重点对照 article structure、markdown-style readability、cover/illustration/infographic artifact。'
  },
  {
    id: 'article-generic-scaffold-gate',
    format: 'article',
    uiLabel: '长文',
    prompt: '写一篇关于 AI 内容全是判断没有例子的 X 长文，标题不要方法论味，也不要写成方法论大纲。',
    acceptQualityBlocked: true,
    baoyuComparisonNote:
      'quality-gate case：若模型仍输出 article_generic_scaffold，必须被拦截成用户可恢复失败态；若后端修复成功，则按正常 article artifact 验收。'
  },
  {
    id: 'diagram-process-prompt',
    format: 'tweet',
    uiLabel: '短推',
    prompt: '用一条短推解释 DraftOrbit 从输入一句话到手动确认发布的 5 步流程，并配一个流程图：输入→来源→正文→图文→确认。',
    visualMode: 'diagram',
    visualLayout: 'flow',
    exportHtml: true,
    baoyuComparisonNote:
      'diagram case：对标 baoyu-diagram / visual flow 能力，必须产出 diagram SVG 与 Markdown/HTML 导出资产。'
  },
  {
    id: 'latest-hermes-source',
    format: 'article',
    uiLabel: '长文',
    prompt: '生成关于最新的 Hermes 的文章',
    sourceExpectation: 'ready_or_blocked',
    baoyuComparisonNote:
      'source case：若 Tavily 与 baoyu URL 抓取可用，必须进入 sourceArtifacts；若 Hermes 歧义或搜索未配置，必须 fail-closed 并显示“需要可靠来源”。'
  },
  {
    id: 'latest-hermes-agent-url-source',
    format: 'article',
    uiLabel: '长文',
    prompt: '根据这篇来源写一篇关于最新 Hermes Agent 的 X 长文：https://tech.ifeng.com/c/8sDHJq3vKxM',
    sourceExpectation: 'ready',
    acceptQualityBlocked: true,
    baoyuComparisonNote:
      'source-ready case：用户已给出明确 URL 时，必须先用 baoyu-url-to-markdown 抓成 markdown source artifact，再进入文章与图文资产生成。'
  }
];

function selectedOrdinaryUserCases(): OrdinaryUserBaoyuSyncCase[] {
  const ids = process.env.ORDINARY_USER_CASE_IDS?.split(',').map((item) => item.trim()).filter(Boolean);
  if (!ids?.length) return ORDINARY_USER_BAOYU_SYNC_CASES;
  const idSet = new Set(ids);
  return ORDINARY_USER_BAOYU_SYNC_CASES.filter((item) => idSet.has(item.id));
}

const PROMPT_WRAPPER_PATTERNS = [
  '给我一条',
  '更像真人',
  '冷启动判断句',
  '不要像建议模板',
  '标题不要方法论味',
  '空荡荡的输入框',
  '自我介绍',
  '读者扫完整条还是不知道',
  '欢迎留言讨论',
  '评论区聊聊',
  '你怎么看'
];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function createStamp(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(
    date.getMinutes()
  )}-${pad(date.getSeconds())}`;
}

function repoRootFromScript(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function buildOrdinaryUserBaoyuOutputPaths(repoRoot: string, stamp: string, evidenceDirOverride?: string) {
  const evidenceDir = evidenceDirOverride
    ? path.resolve(evidenceDirOverride)
    : path.join(repoRoot, 'output', 'playwright', `ordinary-user-baoyu-sync-${stamp}`);
  const trackedReportDir = path.join(repoRoot, 'output', 'reports', 'uat-full');
  return {
    evidenceDir,
    evidenceReportPath: path.join(evidenceDir, 'BAOYU-ORDINARY-USER-SYNC.md'),
    summaryPath: path.join(evidenceDir, 'summary.json'),
    trackedReportDir,
    trackedReportPath: path.join(trackedReportDir, `BAOYU-ORDINARY-USER-SYNC-${stamp}.md`)
  };
}

export function buildOrdinaryUserEvidenceNotes(env: NodeJS.ProcessEnv = process.env, selectedCaseCount = ORDINARY_USER_BAOYU_SYNC_CASES.length): string[] {
  const notes: string[] = [];
  const codexLocalEvidence =
    env.CODEX_LOCAL_ADAPTER_ENABLED === '1' &&
    env.MODEL_ROUTER_ENABLE_CODEX_LOCAL === '1' &&
    env.CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE === '1';
  if (!env.OPENAI_API_KEY && !env.OPENROUTER_API_KEY && !codexLocalEvidence) {
    notes.push(
      'No real OPENAI_API_KEY/OPENROUTER_API_KEY was available for this run; mock/free/local generations must not be counted as baoyu quality pass evidence.'
    );
  } else if (!env.OPENAI_API_KEY && !env.OPENROUTER_API_KEY && codexLocalEvidence) {
    notes.push(
      'No real OPENAI_API_KEY/OPENROUTER_API_KEY was available; this run allows Codex OAuth local adapter evidence only because CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE=1 and the adapter smoke must pass.'
    );
  }
  if (!env.TAVILY_API_KEY && (!env.DRAFTORBIT_SEARCH_PROVIDER || env.DRAFTORBIT_SEARCH_PROVIDER === 'none')) {
    notes.push('No live search provider was configured; ambiguous latest-fact prompts are expected to fail closed unless the user supplies a URL.');
  }
  if (selectedCaseCount === 0) {
    notes.push('No live generation cases were selected in this run; the report only proves route/browser coverage and the static baoyu matrix.');
  }
  return notes;
}

function toComparableText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function collectPromptLeak(haystack: string, field: string, leaks: string[]) {
  const normalized = haystack.replace(/\s+/gu, ' ').trim();
  if (!normalized) return;
  for (const pattern of PROMPT_WRAPPER_PATTERNS) {
    if (normalized.includes(pattern)) leaks.push(`${field}:${pattern}`);
  }
}

function collectCopyHygieneLeak(haystack: string, field: string, leaks: string[]) {
  const normalized = haystack.replace(/\r\n/gu, '\n').trim();
  if (!normalized) return;
  if (/(?:^|\n)\s*[”"']\s*(?:\n|$)|\d+\/\d+\s*[”"']/u.test(normalized)) {
    leaks.push(`${field}:stray quote`);
  }
  if (/(?:^|\n)\s*\*{1,3}\s*\d+\/\d+\s*\*{1,3}\s*(?:\n|$)/u.test(normalized)) {
    leaks.push(`${field}:markdown thread label`);
  }
  if (field !== 'text' && /(?:^|\s)\d+\/\d+\s+\S/u.test(normalized)) {
    leaks.push(`${field}:card number label`);
  }
}

export function findPromptWrapperLeaks(input: {
  text?: string;
  visualPlan?: VisualPlanLike | null;
  visualAssets?: VisualAssetLike[];
}): string[] {
  const leaks: string[] = [];
  collectPromptLeak(toComparableText(input.text), 'text', leaks);

  const plan = input.visualPlan;
  (plan?.visualizablePoints ?? []).forEach((item, index) => collectPromptLeak(item, `visualPlan.visualizablePoints[${index}]`, leaks));
  (plan?.keywords ?? []).forEach((item, index) => collectPromptLeak(item, `visualPlan.keywords[${index}]`, leaks));
  (plan?.items ?? []).forEach((item, index) => {
    collectPromptLeak(toComparableText(item.cue), `visualPlan.items[${index}].cue`, leaks);
    collectPromptLeak(toComparableText(item.reason), `visualPlan.items[${index}].reason`, leaks);
  });
  (input.visualAssets ?? []).forEach((asset, index) => {
    collectPromptLeak(toComparableText(asset.cue), `visualAssets[${index}].cue`, leaks);
    collectPromptLeak(toComparableText(asset.reason), `visualAssets[${index}].reason`, leaks);
  });

  return [...new Set(leaks)];
}

function findCopyHygieneLeaks(input: {
  text?: string;
  visualPlan?: VisualPlanLike | null;
  visualAssets?: VisualAssetLike[];
}): string[] {
  const leaks: string[] = [];
  collectCopyHygieneLeak(toComparableText(input.text), 'text', leaks);

  const plan = input.visualPlan;
  (plan?.visualizablePoints ?? []).forEach((item, index) =>
    collectCopyHygieneLeak(item, `visualPlan.visualizablePoints[${index}]`, leaks)
  );
  (plan?.keywords ?? []).forEach((item, index) => collectCopyHygieneLeak(item, `visualPlan.keywords[${index}]`, leaks));
  (plan?.items ?? []).forEach((item, index) => {
    collectCopyHygieneLeak(toComparableText(item.cue), `visualPlan.items[${index}].cue`, leaks);
    collectCopyHygieneLeak(toComparableText(item.reason), `visualPlan.items[${index}].reason`, leaks);
  });
  (input.visualAssets ?? []).forEach((asset, index) => {
    collectCopyHygieneLeak(toComparableText(asset.cue), `visualAssets[${index}].cue`, leaks);
    collectCopyHygieneLeak(toComparableText(asset.reason), `visualAssets[${index}].reason`, leaks);
  });

  return [...new Set(leaks)];
}

function isForbiddenModel(value: string): boolean {
  if (/^codex-local\//iu.test(value)) return process.env.CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE !== '1';
  return /draftorbit\/heuristic|openrouter\/free|mock\/|^ollama\//iu.test(value);
}

function countThreadPosts(text: string): number {
  const explicit = text.match(/(?:^|\n)\s*\d+\/\d+\s*(?:\n|$)/gu)?.length ?? 0;
  if (explicit > 0) return explicit;
  return text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean).length;
}

function firstParagraphs(text: string): string[] {
  return text.split(/\n{2,}/u).map((item) => item.trim()).filter(Boolean);
}

function assertArticleStructure(text: string): string[] {
  const failures: string[] = [];
  const blocks = firstParagraphs(text);
  if (blocks.length < 5) failures.push('article 段落数不足');
  const title = blocks[0] ?? '';
  const bodyOpening = blocks.slice(1, 3).join('\n');
  if (title && bodyOpening.includes(title)) failures.push('article 标题被首节复述');
  if (/先把|再让|讲清楚|方法论|框架/u.test(title)) failures.push('article 标题仍有方法论味');
  return failures;
}

export function assertOrdinaryUserCaseEvidence(input: CaseEvidenceInput): EvidenceSummary {
  const result = input.finalPayload.result;
  const errors: string[] = [];
  if (input.finalPayload.status !== 'DONE') errors.push(`run status 不是 DONE:${input.finalPayload.status ?? 'missing'}`);
  if (input.finalPayload.format !== input.caseDef.format) {
    errors.push(`format 不匹配:${input.finalPayload.format ?? 'missing'} != ${input.caseDef.format}`);
  }
  if (!result) errors.push('finalPayload.result 缺失');

  const sourceBlocked =
    input.caseDef.sourceExpectation === 'ready_or_blocked' &&
    Boolean(result?.qualityGate?.sourceRequired) &&
      result?.qualityGate?.sourceStatus !== 'ready' &&
      (result?.qualityGate?.safeToDisplay === false || result?.qualityGate?.status === 'failed');
  const qualityBlocked =
    !sourceBlocked &&
    Boolean(input.caseDef.acceptQualityBlocked) &&
    (result?.qualityGate?.safeToDisplay === false || result?.qualityGate?.status === 'failed');

  if (sourceBlocked) {
    if (!input.bodyText.includes('需要可靠来源，不能编造最新事实')) errors.push('source failure 没有展示可恢复来源提示');
    if (!input.bodyText.includes('粘贴来源 URL 再生成')) errors.push('source failure 缺少“粘贴来源 URL 再生成”动作');
    if (!input.bodyText.includes('改成非最新主题再生成')) errors.push('source failure 缺少“改成非最新主题再生成”动作');
    if (input.bodyText.includes('可以直接进入确认')) errors.push('source failure 仍显示“可以直接进入确认”的误导状态');
    if (String(result?.text ?? '').trim()) errors.push('source failure 仍返回了可展示坏稿正文');
    if ((result?.visualAssets ?? []).some((asset) => asset.status === 'ready')) errors.push('source failure 仍生成了 ready 图片资产');
    if (input.consoleErrors.length > 0) errors.push(`console/page errors:${JSON.stringify(input.consoleErrors)}`);
    if (errors.length > 0) throw new Error(errors.join('\n'));

    return {
      id: input.caseDef.id,
      format: input.caseDef.format,
      prompt: input.caseDef.prompt,
      pass: true,
      runId: String(input.finalPayload.runId ?? ''),
      model: 'source-blocked',
      routingTier: 'source-blocked',
      runtimeEngine: String(result?.runtime?.engine ?? 'source-blocked'),
      screenshotPath: input.screenshotPath,
      responsiveScreenshotPaths: input.responsiveScreenshotPaths ?? [],
      finalJsonPath: input.finalJsonPath,
      visualAssetsReady: 0,
      visualAssetsFailed: result?.visualAssets?.length ?? 0,
      sourcePass: true,
      sourceStatus: String(result?.qualityGate?.sourceStatus ?? 'failed'),
      promptLeaks: [],
      notes: [input.caseDef.baoyuComparisonNote, 'source failed but correctly blocked']
    };
  }

  if (qualityBlocked) {
    if (!input.bodyText.includes('这版还没达到可发布标准')) errors.push('quality failure 没有展示用户可理解失败标题');
    if (!input.bodyText.includes('再来一版')) errors.push('quality failure 缺少“再来一版”恢复动作');
    if (!input.bodyText.includes('回到输入框调整')) errors.push('quality failure 缺少“回到输入框调整”恢复动作');
    if (input.bodyText.includes('article_generic_scaffold')) errors.push('quality failure 主界面暴露了 raw hard fail tag');
    if (input.bodyText.includes('可以直接进入确认')) errors.push('quality failure 仍显示“可以直接进入确认”的误导状态');
    if (String(result?.text ?? '').trim()) errors.push('quality failure 仍返回了可展示坏稿正文');
    if ((result?.visualAssets ?? []).some((asset) => asset.status === 'ready')) errors.push('quality failure 仍展示 ready 图片资产');
    if (input.consoleErrors.length > 0) errors.push(`console/page errors:${JSON.stringify(input.consoleErrors)}`);
    if (errors.length > 0) throw new Error(errors.join('\n'));

    return {
      id: input.caseDef.id,
      format: input.caseDef.format,
      prompt: input.caseDef.prompt,
      pass: true,
      runId: String(input.finalPayload.runId ?? ''),
      model: String(result?.routing?.primaryModel ?? 'quality-blocked'),
      routingTier: String(result?.routing?.routingTier ?? 'quality-blocked'),
      runtimeEngine: String(result?.runtime?.engine ?? 'quality-blocked'),
      screenshotPath: input.screenshotPath,
      responsiveScreenshotPaths: input.responsiveScreenshotPaths ?? [],
      finalJsonPath: input.finalJsonPath,
      visualAssetsReady: 0,
      visualAssetsFailed: result?.visualAssets?.length ?? 0,
      sourcePass:
        input.caseDef.sourceExpectation === 'ready' || input.caseDef.sourceExpectation === 'ready_or_blocked'
          ? (result?.sourceArtifacts ?? []).some((artifact) => artifact.status === 'ready' && artifact.markdownPath)
          : undefined,
      sourceStatus: result?.qualityGate?.sourceStatus,
      promptLeaks: [],
      notes: [input.caseDef.baoyuComparisonNote, 'quality failed but correctly blocked with recoverable copy']
    };
  }

  const routing = result?.routing ?? null;
  const usage = result?.usage ?? [];
  const model = String(routing?.primaryModel ?? usage[0]?.modelUsed ?? usage[0]?.model ?? '');
  const routingTier = String(routing?.routingTier ?? usage[0]?.routingTier ?? '');
  if (!model) errors.push('routing.primaryModel 缺失');
  if (isForbiddenModel(model)) errors.push(`real-model evidence 使用了禁用模型:${model}`);
  if (/free_first/iu.test(routingTier)) errors.push(`routingTier 禁用:${routingTier}`);
  for (const usageItem of usage) {
    const usageModel = String(usageItem.modelUsed ?? usageItem.model ?? '');
    if (isForbiddenModel(usageModel)) errors.push(`usage 使用了禁用模型:${usageModel}`);
    if (/free_first/iu.test(String(usageItem.routingTier ?? ''))) errors.push(`usage routingTier 禁用:${usageItem.routingTier}`);
  }

  const runtimeEngine = String(result?.runtime?.engine ?? '');
  if (runtimeEngine !== 'baoyu-skills') errors.push(`runtime.engine 不是 baoyu-skills:${runtimeEngine || 'missing'}`);

  if (result?.qualityGate?.safeToDisplay === false || result?.qualityGate?.status === 'failed') {
    errors.push(`qualityGate failed:${JSON.stringify(result.qualityGate)}`);
  }
  if ((result?.qualityGate?.visualHardFails ?? []).length > 0) {
    errors.push(`visual qualityGate failed:${result.qualityGate.visualHardFails.join(',')}`);
  }

  const text = String(result?.text ?? '');
  const promptLeaks = findPromptWrapperLeaks({
    text,
    visualPlan: result?.visualPlan ?? null,
    visualAssets: result?.visualAssets ?? []
  });
  if (promptLeaks.length > 0) errors.push(`prompt wrapper leak:${promptLeaks.join(', ')}`);
  const hygieneLeaks = findCopyHygieneLeaks({
    text,
    visualPlan: result?.visualPlan ?? null,
    visualAssets: result?.visualAssets ?? []
  });
  if (hygieneLeaks.length > 0) errors.push(`copy hygiene leak:${hygieneLeaks.join(', ')}`);

  if (input.caseDef.format === 'thread') {
    const posts = countThreadPosts(text);
    if (posts < 4 || posts > 6) errors.push(`thread 未拆成 4-6 条:${posts}`);
  }
  if (input.caseDef.format === 'article') {
    errors.push(...assertArticleStructure(text));
  }
  if (input.caseDef.sourceExpectation === 'ready' || input.caseDef.sourceExpectation === 'ready_or_blocked') {
    const readySources = (result?.sourceArtifacts ?? []).filter((artifact) => artifact.status === 'ready' && artifact.markdownPath);
    if (readySources.length === 0) errors.push('source case 没有 ready sourceArtifacts，也没有正确阻断');
  }

  const publishPrepVisible =
    input.bodyText.includes('连接 X 后才能发布') ||
    input.bodyText.includes('加入待确认') ||
    input.bodyText.includes('进入发布队列');
  if (input.caseDef.format !== 'article' && !publishPrepVisible) {
    errors.push('发布准备/连接 X 阻断文案不可见');
  }
  if (!input.bodyText.includes('主视觉方向')) errors.push('结果页主视觉方向不可见');
  if (!input.bodyText.includes('图文资产')) errors.push('结果页图文资产 gallery 不可见');
  if (!input.bodyText.includes('只重试图片')) errors.push('只重试图片操作不可见');
  if (!input.bodyText.includes('下载全部图文资产') && !input.bodyText.includes('暂无可下载图片')) errors.push('下载全部图文资产按钮状态不可见');
  if (!input.bodyText.includes('已生成') && !input.bodyText.includes('生成失败')) errors.push('图片 artifact 状态不可见');
  if (input.bodyText.includes('routingTier') || input.bodyText.includes('primaryModel') || input.bodyText.includes('judge notes')) {
    errors.push('技术推理细节默认暴露给普通用户');
  }
  if (input.consoleErrors.length > 0) errors.push(`console/page errors:${JSON.stringify(input.consoleErrors)}`);

  const visualAssets = result?.visualAssets ?? [];
  const visualRenderAssets = visualAssets.filter((asset) => (asset.exportFormat ?? 'svg') === 'svg');
  const readyAssets = visualRenderAssets.filter((asset) => asset.status === 'ready' && asset.assetUrl);
  const failedAssets = visualAssets.filter((asset) => asset.status === 'failed');
  if (visualAssets.length === 0) errors.push('visualAssets 缺失');
  if (readyAssets.length === 0) errors.push('withImage=true 但没有 ready 图片 artifact');
  if (readyAssets.length > 0 && !String(result?.visualAssetsBundleUrl ?? '').includes('token=')) {
    errors.push('bundle download signed URL missing');
  }
  if (input.caseDef.format === 'thread' && !readyAssets.some((asset) => asset.kind === 'cards')) {
    errors.push('thread 缺少 ready cards asset');
  }
  if (
    input.caseDef.format === 'article' &&
    (!readyAssets.some((asset) => asset.kind === 'cover') ||
      !readyAssets.some((asset) => asset.kind === 'infographic' || asset.kind === 'illustration'))
  ) {
    errors.push('article 缺少 ready cover 或 summary/section visual asset');
  }
  if (input.caseDef.visualMode === 'diagram' && !readyAssets.some((asset) => asset.kind === 'diagram')) {
    errors.push('diagram case 缺少 ready diagram asset');
  }
  if (input.caseDef.exportHtml && !visualAssets.some((asset) => asset.exportFormat === 'html' && asset.status === 'ready')) {
    errors.push('exportHtml case 缺少 ready HTML export asset');
  }
  for (const asset of visualAssets) {
    if (!asset.status || !['ready', 'failed'].includes(asset.status)) errors.push(`visualAsset 状态未收口:${asset.id ?? 'unknown'}:${asset.status}`);
    if (/placeholder|mock/iu.test(String(asset.assetUrl ?? asset.error ?? ''))) {
      errors.push(`visualAsset 使用 placeholder/mock:${asset.id ?? asset.assetUrl ?? 'unknown'}`);
    }
    if (asset.status === 'ready' && !asset.promptPath) errors.push(`ready visualAsset 缺少 promptPath:${asset.id ?? asset.assetUrl ?? 'unknown'}`);
    if (asset.status === 'ready' && asset.exportFormat && !asset.specPath) {
      errors.push(`ready visualAsset 缺少 specPath:${asset.id ?? asset.assetUrl ?? 'unknown'}`);
    }
    if (asset.status === 'ready' && asset.exportFormat && !asset.checksum) {
      errors.push(`ready visualAsset 缺少 checksum:${asset.id ?? asset.assetUrl ?? 'unknown'}`);
    }
    if (asset.status === 'ready' && asset.exportFormat && !asset.provider) {
      errors.push(`ready visualAsset 缺少 provider provenance:${asset.id ?? asset.assetUrl ?? 'unknown'}`);
    }
    if (asset.status === 'ready') {
      const signedUrl = String(asset.signedAssetUrl ?? asset.assetUrl ?? '');
      if (!signedUrl.includes('token=')) errors.push(`signed asset url missing:${asset.id ?? asset.assetUrl ?? 'unknown'}`);
    }
    if ((asset.exportFormat ?? 'svg') === 'svg') {
      if (asset.status === 'ready' && asset.renderer !== 'template-svg') errors.push(`ready visualAsset 未使用模板渲染:${asset.id ?? 'unknown'}:${asset.renderer ?? 'missing'}`);
      if (asset.status === 'ready' && asset.textLayer !== 'app-rendered') errors.push(`ready visualAsset textLayer 未由 app 渲染:${asset.id ?? 'unknown'}:${asset.textLayer ?? 'missing'}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return {
    id: input.caseDef.id,
    format: input.caseDef.format,
    prompt: input.caseDef.prompt,
    pass: true,
    runId: String(input.finalPayload.runId ?? ''),
    model,
    routingTier,
    runtimeEngine,
    screenshotPath: input.screenshotPath,
    responsiveScreenshotPaths: input.responsiveScreenshotPaths ?? [],
    finalJsonPath: input.finalJsonPath,
    visualAssetsReady: readyAssets.length,
    visualAssetsFailed: failedAssets.length,
    sourcePass:
      input.caseDef.sourceExpectation === 'ready' || input.caseDef.sourceExpectation === 'ready_or_blocked'
        ? (result?.sourceArtifacts ?? []).some((artifact) => artifact.status === 'ready')
        : undefined,
    sourceStatus: result?.qualityGate?.sourceStatus,
    promptLeaks,
    actionChecks: [],
    notes: [input.caseDef.baoyuComparisonNote]
  };
}

export function buildOrdinaryUserBaoyuSyncReport(input: {
  stamp: string;
  apiUrl: string;
  webUrl: string;
  baoyuCommit: string;
  evidenceRoot: string;
  cases: EvidenceSummary[];
  routes?: RouteAuditSummary[];
  evidenceNotes?: string[];
}): string {
  const passCount = input.cases.filter((item) => item.pass).length;
  const routePassCount = (input.routes ?? []).filter((item) => item.pass).length;
  return [
    `# DraftOrbit × baoyu ordinary-user sync comparison (${input.stamp})`,
    '',
    `- API: \`${input.apiUrl}\``,
    `- Web: \`${input.webUrl}\``,
    `- Evidence root: \`${input.evidenceRoot}\``,
    `- baoyu-skills commit: \`${input.baoyuCommit}\``,
    `- Cases: \`${input.cases.length}\``,
    `- Pass count: \`${passCount}/${input.cases.length}\``,
    '',
    '## Comparison policy',
    '',
    '- DraftOrbit is tested through the ordinary `/` → `/app` user path, not only direct API calls.',
    '- baoyu runtime comparison uses real runnable artifacts where available: source capture, markdown normalization, visual prompt/spec files, local SVG assets and baoyu-imagine provider seams.',
    '- baoyu does not expose a direct tweet/thread/article writer CLI in this pinned runtime; writer quality is judged against the baoyu fixed/adversarial rubric without faking direct baoyu text output.',
    '- `draftorbit/heuristic`, `openrouter/free`, `ollama/*`, placeholder images and mock images invalidate test_high evidence; `codex-local/*` counts only when explicitly enabled by `CODEX_LOCAL_ALLOW_QUALITY_EVIDENCE=1`.',
    '',
    '## Evidence notes',
    '',
    ...(input.evidenceNotes?.length ? input.evidenceNotes.map((note) => `- ${note}`) : ['- no additional evidence caveats']),
    '',
    '## Ordinary-user route audit',
    '',
    `- Routes: \`${routePassCount}/${input.routes?.length ?? 0}\``,
    `- Breakpoints per route: ${RESPONSIVE_VIEWPORTS.map((viewport) => `\`${viewport.label}\``).join(', ')}`,
    '',
    ...(input.routes?.length
      ? input.routes.flatMap((route) => [
          `### ${route.id} · \`${route.path}\``,
          '',
          `- pass: \`${route.pass}\``,
          `- finalUrl: \`${route.finalUrl}\``,
          `- checkedCopy: ${route.checkedCopy.map((copy) => `\`${copy}\``).join(', ')}`,
          `- body: \`${route.bodyPath}\``,
          `- screenshots: ${route.screenshotPaths.map((itemPath) => `\`${itemPath}\``).join(', ')}`,
          ...(route.consoleErrors.length
            ? [`- consoleErrors: ${route.consoleErrors.map((entry) => `\`${entry.type}:${entry.text}\``).join(', ')}`]
            : ['- consoleErrors: none']),
          ...route.notes.map((note) => `- ${note}`),
          ''
        ])
      : ['- not run in this report', '']),
    '## Product-relevant baoyu matrix',
    '',
    '| baoyu skill | status | DraftOrbit usage | test evidence | gap / remaining reason | repair result |',
    '| --- | --- | --- | --- | --- | --- |',
    ...BAOYU_PRODUCT_SKILL_MATRIX.map((item) =>
      [
        `\`${item.skill}\``,
        `\`${item.status}\``,
        item.draftOrbitUsage,
        item.testEvidence,
        item.gapOrReason,
        item.repairResult
      ].join(' | ')
    ).map((row) => `| ${row} |`),
    '',
    ...input.cases.flatMap((item) => [
      `## ${item.id} · ${item.format}`,
      '',
      `- pass: \`${item.pass}\``,
      `- runId: \`${item.runId}\``,
      `- prompt: ${item.prompt}`,
      `- primaryModel: \`${item.model}\``,
      `- routingTier: \`${item.routingTier}\``,
      `- runtimeEngine: \`${item.runtimeEngine}\``,
      `- visualAssetsReady: \`${item.visualAssetsReady}\``,
      `- visualAssetsFailed: \`${item.visualAssetsFailed}\``,
      ...(item.sourceStatus ? [`- sourceStatus: \`${item.sourceStatus}\``, `- sourcePass: \`${item.sourcePass ?? false}\``] : []),
      ...(item.actionChecks?.length ? [`- actionChecks: ${item.actionChecks.map((check) => `\`${check}\``).join(', ')}`] : []),
      `- screenshot: \`${item.screenshotPath}\``,
      ...((item.responsiveScreenshotPaths ?? []).length
        ? [`- responsive screenshots: ${(item.responsiveScreenshotPaths ?? []).map((itemPath) => `\`${itemPath}\``).join(', ')}`]
        : []),
      `- finalJson: \`${item.finalJsonPath}\``,
      '',
      '**Prompt leaks**',
      '',
      ...(item.promptLeaks.length ? item.promptLeaks.map((leak) => `- ${leak}`) : ['- none']),
      '',
      '**baoyu sync notes**',
      '',
      ...item.notes.map((note) => `- ${note}`),
      ''
    ])
  ].join('\n');
}

async function captureResponsiveScreenshots(page: Page, caseDir: string) {
  const screenshotPaths: string[] = [];
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.getByText('图文资产', { exact: true }).waitFor({ timeout: 30_000 });
    await page.getByText('查看依据与配图建议').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(250);
    const screenshotPath = path.join(caseDir, `responsive-${viewport.label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshotPaths.push(screenshotPath);
  }
  await page.setViewportSize({ width: 1440, height: 1200 });
  return screenshotPaths;
}

function pageConsoleErrors(entries: Array<{ type: string; text: string }>) {
  return entries.filter((entry) => entry.type === 'error' || entry.type === 'pageerror');
}

async function auditOrdinaryUserRoutes(input: {
  webUrl: string;
  outDir: string;
  page: Page;
  consoleEntries: Array<{ type: string; text: string }>;
}): Promise<RouteAuditSummary[]> {
  const routeRoot = path.join(input.outDir, 'routes');
  await fs.mkdir(routeRoot, { recursive: true });
  const summaries: RouteAuditSummary[] = [];

  for (const target of ORDINARY_USER_ROUTE_AUDIT_TARGETS) {
    const routeDir = path.join(routeRoot, target.id);
    await fs.mkdir(routeDir, { recursive: true });
    const consoleStart = input.consoleEntries.length;
    const checkedCopy: string[] = [];
    const notes = [...target.notes];
    const screenshotPaths: string[] = [];
    const bodyPath = path.join(routeDir, 'body.txt');
    const errors: string[] = [];

    await input.page.setViewportSize({ width: 1440, height: 1200 });
    await input.page.goto(`${input.webUrl}${target.path}`, { waitUntil: 'networkidle', timeout: 60_000 });
    for (const copy of target.expectedCopy) {
      const locator = input.page.getByText(copy, { exact: false }).first();
      try {
        await locator.waitFor({ timeout: 60_000 });
        checkedCopy.push(copy);
      } catch {
        errors.push(`expected copy not visible:${copy}`);
      }
    }

    const bodyText = await input.page.locator('body').innerText({ timeout: 30_000 });
    await fs.writeFile(bodyPath, bodyText, 'utf8');
    if (target.id === 'pricing') {
      const checkoutEntry = input.page.getByRole('button', { name: /开始 \d+ 天试用|继续结账/u }).first();
      if ((await checkoutEntry.count()) > 0) {
        notes.push(`checkout entry visible and not clicked: ${await checkoutEntry.innerText({ timeout: 10_000 })}`);
      } else {
        errors.push('checkout entry button not visible');
      }
    }
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await input.page.setViewportSize({ width: viewport.width, height: viewport.height });
      await input.page.waitForTimeout(250);
      const screenshotPath = path.join(routeDir, `${viewport.label}.png`);
      await input.page.screenshot({ path: screenshotPath, fullPage: true });
      screenshotPaths.push(screenshotPath);
    }
    await input.page.setViewportSize({ width: 1440, height: 1200 });

    const consoleErrors = pageConsoleErrors(input.consoleEntries.slice(consoleStart));
    if (consoleErrors.length > 0) errors.push(`console/page errors:${JSON.stringify(consoleErrors)}`);

    const summary: RouteAuditSummary = {
      id: target.id,
      path: target.path,
      finalUrl: input.page.url(),
      pass: errors.length === 0,
      bodyPath,
      screenshotPaths,
      checkedCopy,
      consoleErrors,
      notes: errors.length ? [...notes, ...errors] : notes
    };
    summaries.push(summary);
    if (errors.length > 0) {
      throw new Error(`route audit failed for ${target.id}\n${errors.join('\n')}`);
    }
  }

  return summaries;
}

async function requestJson(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  }
  return payload as Record<string, any>;
}

function absoluteApiUrl(apiUrl: string, assetUrl?: string | null): string | null {
  if (!assetUrl) return null;
  if (/^https?:\/\//iu.test(assetUrl)) return assetUrl;
  if (assetUrl.startsWith('/')) return `${apiUrl.replace(/\/$/u, '')}${assetUrl}`;
  return assetUrl;
}

async function fetchAssetText(apiUrl: string, assetUrl?: string | null): Promise<string> {
  const url = absoluteApiUrl(apiUrl, assetUrl);
  if (!url) throw new Error('asset URL missing');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`asset fetch failed ${response.status}: ${url}`);
  return await response.text();
}

async function fetchAssetBuffer(apiUrl: string, assetUrl?: string | null): Promise<Buffer> {
  const url = absoluteApiUrl(apiUrl, assetUrl);
  if (!url) throw new Error('asset URL missing');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`asset fetch failed ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function waitForFinal(apiUrl: string, token: string, runId: string): Promise<FinalRunPayload> {
  const attempts = Number(process.env.ORDINARY_USER_FINAL_WAIT_ATTEMPTS ?? 240);
  for (let index = 0; index < attempts; index += 1) {
    const finalPayload = await requestJson(`${apiUrl}/v3/chat/runs/${runId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (finalPayload.status === 'DONE' || finalPayload.status === 'FAILED') return finalPayload as FinalRunPayload;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for final payload for ${runId}`);
}

async function verifyOrdinaryUserActions(input: {
  apiUrl: string;
  token: string;
  page: Page;
  caseDef: OrdinaryUserBaoyuSyncCase;
  finalPayload: FinalRunPayload;
}): Promise<string[]> {
  const result = input.finalPayload.result;
  const checks: string[] = [];
  if (!result) return checks;

  const readyAssets = (result.visualAssets ?? []).filter((asset) => asset.status === 'ready');
  const firstSvg = readyAssets.find((asset) => (asset.exportFormat ?? 'svg') === 'svg' && (asset.signedAssetUrl || asset.assetUrl));
  if (firstSvg) {
    const svg = await fetchAssetText(input.apiUrl, firstSvg.signedAssetUrl ?? firstSvg.assetUrl);
    if (!/<svg[\s>]/iu.test(svg)) throw new Error(`download SVG did not return SVG content:${firstSvg.id ?? firstSvg.kind}`);
    if (/prompt-wrapper|给我一条|不要像建议模板/iu.test(svg)) {
      throw new Error(`download SVG leaks prompt-wrapper copy:${firstSvg.id ?? firstSvg.kind}`);
    }
    checks.push(`download-svg:${firstSvg.id ?? firstSvg.kind}`);
  }

  if (result.visualAssetsBundleUrl) {
    const zip = await fetchAssetBuffer(input.apiUrl, result.visualAssetsBundleUrl);
    if (zip.length < 4 || zip[0] !== 0x50 || zip[1] !== 0x4b) throw new Error('bundle download did not return a ZIP payload');
    checks.push('download-bundle:zip');
  }

  const htmlAsset = readyAssets.find((asset) => asset.exportFormat === 'html' && (asset.signedAssetUrl || asset.assetUrl));
  if (htmlAsset) {
    const html = await fetchAssetText(input.apiUrl, htmlAsset.signedAssetUrl ?? htmlAsset.assetUrl);
    if (!/<(?:!doctype html|html|article|section)[\s>]/iu.test(html)) throw new Error(`HTML export content invalid:${htmlAsset.id ?? 'html'}`);
    checks.push(`download-html:${htmlAsset.id ?? 'html'}`);
  }

  const markdownAsset = readyAssets.find((asset) => asset.exportFormat === 'markdown' && (asset.signedAssetUrl || asset.assetUrl));
  if (markdownAsset) {
    const markdown = await fetchAssetText(input.apiUrl, markdownAsset.signedAssetUrl ?? markdownAsset.assetUrl);
    if (markdown.trim().length < 40) throw new Error(`Markdown export content too short:${markdownAsset.id ?? 'markdown'}`);
    checks.push(`download-markdown:${markdownAsset.id ?? 'markdown'}`);
    const copyButton = input.page.getByRole('button', { name: /复制 Markdown/u }).first();
    if ((await copyButton.count()) > 0) {
      await copyButton.click();
      await input.page.getByText('Markdown 已复制').waitFor({ timeout: 10_000 });
      checks.push('copy-markdown:toast');
    }
  }

  const retryButton = input.page.getByRole('button', { name: /只重试图片/u }).first();
  if ((await retryButton.count()) > 0) {
    checks.push((await retryButton.isDisabled()) ? 'retry-ui:disabled-no-failed-assets' : 'retry-ui:enabled');
  }

  if (input.caseDef.id === 'tweet-cold-start') {
    const retryPayload = await requestJson(`${input.apiUrl}/v3/chat/runs/${input.finalPayload.runId}/assets/retry`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.token}`, 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ visualRequest: { mode: 'cover', style: 'draftorbit', layout: 'auto', palette: 'draftorbit', aspect: '1:1', exportHtml: false } })
    }) as FinalRunPayload;
    const retryReady = retryPayload.result?.visualAssets?.some((asset) => asset.status === 'ready' && (asset.signedAssetUrl || asset.assetUrl));
    if (!retryReady) throw new Error('retry visual assets did not return ready signed assets');
    checks.push('retry-assets-api:ok');
  }

  return checks;
}

async function ensureAdvancedOptions(page: Page) {
  const advanced = page.locator('details').first();
  if ((await advanced.count()) > 0 && !(await advanced.evaluate((el) => el.open))) {
    await page.getByText('高级选项').click();
    await page.waitForTimeout(250);
  }
}

async function ensureWithImage(page: Page) {
  await ensureAdvancedOptions(page);
  const checkboxes = page.locator('input[type="checkbox"]');
  if ((await checkboxes.count()) > 0 && !(await checkboxes.nth(0).isChecked())) {
    await page.getByText('生成图文资产').click();
    await page.waitForTimeout(250);
  }
  if ((await checkboxes.count()) > 0 && !(await checkboxes.nth(0).isChecked())) {
    await checkboxes.nth(0).evaluate((el) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
      setter?.call(el, true);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

async function selectFormat(page: Page, caseDef: OrdinaryUserBaoyuSyncCase) {
  await ensureAdvancedOptions(page);
  await page
    .locator('details')
    .first()
    .getByRole('button', { name: new RegExp(`^${caseDef.uiLabel}`, 'u') })
    .click();
}

async function applyVisualControls(page: Page, caseDef: OrdinaryUserBaoyuSyncCase) {
  await ensureAdvancedOptions(page);
  if (caseDef.visualMode) {
    await page.locator('select[name="visualMode"]').selectOption(caseDef.visualMode);
  }
  if (caseDef.visualLayout) {
    await page.locator('select[name="visualLayout"]').selectOption(caseDef.visualLayout);
  }
  if (typeof caseDef.exportHtml === 'boolean') {
    const checkbox = page.locator('input[name="exportHtml"]');
    if ((await checkbox.count()) > 0 && (await checkbox.isChecked()) !== caseDef.exportHtml) {
      await checkbox.click();
    }
  }
  if (caseDef.visualMode || caseDef.visualLayout || typeof caseDef.exportHtml === 'boolean') {
    await page.waitForTimeout(300);
  }
}

function getBaoyuCommit(repoRoot: string): string {
  const configured = process.env.BAOYU_SKILLS_DIR?.trim();
  const baoyuDir = configured
    ? path.isAbsolute(configured)
      ? configured
      : path.join(repoRoot, configured)
    : path.join(repoRoot, 'vendor', 'baoyu-skills');
  try {
    return execFileSync('git', ['-C', baoyuDir, 'rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8'
    }).trim();
  } catch {
    return '8c17d77209b';
  }
}

async function runCase(input: {
  apiUrl: string;
  webUrl: string;
  token: string;
  outDir: string;
  page: Page;
  consoleEntries: Array<{ type: string; text: string }>;
  caseDef: OrdinaryUserBaoyuSyncCase;
}): Promise<EvidenceSummary> {
  const caseDir = path.join(input.outDir, input.caseDef.id);
  await fs.mkdir(caseDir, { recursive: true });
  const screenshotPath = path.join(caseDir, 'app-result.png');
  const bodyPath = path.join(caseDir, 'body.txt');
  const finalJsonPath = path.join(caseDir, 'final.json');
  const startJsonPath = path.join(caseDir, 'start.json');
  const consolePath = path.join(caseDir, 'console.json');
  const consoleStart = input.consoleEntries.length;

  await input.page.goto(`${input.webUrl}/`, { waitUntil: 'networkidle', timeout: 60_000 });
  const appLink = input.page.getByRole('link', { name: /进入生成器/u }).first();
  if ((await appLink.count()) > 0) {
    await appLink.click();
  } else {
    await input.page.goto(`${input.webUrl}/app`, { waitUntil: 'networkidle', timeout: 60_000 });
  }

  await input.page.getByRole('button', { name: /^开始生成$/u }).waitFor({ timeout: 30_000 });
  await selectFormat(input.page, input.caseDef);
  await ensureWithImage(input.page);
  await applyVisualControls(input.page, input.caseDef);
  await input.page.locator('textarea').first().fill(input.caseDef.prompt);

  const startResponsePromise = input.page.waitForResponse(
    (response) => response.url().includes('/v3/chat/run') && response.request().method() === 'POST',
    { timeout: 30_000 }
  );
  await input.page.getByRole('button', { name: /^开始生成$/u }).click();
  const startResponse = await startResponsePromise;
  const startPayload = (await startResponse.json()) as { runId: string };
  await fs.writeFile(startJsonPath, JSON.stringify(startPayload, null, 2), 'utf8');

  const finalPayload = await waitForFinal(input.apiUrl, input.token, startPayload.runId);
  await fs.writeFile(finalJsonPath, JSON.stringify(finalPayload, null, 2), 'utf8');
  const sourceBlocked =
    input.caseDef.sourceExpectation === 'ready_or_blocked' &&
    Boolean(finalPayload.result?.qualityGate?.sourceRequired) &&
    finalPayload.result?.qualityGate?.sourceStatus !== 'ready' &&
    (finalPayload.result?.qualityGate?.safeToDisplay === false || finalPayload.result?.qualityGate?.status === 'failed');
  const qualityBlocked =
    !sourceBlocked &&
    Boolean(input.caseDef.acceptQualityBlocked) &&
    (finalPayload.result?.qualityGate?.safeToDisplay === false || finalPayload.result?.qualityGate?.status === 'failed');

  await input.page.getByText('结果已生成').waitFor({ timeout: 360_000 });
  if (sourceBlocked) {
    await input.page.getByText('需要可靠来源，不能编造最新事实').waitFor({ timeout: 30_000 });
    await input.page.getByText('粘贴来源 URL 再生成').waitFor({ timeout: 30_000 });
  } else if (qualityBlocked) {
    await input.page.getByText('这版还没达到可发布标准').waitFor({ timeout: 30_000 });
    await input.page.getByText('回到输入框调整').waitFor({ timeout: 30_000 });
  } else {
    await input.page.getByText('查看依据与配图建议').click();
    await input.page.getByText('主视觉方向').waitFor({ timeout: 30_000 });
    await input.page.getByText(/已生成|生成失败/u).first().waitFor({ timeout: 240_000 });
  }
  if (input.caseDef.format !== 'article' && !sourceBlocked) {
    await input.page.getByText(/连接 X 后才能发布|加入待确认|进入发布队列/u).first().waitFor({ timeout: 30_000 });
  }

  const bodyText = await input.page.locator('body').innerText({ timeout: 30_000 });
  const caseConsoleEntries = input.consoleEntries.slice(consoleStart);
  const consoleErrors = pageConsoleErrors(caseConsoleEntries);
  await fs.writeFile(bodyPath, bodyText, 'utf8');
  await fs.writeFile(consolePath, JSON.stringify(caseConsoleEntries, null, 2), 'utf8');
  await input.page.screenshot({ path: screenshotPath, fullPage: true });
  const responsiveScreenshotPaths = sourceBlocked || qualityBlocked ? [] : await captureResponsiveScreenshots(input.page, caseDir);

  const summary = assertOrdinaryUserCaseEvidence({
    caseDef: input.caseDef,
    finalPayload,
    bodyText,
    consoleErrors,
    screenshotPath,
    responsiveScreenshotPaths,
    finalJsonPath
  });
  if (!sourceBlocked && !qualityBlocked) {
    summary.actionChecks = await verifyOrdinaryUserActions({
      apiUrl: input.apiUrl,
      token: input.token,
      page: input.page,
      caseDef: input.caseDef,
      finalPayload
    });
  }
  return summary;
}

async function main() {
  const repoRoot = repoRootFromScript();
  const stamp = createStamp();
  const apiUrl = process.env.API_URL?.trim() || 'http://127.0.0.1:4310';
  const webUrl = process.env.WEB_URL?.trim() || 'http://127.0.0.1:3200';
  const caseDefs = selectedOrdinaryUserCases();
  const evidenceNotes = buildOrdinaryUserEvidenceNotes(process.env, caseDefs.length);
  const outputPaths = buildOrdinaryUserBaoyuOutputPaths(repoRoot, stamp, process.env.OUT_DIR);
  const outDir = outputPaths.evidenceDir;
  await fs.mkdir(outDir, { recursive: true });

  const apiContext = await playwrightRequest.newContext({ baseURL: apiUrl, extraHTTPHeaders: { 'content-type': 'application/json' } });
  const session = await apiContext.post('/auth/local/session', { data: {} });
  if (!session.ok()) throw new Error(`local session failed ${session.status()} ${await session.text()}`);
  const { token } = await session.json();
  await apiContext.dispose();

  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== '0' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    permissions: ['clipboard-read', 'clipboard-write'],
    baseURL: webUrl
  });
  const page = await context.newPage();
  await page.addInitScript((tokenValue) => {
    window.localStorage.setItem('draftorbit_token', tokenValue);
  }, String(token));

  const consoleEntries: Array<{ type: string; text: string }> = [];
  page.on('console', (msg) => consoleEntries.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (error) => consoleEntries.push({ type: 'pageerror', text: error.message }));

  const summaries: EvidenceSummary[] = [];
  let routeSummaries: RouteAuditSummary[] = [];
  try {
    routeSummaries = await auditOrdinaryUserRoutes({ webUrl, outDir, page, consoleEntries });
    for (const caseDef of caseDefs) {
      console.log(`[ordinary-user-baoyu-sync] start ${caseDef.id}`);
      summaries.push(await runCase({ apiUrl, webUrl, token: String(token), outDir, page, consoleEntries, caseDef }));
      console.log(`[ordinary-user-baoyu-sync] pass ${caseDef.id}`);
    }
  } finally {
    await browser.close();
  }

  const baoyuCommit = getBaoyuCommit(repoRoot);
  const report = buildOrdinaryUserBaoyuSyncReport({
    stamp,
    apiUrl,
    webUrl,
    baoyuCommit,
    evidenceRoot: outDir,
    cases: summaries,
    routes: routeSummaries,
    evidenceNotes
  });
  await fs.mkdir(outputPaths.trackedReportDir, { recursive: true });
  await fs.writeFile(outputPaths.evidenceReportPath, report, 'utf8');
  await fs.writeFile(outputPaths.trackedReportPath, report, 'utf8');
  await fs.writeFile(
    outputPaths.summaryPath,
    JSON.stringify(
      { reportPath: outputPaths.evidenceReportPath, trackedReportPath: outputPaths.trackedReportPath, outDir, routes: routeSummaries, cases: summaries },
      null,
      2
    ),
    'utf8'
  );

  console.log(
    JSON.stringify(
      {
        outDir,
        reportPath: outputPaths.evidenceReportPath,
        trackedReportPath: outputPaths.trackedReportPath,
        passCount: summaries.filter((item) => item.pass).length,
        total: summaries.length
      },
      null,
      2
    )
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
