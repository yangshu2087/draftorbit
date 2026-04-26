import { Injectable } from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BaoyuRuntimeService, type BaoyuSkillName } from './baoyu-runtime.service';

export type SourceArtifactKind = 'url' | 'x' | 'youtube' | 'search';

export type SourceArtifact = {
  kind: SourceArtifactKind;
  url?: string;
  title?: string;
  markdownPath: string;
  capturedAt: string;
  status: 'ready' | 'failed' | 'skipped';
  evidenceUrl?: string;
  error?: string;
};

export type SourceCaptureStatus = 'ready' | 'failed' | 'ambiguous' | 'not_configured';

export type SourceSearchResult = {
  title: string;
  url: string;
  content?: string;
  rawContent?: string | null;
  score?: number;
  favicon?: string;
};

export type SourceSearchProvider = {
  search(input: { query: string; maxResults: number }): Promise<SourceSearchResult[]>;
};

export type SourceCaptureAnalysis = {
  urls: string[];
  requiresFreshSource: boolean;
  freshnessSignals: string[];
  hardFails: string[];
};

export type SourceCaptureResult = {
  artifacts: SourceArtifact[];
  sourceContext: string;
  hardFails: string[];
  sourceRequired: boolean;
  sourceStatus: SourceCaptureStatus;
  searchResults?: SourceSearchResult[];
};

type SourceCaptureOptions = {
  runtime?: BaoyuRuntimeService;
  searchProvider?: SourceSearchProvider | null;
  maxSearchResults?: number;
};

const URL_PATTERN = /https?:\/\/[^\s"'，。！？）)]+/giu;
const FRESHNESS_PATTERNS = [
  /(?:最新|今天|刚刚|实时|近期|昨天|昨日|\blatest\b|\bcurrent\b|\bbreaking\b|\btoday\b|\byesterday\b)/iu,
  /(?:(?:刚|新|已|正式).{0,6}(?:发布|上线|推出)|发布了|上线了|推出了|发布会|产品发布|\breleased\b|\blaunched\b)/iu,
  /(?:最新|今天|刚刚|实时|近期|昨天|昨日|\blatest\b|\bcurrent\b).{0,16}(?:更新|changelog|版本|version|release|价格|模型|model|发布|上线|推出)/iu,
  /新闻/u,
  /(?:价格(?:调整|上涨|下调|变化|变动)|涨价|降价)/u,
  /融资/u,
  /(?:最新|今天|刚刚).{0,12}changelog/iu
];

function sanitizeUrl(raw: string): string {
  return raw.replace(/[),.。！？]+$/u, '');
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/^https?:\/\//iu, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48) || 'source';
}

function normalizeSearchProviderName(): 'tavily' | 'none' {
  const raw = process.env.DRAFTORBIT_SEARCH_PROVIDER?.trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'off' || raw === 'false' || raw === '0') return 'none';
  return raw === 'tavily' ? 'tavily' : 'none';
}

function defaultMaxSearchResults(): number {
  const parsed = Number(process.env.DRAFTORBIT_SEARCH_MAX_RESULTS ?? 3);
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(10, Math.max(1, Math.floor(parsed)));
}

function isUsableSearchResult(result: SourceSearchResult): boolean {
  if (!result.title?.trim() || !result.url?.trim()) return false;
  if (!/^https?:\/\//iu.test(result.url)) return false;
  return !/(?:^https?:\/\/(?:www\.)?(?:google|bing|baidu|duckduckgo)\.[^/]+\/search\b|\/search\?|[?&]q=|adservice|doubleclick|utm_ad)/iu.test(
    result.url
  );
}

function hermesIntentHasQualifier(intent: string): boolean {
  return /(nous|llm|ai|人工智能|模型|model|huggingface|ollama|奢侈|爱马仕|品牌|包|birkin|kelly|fashion|luxury|香水|丝巾|github|npm|软件|项目)/iu.test(
    intent
  );
}

function categorizeHermesResult(result: SourceSearchResult): 'ai' | 'luxury' | 'software' | 'generic' {
  const haystack = [result.title, result.url, result.content, result.rawContent].filter(Boolean).join(' ').toLowerCase();
  if (/(nous|huggingface|llm|language model|model checkpoint|ollama|hermes[-\s]?\d|ai model|benchmark|模型|人工智能)/iu.test(haystack)) {
    return 'ai';
  }
  if (/(herm[eè]s\.com|birkin|kelly|luxury|fashion|bag|scarf|perfume|爱马仕|奢侈|包|丝巾|香水)/iu.test(haystack)) {
    return 'luxury';
  }
  if (/(github|npm|docs|api|protocol|sdk|software|repository|项目|软件)/iu.test(haystack)) {
    return 'software';
  }
  return 'generic';
}

function hasAmbiguousHermesResults(intent: string, results: SourceSearchResult[]): boolean {
  if (!/(?:\bherm[eè]s\b|爱马仕)/iu.test(intent)) return false;
  if (hermesIntentHasQualifier(intent)) return false;
  const categories = new Set(results.map(categorizeHermesResult).filter((category) => category !== 'generic'));
  return categories.size >= 2;
}

function createDefaultSearchProvider(): SourceSearchProvider | null {
  if (normalizeSearchProviderName() !== 'tavily') return null;
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return null;
  return new TavilySearchProvider({ apiKey });
}

export class TavilySearchProvider implements SourceSearchProvider {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { apiKey: string; endpoint?: string; fetchImpl?: typeof fetch }) {
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? 'https://api.tavily.com/search';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async search(input: { query: string; maxResults: number }): Promise<SourceSearchResult[]> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        query: input.query,
        max_results: input.maxResults,
        search_depth: 'basic',
        topic: 'general',
        include_answer: false,
        include_images: false,
        include_favicon: true
      })
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`tavily_search_failed:${response.status}:${bodyText.slice(0, 500)}`);
    }

    const payload = JSON.parse(bodyText || '{}') as {
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        raw_content?: string | null;
        score?: number;
        favicon?: string;
      }>;
    };
    return (payload.results ?? [])
      .map((result) => ({
        title: result.title?.trim() ?? '',
        url: result.url?.trim() ?? '',
        content: result.content,
        rawContent: result.raw_content,
        score: result.score,
        favicon: result.favicon
      }))
      .filter(isUsableSearchResult);
  }
}

