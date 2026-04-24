'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCcw,
  Send,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AppError, getToken } from '../../lib/api';
import {
  V4_FORMAT_OPTIONS,
  buildV4StudioPreview,
  buildV4StudioRunRequest,
  fetchV4Capabilities,
  fetchV4StudioRun,
  getV4ErrorCopy,
  getV4FormatOption,
  runV4Studio,
  type V4StudioFormat,
  type V4StudioPreviewContract,
  type V4VisualControls
} from '../../lib/v4-studio';
import type { VisualRequestAspect, VisualRequestLayout, VisualRequestPalette, VisualRequestStyle } from '../../lib/queries';
import { Button } from '../ui/button';
import { AppShell } from '../v3/shell';
import { cn } from '../../lib/utils';

const quickPrompts = [
  '别再靠灵感写推文，给我一条关于 AI 产品冷启动的判断，并配一张封面。',
  '把一个 AI 产品新功能写成 4 条 thread，并生成卡片组。',
  '根据 https://example.com/source 写一篇 X 长文，带封面、信息图和 HTML 导出。',
  '用流程图解释：输入→来源→正文→图文→手动确认发布。'
];

const styles: Array<{ value: VisualRequestStyle; label: string }> = [
  { value: 'draftorbit', label: 'DraftOrbit' },
  { value: 'minimal', label: '极简' },
  { value: 'blueprint', label: '蓝图' },
  { value: 'notion', label: 'Notion' },
  { value: 'sketch-notes', label: '手绘笔记' },
  { value: 'bold-editorial', label: '强编辑感' }
];

const layouts: Array<{ value: VisualRequestLayout; label: string }> = [
  { value: 'auto', label: '自动布局' },
  { value: 'balanced', label: '平衡' },
  { value: 'flow', label: '流程' },
  { value: 'comparison', label: '对比' },
  { value: 'mindmap', label: '思维导图' },
  { value: 'dense', label: '高密度' }
];

const palettes: Array<{ value: VisualRequestPalette; label: string }> = [
  { value: 'draftorbit', label: 'DraftOrbit' },
  { value: 'auto', label: '自动' },
  { value: 'mono', label: '黑白' },
  { value: 'warm', label: '暖色' },
  { value: 'macaron', label: '马卡龙' },
  { value: 'neon', label: '霓虹' }
];

const aspects: Array<{ value: VisualRequestAspect; label: string }> = [
  { value: 'auto', label: '自动比例' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '4:5', label: '4:5' },
  { value: '2.35:1', label: '2.35:1' }
];

function isLatestWithoutSource(prompt: string, sourceUrl: string) {
  return /(最新|今天|昨日|昨天|刚刚|近期|实时|新闻|current|latest|breaking|today|yesterday|this week)/iu.test(prompt) &&
    !sourceUrl.trim() &&
    !/https?:\/\/\S+/iu.test(prompt);
}

function assetKindLabel(kind: string) {
  switch (kind) {
    case 'cover':
      return '封面图';
    case 'cards':
    case 'card':
      return '卡片组';
    case 'infographic':
      return '信息图';
    case 'illustration':
      return '章节配图';
    case 'diagram':
      return '流程图';
    case 'html':
      return 'HTML 导出';
    case 'markdown':
      return 'Markdown 导出';
    default:
      return kind;
  }
}

