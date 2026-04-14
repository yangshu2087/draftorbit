import {
  detectContentAntiPatterns,
  isPromptWrapperInstruction,
  type ContentFormat,
  type QualitySignalReport
} from './content-strategy';
import type { VisualPlan } from './visual-planning.service';
import type { BaoyuVisualAsset } from './baoyu-runtime.service';

export type ContentQualityGateStatus = 'passed' | 'failed';
export type ContentQualityGateSourceStatus = 'ready' | 'failed' | 'ambiguous' | 'not_configured';

export type ContentQualityGateResult = {
  status: ContentQualityGateStatus;
  safeToDisplay: boolean;
  hardFails: string[];
  visualHardFails?: string[];
  sourceRequired?: boolean;
  sourceStatus?: ContentQualityGateSourceStatus;
  userMessage?: string;
  recoveryAction?: 'retry' | 'add_source' | 'narrow_topic';
  judgeNotes: string[];
};

function hasPromptWrapperCue(text = ''): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return Boolean(normalized) && isPromptWrapperInstruction(normalized);
}

function hasVisualPromptLeakage(visualPlan?: VisualPlan | null): boolean {
  if (!visualPlan) return false;
  const cues = [
    ...visualPlan.visualizablePoints,
    ...visualPlan.keywords,
    ...visualPlan.items.flatMap((item) => [item.cue, item.reason])
  ];
  return cues.some((cue) => hasPromptWrapperCue(cue));
}

