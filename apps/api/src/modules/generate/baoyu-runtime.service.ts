import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ContentFormat } from './content-strategy';
import { isPromptWrapperInstruction } from './content-strategy';
import type { VisualPlan } from './visual-planning.service';
import type { VisualAssetKind } from './benchmarks/baoyu-visual-rules';
import { normalizeVisualRequest, type VisualRequest } from './visual-request';
import { renderDeterministicVisualAsset as renderTemplateVisualAsset } from './visual-card-render.service';

export const BAOYU_SKILLS_COMMIT = '9977ff520c49ea0888d8d43d582973c6e8c1d55a';

export type BaoyuSkillName =
  | 'baoyu-url-to-markdown'
  | 'baoyu-danger-x-to-markdown'
  | 'baoyu-youtube-transcript'
  | 'baoyu-format-markdown'
  | 'baoyu-imagine'
  | 'baoyu-image-gen'
  | 'baoyu-image-cards'
  | 'baoyu-cover-image'
  | 'baoyu-infographic'
  | 'baoyu-article-illustrator'
  | 'baoyu-diagram'
  | 'baoyu-compress-image'
  | 'baoyu-markdown-to-html'
  | 'baoyu-post-to-x';

export type BaoyuRuntimeMeta = {
  engine: 'baoyu-skills';
  commit: string;
  skills: BaoyuSkillName[];
};

export type BaoyuRuntimeCommand = {
  command: string;
  args: string[];
};

export type BaoyuSkillCommand = BaoyuRuntimeCommand & {
  skill: BaoyuSkillName;
  commit: string;
  cwd: string;
  scriptPath: string;
};

export type BaoyuCommandResult = {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
};

export type BaoyuVisualAssetStatus = 'generating' | 'ready' | 'failed';
export type BaoyuVisualAssetProvider = 'codex-local-svg' | 'template-svg' | 'baoyu-imagine' | 'ollama-text';
export type BaoyuVisualExportFormat = 'svg' | 'html' | 'markdown' | 'zip';
export type BaoyuVisualAssetKind = VisualAssetKind | 'html' | 'markdown' | 'bundle';

export type BaoyuVisualAsset = {
  id: string;
  kind: BaoyuVisualAssetKind;
  status: BaoyuVisualAssetStatus;
  renderer?: 'template-svg' | 'provider-image';
  provider?: BaoyuVisualAssetProvider;
  model?: string;
  skill?: BaoyuSkillName;
  exportFormat?: BaoyuVisualExportFormat;
  aspectRatio?: '1:1' | '16:9';
  textLayer?: 'app-rendered' | 'none';
  width?: number;
  height?: number;
  checksum?: string;
  assetUrl?: string;
  signedAssetUrl?: string;
  assetPath?: string;
  providerArtifactPath?: string;
  promptPath?: string;
  specPath?: string;
  cue: string;
  reason?: string;
  error?: string;
};

export type BaoyuVisualArtifacts = {
  runtime: BaoyuRuntimeMeta;
  rootDir: string;
  promptDir: string;
  specDir: string;
  imageDir: string;
  exportDir: string;
  batchFilePath: string;
  assets: BaoyuVisualAsset[];
};

type BaoyuRuntimeOptions = {
  skillsDir?: string;
  artifactsRoot?: string;
  runtimeCommand?: BaoyuRuntimeCommand;
  imageProvider?: string;
  imageModel?: string;
  timeoutMs?: number;
};

function repoRootFromCwd(): string {
  let current = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const pkg = JSON.parse(require('node:fs').readFileSync(path.join(current, 'package.json'), 'utf8')) as { name?: string };
      if (pkg.name === 'draftorbit') return current;
    } catch {
      // keep walking upward
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

function defaultSkillsDir() {
  const configured = process.env.BAOYU_SKILLS_DIR?.trim();
  if (!configured) return path.join(repoRootFromCwd(), 'vendor', 'baoyu-skills');
  return path.isAbsolute(configured) ? configured : path.join(repoRootFromCwd(), configured);
}

function defaultArtifactsRoot() {
  const configured = process.env.BAOYU_RUNTIME_ARTIFACTS_DIR?.trim();
  if (!configured) return path.join(repoRootFromCwd(), 'artifacts', 'baoyu-runtime');
  return path.isAbsolute(configured) ? configured : path.join(repoRootFromCwd(), configured);
}

function defaultRuntimeCommand(): BaoyuRuntimeCommand {
  const configured = process.env.BAOYU_BUN_COMMAND?.trim();
  if (configured) {
    const [command, ...args] = configured.split(/\s+/u).filter(Boolean);
    return { command: command || 'npx', args };
  }
  if (process.env.BAOYU_FORCE_NPX_BUN === '1') return { command: 'npx', args: ['-y', 'bun'] };
  return { command: 'npx', args: ['-y', 'bun'] };
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/giu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 40) || 'asset';
}