function mockPreviewForLocalShell(format: V4StudioFormat, prompt: string): V4StudioPreviewContract {
  const option = getV4FormatOption(format);
  const runId = `v4-local-${format}`;
  const contentByFormat: Record<V4StudioFormat, string> = {
    tweet: '真正稳定的创作者，不是每天都有灵感，而是把输入、判断、图文和确认变成固定流程。',
    thread: '1/4 先讲真实场景。\n\n2/4 再给判断。\n\n3/4 用卡片把结构固定下来。\n\n4/4 最后由你手动确认是否发布。',
    article: '标题：AI 内容最大的问题不是缺模型\n\n导语：真正的问题是缺少从来源到图文资产的稳定工作流。\n\n一、先锁定来源\n二、再生成判断\n三、最后导出可发布图文包',
    diagram: '输入一句话 → 来源校验 → Codex 生成正文和视觉规格 → 本地 SVG 渲染 → 手动确认发布。',
    social_pack: '这套图文包包含：主文案、封面图、卡片组、HTML/Markdown 导出，以及 X 发布准备。'
  };
  const visualKind = option.visualMode === 'article_illustration' ? 'cover' : option.visualMode;
  return {
    runId,
    status: 'LOCAL_PREVIEW',
    textResult: { format, content: contentByFormat[format], variants: [] },
    visualAssets: [
      {
        id: `${format}-primary`,
        kind: visualKind,
        status: 'ready',
        provider: 'codex-local-svg',
        model: 'codex-local/best-available',
        skill: option.baoyuSkill,
        exportFormat: 'svg',
        checksum: `sha256-${format}-preview`,
        signedAssetUrl: '',
        cue: prompt.slice(0, 72) || option.description,
        provenanceLabel: 'Codex 本机 SVG'
      },
      {
        id: `${format}-html`,
        kind: 'html',
        status: 'ready',
        provider: 'template-svg',
        skill: 'baoyu-markdown-to-html',
        exportFormat: 'html',
        checksum: `sha256-${format}-html`,
        signedAssetUrl: '',
        cue: 'HTML/Markdown 导出包',
        provenanceLabel: '安全模板渲染'
      }
    ],
    sourceArtifacts: prompt.includes('http') ? [{ kind: 'url', status: 'ready' }] : [],
    qualityGate: { status: 'passed', safeToDisplay: true, hardFails: [] },
    publishPreparation: { mode: 'manual-confirm', label: '准备发布 / 手动确认', canAutoPost: false },
    usageEvidence: { primaryProvider: 'codex-local', model: 'codex-local/best-available', fallbackDepth: 0 }
  };
}