function hasMalformedVisualCue(visualPlan?: VisualPlan | null): boolean {
  if (!visualPlan) return false;
  const cues = [
    ...visualPlan.visualizablePoints,
    ...visualPlan.keywords,
    ...visualPlan.items.flatMap((item) => [item.cue, item.reason])
  ];
  return cues.some((cue) => /(?:^|\n)\s*\*{1,3}\s*(?:\n|$)|\*{2}|###|\bbef\b|(?:^|\s)\d+\/\d+\s+/u.test(cue ?? ''));
}

function hasTweetScene(text: string): boolean {
  return /(比如|例如|周一|周三|第一条|第一屏|首页|用户|访客|上传|录音|会议纪要|贴一段|改成|before\/after|反例)/iu.test(text);
}

function hasArticleEmptySection(text: string): boolean {
  const sections = text
    .split(/(?=^[一二三四五六七八九十]、)/gmu)
    .map((block) => block.trim())
    .filter((block) => /^[一二三四五六七八九十]、/u.test(block));
  for (const section of sections) {
    const body = section
      .split(/\n+/u)
      .slice(1)
      .join('\n')
      .trim();
    if (
      ![...body].length ||
      !/(比如|例如|反例|坏例子|具体|动作|问题|before\/after|用户|读者|团队|首页|第一条|改成|删掉|上传|录音|会议|周报|反馈|客户|之前|之后|以前|现在|省了哪一步)/iu.test(body)
    ) {
      return true;
    }
  }
  return false;
}

function countArticleSections(text: string): number {
  return text
    .split(/(?=^[一二三四五六七八九十]、)/gmu)
    .map((block) => block.trim())
    .filter((block) => /^[一二三四五六七八九十]、/u.test(block)).length;
}

function countThreadPosts(text: string): number {
  const numberedPosts = text.match(/(?:^|\n)\d+\/\d+(?=\n)/gu)?.length ?? 0;
  if (numberedPosts > 0) return numberedPosts;
  return text.split(/\n{2,}/u).map((block) => block.trim()).filter(Boolean).length;
}

function normalizeRepeatKey(text: string): string {
  return text.replace(/[。！？!?，,；;：:\s"“”‘’]/gu, '').trim();
}

function hasRepeatedArticleHeadingBody(text: string): boolean {
  const sections = text
    .split(/(?=^[一二三四五六七八九十]+[、.])/gmu)
    .map((block) => block.trim())
    .filter((block) => /^[一二三四五六七八九十]+[、.]/u.test(block));

  for (const section of sections) {
    const [heading = '', ...bodyLines] = section.split(/\n+/u).map((line) => line.trim()).filter(Boolean);
    const headingKey = heading
      .replace(/^\s*[一二三四五六七八九十]+[、.]\s*/u, '')
      .replace(/[*#_`>\s"'“”‘’。！？!?，,；;：:、.-]/gu, '')
      .trim();
    const bodyKey = bodyLines
      .join(' ')
      .replace(/[*#_`>\s"'“”‘’。！？!?，,；;：:、.-]/gu, '')
      .trim();
    if (headingKey.length >= 10 && bodyKey.startsWith(headingKey)) return true;
  }

  return false;
}

function hasMalformedArticleMarkdown(text: string): boolean {
  return (
    /(?:^|\n)\s*\*{1,3}\s*(?:\n|$)/u.test(text) ||
    /(?:^|\n)[一二三四五六七八九十]+[、.][^\n]{1,80}\*{2}\s*(?:\n|$)/u.test(text) ||
    /(?:^|\n)[一二三四五六七八九十]+[、.][^\n]*\bbef\s*(?:\n|$)/u.test(text) ||
    (/\*{2}|\bbef\b/u.test(text) && hasRepeatedArticleHeadingBody(text))
  );
}

function hasSourceMetadataLeakage(text: string): boolean {
  return /(?:^|[\s。！？；;：:])(?:requestedUrl|coverImage|adapter|capturedAt|conversionMethod|kind|language|summary|url):\s*["']?/iu.test(
    text
  );
}

function hasRepeatedThreadCards(text: string): boolean {
  const posts = text
    .split(/(?=(?:^|\n)\d+\/\d+\n)/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => block.replace(/^\d+\/\d+\s*/u, '').trim());
  const seenLines = new Set<string>();
  for (const post of posts) {
    const lines = post
      .split(/\n+/u)
      .map(normalizeRepeatKey)
      .filter((line) => line.length >= 12);
    for (const line of lines) {
      if (seenLines.has(line)) return true;
      seenLines.add(line);
    }
  }
  return false;
}

function hasRepeatedThreadHype(text: string): boolean {
  const posts = text
    .split(/(?=(?:^|\n)\d+\/\d+\n)/u)
    .map((block) => block.trim())
    .filter(Boolean);
  if (posts.length < 2) return false;

  const hypePatterns = [
    /我见过最狠的团队/u,
    /死循环彻底干掉/u,
    /效率直接起飞/u,
    /值得你继续往下看/u
  ];
  const hypeHits = hypePatterns.reduce((sum, rule) => sum + posts.filter((post) => rule.test(post)).length, 0);
  if (hypeHits >= 2) return true;

  const normalizedPosts = posts.map((post) => normalizeRepeatKey(post.replace(/^\d+\/\d+\s*/u, '')));
  for (let index = 0; index < normalizedPosts.length - 1; index += 1) {
    const current = normalizedPosts[index] ?? '';
    const next = normalizedPosts[index + 1] ?? '';
    const prefix = current.slice(0, 32);
    if (prefix.length >= 24 && next.startsWith(prefix)) return true;
  }
  return false;
}

function hasStrayThreadQuote(text: string): boolean {
  return text
    .split(/(?=(?:^|\n)\d+\/\d+\n)/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .some((block) => /^3\/\d+\s*[”"'](?:\s|\n)/u.test(block) || /(?:^|\n)[”"']\s*(?:\n|$)/u.test(block));
}

function hasThreadMarkdownArtifact(text: string): boolean {
  return /(?:^|\n)\s*\*{1,3}\s*\d+\/\d+\s*\*{1,3}\s*(?:\n|$)/u.test(text);
}

function hasThreadAdviceTemplate(text: string): boolean {
  return /(?:^|\n)\d+\/\d+\s*\n\s*更有效的写法是[：:]/u.test(text);
}

function getThreadPosts(text: string): string[] {
  return text
    .split(/(?=(?:^|\n)\d+\/\d+\n)/u)
    .map((block) => block.trim())
    .filter(Boolean);
}

function hasThirdPostWithoutAction(text: string): boolean {
  const posts = getThreadPosts(text);
  const third = posts[2]?.replace(/^\d+\/\d+\s*/u, '').trim() ?? '';
  if (!third) return false;
  if (/第\s*3\s*条|第三条/u.test(third)) return true;
  if (/^更有效的写法是[：:]/u.test(third)) return true;
  if (/[？?]\s*$/u.test(third)) return true;
  if (/^如果/u.test(third) && /(你会|你现在最想|哪一个|哪个|哪一步)/u.test(third)) return true;
  return !/(我会|先|改成|删掉|保留|补|换成|把|直接|只讲|动作|使用场景|固定|上传|录音|跟进清单|周会前)/u.test(third);
}

function detectVisualAssetHardFails(input: {
  format: ContentFormat;
  visualAssets?: BaoyuVisualAsset[] | null;
  requireVisualAssets?: boolean;
}): string[] {
  const assets = input.visualAssets ?? [];
  if (!input.requireVisualAssets && assets.length === 0) return [];

  const hardFails = new Set<string>();
  const readyAssets = assets.filter((asset) => asset.status === 'ready');
  const readyCards = readyAssets.filter((asset) => asset.kind === 'cards');
  const readyCover = readyAssets.some((asset) => asset.kind === 'cover');
  const readySummary = readyAssets.some((asset) => asset.kind === 'infographic' || asset.kind === 'illustration');

  if (input.requireVisualAssets && readyAssets.length === 0) hardFails.add('visual_asset_missing');
  if (input.format === 'thread' && input.requireVisualAssets && readyCards.length < 1) hardFails.add('thread_visual_cards_missing');
  if (input.format === 'article' && input.requireVisualAssets && (!readyCover || !readySummary)) hardFails.add('article_visual_summary_missing');

  for (const asset of readyAssets) {
    const joined = [asset.assetUrl, asset.assetPath, asset.providerArtifactPath, asset.promptPath].filter(Boolean).join(' ');
    if (/placeholder|mock/iu.test(joined)) hardFails.add('visual_asset_placeholder');
    if (asset.cue && hasPromptWrapperCue(asset.cue)) hardFails.add('visual_asset_prompt_leakage');
    if (asset.renderer === 'provider-image' && asset.textLayer !== 'none') hardFails.add('visual_asset_text_layer_mismatch');
    if (asset.renderer === 'template-svg' && asset.textLayer !== 'app-rendered') hardFails.add('visual_asset_text_layer_mismatch');
  }

  return [...hardFails];
}

export function buildContentQualityGate(input: {
  format: ContentFormat;
  focus?: string | null;
  text: string;
  qualitySignals?: QualitySignalReport | null;
  visualPlan?: VisualPlan | null;
  visualAssets?: BaoyuVisualAsset[] | null;
  requireVisualAssets?: boolean;
  sourceRequired?: boolean;
  sourceStatus?: ContentQualityGateSourceStatus;
  sourceHardFails?: string[];
}): ContentQualityGateResult {
  const text = input.text.trim();
  const hardFails = new Set<string>();
  const visualHardFails = detectVisualAssetHardFails(input);
  const judgeNotes: string[] = [];

  for (const flag of detectContentAntiPatterns(text, input.focus ?? '')) {
    hardFails.add(flag);
  }

  if (!text) hardFails.add('empty_result');
  if (hasVisualPromptLeakage(input.visualPlan)) hardFails.add('visual_prompt_leakage');
  if (hasMalformedVisualCue(input.visualPlan)) hardFails.add('visual_malformed_cue');
  if (input.sourceRequired && input.sourceStatus && input.sourceStatus !== 'ready') {
    for (const flag of input.sourceHardFails?.length ? input.sourceHardFails : [`source_${input.sourceStatus}`]) {
      hardFails.add(flag);
    }
  }

  if (input.format === 'tweet') {
    if (!hasTweetScene(text)) hardFails.add('missing_scene');
    if (/欢迎交流|欢迎留言讨论|评论区见|你怎么看[？?]?$/u.test(text)) hardFails.add('empty_close');
  }

  if (input.format === 'thread') {
    if (countThreadPosts(text) < 4 || countThreadPosts(text) > 6) {
      hardFails.add('thread_not_split');
    }
    if (hasRepeatedThreadCards(text)) {
      hardFails.add('thread_repeated_cards');
    }
    if (hasRepeatedThreadHype(text)) {
      hardFails.add('thread_hype_repeated');
    }
    if (hasStrayThreadQuote(text)) {
      hardFails.add('thread_stray_quote');
    }
    if (hasThreadMarkdownArtifact(text)) {
      hardFails.add('thread_markdown_artifact');
    }
    if (hasThreadAdviceTemplate(text)) {
      hardFails.add('thread_advice_template');
    }
    if (hasThirdPostWithoutAction(text)) {
      hardFails.add('thread_third_post_not_action');
    }
  }

  if (input.format === 'article' && hasArticleEmptySection(text)) {
    hardFails.add('article_empty_section');
  }
  if (input.format === 'article' && hasMalformedArticleMarkdown(text)) {
    hardFails.add('article_malformed_markdown');
  }
  if (input.format === 'article' && hasSourceMetadataLeakage(text)) {
    hardFails.add('source_metadata_leakage');
  }
  if (input.format === 'article' && countArticleSections(text) < 3) {
    hardFails.add('article_too_few_sections');
  }
  if (
    input.format === 'article' &&
    /(赛道、定位、功能和愿景|把表达动作排成稳定节奏|^---$|###|欢迎直接评论|核心展开|这条来源可以写|第一屏必须先把事实放稳|放进文章时|先把来源里的具体事实放到第一屏|读完以后，你最想先改哪一步)/mu.test(
      text
    )
  ) {
    hardFails.add('article_generic_scaffold');
  }

  if ((input.qualitySignals?.antiPatternPenalty ?? 0) >= 45) {
    hardFails.add('quality_signal_hard_fail');
  }

  if (hardFails.has('prompt_leakage')) {
    judgeNotes.push('正文仍包含用户包装指令或原 prompt 复述。');
  }
  if (hardFails.has('generic_scene_leakage') || hardFails.has('missing_scene')) {
    judgeNotes.push('支撑句没有落到真实场景，不能作为最终成品展示。');
  }
  if (hardFails.has('visual_prompt_leakage')) {
    judgeNotes.push('图文规划 cue 仍在复读 prompt，而不是锚定最终成稿。');
  }
  if (hardFails.has('article_malformed_markdown') || hardFails.has('visual_malformed_cue')) {
    judgeNotes.push('正文或图文 cue 仍带 markdown 残片/截断标题，不能作为最终图文产物。');
  }
  if (hardFails.has('source_metadata_leakage')) {
    judgeNotes.push('正文把来源抓取元数据当成事实写出去了，必须改用正文段落里的真实事实。');
  }
  if (visualHardFails.length > 0) {
    judgeNotes.push('视觉资产没有达到可发布标准，不能用 mock、placeholder 或 prompt 包装词冒充完整图文 evidence。');
  }
  if (input.sourceRequired && input.sourceStatus && input.sourceStatus !== 'ready') {
    judgeNotes.push('这类最新事实必须先抓到可靠来源；当前来源不可用或有歧义，不能编造最新事实。');
  }
  if (hardFails.has('thread_stray_quote')) {
    judgeNotes.push('thread 条目仍带孤立引号，说明模型输出残片没有被清理。');
  }
  if (hardFails.has('thread_markdown_artifact')) {
    judgeNotes.push('thread 条目仍带 markdown 序号残片，说明模型输出残片没有被清理。');
  }
  if (hardFails.has('thread_third_post_not_action')) {
    judgeNotes.push('thread 第 3 条没有承担动作/拆解职责，退化成了另一个结尾问题。');
  }

  const hardFailList = [...hardFails];
  const sourceBlocked = Boolean(input.sourceRequired && input.sourceStatus && input.sourceStatus !== 'ready');
  const userMessage = sourceBlocked
    ? '这类最新事实必须先抓到可靠来源；当前来源不可用或有歧义，不能编造最新事实。'
    : hardFails.has('article_generic_scaffold')
      ? '内容还像大纲或写作过程，已拦截。'
      : hardFails.has('source_metadata_leakage')
        ? '来源元数据泄漏到正文，已拦截。'
        : hardFails.has('visual_asset_missing') || visualHardFails.length > 0
          ? '图片资产未完成或未达标，已拦截。'
          : hardFailList.length > 0
            ? '这版还没达到可发布标准，已拦截。'
            : undefined;
  const recoveryAction: ContentQualityGateResult['recoveryAction'] = sourceBlocked
    ? 'add_source'
    : hardFails.has('article_generic_scaffold') || hardFails.has('article_too_few_sections') || hardFails.has('article_empty_section')
      ? 'retry'
      : hardFailList.length > 0
        ? 'narrow_topic'
        : undefined;

  return {
    status: hardFailList.length > 0 ? 'failed' : 'passed',
    safeToDisplay: hardFailList.length === 0,
    hardFails: hardFailList,
    visualHardFails,
    sourceRequired: input.sourceRequired,
    sourceStatus: input.sourceStatus,
    userMessage,
    recoveryAction,
    judgeNotes
  };
}