function safeCue(cue: string, fallback: string): string {
  const normalized = cue
    .replace(/(?:^|\n)\s*\*{1,3}\s*\d+\/\d+\s*\*{1,3}\s*/gu, ' ')
    .replace(/(?:^|\n)\s*\d+\/\d+\s*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized || isPromptWrapperInstruction(normalized)) return fallback;
  return normalized;
}

function visualPrompt(input: {
  format: ContentFormat;
  focus: string;
  text: string;
  item: VisualPlan['items'][number];
  visualRequest?: VisualRequest | null;
}) {
  const visual = normalizeVisualRequest(input.visualRequest, input.format);
  const cue = safeCue(input.item.cue, input.focus);
  return [
    '# baoyu-skills compatible visual prompt',
    '',
    `Format: ${input.format}`,
    `Asset kind: ${input.item.kind}`,
    `Asset type: ${input.item.type}`,
    `Layout: ${visual.layout === 'auto' ? input.item.layout : visual.layout}`,
    `Style: ${visual.style}`,
    `Palette: ${visual.palette}`,
    `Aspect: ${visual.aspect}`,
    `Content cue: ${cue}`,
    `Reason: ${input.item.reason}`,
    '',
    'Create a polished Chinese social media visual that faithfully visualizes the cue.',
    'Important: do NOT render readable text, Chinese characters, English letters, numbers, labels, watermarks, or UI copy inside the raster image.',
    'The DraftOrbit app will render approved copy in a safe SVG/text layer and export a deterministic SVG asset.',
    'Avoid generic AI symbolism, fake UI, noisy text blocks, gibberish text, and prompt-wrapper words.',
    '',
    'Reference approved copy for semantics only; do NOT render it as text in a raster image:',
    input.text.trim()
  ].join('\n');
}