export default function CreatorStudio() {
  const [prompt, setPrompt] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [format, setFormat] = useState<V4StudioFormat>('tweet');
  const [controls, setControls] = useState<V4VisualControls>({
    style: 'draftorbit',
    layout: 'balanced',
    palette: 'draftorbit',
    aspect: 'auto',
    exportHtml: true
  });
  const [capabilityCount, setCapabilityCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [preview, setPreview] = useState<V4StudioPreviewContract | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const capabilities = await fetchV4Capabilities();
        setCapabilityCount(capabilities.skillMatrix.filter((item) => item.usedByDraftOrbit).length);
      } catch {
        setCapabilityCount(null);
      }
    })();
  }, []);

  const selectedFormat = useMemo(() => getV4FormatOption(format), [format]);
  const previewView = useMemo(() => preview ? buildV4StudioPreview(preview) : null, [preview]);
  const errorCopy = useMemo(() => getV4ErrorCopy(errorCode ?? undefined), [errorCode]);
  const canGenerate = prompt.trim().length > 0 && !loading;
  const sourceBlocked = isLatestWithoutSource(prompt, sourceUrl);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setErrorCode(null);
    setNotice('');
    setPreview(null);

    const request = buildV4StudioRunRequest({ prompt, format, sourceUrl, controls });
    try {
      if (sourceBlocked) {
        throw new AppError({ code: 'SOURCE_REQUIRED', message: '需要来源后再生成', statusCode: 424 });
      }
      if (!getToken()) {
        setPreview(mockPreviewForLocalShell(format, prompt));
        setNotice('本地 UI 预览已生成；登录后会调用 /v4/studio/run 并写入真实 run。');
        return;
      }
      const started = await runV4Studio(request);
      setNotice(`V4 生成已排队：${started.runId}。正在读取结果预览…`);
      try {
        const detail = await fetchV4StudioRun(started.runId);
        setPreview(detail);
      } catch {
        setPreview(mockPreviewForLocalShell(format, prompt));
        setNotice(`V4 生成已排队：${started.runId}。结果仍在生成，先展示本地可审计预览。`);
      }
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'UNKNOWN_ERROR';
      setErrorCode(code);
    } finally {
      setLoading(false);
    }
  }

  async function copyMarkdown() {
    const text = preview?.textResult.content ?? '';
    if (!text) return;
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    setNotice('Markdown 已复制；仍需你手动确认后再发布。');
  }

  return (
    <AppShell
      eyebrow="V4 Creator Studio"
      title="Codex OAuth 优先的图文创作工作台"
      description="从一句话、URL 或最新事实需求开始，生成 tweet/thread/article/diagram/social pack，并输出可审计 SVG、Markdown、HTML 与发布准备。"
      actions={
        <>
          <Button asChild variant="outline">
            <Link href="/queue">查看队列</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/connect">连接 X</Link>
          </Button>
          <Button asChild>
            <Link href="/pricing">查看套餐</Link>
          </Button>
        </>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_340px]">
        <aside className="do-panel p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            创作输入
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">写一句目标或粘贴 URL。涉及“最新/实时”但没有来源时会 fail-closed。</p>

          <div className="mt-5 space-y-3">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="v4-prompt">Prompt</label>
            <textarea
              id="v4-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="例如：把这个产品更新写成 4 条 thread，并生成卡片组。"
              className="min-h-[156px] w-full"
            />
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500" htmlFor="v4-source">Source URL（可选）</label>
            <input
              id="v4-source"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder="https://example.com/source"
              className="w-full"
            />
          </div>

          <div className="mt-5 grid gap-2">
            {quickPrompts.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPrompt(item)}
                className="rounded-2xl border border-slate-900/10 bg-slate-50 px-3 py-2 text-left text-xs leading-5 text-slate-600 transition hover:border-slate-900/20 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30"
              >
                {item}
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-5">
          <section className="do-panel p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Format + taskType routing</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">选择要交付的图文包</h2>
              </div>
              <span className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                Codex OAuth first · Ollama off
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-5">
              {V4_FORMAT_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFormat(item.value)}
                  className={cn(
                    'rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30',
                    format === item.value
                      ? 'border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-900/10'
                      : 'border-slate-900/10 bg-white text-slate-700 hover:border-slate-900/25 hover:bg-slate-50'
                  )}
                >
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className={cn('mt-2 text-xs leading-5', format === item.value ? 'text-slate-300' : 'text-slate-500')}>{item.description}</p>
                </button>
              ))}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Style
                <select className="w-full normal-case tracking-normal" value={controls.style} onChange={(event) => setControls((current) => ({ ...current, style: event.target.value as VisualRequestStyle }))}>
                  {styles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Layout
                <select className="w-full normal-case tracking-normal" value={controls.layout} onChange={(event) => setControls((current) => ({ ...current, layout: event.target.value as VisualRequestLayout }))}>
                  {layouts.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Palette
                <select className="w-full normal-case tracking-normal" value={controls.palette} onChange={(event) => setControls((current) => ({ ...current, palette: event.target.value as VisualRequestPalette }))}>
                  {palettes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Aspect
                <select className="w-full normal-case tracking-normal" value={controls.aspect} onChange={(event) => setControls((current) => ({ ...current, aspect: event.target.value as VisualRequestAspect }))}>
                  {aspects.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button disabled={!canGenerate} onClick={() => void handleGenerate()}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {loading ? '生成中…' : '生成 V4 图文包'}
              </Button>
              <Button variant="outline" disabled={!preview?.textResult.content} onClick={() => void copyMarkdown()}>
                <Copy className="mr-2 h-4 w-4" />
                复制 Markdown
              </Button>
              <Button variant="outline" disabled={!previewView?.hasDownloadableAssets}>
                <Download className="mr-2 h-4 w-4" />
                {previewView?.bundleActionCopy ?? '下载 bundle'}
              </Button>
              <Button variant="ghost" disabled>
                <Send className="mr-2 h-4 w-4" />
                准备发布 / 手动确认
              </Button>
            </div>
          </section>

          {sourceBlocked ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-semibold">最新事实需要来源</p>
                  <p className="mt-1 leading-6">请粘贴来源 URL，或配置搜索 provider。DraftOrbit 不会编造最新信息。</p>
                </div>
              </div>
            </section>
          ) : null}

          {errorCode ? (
            <section className={cn('rounded-2xl border p-4 text-sm', errorCopy.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-rose-200 bg-rose-50 text-rose-900')}>
              <p className="font-semibold">{errorCopy.title}</p>
              <p className="mt-1 leading-6">{errorCopy.description}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => setErrorCode(null)}>{errorCopy.primaryAction}</Button>
            </section>
          ) : null}

          {notice ? (
            <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">{notice}</section>
          ) : null}

          <section className="do-panel p-5" aria-label="V4 结果预览">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Preview</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">正文 + 视觉资产 + 导出包</h2>
              </div>
              <span className="rounded-full border border-slate-900/10 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {selectedFormat.baoyuSkill}
              </span>
            </div>

            {!preview ? (
              <div className="mt-5 rounded-[28px] border border-dashed border-slate-900/15 bg-slate-50 p-8 text-center">
                <FileText className="mx-auto h-9 w-9 text-slate-400" />
                <p className="mt-4 text-sm font-semibold text-slate-900">还没有结果</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">输入一句话，选择 format，然后生成。空态、失败态、retry 和导出动作都会在这里收口。</p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <article className="rounded-[28px] border border-slate-900/10 bg-slate-950 p-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{preview.textResult.format}</p>
                  <pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-100">{preview.textResult.content}</pre>
                </article>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />{previewView?.qualityCopy}</div>
                    <p className="mt-2 text-xs leading-5">Provider：{preview.usageEvidence.primaryProvider} · {preview.usageEvidence.model ?? 'codex-local/best-available'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-900/10 bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-950">发布安全</p>
                    <p className="mt-2 leading-6">{previewView?.publishCopy}</p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>

        <aside className="space-y-5">
          <section className="do-panel-soft p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Provenance</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">资产来源与质量门</h2>
            <div className="mt-4 space-y-3">
              {(previewView?.readyAssets ?? []).map((asset) => (
                <div key={asset.id} className="rounded-2xl border border-slate-900/10 bg-white p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{assetKindLabel(asset.kind)}</p>
                      <p className="mt-1 text-xs text-slate-500">{asset.providerLabel} · {asset.skill ?? 'baoyu-imagine'}</p>
                    </div>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-600">{asset.cue}</p>
                  {asset.normalizedUrl ? (
                    <a className="mt-3 inline-flex text-xs font-semibold text-slate-950 underline-offset-4 hover:underline" href={asset.normalizedUrl}>下载 {asset.exportFormat?.toUpperCase() ?? 'SVG'}</a>
                  ) : (
                    <p className="mt-3 text-xs font-semibold text-slate-500">本地预览资产，真实 run 会生成签名下载链接</p>
                  )}
                </div>
              ))}
              {(previewView?.failedAssets ?? []).map((asset) => (
                <div key={asset.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">{assetKindLabel(asset.kind)} 需要重试</p>
                  <p className="mt-2 text-xs leading-5">失败资产不会被当作成品展示。</p>
                  <Button className="mt-3" size="sm" variant="outline"><RefreshCcw className="mr-2 h-3.5 w-3.5" />只重试图文资产</Button>
                </div>
              ))}
              {!previewView?.readyAssets.length && !previewView?.failedAssets.length ? (
                <p className="rounded-2xl border border-slate-900/10 bg-white p-4 text-sm leading-6 text-slate-500">生成后会展示 assetUrl、checksum、prompt/spec 路径和 provider provenance。</p>
              ) : null}
            </div>
          </section>

          <section className="do-panel p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">baoyu parity</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">图文能力覆盖</h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {['baoyu-imagine', 'cover/cards/infographic', 'article illustrator', 'diagram', 'markdown-to-html', 'safe post-to-x'].map((item) => (
                <li key={item} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />{item}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-5 text-slate-500">已启用 {capabilityCount ?? '本地'} 项产品相关能力；`baoyu-image-gen` 仅作为 deprecated 对标项。</p>
          </section>
        </aside>
      </section>
    </AppShell>
  );
}
