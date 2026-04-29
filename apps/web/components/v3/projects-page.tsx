'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Copy, Download, FolderKanban, Loader2, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getToken } from '../../lib/api';
import { fetchRunStream, type V3StreamEvent } from '../../lib/sse-stream';
import { hydrateRunDetailUntilReady, shouldHydrateRunDetail } from '../../lib/v3-run-hydration';
import {
  buildOperationHubCards,
  buildRunAssetsZipUrl,
  buildVisualAssetCards,
  formatOperationNextAction,
  normalizeVisualAssetUrl
} from '../../lib/v3-result-preview';
import { normalizeResultText } from '../../lib/v3-result-copy';
import { toUiError, type UiError } from '../../lib/ui-error';
import {
  createProject,
  fetchProject,
  fetchProjects,
  fetchRun,
  generateProjectRun,
  type V3Format,
  type V3ProjectDetailResponse,
  type V3ProjectPreset,
  type V3ProjectView,
  type V3RunResponse
} from '../../lib/queries';
import {
  buildProjectGeneratePayload,
  getProjectPresetCard,
  projectPresetCards,
  summarizeProjectMetadata
} from '../../lib/project-ops';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, LoadingState, SuccessNotice } from '../ui/state-feedback';
import { useToast } from '../ui/toast';
import { AppShell } from './shell';

const formatOptions: Array<{ value: V3Format; label: string }> = [
  { value: 'tweet', label: '短推' },
  { value: 'thread', label: 'Thread' },
  { value: 'article', label: '长文' }
];

function defaultPromptForProject(project: V3ProjectView | null) {
  if (project?.preset === 'skilltrust_x_ops') {
    return '围绕 SkillTrust 的 skill 安装前审计，生成一组有判断、有例子、有图文卡片的 thread';
  }
  return '把本周项目进展整理成一组适合 X 发布的 thread，附带图文卡片';
}