function checksumFile(filePath: string): Promise<string> {
  return fs.readFile(filePath).then((buffer) => createHash('sha256').update(buffer).digest('hex'));
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function markdownDocument(input: { format: ContentFormat; focus: string; text: string }): string {
  return [`# ${input.focus || 'DraftOrbit export'}`, '', `- format: ${input.format}`, `- generatedBy: DraftOrbit`, '', input.text.trim()].join('\n');
}

function htmlDocument(input: { format: ContentFormat; focus: string; text: string }): string {
  const paragraphs = input.text
    .trim()
    .split(/\n{2,}/u)
    .map((block) => `<p>${htmlEscape(block).replace(/\n/gu, '<br/>')}</p>`)
    .join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${htmlEscape(input.focus || 'DraftOrbit export')}</title>
  <style>body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;max-width:760px;margin:48px auto;padding:0 24px;line-height:1.8;color:#0f172a}p{white-space:normal}h1{line-height:1.25}</style>
</head>
<body>
  <h1>${htmlEscape(input.focus || 'DraftOrbit export')}</h1>
  <p><strong>Format:</strong> ${htmlEscape(input.format)}</p>
  ${paragraphs}
</body>
</html>`;
}

function providerForLocalSvg(): BaoyuVisualAssetProvider {
  return process.env.CODEX_LOCAL_ADAPTER_ENABLED === '1' && process.env.MODEL_ROUTER_ENABLE_CODEX_LOCAL === '1'
    ? 'codex-local-svg'
    : 'template-svg';
}

@Injectable()
export class BaoyuRuntimeService {
  private readonly skillsDir: string;
  private readonly artifactsRoot: string;
  private readonly runtimeCommand: BaoyuRuntimeCommand;
  private readonly imageProvider: string;
  private readonly imageModel: string;
  private readonly timeoutMs: number;

  constructor(options: BaoyuRuntimeOptions = {}) {
    this.skillsDir = options.skillsDir ?? defaultSkillsDir();
    this.artifactsRoot = options.artifactsRoot ?? defaultArtifactsRoot();
    this.runtimeCommand = options.runtimeCommand ?? defaultRuntimeCommand();
    this.imageProvider = options.imageProvider ?? process.env.BAOYU_IMAGE_PROVIDER?.trim() ?? 'openrouter';
    this.imageModel =
      options.imageModel ??
      process.env.OPENROUTER_IMAGE_MODEL?.trim() ??
      process.env.BAOYU_IMAGE_MODEL?.trim() ??
      'black-forest-labs/flux.2-pro';
    this.timeoutMs = options.timeoutMs ?? Number(process.env.BAOYU_RUNTIME_TIMEOUT_MS ?? 600_000);
  }

  runtimeMeta(skills: BaoyuSkillName[]): BaoyuRuntimeMeta {
    return {
      engine: 'baoyu-skills',
      commit: BAOYU_SKILLS_COMMIT,
      skills: [...new Set(skills)]
    };
  }

  getArtifactsRoot(): string {
    return this.artifactsRoot;
  }

  getSkillsDir(): string {
    return this.skillsDir;
  }

  resolveSkillScript(skill: BaoyuSkillName): string {
    const scriptBySkill: Partial<Record<BaoyuSkillName, string>> = {
      'baoyu-url-to-markdown': path.join('skills', skill, 'scripts', 'vendor', 'baoyu-fetch', 'src', 'cli.ts'),
      'baoyu-danger-x-to-markdown': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-youtube-transcript': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-format-markdown': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-imagine': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-image-gen': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-compress-image': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-markdown-to-html': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-diagram': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-article-illustrator': path.join('skills', skill, 'scripts', 'build-batch.ts'),
      'baoyu-post-to-x': path.join('skills', skill, 'scripts', 'main.ts')
    };
    return path.join(this.skillsDir, scriptBySkill[skill] ?? path.join('skills', skill, 'SKILL.md'));
  }

  buildSkillCommand(skill: BaoyuSkillName, args: string[] = []): BaoyuSkillCommand {
    const scriptPath = this.resolveSkillScript(skill);
    return {
      skill,
      commit: BAOYU_SKILLS_COMMIT,
      command: this.runtimeCommand.command,
      args: [...this.runtimeCommand.args, scriptPath, ...args],
      cwd: repoRootFromCwd(),
      scriptPath
    };
  }

  async runSkill(skill: BaoyuSkillName, args: string[] = []): Promise<BaoyuCommandResult> {
    const command = this.buildSkillCommand(skill, args);
    const started = Date.now();

    return new Promise((resolve) => {
      const child = spawn(command.command, command.args, {
        cwd: command.cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      let timedOut = false;
      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: exitCode === 0 && !timedOut, exitCode, stdout, stderr, timedOut, durationMs: Date.now() - started });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        finish(null);
      }, this.timeoutMs);

      child.stdout.on('data', (chunk) => { stdout += String(chunk); });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', (error) => {
        stderr += `\n${error.message}`;
        finish(null);
      });
      child.on('close', (code) => finish(code));
    });
  }

  async prepareVisualArtifacts(input: {
    runId: string;
    format: ContentFormat;
    focus: string;
    text: string;
    visualPlan: VisualPlan;
    withImage: boolean;
    visualRequest?: VisualRequest | null;
  }): Promise<BaoyuVisualArtifacts> {
    const visualRequest = normalizeVisualRequest(input.visualRequest, input.format);
    const rootDir = path.join(this.artifactsRoot, input.runId, 'visual');
    const promptDir = path.join(rootDir, 'prompts');
    const specDir = path.join(rootDir, 'specs');
    const imageDir = path.join(rootDir, 'images');
    const exportDir = path.join(rootDir, 'exports');
    await Promise.all([
      fs.mkdir(promptDir, { recursive: true }),
      fs.mkdir(specDir, { recursive: true }),
      fs.mkdir(imageDir, { recursive: true }),
      fs.mkdir(exportDir, { recursive: true })
    ]);

    const items = input.visualPlan.items.slice(0, input.format === 'tweet' ? 1 : input.format === 'thread' ? 4 : 5);
    const assets: BaoyuVisualAsset[] = [];
    const tasks: Array<Record<string, unknown>> = [];
    const localProvider = providerForLocalSvg();

    for (const [index, item] of items.entries()) {
      const id = `${String(index + 1).padStart(2, '0')}-${slugPart(item.kind)}`;
      const promptPath = path.join(promptDir, `${id}.md`);
      const specPath = path.join(specDir, `${id}.json`);
      const imagePath = path.join(imageDir, `${id}.svg`);
      const providerArtifactPath = path.join(imageDir, `${id}.provider.png`);
      const prompt = visualPrompt({ format: input.format, focus: input.focus, text: input.text, item, visualRequest });
      await fs.writeFile(promptPath, prompt, 'utf8');
      await fs.writeFile(
        specPath,
        JSON.stringify({
          id,
          kind: item.kind,
          cue: safeCue(item.cue, input.focus),
          provider: localProvider,
          renderer: 'template-svg',
          format: input.format,
          visualRequest,
          item
        }, null, 2),
        'utf8'
      );

      const aspectRatio: '1:1' | '16:9' = input.format === 'article' || item.kind === 'diagram' || visualRequest.aspect === '16:9' ? '16:9' : '1:1';
      assets.push({
        id,
        kind: item.kind,
        status: input.withImage ? 'generating' : 'failed',
        renderer: 'template-svg',
        provider: localProvider,
        model: localProvider === 'codex-local-svg' ? `codex-local/${process.env.CODEX_LOCAL_PROFILE?.trim() || 'quick'}` : 'draftorbit-template-svg',
        skill: item.kind === 'diagram' ? 'baoyu-diagram' : 'baoyu-imagine',
        exportFormat: 'svg',
        aspectRatio,
        textLayer: 'app-rendered',
        assetUrl: input.withImage ? `/v3/chat/runs/${encodeURIComponent(input.runId)}/assets/${encodeURIComponent(id)}` : undefined,
        assetPath: imagePath,
        providerArtifactPath,
        promptPath,
        specPath,
        cue: safeCue(item.cue, input.focus),
        reason: item.reason,
        error: input.withImage ? undefined : 'image_generation_not_requested'
      });

      tasks.push({
        id,
        promptFiles: [path.relative(rootDir, promptPath)],
        image: path.relative(rootDir, providerArtifactPath),
        provider: this.imageProvider,
        model: this.imageModel,
        ar: aspectRatio,
        quality: '2k',
        deprecatedAlias: 'baoyu-image-gen is deprecated; use baoyu-imagine'
      });
    }

    if (input.withImage && visualRequest.exportHtml) {
      const markdownPath = path.join(exportDir, 'content.md');
      const htmlPath = path.join(exportDir, 'content.html');
      const exportPromptPath = path.join(promptDir, '99-export.md');
      const markdownSpecPath = path.join(specDir, '98-markdown.json');
      const htmlSpecPath = path.join(specDir, '99-html.json');
      await fs.writeFile(markdownPath, markdownDocument(input), 'utf8');
      await fs.writeFile(htmlPath, htmlDocument(input), 'utf8');
      await fs.writeFile(exportPromptPath, `# Markdown/HTML export\n\n${input.text.trim()}\n`, 'utf8');
      await fs.writeFile(markdownSpecPath, JSON.stringify({ id: '98-markdown', provider: 'template-svg', exportFormat: 'markdown' }, null, 2), 'utf8');
      await fs.writeFile(htmlSpecPath, JSON.stringify({ id: '99-html', provider: 'template-svg', exportFormat: 'html' }, null, 2), 'utf8');
      assets.push(
        {
          id: '98-markdown',
          kind: 'markdown',
          status: 'ready',
          provider: 'template-svg',
          skill: 'baoyu-markdown-to-html',
          exportFormat: 'markdown',
          assetUrl: `/v3/chat/runs/${encodeURIComponent(input.runId)}/assets/98-markdown`,
          assetPath: markdownPath,
          promptPath: exportPromptPath,
          specPath: markdownSpecPath,
          cue: 'Markdown export',
          reason: '为手动发布、复用和审计准备 Markdown 包。'
        },
        {
          id: '99-html',
          kind: 'html',
          status: 'ready',
          provider: 'template-svg',
          skill: 'baoyu-markdown-to-html',
          exportFormat: 'html',
          assetUrl: `/v3/chat/runs/${encodeURIComponent(input.runId)}/assets/99-html`,
          assetPath: htmlPath,
          promptPath: exportPromptPath,
          specPath: htmlSpecPath,
          cue: 'HTML export',
          reason: '对标 baoyu-markdown-to-html 的安全本地 HTML 导出。'
        }
      );
    }

    const batchFilePath = path.join(rootDir, 'batch.json');
    await fs.writeFile(batchFilePath, JSON.stringify({ jobs: 1, tasks }, null, 2), 'utf8');

    return { runtime: this.runtimeMeta(['baoyu-imagine']), rootDir, promptDir, specDir, imageDir, exportDir, batchFilePath, assets };
  }

  async generateVisualArtifacts(input: {
    runId: string;
    format: ContentFormat;
    focus: string;
    text: string;
    visualPlan: VisualPlan;
    withImage: boolean;
    visualRequest?: VisualRequest | null;
  }): Promise<BaoyuVisualArtifacts> {
    const prepared = await this.prepareVisualArtifacts(input);
    if (!input.withImage) return prepared;

    let result: BaoyuCommandResult | null = null;
    const skillsDirExists = await fs.access(this.skillsDir).then(() => true).catch(() => false);
    if (skillsDirExists) {
      result = await this.runSkill('baoyu-imagine', ['--batchfile', prepared.batchFilePath, '--jobs', '1', '--json']);
      await fs.writeFile(
        path.join(prepared.rootDir, 'baoyu-imagine-result.json'),
        JSON.stringify({ command: this.buildSkillCommand('baoyu-imagine', ['--batchfile', prepared.batchFilePath]), result }, null, 2),
        'utf8'
      );
    }

    const visualItems = input.visualPlan.items.slice(0, input.format === 'tweet' ? 1 : input.format === 'thread' ? 4 : 5);
    const assets = await Promise.all(
      prepared.assets.map(async (asset, index) => {
        if (asset.exportFormat && asset.exportFormat !== 'svg') {
          const checksum = asset.assetPath ? await checksumFile(asset.assetPath).catch(() => undefined) : undefined;
          return { ...asset, checksum };
        }

        if (!asset.assetPath) return { ...asset, status: 'failed' as const, error: 'asset_path_missing' };
        const item = visualItems[index];
        if (!item) return { ...asset, status: 'failed' as const, error: 'visual_plan_item_missing' };

        const rendered = await renderTemplateVisualAsset({
          format: input.format,
          focus: input.focus,
          text: input.text,
          item,
          assetPath: asset.assetPath
        });
        const renderedExists = await fs.access(asset.assetPath).then(() => true).catch(() => false);
        if (!renderedExists) return { ...asset, status: 'failed' as const, error: 'template_svg_missing' };
        const checksum = await checksumFile(asset.assetPath);
        const providerExists = asset.providerArtifactPath
          ? await fs.access(asset.providerArtifactPath).then(() => true).catch(() => false)
          : false;

        if (rendered.diagnostics.overflow) {
          return {
            ...asset,
            ...rendered.metadata,
            checksum,
            providerArtifactPath: providerExists ? asset.providerArtifactPath : asset.providerArtifactPath,
            status: 'failed' as const,
            error: 'template_svg_text_overflow'
          };
        }

        return {
          ...asset,
          ...rendered.metadata,
          checksum,
          providerArtifactPath: providerExists ? asset.providerArtifactPath : asset.providerArtifactPath,
          status: 'ready' as const,
          error: undefined
        };
      })
    );

    const skills: BaoyuSkillName[] = ['baoyu-imagine'];
    if (prepared.assets.some((asset) => asset.kind === 'diagram')) skills.push('baoyu-diagram');
    if (prepared.assets.some((asset) => asset.exportFormat === 'html' || asset.exportFormat === 'markdown')) skills.push('baoyu-markdown-to-html');

    return { ...prepared, runtime: this.runtimeMeta(skills), assets };
  }
}

export function filePathToAssetHref(filePath: string): string {
  return pathToFileURL(filePath).href;
}
