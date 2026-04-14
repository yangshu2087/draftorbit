import { Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ContentFormat } from './content-strategy';
import { isPromptWrapperInstruction } from './content-strategy';
import type { VisualPlan } from './visual-planning.service';
import type { VisualAssetKind } from './benchmarks/baoyu-visual-rules';
import { renderDeterministicVisualAsset as renderTemplateVisualAsset } from './visual-card-render.service';

export const BAOYU_SKILLS_COMMIT = 'dcd0f81433490d85f72a0eae557a710ab34bc9b1';

export type BaoyuSkillName =
  | 'baoyu-url-to-markdown'
  | 'baoyu-danger-x-to-markdown'
  | 'baoyu-youtube-transcript'
  | 'baoyu-format-markdown'
  | 'baoyu-imagine';

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

export type BaoyuVisualAsset = {
  id: string;
  kind: VisualAssetKind;
  status: BaoyuVisualAssetStatus;
  renderer?: 'template-svg' | 'provider-image';
  aspectRatio?: '1:1' | '16:9';
  textLayer?: 'app-rendered' | 'none';
  assetUrl?: string;
  assetPath?: string;
  providerArtifactPath?: string;
  promptPath?: string;
  cue: string;
  reason?: string;
  error?: string;
};

export type BaoyuVisualArtifacts = {
  runtime: BaoyuRuntimeMeta;
  rootDir: string;
  promptDir: string;
  imageDir: string;
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
  for (let depth = 0; depth < 6; depth += 1) {
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
}) {
  const cue = safeCue(input.item.cue, input.focus);
  return [
    '# baoyu-skills compatible visual prompt',
    '',
    `Format: ${input.format}`,
    `Asset kind: ${input.item.kind}`,
    `Asset type: ${input.item.type}`,
    `Layout: ${input.item.layout}`,
    `Style: ${input.item.style}`,
    `Palette: ${input.item.palette}`,
    `Content cue: ${cue}`,
    `Reason: ${input.item.reason}`,
    '',
    'Create a polished Chinese social media visual that faithfully visualizes the cue.',
    'Important: do NOT render readable text, Chinese characters, English letters, numbers, labels, watermarks, or UI copy inside the image.',
    'Use clean composition, abstract cards, icons, arrows, before/after shapes, and empty text-safe panels only.',
    'Avoid generic AI symbolism, fake UI, noisy text blocks, gibberish text, and prompt-wrapper words.',
    'The app will render the approved copy outside the image, so the image should be text-free and should not try to typeset the copy.',
    '',
    'Reference approved copy for semantics only; do NOT render it as text in the image:',
    input.text.trim()
  ].join('\n');
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
    const scriptBySkill: Record<BaoyuSkillName, string> = {
      'baoyu-url-to-markdown': path.join('skills', skill, 'scripts', 'vendor', 'baoyu-fetch', 'src', 'cli.ts'),
      'baoyu-danger-x-to-markdown': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-youtube-transcript': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-format-markdown': path.join('skills', skill, 'scripts', 'main.ts'),
      'baoyu-imagine': path.join('skills', skill, 'scripts', 'main.ts')
    };
    return path.join(this.skillsDir, scriptBySkill[skill]);
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
        resolve({
          ok: exitCode === 0 && !timedOut,
          exitCode,
          stdout,
          stderr,
          timedOut,
          durationMs: Date.now() - started
        });
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        finish(null);
      }, this.timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
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
  }): Promise<BaoyuVisualArtifacts> {
    const rootDir = path.join(this.artifactsRoot, input.runId, 'visual');
    const promptDir = path.join(rootDir, 'prompts');
    const imageDir = path.join(rootDir, 'images');
    await fs.mkdir(promptDir, { recursive: true });
    await fs.mkdir(imageDir, { recursive: true });

    const items = input.visualPlan.items.slice(0, input.format === 'tweet' ? 1 : input.format === 'thread' ? 4 : 5);
    const assets: BaoyuVisualAsset[] = [];
    const tasks: Array<Record<string, unknown>> = [];

    for (const [index, item] of items.entries()) {
      const id = `${String(index + 1).padStart(2, '0')}-${slugPart(item.kind)}`;
      const promptPath = path.join(promptDir, `${id}.md`);
      const imagePath = path.join(imageDir, `${id}.svg`);
      const providerArtifactPath = path.join(imageDir, `${id}.provider.png`);
      await fs.writeFile(promptPath, visualPrompt({ format: input.format, focus: input.focus, text: input.text, item }), 'utf8');

      assets.push({
        id,
        kind: item.kind,
        status: input.withImage ? 'generating' : 'failed',
        renderer: 'template-svg',
        aspectRatio: input.format === 'article' && (item.kind === 'infographic' || item.kind === 'illustration') ? '16:9' : '1:1',
        textLayer: 'app-rendered',
        assetUrl: input.withImage ? `/v3/chat/runs/${encodeURIComponent(input.runId)}/assets/${encodeURIComponent(id)}` : undefined,
        assetPath: imagePath,
        providerArtifactPath,
        promptPath,
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
        ar: input.format === 'article' ? '16:9' : '1:1',
        quality: '2k'
      });
    }

    const batchFilePath = path.join(rootDir, 'batch.json');
    await fs.writeFile(batchFilePath, JSON.stringify({ jobs: 1, tasks }, null, 2), 'utf8');

    return {
      runtime: this.runtimeMeta(['baoyu-imagine']),
      rootDir,
      promptDir,
      imageDir,
      batchFilePath,
      assets
    };
  }

  async generateVisualArtifacts(input: {
    runId: string;
    format: ContentFormat;
    focus: string;
    text: string;
    visualPlan: VisualPlan;
    withImage: boolean;
  }): Promise<BaoyuVisualArtifacts> {
    const prepared = await this.prepareVisualArtifacts(input);
    if (!input.withImage) return prepared;

    const skillsDirExists = await fs.access(this.skillsDir).then(() => true).catch(() => false);
    if (!skillsDirExists) {
      return {
        ...prepared,
        assets: prepared.assets.map((asset) => ({
          ...asset,
          status: 'failed',
          error: `baoyu_skills_dir_missing:${this.skillsDir}`
        }))
      };
    }

    const result = await this.runSkill('baoyu-imagine', ['--batchfile', prepared.batchFilePath, '--jobs', '1', '--json']);
    const assets = await Promise.all(
      prepared.assets.map(async (asset, index) => {
        const providerExists = asset.providerArtifactPath
          ? await fs.access(asset.providerArtifactPath).then(() => true).catch(() => false)
          : false;
        if (result.ok && providerExists && asset.assetPath) {
          const rendered = await renderTemplateVisualAsset({
            format: input.format,
            focus: input.focus,
            text: input.text,
            item: input.visualPlan.items.slice(0, input.format === 'tweet' ? 1 : input.format === 'thread' ? 4 : 5)[index]!,
            assetPath: asset.assetPath
          });
          const renderedExists = await fs.access(asset.assetPath).then(() => true).catch(() => false);
          if (renderedExists && !rendered.diagnostics.overflow) {
            return { ...asset, ...rendered.metadata, status: 'ready' as const, error: undefined };
          }
          if (renderedExists) {
            return {
              ...asset,
              ...rendered.metadata,
              status: 'failed' as const,
              error: 'template_svg_text_overflow'
            };
          }
        }
        return {
          ...asset,
          status: 'failed' as const,
          error: result.timedOut
            ? 'baoyu_imagine_timeout'
            : (result.stderr || result.stdout || 'baoyu_imagine_failed').slice(0, 500)
        };
      })
    );

    await fs.writeFile(
      path.join(prepared.rootDir, 'baoyu-imagine-result.json'),
      JSON.stringify({ command: this.buildSkillCommand('baoyu-imagine', ['--batchfile', prepared.batchFilePath]), result }, null, 2),
      'utf8'
    );

    return { ...prepared, assets };
  }
}

export function filePathToAssetHref(filePath: string): string {
  return pathToFileURL(filePath).href;
}