@Injectable()
export class SourceCaptureService {
  private readonly runtime: BaoyuRuntimeService;
  private readonly searchProvider: SourceSearchProvider | null;
  private readonly maxSearchResults: number;

  constructor(options: SourceCaptureOptions = {}) {
    this.runtime = options.runtime ?? new BaoyuRuntimeService();
    this.searchProvider = options.searchProvider === undefined ? createDefaultSearchProvider() : options.searchProvider;
    this.maxSearchResults = options.maxSearchResults ?? defaultMaxSearchResults();
  }

  analyzeIntent(intent: string): SourceCaptureAnalysis {
    const urls = [...intent.matchAll(URL_PATTERN)].map((match) => sanitizeUrl(match[0])).filter(Boolean);
    const freshnessSignals = FRESHNESS_PATTERNS.filter((rule) => rule.test(intent)).map((rule) => String(rule));
    const requiresFreshSource = urls.length > 0 || freshnessSignals.length > 0;
    const hardFails = requiresFreshSource && urls.length === 0 && !this.searchProvider ? ['source_not_configured'] : [];
    return { urls, requiresFreshSource, freshnessSignals, hardFails };
  }

  selectSkillForUrl(url: string): { skill: BaoyuSkillName; kind: SourceArtifactKind } {
    if (/youtu\.be|youtube\.com/iu.test(url)) return { skill: 'baoyu-youtube-transcript', kind: 'youtube' };
    if (/twitter\.com|x\.com/iu.test(url) && /\/status\/|\/i\/article\//iu.test(url)) {
      return { skill: 'baoyu-danger-x-to-markdown', kind: 'x' };
    }
    return { skill: 'baoyu-url-to-markdown', kind: 'url' };
  }

  buildCaptureArgs(input: { skill: BaoyuSkillName; url: string; outputPath: string }): string[] {
    switch (input.skill) {
      case 'baoyu-youtube-transcript':
        return [input.url, '--languages', 'zh,en', '--chapters', '-o', input.outputPath];
      case 'baoyu-danger-x-to-markdown':
        return [input.url, '-o', input.outputPath];
      case 'baoyu-url-to-markdown':
      default:
        return [input.url, '--headless', '--output', input.outputPath, '--timeout', '30000'];
    }
  }

  private async captureUrl(input: {
    url: string;
    title?: string;
    index: number;
    rootDir: string;
    kindOverride?: SourceArtifactKind;
  }): Promise<{ artifact: SourceArtifact; markdown?: string }> {
    const { skill, kind } = this.selectSkillForUrl(input.url);
    const artifactKind = input.kindOverride ?? kind;
    const outputPath = path.join(input.rootDir, `${String(input.index + 1).padStart(2, '0')}-${slugPart(input.title ?? input.url)}.md`);
    const capturedAt = new Date().toISOString();
    const skillsDirExists = await fs.access(this.runtime.getSkillsDir()).then(() => true).catch(() => false);

    if (!skillsDirExists) {
      return {
        artifact: {
          kind: artifactKind,
          url: input.url,
          title: input.title,
          markdownPath: outputPath,
          capturedAt,
          status: 'failed',
          evidenceUrl: input.url,
          error: `baoyu_skills_dir_missing:${this.runtime.getSkillsDir()}`
        }
      };
    }

    const run = await this.runtime.runSkill(skill, this.buildCaptureArgs({ skill, url: input.url, outputPath }));
    const exists = await fs.access(outputPath).then(() => true).catch(() => false);
    if (!run.ok || !exists) {
      return {
        artifact: {
          kind: artifactKind,
          url: input.url,
          title: input.title,
          markdownPath: outputPath,
          capturedAt,
          status: 'failed',
          evidenceUrl: input.url,
          error: (run.stderr || run.stdout || 'source_capture_failed').slice(0, 500)
        }
      };
    }

    const markdown = await fs.readFile(outputPath, 'utf8');
    return {
      artifact: {
        kind: artifactKind,
        url: input.url,
        title: input.title,
        markdownPath: outputPath,
        capturedAt,
        status: 'ready',
        evidenceUrl: input.url
      },
      markdown
    };
  }