function ProjectSummaryCard(props: { project: V3ProjectView; active: boolean; onSelect: () => void }) {
  const summary = summarizeProjectMetadata(props.project.metadata);
  return (
    <button
      type="button"
      onClick={props.onSelect}
      className={cn(
        'w-full rounded-3xl border bg-white/90 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950',
        props.active ? 'border-slate-950 ring-2 ring-slate-950/10' : 'border-slate-200'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{props.project.preset === 'skilltrust_x_ops' ? 'SkillTrust preset' : 'Project'}</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">{props.project.name}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{summary.objective}</p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">{summary.visualStyle}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {summary.pillars.slice(0, 4).map((pillar) => (
          <span key={pillar} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {pillar}
          </span>
        ))}
      </div>
    </button>
  );
}

function PresetCard(props: { preset: V3ProjectPreset; creating: boolean; onCreate: (preset: V3ProjectPreset) => void }) {
  const card = getProjectPresetCard(props.preset)!;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {card.badge}
        </span>
        <Sparkles className="h-4 w-4 text-slate-400" />
      </div>
      <h3 className="mt-4 text-xl font-semibold text-slate-950">{card.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {card.pillars.map((pillar) => (
          <span key={pillar} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {pillar}
          </span>
        ))}
      </div>
      <Button className="mt-5 w-full" onClick={() => props.onCreate(props.preset)} disabled={props.creating}>
        {props.creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        创建项目
      </Button>
    </div>
  );
}

export default function ProjectsPage() {
  const { pushToast } = useToast();
  const [projects, setProjects] = useState<V3ProjectView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<V3ProjectDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingPreset, setCreatingPreset] = useState<V3ProjectPreset | null>(null);
  const [pageError, setPageError] = useState<UiError | null>(null);
  const [intent, setIntent] = useState('');
  const [format, setFormat] = useState<V3Format>('thread');
  const [runLoading, setRunLoading] = useState(false);
  const [activeRun, setActiveRun] = useState<V3RunResponse | null>(null);
  const [stageEvents, setStageEvents] = useState<Record<string, V3StreamEvent>>({});
  const [runError, setRunError] = useState<UiError | null>(null);
  const hydrationPromiseRef = useRef<Promise<V3RunResponse | null> | null>(null);

  const selectedProject = detail?.project ?? projects.find((project) => project.id === selectedId) ?? null;
  const summary = useMemo(() => summarizeProjectMetadata(selectedProject?.metadata), [selectedProject?.metadata]);
  const visualCards = useMemo(() => buildVisualAssetCards(activeRun?.result?.visualAssets ?? []), [activeRun?.result?.visualAssets]);
  const operationHubCards = useMemo(
    () => buildOperationHubCards(activeRun?.result?.operationSummary ?? null),
    [activeRun?.result?.operationSummary]
  );
  const operationNextActions = useMemo(
    () => (activeRun?.result?.operationSummary?.workflow.nextActions ?? []).map(formatOperationNextAction),
    [activeRun?.result?.operationSummary?.workflow.nextActions]
  );
  const projectHubCards = useMemo(
    () =>
      operationHubCards.length
        ? operationHubCards
        : [
            {
              title: '数据源',
              value: summary.sources.length ? `${summary.sources.length} 个固定来源` : '按需补来源',
              description: summary.sources.length ? summary.sources.slice(0, 2).join(' / ') : '涉及最新事实时会要求粘贴 URL，不编造。',
              tone: summary.sources.length ? 'ready' : 'neutral'
            },
            {
              title: '项目上下文',
              value: selectedProject ? '已加载' : '待选择',
              description: selectedProject ? `${summary.audience} · ${summary.pillars.slice(0, 2).join(' / ')}` : '选择项目后注入目标、受众和内容支柱。',
              tone: selectedProject ? 'ready' : 'neutral'
            },
            {
              title: '智能生成',
              value: activeRun?.result ? '本轮已完成' : runLoading ? '生成中' : '待启动',
              description: activeRun?.result ? '已完成策略、正文、视觉规划和发布前检查。' : '点击生成后后台完成推理链路。',
              tone: activeRun?.result ? 'ready' : runLoading ? 'warning' : 'neutral'
            },
            {
              title: '工作流',
              value: '人工确认',
              description: '可复制、下载 bundle，或进入发布队列人工确认。',
              tone: 'neutral'
            },
            {
              title: '监控',
              value: detail?.recentRuns.length ? `${detail.recentRuns.length} 条记录` : '暂无记录',
              description: '最近生成、视觉资产数和发布准备状态会保留在项目里。',
              tone: detail?.recentRuns.length ? 'ready' : 'neutral'
            }
          ],
    [activeRun?.result, detail?.recentRuns.length, operationHubCards, runLoading, selectedProject, summary.audience, summary.pillars, summary.sources]
  );
  const bundleUrl = useMemo(() => {
    if (!activeRun?.runId) return null;
    return activeRun.result?.visualAssetsBundleUrl
      ? normalizeVisualAssetUrl(activeRun.result.visualAssetsBundleUrl)
      : buildRunAssetsZipUrl(activeRun.runId);
  }, [activeRun?.result?.visualAssetsBundleUrl, activeRun?.runId]);

  const loadProjects = useCallback(async () => {
    if (!getToken()) {
      setPageError({ message: '未登录，请先回首页完成登录或使用本机快速体验。' });
      setLoading(false);
      return;
    }
    setLoading(true);
    setPageError(null);
    try {
      const response = await fetchProjects();
      setProjects(response.projects);
      const nextSelected = selectedId ?? response.projects[0]?.id ?? null;
      setSelectedId(nextSelected);
      if (nextSelected) {
        setDetail(await fetchProject(nextSelected));
      } else {
        setDetail(null);
      }
    } catch (error) {
      setPageError(toUiError(error));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedProject) return;
    setIntent((current) => current || defaultPromptForProject(selectedProject));
    setFormat(selectedProject.defaultFormat ?? 'thread');
  }, [selectedProject]);

  const selectProject = useCallback(async (projectId: string) => {
    setSelectedId(projectId);
    setDetail(null);
    setActiveRun(null);
    setStageEvents({});
    try {
      setDetail(await fetchProject(projectId));
    } catch (error) {
      setPageError(toUiError(error));
    }
  }, []);

  const createPresetProject = useCallback(async (preset: V3ProjectPreset) => {
    const card = getProjectPresetCard(preset)!;
    setCreatingPreset(preset);
    setPageError(null);
    try {
      const created = await createProject({ name: card.defaultName, description: card.description, preset });
      const nextProjects = await fetchProjects();
      setProjects(nextProjects.projects);
      setSelectedId(created.project.id);
      setDetail(await fetchProject(created.project.id));
      setIntent(defaultPromptForProject(created.project));
      pushToast({ title: '项目已创建', description: `${created.project.name} 可以开始生成本轮内容。` });
    } catch (error) {
      setPageError(toUiError(error));
    } finally {
      setCreatingPreset(null);
    }
  }, [pushToast]);

  const runProjectGeneration = useCallback(async () => {
    if (!selectedProject || !intent.trim()) return;
    setRunLoading(true);
    setRunError(null);
    setActiveRun(null);
    setStageEvents({});
    hydrationPromiseRef.current = null;
    try {
      const payload = buildProjectGeneratePayload({
        intent,
        format,
        visualDefaults: selectedProject.visualDefaults,
        sourceUrls: summary.sources
      });
      const started = await generateProjectRun(selectedProject.id, payload);
      await fetchRunStream(started.runId, (event) => {
        setStageEvents((previous) => ({ ...previous, [event.stage]: event }));
        if (shouldHydrateRunDetail(event) && !hydrationPromiseRef.current) {
          hydrationPromiseRef.current = hydrateRunDetailUntilReady(fetchRun, started.runId, { timeoutMs: 25_000 }).then((detail) => {
            if (detail) setActiveRun(detail);
            return detail;
          });
        }
      });
      const hydrated = hydrationPromiseRef.current ? await hydrationPromiseRef.current : await hydrateRunDetailUntilReady(fetchRun, started.runId, { timeoutMs: 10_000 });
      if (hydrated) setActiveRun(hydrated);
      setDetail(await fetchProject(selectedProject.id));
      pushToast({ title: '项目内容已生成', description: '可以复制、下载图文资产，或进入人工确认队列。' });
    } catch (error) {
      setRunError(toUiError(error));
    } finally {
      setRunLoading(false);
    }
  }, [format, intent, pushToast, selectedProject, summary.sources]);

  const copyResult = useCallback(async () => {
    const text = normalizeResultText(activeRun?.result?.text ?? '');
    if (!text) return;
    await navigator.clipboard.writeText(text);
    pushToast({ title: '已复制项目生成结果' });
  }, [activeRun?.result?.text, pushToast]);

  if (loading) {
    return (
      <AppShell eyebrow="项目运营" title="把 X 运营沉淀成项目" description="为每个项目固定目标、受众、内容支柱、来源和发布前检查。">
        <LoadingState title="正在加载项目" description="读取你的工作区项目与最近生成结果。" />
      </AppShell>
    );
  }

  if (pageError && projects.length === 0) {
    return (
      <AppShell eyebrow="项目运营" title="把 X 运营沉淀成项目" description="先完成本机体验或登录，再创建项目。">
        <ErrorState error={pageError} onRetry={() => void loadProjects()} actionHref="/" actionLabel="返回首页" />
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="项目运营工作台"
      title="按项目持续生成 X 线程和图文资产"
      description="保留当前生成器体验，同时把目标、内容支柱、来源和发布前检查沉淀到项目里。SkillTrust 是内置示范预设，通用项目同样可用。"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/app">回到生成器</Link></Button>
          <Button asChild variant="outline"><Link href="/queue">发布队列</Link></Button>
          <Button asChild variant="outline"><Link href="/connect">连接来源</Link></Button>
          <Button asChild variant="outline"><Link href="/pricing">套餐</Link></Button>
        </div>
      }
    >
      {pageError ? <ErrorState error={pageError} onRetry={() => void loadProjects()} /> : null}

      {projects.length === 0 ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {projectPresetCards.map((card) => (
            <PresetCard key={card.preset} preset={card.preset} creating={creatingPreset === card.preset} onCreate={createPresetProject} />
          ))}
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">项目</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">{projects.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {projects.map((project) => (
                  <ProjectSummaryCard key={project.id} project={project} active={project.id === selectedProject?.id} onSelect={() => void selectProject(project.id)} />
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {projectPresetCards.map((card) => (
                <PresetCard key={card.preset} preset={card.preset} creating={creatingPreset === card.preset} onCreate={createPresetProject} />
              ))}
            </div>
          </aside>

          <section className="space-y-6">
            {!selectedProject ? (
              <EmptyState title="还没有选中项目" description="创建或选择一个项目后，就能把上下文带入生成器。" />
            ) : (
              <>
                <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                          <FolderKanban className="h-3.5 w-3.5" />
                          {selectedProject.preset === 'skilltrust_x_ops' ? 'SkillTrust 预设' : '通用项目'}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          发布前人工确认
                        </span>
                      </div>
                      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">{selectedProject.name}</h2>
                      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{summary.objective}</p>
                    </div>
                    <Button asChild><Link href="/app">一键进入当前生成器 <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                  </div>

                  <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">受众</p>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{summary.audience}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">内容支柱</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {summary.pillars.map((pillar) => <span key={pillar} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">{pillar}</span>)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">视觉风格</p>
                      <p className="mt-2 text-sm font-medium text-slate-700">{summary.visualStyle}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">来源</p>
                      <p className="mt-2 text-sm text-slate-600">{summary.sources.length ? `${summary.sources.length} 个固定来源` : '暂无固定来源，最新事实会要求补来源'}</p>
                    </div>
                  </div>
                </div>

                <section
                  data-testid="project-operation-hub"
                  className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">全景中枢概览</p>
                      <h3 className="mt-2 text-xl font-semibold text-slate-950">从数据源到人工确认，一眼看清本项目链路</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        这里把项目上下文、来源治理、智能生成、图文资产和队列状态合成运营摘要；普通用户无需理解模型路由细节。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
                      {(operationNextActions.length ? operationNextActions : ['生成本轮内容', '下载图文包', '进入人工确认']).slice(0, 4).map((label) => (
                        <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {projectHubCards.map((card) => (
                      <div
                        key={card.title}
                        className={cn(
                          'rounded-2xl border p-4',
                          card.tone === 'ready' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
                          card.tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
                          card.tone === 'blocked' && 'border-red-200 bg-red-50 text-red-800',
                          card.tone === 'neutral' && 'border-slate-200 bg-slate-50 text-slate-700'
                        )}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">{card.title}</p>
                        <p className="mt-2 text-sm font-semibold">{card.value}</p>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 opacity-80">{card.description}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm">
                    <h3 className="text-xl font-semibold text-slate-950">生成本轮项目内容</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">项目上下文会在后台注入：目标、受众、内容支柱、视觉风格和发布安全清单；前台只需要写本轮目标。</p>
                    <textarea
                      value={intent}
                      onChange={(event) => setIntent(event.target.value)}
                      rows={5}
                      className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-950 focus:bg-white focus:ring-4 focus:ring-slate-950/10"
                      placeholder="写一句本轮内容目标，例如：把这周 SkillTrust 审计发现整理成 thread"
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      {formatOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setFormat(option.value)}
                          className={cn(
                            'rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950',
                            format === option.value ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <Button className="mt-5 w-full sm:w-auto" onClick={() => void runProjectGeneration()} disabled={!intent.trim() || runLoading}>
                      {runLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      {runLoading ? '正在生成项目内容…' : '生成 thread + 图文资产'}
                    </Button>
                    {runError ? <div className="mt-4"><ErrorState error={runError} onRetry={() => void runProjectGeneration()} /></div> : null}
                    {Object.values(stageEvents).length > 0 ? (
                      <div className="mt-5 grid gap-2 sm:grid-cols-2">
                        {Object.values(stageEvents).map((event) => (
                          <div key={event.stage} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            <span className="font-semibold text-slate-800">{event.label}</span>
                            <span className="ml-2">{event.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm">
                    <h3 className="text-xl font-semibold text-slate-950">发布安全清单</h3>
                    <ul className="mt-4 space-y-3">
                      {summary.checklist.map((item) => (
                        <li key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                      只进入导出与人工确认队列；不会自动发帖、不会真实扣费。
                    </div>
                  </div>
                </div>

                {activeRun?.result ? (
                  <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">生成结果</p>
                        <h3 className="mt-2 text-2xl font-semibold text-slate-950">已关联到 {selectedProject.name}</h3>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void copyResult()}><Copy className="mr-2 h-4 w-4" />复制文本</Button>
                        {bundleUrl ? <Button asChild variant="outline"><a href={bundleUrl}><Download className="mr-2 h-4 w-4" />下载 bundle</a></Button> : null}
                        <Button asChild><Link href={`/queue?highlight=${activeRun.runId}`}>进入人工确认</Link></Button>
                      </div>
                    </div>
                    <pre className="mt-5 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-3xl border border-slate-200 bg-slate-950 p-5 text-sm leading-7 text-slate-50">{normalizeResultText(activeRun.result.text)}</pre>
                    {visualCards.length > 0 ? (
                      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {visualCards.map((asset) => (
                          <a key={asset.id} href={normalizeVisualAssetUrl(asset.assetUrl)} className="rounded-3xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white">
                            <p className="font-semibold text-slate-900">{asset.label}</p>
                            <p className="mt-1 text-xs text-slate-500">{asset.providerLabel} · {asset.exportFormat}</p>
                            <p className="mt-3 text-sm leading-6 text-slate-600">{asset.reason || asset.cue}</p>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="rounded-[32px] border border-slate-200 bg-white/90 p-6 shadow-sm">
                  <h3 className="text-xl font-semibold text-slate-950">最近生成</h3>
                  {detail?.recentRuns.length ? (
                    <div className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-200">
                      {detail.recentRuns.map((run) => (
                        <div key={run.runId} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{run.format} · {run.status}</p>
                            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{run.text || '生成中，稍后刷新项目即可回看。'}</p>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                            <span>{run.visualAssetCount} 个视觉资产</span>
                            <span>{run.publishPrepStatus === 'queued' ? '已入队' : '待人工确认'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="还没有项目生成结果" description="写一句本轮目标，生成后会在这里保留审计记录。" />
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <SuccessNotice message="安全边界：项目工作台只准备内容、导出和人工确认，不执行真实 X 发帖、支付或 OAuth 最终授权。" />
    </AppShell>
  );
}
