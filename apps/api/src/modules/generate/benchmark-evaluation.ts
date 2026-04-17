import { detectContentAntiPatterns, type ContentFormat, type QualitySignalReport } from './content-strategy';

export type BenchmarkCase = {
  id: string;
  format: ContentFormat;
  prompt: string;
  baoyuBaselineNotes: string[];
  expectedStrengths: string[];
  knownAntiPatterns: string[];
};

export type BenchmarkRubric = {
  hookStrength: number;
  specificity: number;
  evidenceSceneDensity: number;
  humanLikeness: number;
  conversationalFlow: number;
  structureFitness: number;
  visualizability: number;
  closeNaturalness: number;
};

export type BenchmarkEvaluation = {
  pass: boolean;
  evidenceValid: boolean;
  rubric: BenchmarkRubric;
  average: number;
  hardFails: string[];
  antiPatternFlags: string[];
  gaps: string[];
  threadPostCount: number;
  articleSectionCount: number;
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function countThreadPosts(text: string): number {
  const lines = text.match(/(?:^|\n)\d+\/\d+(?=\n)/gu) ?? [];
  return lines.length;
}

function splitThreadPosts(text: string): string[] {
  return text
    .split(/(?=(?:^|\n)\d+\/\d+\n)/u)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => block.replace(/^\d+\/\d+\s*/u, '').trim());
}