  private buildSourceContext(title: string | undefined, url: string | undefined, markdown: string): string {
    return [`# Source${title ? `: ${title}` : ''}`, url ? `URL: ${url}` : null, '', markdown.slice(0, 6000)]
      .filter((line) => line !== null)
      .join('\n');
  }

  private async searchAndCapture(input: { runId: string; intent: string; rootDir: string }): Promise<SourceCaptureResult> {
    if (!this.searchProvider) {
      return {
        artifacts: [],
        sourceContext: '',
        hardFails: ['source_not_configured'],
        sourceRequired: true,
        sourceStatus: 'not_configured',
        searchResults: []
      };
    }

    let searchResults: SourceSearchResult[] = [];
    try {
      searchResults = (await this.searchProvider.search({ query: input.intent, maxResults: this.maxSearchResults }))
        .filter(isUsableSearchResult)
        .slice(0, this.maxSearchResults);
    } catch {
      return {
        artifacts: [],
        sourceContext: '',
        hardFails: ['source_search_failed'],
        sourceRequired: true,
        sourceStatus: 'failed',
        searchResults: []
      };
    }

    if (searchResults.length === 0) {
      return {
        artifacts: [],
        sourceContext: '',
        hardFails: ['source_search_failed'],
        sourceRequired: true,
        sourceStatus: 'failed',
        searchResults
      };
    }

    if (hasAmbiguousHermesResults(input.intent, searchResults)) {
      return {
        artifacts: searchResults.map((result, index) => ({
          kind: 'search',
          url: result.url,
          title: result.title,
          markdownPath: path.join(input.rootDir, `${String(index + 1).padStart(2, '0')}-${slugPart(result.title)}.md`),
          capturedAt: new Date().toISOString(),
          status: 'skipped',
          evidenceUrl: result.url,
          error: 'source_ambiguous'
        })),
        sourceContext: '',
        hardFails: ['source_ambiguous'],
        sourceRequired: true,
        sourceStatus: 'ambiguous',
        searchResults
      };
    }

    const artifacts: SourceArtifact[] = [];
    const sourceContextParts: string[] = [];

    for (const [index, result] of searchResults.entries()) {
      const captured = await this.captureUrl({
        url: result.url,
        title: result.title,
        index,
        rootDir: input.rootDir,
        kindOverride: 'search'
      });
      artifacts.push(captured.artifact);
      if (captured.markdown) sourceContextParts.push(this.buildSourceContext(result.title, result.url, captured.markdown));
    }

    const readyCount = artifacts.filter((artifact) => artifact.status === 'ready').length;
    return {
      artifacts,
      sourceContext: sourceContextParts.join('\n\n---\n\n'),
      hardFails: readyCount > 0 ? [] : ['source_capture_failed'],
      sourceRequired: true,
      sourceStatus: readyCount > 0 ? 'ready' : 'failed',
      searchResults
    };
  }

  async captureFromIntent(input: { runId: string; intent: string }): Promise<SourceCaptureResult> {
    const analysis = this.analyzeIntent(input.intent);
    const rootDir = path.join(this.runtime.getArtifactsRoot(), input.runId, 'sources');
    await fs.mkdir(rootDir, { recursive: true });
    const artifacts: SourceArtifact[] = [];
    const sourceContextParts: string[] = [];

    if (analysis.requiresFreshSource && analysis.urls.length === 0) {
      return this.searchAndCapture({ runId: input.runId, intent: input.intent, rootDir });
    }

    for (const [index, url] of analysis.urls.entries()) {
      const captured = await this.captureUrl({ url, index, rootDir });
      artifacts.push(captured.artifact);
      if (captured.markdown) sourceContextParts.push(this.buildSourceContext(captured.artifact.title, url, captured.markdown));
    }

    const failedCount = artifacts.filter((item) => item.status === 'failed').length;
    const readyCount = artifacts.filter((item) => item.status === 'ready').length;

    return {
      artifacts,
      sourceContext: sourceContextParts.join('\n\n---\n\n'),
      hardFails: failedCount > 0 ? ['source_capture_failed'] : [],
      sourceRequired: analysis.requiresFreshSource,
      sourceStatus: !analysis.requiresFreshSource || readyCount > 0 ? 'ready' : 'failed'
    };
  }
}
