import { chromium, request as playwrightRequest, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type ContentFormat = 'tweet' | 'thread' | 'article';

export type OrdinaryUserBaoyuSyncCase = {
  id: string;
  format: ContentFormat;
  uiLabel: string;
  prompt: string;
  baoyuComparisonNote: string;
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
  notes: string[];
};

type VisualAssetLike = {
  id?: string;
  kind?: string;
  status?: string;
  renderer?: string;
  aspectRatio?: string;
  textLayer?: string;
  assetUrl?: string;
  promptPath?: string;
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
      model: String(result?.routing?.primaryModel ?? 'source-blocked'),
      routingTier: String(result?.routing?.routingTier ?? 'source-blocked'),
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

  if (input.caseDef.format !== 'article' && !input.bodyText.includes('连接 X 后才能发布')) {
    errors.push('未连接 X 发布拦截文案不可见');
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
  const readyAssets = visualAssets.filter((asset) => asset.status === 'ready' && asset.assetUrl);
  const failedAssets = visualAssets.filter((asset) => asset.status === 'failed');
  if (visualAssets.length === 0) errors.push('visualAssets 缺失');
  if (readyAssets.length === 0) errors.push('withImage=true 但没有 ready 图片 artifact');
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
  for (const asset of visualAssets) {
    if (!asset.status || !['ready', 'failed'].includes(asset.status)) errors.push(`visualAsset 状态未收口:${asset.id ?? 'unknown'}:${asset.status}`);
    if (/placeholder|mock/iu.test(String(asset.assetUrl ?? asset.error ?? ''))) {
      errors.push(`visualAsset 使用 placeholder/mock:${asset.id ?? asset.assetUrl ?? 'unknown'}`);
    }
    if (asset.status === 'ready' && !asset.promptPath) errors.push(`ready visualAsset 缺少 promptPath:${asset.id ?? asset.assetUrl ?? 'unknown'}`);
    if (asset.status === 'ready' && asset.renderer !== 'template-svg') errors.push(`ready visualAsset 未使用模板渲染:${asset.id ?? 'unknown'}:${asset.renderer ?? 'missing'}`);
    if (asset.status === 'ready' && asset.textLayer !== 'app-rendered') errors.push(`ready visualAsset textLayer 未由 app 渲染:${asset.id ?? 'unknown'}:${asset.textLayer ?? 'missing'}`);
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
}): string {
  const passCount = input.cases.filter((item) => item.pass).length;
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
    '- baoyu runtime comparison uses real runnable artifacts where available: source capture, markdown normalization, visual prompt files and baoyu-imagine image artifacts.',
    '- baoyu does not expose a direct tweet/thread/article writer CLI in this pinned runtime; writer quality is judged against the baoyu fixed/adversarial rubric without faking direct baoyu text output.',
    '- `draftorbit/heuristic`, `openrouter/free`, `ollama/*`, placeholder images and mock images invalidate test_high evidence.',
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

function getBaoyuCommit(repoRoot: string): string {
  const baoyuDir = process.env.BAOYU_SKILLS_DIR?.trim()
    ? path.resolve(process.env.BAOYU_SKILLS_DIR.trim())
    : path.join(repoRoot, 'vendor', 'baoyu-skills');
  try {
    return execFileSync('git', ['-C', baoyuDir, 'rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8'
    }).trim();
  } catch {
    return '31b2929d1cc0';
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
    await input.page.getByText('连接 X 后才能发布').waitFor({ timeout: 30_000 });
  }

  const bodyText = await input.page.locator('body').innerText({ timeout: 30_000 });
  const consoleErrors = input.consoleEntries.filter((entry) => entry.type === 'error' || entry.type === 'pageerror');
  await fs.writeFile(bodyPath, bodyText, 'utf8');
  await fs.writeFile(consolePath, JSON.stringify(input.consoleEntries, null, 2), 'utf8');
  await input.page.screenshot({ path: screenshotPath, fullPage: true });
  const responsiveScreenshotPaths = sourceBlocked || qualityBlocked ? [] : await captureResponsiveScreenshots(input.page, caseDir);

  return assertOrdinaryUserCaseEvidence({
    caseDef: input.caseDef,
    finalPayload,
    bodyText,
    consoleErrors,
    screenshotPath,
    responsiveScreenshotPaths,
    finalJsonPath
  });
}

async function main() {
  const repoRoot = repoRootFromScript();
  const stamp = createStamp();
  const apiUrl = process.env.API_URL?.trim() || 'http://127.0.0.1:4310';
  const webUrl = process.env.WEB_URL?.trim() || 'http://127.0.0.1:3200';
  const outDir = process.env.OUT_DIR
    ? path.resolve(process.env.OUT_DIR)
    : path.join(repoRoot, 'output', 'playwright', `ordinary-user-baoyu-sync-${stamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const apiContext = await playwrightRequest.newContext({ baseURL: apiUrl, extraHTTPHeaders: { 'content-type': 'application/json' } });
  const session = await apiContext.post('/auth/local/session', { data: {} });
  if (!session.ok()) throw new Error(`local session failed ${session.status()} ${await session.text()}`);
  const { token } = await session.json();
  await apiContext.dispose();

  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== '0' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await page.addInitScript((tokenValue) => {
    window.localStorage.setItem('draftorbit_token', tokenValue);
  }, String(token));

  const consoleEntries: Array<{ type: string; text: string }> = [];
  page.on('console', (msg) => consoleEntries.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', (error) => consoleEntries.push({ type: 'pageerror', text: error.message }));

  const summaries: EvidenceSummary[] = [];
  try {
    for (const caseDef of selectedOrdinaryUserCases()) {
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
    cases: summaries
  });
  const reportPath = path.join(outDir, 'BAOYU-ORDINARY-USER-SYNC.md');
  const summaryPath = path.join(outDir, 'summary.json');
  await fs.writeFile(reportPath, report, 'utf8');
  await fs.writeFile(summaryPath, JSON.stringify({ reportPath, outDir, cases: summaries }, null, 2), 'utf8');

  console.log(JSON.stringify({ outDir, reportPath, passCount: summaries.filter((item) => item.pass).length, total: summaries.length }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