function normalizeRepeatKey(text: string): string {
  return text
    .replace(/[。！？!?，,；;：:\s"“”‘’]/gu, '')
    .trim();
}

function countArticleSections(text: string): number {
  return (text.match(/(?:^|\n)[一二三四五六七八九十]、/gu) ?? []).length;
}

function hasSceneSignal(text: string): boolean {
  return /(比如|例如|最常见的场景|真实场景|一次|首页|第一条|第一屏|团队|用户|访客|before\/after|反例|滑走|点击率|贴一段|上传|录音|会议|周报|会议纪要|客户吐槽|功能表|省了哪一步|以前|现在|之前|之后|改成)/u.test(text);
}

function hasHumanSignal(text: string): boolean {
  return /(我会|我见过|我们|你|别先|直接写|如果现在|之前|之后|以前|现在|后来|先删|只留)/u.test(text);
}

function hasDirectJudgment(text: string): boolean {
  const firstSentence = splitParagraphs(text)[0]?.split(/[。！？!?]/u)[0] ?? text;
  return /(不是|别再|最容易|通常不是|先讲|先只讲|别先)/u.test(firstSentence);
}

function hasWeakClose(text: string): boolean {
  return /(欢迎交流|欢迎留言讨论|评论区见|你怎么看)[。！？?]*$/u.test(text.trim());
}

function articleRepeatsTitle(text: string): boolean {
  const blocks = splitParagraphs(text);
  const title = blocks[0] ?? '';
  const firstSection = blocks.find((block) => /^[一二三四五六七八九十]、/u.test(block)) ?? '';
  if (!title || !firstSection) return false;
  const normalizedTitle = title.replace(/[：:].*$/u, '').trim();
  return normalizedTitle.length >= 4 && firstSection.includes(normalizedTitle);
}

function hasRepeatedThreadCards(text: string): boolean {
  const posts = splitThreadPosts(text);
  const postKeys = posts.map(normalizeRepeatKey).filter((item) => item.length >= 16);
  if (new Set(postKeys).size < postKeys.length) return true;

  const seenLines = new Set<string>();
  for (const post of posts) {
    const lines = post
      .split(/\n+/u)
      .map(normalizeRepeatKey)
      .filter((item) => item.length >= 12);
    for (const line of lines) {
      if (seenLines.has(line)) return true;
      seenLines.add(line);
    }
  }
  return false;
}

function hasRepeatedTweetSupport(text: string): boolean {
  const chunks = text
    .split(/[，,。！？!?；;]/u)
    .map(normalizeRepeatKey)
    .filter((item) => item.length >= 10 && !/^(如果|你最近|你现在|读完以后)/u.test(item));
  const seen = new Set<string>();
  for (const chunk of chunks) {
    if (seen.has(chunk)) return true;
    seen.add(chunk);
  }
  return /用户一眼就知道这次更新省了哪一步.*用户一眼就知道这次更新省了哪一步/u.test(text);
}

function hasGenericArticleScaffold(benchmarkCase: BenchmarkCase, text: string): boolean {
  if (benchmarkCase.format !== 'article') return false;
  if (benchmarkCase.id === 'article-ai-cold-start') return false;
  return (
    /赛道、定位、功能和愿景/u.test(text) &&
    /把表达动作排成稳定节奏，比等灵感更有效/u.test(text)
  );
}

function buildStructureFitness(format: ContentFormat, text: string): { score: number; hardFails: string[]; threadPostCount: number; articleSectionCount: number } {
  const hardFails: string[] = [];
  const threadPostCount = countThreadPosts(text);
  const articleSectionCount = countArticleSections(text);

  if (format === 'thread') {
    if (threadPostCount < 4 || threadPostCount > 6) {
      hardFails.push('thread 没有稳定拆成 4-6 条');
      return { score: 22, hardFails, threadPostCount, articleSectionCount };
    }
    if (hasRepeatedThreadCards(text)) {
      hardFails.push('thread 条目职责重复');
    }
    return { score: 88, hardFails, threadPostCount, articleSectionCount };
  }

  if (format === 'article') {
    if (articleSectionCount < 3) {
      hardFails.push('article 小节少于 3 节');
    }
    if (articleRepeatsTitle(text)) {
      hardFails.push('article 标题或首节重复');
    }
    return {
      score: hardFails.length > 0 ? 34 : 86,
      hardFails,
      threadPostCount,
      articleSectionCount
    };
  }

  const length = [...text].length;
  const score = length >= 90 && length <= 220 ? 84 : length <= 260 ? 70 : 42;
  return { score, hardFails, threadPostCount, articleSectionCount };
}

function expectedStrengthGap(strength: string, text: string, qs: QualitySignalReport): string | null {
  if (/场景|例子|反例/u.test(strength) && !hasSceneSignal(text)) {
    return `缺少与“${strength}”对应的具体场景/例子`;
  }
  if (/hook|判断/u.test(strength) && qs.hookStrength < 70) {
    return `开头仍没达到“${strength}”的强度`;
  }
  if (/自然 close|问题自然|close/u.test(strength) && (qs.ctaNaturalness < 70 || hasWeakClose(text))) {
    return `结尾还没达到“${strength}”`;
  }
  if (/visualizable|可视化|适合 cover|适合 single-card|适合 infographic|适合 cover\+cards|适合 cover\+illustrations/u.test(strength) && qs.visualizability < 70) {
    return `可视化锚点还没达到“${strength}”`;
  }
  if (/像人写|像真人/u.test(strength) && qs.humanLikeness < 72) {
    return `人话感还没达到“${strength}”`;
  }
  return null;
}

export function evaluateBenchmarkCase(input: {
  benchmarkCase: BenchmarkCase;
  text: string;
  qualitySignals: QualitySignalReport;
  routing?: {
    primaryModel?: string | null;
    routingTier?: string | null;
  } | null;
  requireRealModel?: boolean;
}): BenchmarkEvaluation {
  const text = input.text.trim();
  const antiPatternFlags = detectContentAntiPatterns(text);
  const structure = buildStructureFitness(input.benchmarkCase.format, text);
  const sceneDensity = hasSceneSignal(text) ? Math.max(input.qualitySignals.evidence, 80) : input.qualitySignals.evidence;
  const humanMinimum = hasHumanSignal(text) ? 78 : input.qualitySignals.humanLikeness;
  const conversationMinimum = hasHumanSignal(text) && /[？?]$/.test(text) ? 78 : input.qualitySignals.conversationality;
  const visualMinimum = hasSceneSignal(text) ? 80 : input.qualitySignals.visualizability;
  const closeMinimum = /[？?]$/.test(text) && !hasWeakClose(text) ? 82 : input.qualitySignals.ctaNaturalness;

  const rubric: BenchmarkRubric = {
    hookStrength: clampScore(hasDirectJudgment(text) ? Math.max(input.qualitySignals.hookStrength, 82) : input.qualitySignals.hookStrength),
    specificity: clampScore(hasSceneSignal(text) ? Math.max(input.qualitySignals.specificity, 78) : input.qualitySignals.specificity),
    evidenceSceneDensity: clampScore(sceneDensity),
    humanLikeness: clampScore(humanMinimum),
    conversationalFlow: clampScore(conversationMinimum),
    structureFitness: clampScore(structure.score),
    visualizability: clampScore(visualMinimum),
    closeNaturalness: clampScore(closeMinimum)
  };

  const hardFails = [...structure.hardFails];
  if (input.benchmarkCase.format === 'tweet') {
    if (!hasSceneSignal(text)) hardFails.push('tweet 缺少具体场景或例子');
    if (hasWeakClose(text)) hardFails.push('tweet 以模板式收尾');
    if (hasRepeatedTweetSupport(text)) hardFails.push('tweet support line 重复');
  }

  if (hasGenericArticleScaffold(input.benchmarkCase, text)) {
    hardFails.push('article 使用了通用冷启动脚手架');
  }

  const routingTier = String(input.routing?.routingTier ?? '');
  const primaryModel = String(input.routing?.primaryModel ?? '');
  const evidenceValid =
    input.requireRealModel !== true ||
    (!/draftorbit\/heuristic|openrouter\/free|mock\/|^ollama\//iu.test(primaryModel) && !/^free_first$/iu.test(routingTier));
  if (!evidenceValid) {
    hardFails.push('real-model evidence 使用了 heuristic/free_first 路径');
  }

  const gaps = [
    ...input.benchmarkCase.expectedStrengths
      .map((strength) => expectedStrengthGap(strength, text, input.qualitySignals))
      .filter((item): item is string => Boolean(item)),
    ...input.benchmarkCase.knownAntiPatterns
      .filter((pattern) => {
        if (/下面我拆 3 点/u.test(pattern)) return /下面我(只)?拆/u.test(text);
        if (/条目职责重复/u.test(pattern)) return input.benchmarkCase.format === 'thread' && structure.threadPostCount < 4;
        if (/方法论标题/u.test(pattern)) return input.benchmarkCase.format === 'article' && /(先把|再让|讲清楚|节奏|动作)/u.test(text.split('\n')[0] ?? '');
        if (/章节无例子|没有坏例子|没有真实决策场景/u.test(pattern)) return !hasSceneSignal(text);
        if (/欢迎交流|欢迎留言讨论/u.test(pattern)) return hasWeakClose(text);
        return false;
      })
      .map((pattern) => `命中已知反模式：${pattern}`)
  ].filter((item, index, all) => all.indexOf(item) === index);

  const average = clampScore(
    Object.values(rubric).reduce((sum, value) => sum + value, 0) / Object.values(rubric).length
  );
  const passThreshold = input.requireRealModel === true ? 80 : 72;

  return {
    pass: evidenceValid && hardFails.length === 0 && average >= passThreshold,
    evidenceValid,
    rubric,
    average,
    hardFails,
    antiPatternFlags,
    gaps,
    threadPostCount: structure.threadPostCount,
    articleSectionCount: structure.articleSectionCount
  };
}
