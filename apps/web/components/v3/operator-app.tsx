'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Copy, Download, Loader2, PencilLine, RefreshCcw, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getToken } from '../../lib/api';
import { fetchRunStream, type V3StreamEvent } from '../../lib/sse-stream';
import {
  buildArticlePreview,
  buildFreshSourceInputHint,
  buildOperationHubCards,
  buildPrimaryResultHighlights,
  buildPrimarySourceEvidenceCard,
  buildQualityFailureView,
  buildResultDeliveryCopy,
  buildRiskReminderItems,
  buildRunAssetsZipUrl,
  buildRunProgressLabel,
  buildSourceUrlLinePrompt,
  buildSourceFailureView,
  buildThreadPreview,
  getSourceUrlLineSelectionRange,
  buildVisualAnchorTags,
  buildVisualAssetCards,
  formatOperationNextAction,
  formatVisualAssetLabel,
  getResultPreviewMode,
  normalizeVisualAssetUrl
} from '../../lib/v3-result-preview';
import { hydrateRunDetailUntilReady, shouldHydrateRunDetail } from '../../lib/v3-run-hydration';
import {
  confirmPublish,
  connectLocalKnowledgeFiles,
  connectObsidianVault,
  connectSelfX,
  connectTargetX,
  fetchUsageSummary,
  fetchBootstrap,
  fetchProfile,
  fetchQueue,
  fetchRun,
  importKnowledgeUrls,
  preparePublish,
  rebuildProfile,
  retryRunVisualAssets,
  runChat,
  type V3BootstrapResponse,
  type V3Format,
  type V3ProfileResponse,
  type V3QueueResponse,
  type V3RunResponse,
  type UsageSummaryResponse,
  type V3VisualRequest,
  type VisualRequestAspect,
  type VisualRequestLayout,
  type VisualRequestMode,
  type VisualRequestPalette,
  type VisualRequestStyle
} from '../../lib/queries';
import { buildAppTaskHref, getTaskPanelMeta } from '../../lib/v3-ui';
import { normalizeResultText, normalizeStageSummary, summarizeWhySummary } from '../../lib/v3-result-copy';
import { toUiError, type UiError } from '../../lib/ui-error';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, LoadingState, SuccessNotice } from '../ui/state-feedback';
import { useToast } from '../ui/toast';
import OperatorTaskPanel from './operator-task-panel';
import { AppShell } from './shell';

const formatOptions: Array<{ value: V3Format; label: string; description: string }> = [
  { value: 'tweet', label: '短推', description: '单条观点、日常表达、产品动态' },
  { value: 'thread', label: '串推', description: '连续论述、案例拆解、观点展开' },
  { value: 'article', label: '长文', description: '先出长文，再拆成帖子或线程' }
];

const quickPrompts = [
  '帮我发一条关于 AI 产品冷启动的观点短推',
  '参考我最近的风格，写一条更容易引发讨论的 thread',
  '把一次产品更新整理成一条适合 X 的发布文案'
];

const visualModeOptions: Array<{ value: VisualRequestMode; label: string }> = [
  { value: 'auto', label: '自动匹配' },
  { value: 'cover', label: '封面' },
  { value: 'cards', label: '卡片组' },
  { value: 'infographic', label: '信息图' },
  { value: 'article_illustration', label: '文章配图' },
  { value: 'diagram', label: '流程图 / diagram' },
  { value: 'social_pack', label: '社交图文包' }
];

const visualStyleOptions: Array<{ value: VisualRequestStyle; label: string }> = [
  { value: 'draftorbit', label: 'DraftOrbit' },
  { value: 'notion', label: 'Notion 风' },
  { value: 'sketch-notes', label: '手绘笔记' },
  { value: 'blueprint', label: '蓝图' },
  { value: 'minimal', label: '极简' },
  { value: 'bold-editorial', label: '强编辑感' }
];

const visualLayoutOptions: Array<{ value: VisualRequestLayout; label: string }> = [
  { value: 'auto', label: '自动布局' },
  { value: 'sparse', label: '留白' },
  { value: 'balanced', label: '平衡' },
  { value: 'dense', label: '高密度' },
  { value: 'list', label: '列表' },
  { value: 'comparison', label: '对比' },
  { value: 'flow', label: '流程' },
  { value: 'mindmap', label: '思维导图' },
  { value: 'quadrant', label: '四象限' }
];

const visualPaletteOptions: Array<{ value: VisualRequestPalette; label: string }> = [
  { value: 'draftorbit', label: 'DraftOrbit' },
  { value: 'auto', label: '自动' },
  { value: 'macaron', label: '马卡龙' },
  { value: 'warm', label: '暖色' },
  { value: 'neon', label: '霓虹' },
  { value: 'mono', label: '黑白' }
];

const visualAspectOptions: Array<{ value: VisualRequestAspect; label: string }> = [
  { value: 'auto', label: '自动比例' },
  { value: '1:1', label: '1:1 方图' },
  { value: '16:9', label: '16:9 横图' },
  { value: '4:5', label: '4:5 竖图' },
  { value: '2.35:1', label: '2.35:1 宽幅' }
];

const stageOrder = [
  { key: 'research', title: '研究' },
  { key: 'strategy', title: '结构' },
  { key: 'draft', title: '草稿' },
  { key: 'voice', title: '文风' },
  { key: 'media', title: '配图' },
  { key: 'publish_prep', title: '发布前检查' }
] as const;

const SHOW_ROUTING_DEBUG_PANEL = process.env.NEXT_PUBLIC_SHOW_MODEL_ROUTING_PANEL === '1';

const sourceReadyStageSummary: Record<string, string> = {
  research: '已抓取并清洗来源',
  strategy: '已基于来源整理结构',
  draft: '已生成来源驱动草稿',
  voice: '已完成文风收口',
  media: '已按成稿规划图文资产',
  publish_prep: '已完成发布前检查'
};

function qualityLabel(score?: number | null, failed = false) {
  if (failed) return '已拦截，不会进入发布确认';
  if (typeof score !== 'number') return '待评分';
  if (score >= 85) return '可以直接进入确认';
  if (score >= 72) return '建议快速审一下';
  return '建议再来一版';
}

function stageTone(status?: string) {
  if (status === 'done' || status === 'SUCCEEDED') return 'done';
  if (status === 'running' || status === 'queued' || status === 'QUEUED' || status === 'RUNNING') return 'active';
  if (status === 'failed' || status === 'FAILED' || status === 'CANCELED') return 'danger';
  return 'idle';
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatRoutingProviderLabel(provider: string) {
  if (provider === 'codex-local') return 'Codex 本机';
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'openrouter') return 'OpenRouter';
  if (provider === 'ollama') return 'Ollama';
  return provider || 'unknown';
}

function formatUsageEventLabel(eventType: string) {
  if (eventType === 'GENERATION') return '正文生成';
  if (eventType === 'NATURALIZATION') return '文风润色';
  if (eventType === 'IMAGE') return '图文生成';
  if (eventType === 'REPLY') return '自动回复';
  if (eventType === 'PUBLISH') return '发布流程';
  return eventType || '未分类';
}

export default function OperatorApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();

  const [boot, setBoot] = useState<V3BootstrapResponse | null>(null);
  const [profile, setProfile] = useState<V3ProfileResponse | null>(null);
  const [queue, setQueue] = useState<V3QueueResponse | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<UiError | null>(null);
  const [entryNotice, setEntryNotice] = useState<string | null>(null);

  const [intent, setIntent] = useState('');
  const [format, setFormat] = useState<V3Format>('tweet');
  const [withImage, setWithImage] = useState(true);
  const [safeMode, setSafeMode] = useState(true);
  const [visualMode, setVisualMode] = useState<VisualRequestMode>('auto');
  const [visualStyle, setVisualStyle] = useState<VisualRequestStyle>('draftorbit');
  const [visualLayout, setVisualLayout] = useState<VisualRequestLayout>('auto');
  const [visualPalette, setVisualPalette] = useState<VisualRequestPalette>('draftorbit');
  const [visualAspect, setVisualAspect] = useState<VisualRequestAspect>('auto');
  const [exportHtml, setExportHtml] = useState(true);
  const [selectedXAccountId, setSelectedXAccountId] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [runStart, setRunStart] = useState<{ runId: string; streamUrl: string } | null>(null);
  const [runDetail, setRunDetail] = useState<V3RunResponse | null>(null);
  const [stageEvents, setStageEvents] = useState<Record<string, V3StreamEvent>>({});
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<UiError | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualDraft, setManualDraft] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const hydrationPromiseRef = useRef<Promise<V3RunResponse | null> | null>(null);
  const intentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const resultSectionRef = useRef<HTMLElement | null>(null);

  const loadPage = useCallback(async () => {
    if (!getToken()) {
      setPageError({ message: '未登录，请先回首页完成登录。' });
      setLoading(false);
      return;
    }

    setLoading(true);
    setPageError(null);

    try {
      const [bootPayload, profilePayload, queuePayload, usagePayload] = await Promise.all([
        fetchBootstrap(),
        fetchProfile(),
        fetchQueue(12),
        SHOW_ROUTING_DEBUG_PANEL ? fetchUsageSummary().catch(() => null) : Promise.resolve(null)
      ]);

      setBoot(bootPayload);
      setProfile(profilePayload);
      setQueue(queuePayload);
      setUsageSummary(usagePayload);
      setSelectedXAccountId((current) => current || bootPayload.defaultXAccount?.id || profilePayload.xAccounts[0]?.id || '');
    } catch (error) {
      setPageError(toUiError(error, '加载生成器失败，请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    const from = searchParams.get('from');
    if (from === 'auth-login') setEntryNotice('登录完成。现在直接写一句话就能开始生成。');
  }, [searchParams]);

  const activeTaskAction = searchParams.get('nextAction');
  const activeTaskMeta = useMemo(() => getTaskPanelMeta(activeTaskAction), [activeTaskAction]);
  const activeTaskHref = useMemo(() => buildAppTaskHref(runError?.nextAction ?? boot?.suggestedAction), [boot?.suggestedAction, runError?.nextAction]);
  const activeTaskMetaFromError = useMemo(() => getTaskPanelMeta(runError?.nextAction ?? boot?.suggestedAction), [boot?.suggestedAction, runError?.nextAction]);

  const selectedAccount = useMemo(
    () => profile?.xAccounts.find((item) => item.id === selectedXAccountId) ?? null,
    [profile?.xAccounts, selectedXAccountId]
  );

  const activeFormat = useMemo(
    () => formatOptions.find((item) => item.value === format) ?? formatOptions[0],
    [format]
  );
  const routingProviderHealth = useMemo(
    () => usageSummary?.modelRouting?.providerHealth ?? [],
    [usageSummary?.modelRouting?.providerHealth]
  );
  const routingFallbackHotspots = useMemo(
    () => usageSummary?.modelRouting?.fallbackHotspots ?? [],
    [usageSummary?.modelRouting?.fallbackHotspots]
  );
  const routingProbe = usageSummary?.modelRouting?.healthProbe;
  const routingProfile = usageSummary?.modelRouting?.profile ?? 'unknown';

  const visualRequest = useMemo<V3VisualRequest>(
    () => ({
      mode: visualMode,
      style: visualStyle,
      layout: visualLayout,
      palette: visualPalette,
      aspect: visualAspect,
      exportHtml
    }),
    [exportHtml, visualAspect, visualLayout, visualMode, visualPalette, visualStyle]
  );
  const freshSourceInputHint = useMemo(
    () => buildFreshSourceInputHint(intent),
    [intent]
  );

  const stageProgress = useMemo(
    () =>
      stageOrder.map((stage) => ({
        ...stage,
        event: stageEvents[stage.key],
        summary: normalizeStageSummary(stageEvents[stage.key]?.summary),
        tone: stageTone(stageEvents[stage.key]?.status)
      })),
    [stageEvents]
  );

  const cleanedWhySummary = useMemo(
    () => summarizeWhySummary(runDetail?.result?.whySummary ?? []),
    [runDetail?.result?.whySummary]
  );

  const cleanedResultText = useMemo(
    () => normalizeResultText(runDetail?.result?.text ?? ''),
    [runDetail?.result?.text]
  );

  const previewMode = useMemo(
    () => (runDetail ? getResultPreviewMode(runDetail.format) : null),
    [runDetail]
  );

  const threadPreview = useMemo(
    () => (runDetail?.format === 'thread' ? buildThreadPreview(cleanedResultText) : []),
    [cleanedResultText, runDetail?.format]
  );

  const articlePreview = useMemo(
    () => (runDetail?.format === 'article' ? buildArticlePreview(cleanedResultText) : null),
    [cleanedResultText, runDetail?.format]
  );

  const qualityHighlights = useMemo(
    () => buildPrimaryResultHighlights(runDetail?.result ?? null),
    [runDetail?.result]
  );
  const visualAnchorTags = useMemo(
    () =>
      buildVisualAnchorTags({
        primaryAsset: runDetail?.result?.visualPlan?.primaryAsset ?? null,
        visualizablePoints: runDetail?.result?.visualPlan?.visualizablePoints ?? null,
        keywords: runDetail?.result?.imageKeywords ?? []
      }),
    [runDetail?.result?.imageKeywords, runDetail?.result?.visualPlan]
  );
  const visualAssetCards = useMemo(
    () => buildVisualAssetCards(runDetail?.result?.visualAssets ?? []),
    [runDetail?.result?.visualAssets]
  );
  const readyVisualAssetCards = useMemo(
    () => visualAssetCards.filter((asset) => asset.canPreview),
    [visualAssetCards]
  );
  const readyExportAssetCards = useMemo(
    () => visualAssetCards.filter((asset) => asset.status === 'ready' && asset.isExport && asset.assetUrl),
    [visualAssetCards]
  );
  const failedVisualAssetCards = useMemo(
    () => visualAssetCards.filter((asset) => asset.status === 'failed'),
    [visualAssetCards]
  );
  const visualAssetsZipUrl = useMemo(
    () =>
      runDetail?.result?.visualAssetsBundleUrl
        ? normalizeVisualAssetUrl(runDetail.result.visualAssetsBundleUrl)
        : buildRunAssetsZipUrl(runDetail?.runId),
    [runDetail?.result?.visualAssetsBundleUrl, runDetail?.runId]
  );
  const qualityGateFailed =
    runDetail?.result?.qualityGate?.status === 'failed' || runDetail?.result?.qualityGate?.safeToDisplay === false;
  const qualityGateHardFails = runDetail?.result?.qualityGate?.hardFails ?? [];
  const visualHardFails = runDetail?.result?.qualityGate?.visualHardFails ?? [];
  const qualityGateNotes = runDetail?.result?.qualityGate?.judgeNotes ?? [];
  const sourceFailureView = useMemo(
    () => buildSourceFailureView(runDetail?.result ?? null),
    [runDetail?.result]
  );
  const qualityFailureView = useMemo(
    () => buildQualityFailureView(runDetail?.result ?? null),
    [runDetail?.result]
  );
  const deliveryCopy = useMemo(
    () =>
      buildResultDeliveryCopy({
        qualityGateFailed,
        sourceFailureView,
        qualityFailureView
      }),
    [qualityFailureView, qualityGateFailed, sourceFailureView]
  );
  const riskReminderItems = useMemo(
    () =>
      buildRiskReminderItems({
        sourceFailureView,
        riskFlags: runDetail?.result?.riskFlags ?? [],
        hasReadySource: Boolean((runDetail?.result?.sourceArtifacts ?? []).some((artifact) => artifact.status === 'ready')),
        qualityGateFailed
      }),
    [qualityGateFailed, runDetail?.result?.riskFlags, runDetail?.result?.sourceArtifacts, sourceFailureView]
  );
  const currentStageLabel = useMemo(() => {
    const active = [...Object.values(stageEvents)].reverse().find((event) => event.status === 'running');
    const suggestedActionTitle =
      boot?.suggestedAction && getTaskPanelMeta(boot.suggestedAction)
        ? (getTaskPanelMeta(boot.suggestedAction)?.title ?? '继续当前任务')
        : null;
    return buildRunProgressLabel({
      activeStageLabel: active?.label,
      runLoading,
      hasResult: Boolean(runDetail?.result),
      sourceFailureView,
      qualityFailureView,
      suggestedActionTitle
    });
  }, [boot?.suggestedAction, qualityFailureView, runDetail?.result, runLoading, sourceFailureView, stageEvents]);
  const stageProgressForDisplay = useMemo(
    () =>
      sourceFailureView
        ? stageProgress.map((stage) => ({
            ...stage,
            summary: stage.key === 'research' ? '已拦截：需要可靠来源' : '等待可靠来源后继续',
            tone: stage.key === 'research' ? 'danger' : 'idle'
          }))
        : runDetail?.result?.qualityGate?.sourceRequired && runDetail.result.qualityGate.sourceStatus === 'ready'
          ? stageProgress.map((stage) => ({
              ...stage,
              summary: stage.tone === 'idle' ? '等待中' : (sourceReadyStageSummary[stage.key] ?? '已基于来源处理')
            }))
        : stageProgress,
    [runDetail?.result?.qualityGate?.sourceRequired, runDetail?.result?.qualityGate?.sourceStatus, sourceFailureView, stageProgress]
  );
  const sourceCandidateArtifacts = useMemo(
    () =>
      (runDetail?.result?.sourceArtifacts ?? [])
        .filter((artifact) => artifact.url && (artifact.status === 'skipped' || artifact.error === 'source_ambiguous'))
        .slice(0, 4),
    [runDetail?.result?.sourceArtifacts]
  );
  const sourceEvidenceArtifacts = useMemo(
    () => (runDetail?.result?.sourceArtifacts ?? []).filter((artifact) => artifact.url || artifact.title).slice(0, 6),
    [runDetail?.result?.sourceArtifacts]
  );
  const primarySourceEvidenceCard = useMemo(
    () => buildPrimarySourceEvidenceCard(runDetail?.result?.sourceArtifacts ?? []),
    [runDetail?.result?.sourceArtifacts]
  );
  const operationHubCards = useMemo(
    () => buildOperationHubCards(runDetail?.result?.operationSummary ?? null),
    [runDetail?.result?.operationSummary]
  );
  const operationNextActionLabels = useMemo(
    () => (runDetail?.result?.operationSummary?.workflow.nextActions ?? []).map(formatOperationNextAction),
    [runDetail?.result?.operationSummary?.workflow.nextActions]
  );

  const focusIntentInput = useCallback(() => {
    requestAnimationFrame(() => {
      intentInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      intentInputRef.current?.focus();
    });
  }, []);

  const handleSourceUrlRetry = useCallback(() => {
    const nextIntent = buildSourceUrlLinePrompt(intent);
    setIntent(nextIntent);
    requestAnimationFrame(() => {
      const input = intentInputRef.current;
      if (!input) return;
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();
      input.scrollTop = input.scrollHeight;
      const selection = getSourceUrlLineSelectionRange(nextIntent);
      if (selection) {
        input.setSelectionRange(selection.start, selection.end);
      }
    });
  }, [intent]);

  const scrollToResultSection = useCallback(() => {
    requestAnimationFrame(() => {
      resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  useEffect(() => {
    if (!runDetail?.result) return;
    scrollToResultSection();
  }, [runDetail?.runId, runDetail?.result, scrollToResultSection]);

  const handleNonFreshRetry = useCallback(() => {
    const nextIntent = intent
      .replace(/最新的?|今天|刚刚|刚|新闻|版本|发布会|产品发布|发布了|更新|价格/gu, '')
      .replace(/\s+/gu, ' ')
      .replace(/关于\s+的/gu, '关于')
      .trim();
    setIntent(nextIntent || intent);
    focusIntentInput();
  }, [focusIntentInput, intent]);

  const exportArticleAction = useCallback(
    async (text: string) => {
      await navigator.clipboard.writeText(text);
      pushToast({
        title: '长文已复制',
        description: '请直接粘贴到 X 文章编辑器继续发布。',
        variant: 'success'
      });
    },
    [pushToast]
  );

  const copyAssetText = useCallback(
    async (assetUrl: string | undefined, label: string) => {
      if (!assetUrl) return;
      const response = await fetch(assetUrl);
      if (!response.ok) throw new Error(`导出资产读取失败：${response.status}`);
      await navigator.clipboard.writeText(await response.text());
      pushToast({
        title: `${label} 已复制`,
        description: '可以粘贴到编辑器、CMS 或本地文档继续使用。',
        variant: 'success'
      });
    },
    [pushToast]
  );

  const hydrateRunDetail = useCallback(async (runId: string) => {
    if (hydrationPromiseRef.current) return hydrationPromiseRef.current;

    hydrationPromiseRef.current = hydrateRunDetailUntilReady(fetchRun, runId)
      .then((detail) => {
        if (detail?.result) {
          setRunDetail(detail);
          setManualDraft(normalizeResultText(detail.result.text ?? ''));
        }
        return detail;
      })
      .finally(() => {
        hydrationPromiseRef.current = null;
      });

    return hydrationPromiseRef.current;
  }, []);

  const runPipeline = useCallback(async (customIntent?: string) => {
    const finalIntent = (customIntent ?? intent).trim();
    if (!finalIntent) {
      setRunError({ message: '先写一句你想发的内容目标。' });
      return;
    }

    setRunLoading(true);
    setRunError(null);
    setRunDetail(null);
    setRunStart(null);
    setStageEvents({});
    setManualMode(false);
    hydrationPromiseRef.current = null;

    try {
      const started = await runChat({
        intent: finalIntent,
        format,
        withImage,
        xAccountId: selectedXAccountId || undefined,
        safeMode,
        visualRequest: withImage ? visualRequest : undefined
      });

      setRunStart({ runId: started.runId, streamUrl: started.streamUrl });

      await fetchRunStream(started.runId, (event) => {
        setStageEvents((prev) => ({ ...prev, [event.stage]: event }));
        if (shouldHydrateRunDetail(event)) {
          void hydrateRunDetail(started.runId);
        }
      });

      const detail = await fetchRun(started.runId);
      setRunDetail(detail);
      setManualDraft(normalizeResultText(detail.result?.text ?? ''));
      await loadPage();
    } catch (error) {
      setRunError(toUiError(error, '生成失败，请稍后重试。'));
    } finally {
      hydrationPromiseRef.current = null;
      setRunLoading(false);
    }
  }, [format, hydrateRunDetail, intent, loadPage, safeMode, selectedXAccountId, visualRequest, withImage]);

  const handleQueueAction = useCallback(async () => {
    if (!runDetail?.runId) return;

    setBusyAction('queue-result');
    setRunError(null);

    try {
      if (runDetail.format === 'article') {
        await exportArticleAction(manualMode ? manualDraft : cleanedResultText);
        return;
      }

      if (safeMode) {
        const preview = await preparePublish({
          runId: runDetail.runId,
          xAccountId: selectedXAccountId || undefined,
          safeMode: true
        });

        if (preview.blockingReason) {
          throw new Error(preview.blockingReason === 'NO_ACTIVE_X_ACCOUNT' ? '当前没有可用 X 账号，请先完成连接。' : preview.blockingReason);
        }

        await loadPage();
        const href = buildAppTaskHref('open_queue', { highlight: runDetail.runId });
        if (href) router.replace(href);
        return;
      }

      await confirmPublish({
        runId: runDetail.runId,
        xAccountId: selectedXAccountId || undefined,
        safeMode: false
      });
      await loadPage();
      const href = buildAppTaskHref('open_queue', { published: runDetail.runId });
      if (href) router.replace(href);
    } catch (error) {
      setRunError(toUiError(error, '加入队列失败，请稍后重试。'));
    } finally {
      setBusyAction(null);
    }
  }, [
    cleanedResultText,
    exportArticleAction,
    loadPage,
    manualDraft,
    manualMode,
    router,
    runDetail?.format,
    runDetail?.runId,
    safeMode,
    selectedXAccountId
  ]);

  const handleRetryImages = useCallback(async () => {
    if (!runDetail) return;
    setBusyAction('retry-assets');
    setRunError(null);
    try {
      const refreshed = await retryRunVisualAssets(runDetail.runId, visualRequest);
      setRunDetail(refreshed);
      pushToast({
        title: '图片已重新生成',
        description: '只刷新图文资产，正文保持不变。',
        variant: 'success'
      });
    } catch (error) {
      setRunError(toUiError(error, '只重试图片失败，请稍后再试。'));
    } finally {
      setBusyAction(null);
    }
  }, [pushToast, runDetail, visualRequest]);

  const runTaskAction = useCallback(async (action: () => Promise<void>, busyKey: string, errorMessage: string) => {
    setBusyAction(busyKey);
    setRunError(null);
    try {
      await action();
    } catch (error) {
      setRunError(toUiError(error, errorMessage));
      throw error;
    } finally {
      setBusyAction(null);
    }
  }, []);

  const connectSelfAction = useCallback(
    async () =>
      runTaskAction(async () => {
        const { url } = await connectSelfX();
        window.location.href = url;
      }, 'x-self', '拉起 X 连接失败，请稍后重试。'),
    [runTaskAction]
  );

  const rebuildProfileAction = useCallback(
    async () =>
      runTaskAction(async () => {
        await rebuildProfile();
        await loadPage();
        pushToast({ title: '画像已更新', description: '现在可以回到主界面继续生成。', variant: 'success' });
        router.replace('/app');
      }, 'rebuild-profile', '重建画像失败，请稍后重试。'),
    [loadPage, pushToast, router, runTaskAction]
  );

  const connectTargetAction = useCallback(
    async (value: string) =>
      runTaskAction(async () => {
        await connectTargetX(value);
        await loadPage();
        pushToast({ title: '学习样本已补充', description: '返回主界面后，下一条会优先参考这份样本。', variant: 'success' });
        router.replace('/app');
      }, 'x-target', '补充学习样本失败，请稍后重试。'),
    [loadPage, pushToast, router, runTaskAction]
  );

  const importUrlsAction = useCallback(
    async (urls: string[]) =>
      runTaskAction(async () => {
        await importKnowledgeUrls({ urls });
        await loadPage();
        pushToast({ title: '链接已导入', description: '现在可以回到主界面继续生成。', variant: 'success' });
        router.replace('/app');
      }, 'urls', '导入链接失败，请稍后重试。'),
    [loadPage, pushToast, router, runTaskAction]
  );

  const connectObsidianAction = useCallback(
    async (vaultPath: string) =>
      runTaskAction(async () => {
        await connectObsidianVault({ vaultPath });
        await loadPage();
        pushToast({ title: 'Obsidian 已接入', description: '现在可以回到主界面继续生成。', variant: 'success' });
        router.replace('/app');
      }, 'obsidian', '接入 Obsidian 失败，请稍后重试。'),
    [loadPage, pushToast, router, runTaskAction]
  );

  const connectLocalFilesAction = useCallback(
    async (paths: string[]) =>
      runTaskAction(async () => {
        await connectLocalKnowledgeFiles({ paths });
        await loadPage();
        pushToast({ title: '本地文件已导入', description: '现在可以回到主界面继续生成。', variant: 'success' });
        router.replace('/app');
      }, 'local-files', '导入本地文件失败，请稍后重试。'),
    [loadPage, pushToast, router, runTaskAction]
  );

  const confirmQueueItemAction = useCallback(
    async (runId: string) =>
      runTaskAction(async () => {
        await confirmPublish({ runId, safeMode: false });
        await loadPage();
        const href = buildAppTaskHref('open_queue', { published: runId });
        if (href) router.replace(href);
      }, `confirm-${runId}`, '确认发布失败，请稍后重试。'),
    [loadPage, router, runTaskAction]
  );

  const exportQueueItemAction = useCallback(
    async (text: string) =>
      runTaskAction(async () => {
        await exportArticleAction(text);
      }, 'export-article', '复制长文失败，请稍后重试。'),
    [exportArticleAction, runTaskAction]
  );

  if (loading) {
    return (
      <AppShell
        eyebrow="生成器"
        title="你说一句话，DraftOrbit 帮你产出可发的 X 内容"
        description="默认先生成，再由你决定是否发出去。"
      >
        <LoadingState title="正在加载生成器" description="读取账号、画像和待处理状态。" />
      </AppShell>
    );
  }

  if (pageError) {
    return (
      <AppShell
        eyebrow="生成器"
        title="你说一句话，DraftOrbit 帮你产出可发的 X 内容"
        description="默认先生成，再由你决定是否发出去。"
      >
        <ErrorState error={pageError} onRetry={() => void loadPage()} actionHref="/" actionLabel="返回首页" />
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="生成器"
      title="你说一句话，DraftOrbit 帮你产出可发的 X 内容"
      description="写一句话即可。默认先生成，再由你决定是否发出去。"
      actions={
        <Button asChild variant="outline">
          <Link href="/projects">项目运营工作台</Link>
        </Button>
      }
    >
      {entryNotice ? <SuccessNotice message={entryNotice} /> : null}

      {runError ? (
        <ErrorState
          error={runError}
          onRetry={() => void runPipeline()}
          actionHref={activeTaskHref ?? undefined}
          actionLabel={activeTaskMetaFromError?.primaryLabel}
        />
      ) : null}

      <section className="mx-auto w-full max-w-4xl space-y-6">
        {boot?.suggestedAction && getTaskPanelMeta(boot.suggestedAction) ? (
          <div className="do-panel-soft flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">可选下一步</p>
              <p className="mt-1 text-sm text-slate-700">{getTaskPanelMeta(boot.suggestedAction)?.title}</p>
              <p className="mt-1 text-xs text-slate-500">这会提升后续结果质量，但不会挡住你先生成。</p>
            </div>
            {buildAppTaskHref(boot.suggestedAction) ? (
              <Button asChild size="sm" variant="outline">
                <Link href={buildAppTaskHref(boot.suggestedAction) ?? '/app'}>
                  {getTaskPanelMeta(boot.suggestedAction)?.primaryLabel}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        {SHOW_ROUTING_DEBUG_PANEL ? (
        <article className="do-panel-soft p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">模型路由观测</p>
              <p className="mt-1 text-sm text-slate-700">展示 provider 健康与 fallback 热点，不影响你继续生成。</p>
            </div>
            <span className="do-chip">profile: {routingProfile}</span>
          </div>

          {!usageSummary ? (
            <p className="mt-3 rounded-xl border border-slate-900/10 bg-white px-3 py-3 text-sm text-slate-500">
              暂时拿不到路由观测数据，生成流程仍可正常使用。
            </p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-900/10 bg-white px-3 py-3">
                    <p className="text-xs text-slate-500">模型调用数</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{usageSummary.modelRouting.totalCalls ?? 0}</p>
                  </div>
                  <div className="rounded-xl border border-slate-900/10 bg-white px-3 py-3">
                    <p className="text-xs text-slate-500">Fallback 比例</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">{formatPercent(usageSummary.modelRouting.fallbackRate)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-900/10 bg-white px-3 py-3">
                    <p className="text-xs text-slate-500">平均质量分</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">
                      {Number.isFinite(usageSummary.modelRouting.avgQualityScore)
                        ? usageSummary.modelRouting.avgQualityScore.toFixed(1)
                        : '—'}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-900/10 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Provider 健康探针 {routingProbe?.enabled ? '(enabled)' : '(disabled)'}
                  </p>
                  {routingProbe?.enabled ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      window {(routingProbe.windowMs / 1000).toFixed(0)}s · cooldown {(routingProbe.cooldownMs / 1000).toFixed(0)}s
                    </p>
                  ) : null}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {routingProviderHealth.map((item) => (
                      <div
                        key={item.provider}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-xs',
                          item.coolingDown
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : item.healthy
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-rose-200 bg-rose-50 text-rose-800'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{formatRoutingProviderLabel(item.provider)}</span>
                          {item.coolingDown ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </div>
                        <p className="mt-1">
                          failure {formatPercent(item.failureRate)} · samples {item.sampleSize}
                        </p>
                        <p className="mt-0.5">连续失败 {item.consecutiveFailures}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-900/10 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Fallback 热点</p>
                <p className="mt-1 text-[11px] text-slate-500">按 fallback 命中次数排序，优先看最常出问题的 lane。</p>
                {routingFallbackHotspots.length ? (
                  <ul className="mt-3 space-y-2">
                    {routingFallbackHotspots.map((hotspot) => (
                      <li key={hotspot.lane} className="rounded-lg border border-slate-900/10 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {formatUsageEventLabel(hotspot.eventType)} · {formatRoutingProviderLabel(hotspot.provider)}
                          </span>
                          <span>{formatPercent(hotspot.fallbackRate)}</span>
                        </div>
                        <p className="mt-1 text-slate-500">
                          fallback {hotspot.fallbackHits} / {hotspot.totalCalls}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    本周期还没有明显 fallback 热点。
                  </p>
                )}
              </div>
            </div>
          )}
        </article>
        ) : null}

        <article ref={resultSectionRef} className="do-panel scroll-mt-24 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">创作目标</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">写一句话，后台完成策略、正文和图文资产</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">普通用户只需要选择交付形态；来源校验、内容策略、视觉规划和发布前检查都在后台处理。</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <span className="do-chip">{selectedAccount?.handle ? `当前账号 @${selectedAccount.handle}` : '未连接 X 账号 · 仍可先生成'}</span>
              <span className="do-chip">{safeMode ? '默认先确认' : '直接发已开启'}</span>
              <span className="do-chip">待确认 {queue?.review.length ?? 0}</span>
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {formatOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={cn(
                  'rounded-2xl border px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30',
                  format === item.value
                    ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                    : 'border-slate-900/10 bg-white text-slate-700 hover:border-slate-900/20 hover:bg-slate-50'
                )}
                onClick={() => setFormat(item.value)}
              >
                <span className="block font-semibold">{item.label}</span>
                <span className={cn('mt-1 block text-xs leading-5', format === item.value ? 'text-slate-300' : 'text-slate-500')}>
                  {item.description}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {quickPrompts.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-full border border-slate-900/10 bg-slate-50 px-3 py-2 text-left text-xs text-slate-700 transition hover:border-slate-900/20 hover:bg-slate-100"
                onClick={() => setIntent(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <textarea
            data-testid="operator-intent-input"
            ref={intentInputRef}
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            placeholder="例如：参考我最近的风格，写一条关于 AI 产品冷启动的观点短推。"
            className="mt-5 min-h-[180px] w-full rounded-[24px] border border-slate-900/10 bg-white px-5 py-4 text-base leading-7 text-slate-900 shadow-inner shadow-slate-100/80 placeholder:text-slate-400"
          />

          {freshSourceInputHint ? (
            <div
              data-testid="fresh-source-input-hint"
              data-tone={freshSourceInputHint.tone}
              role="note"
              className={cn(
                'mt-3 rounded-2xl border px-4 py-3 text-sm',
                freshSourceInputHint.tone === 'ready'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-2">
                  {freshSourceInputHint.tone === 'ready' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold">{freshSourceInputHint.title}</p>
                    <p className={cn('mt-1 leading-6', freshSourceInputHint.tone === 'ready' ? 'text-emerald-800' : 'text-amber-800')}>
                      {freshSourceInputHint.description}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(
                    'shrink-0 bg-white',
                    freshSourceInputHint.tone === 'ready'
                      ? 'border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                      : 'border-amber-300 text-amber-900 hover:bg-amber-100'
                  )}
                  onClick={freshSourceInputHint.tone === 'ready' ? undefined : handleSourceUrlRetry}
                >
                  {freshSourceInputHint.primaryAction}
                </Button>
              </div>
            </div>
          ) : null}

          <details className="mt-4 rounded-2xl border border-slate-900/10 bg-slate-50 p-4" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">高级选项</summary>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-4">
                <label className="rounded-2xl border border-slate-900/10 bg-white p-4 text-sm text-slate-700">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">配图</span>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">生成图文资产</p>
                      <p className="text-xs leading-5 text-slate-500">后台生成封面、卡片与信息图，前台只展示成品</p>
                    </div>
                    <input type="checkbox" checked={withImage} onChange={(event) => setWithImage(event.target.checked)} className="h-4 w-4" />
                  </div>
                </label>

                <div className="rounded-2xl border border-slate-900/10 bg-white p-4 text-sm text-slate-700">
                  <div className="flex items-start justify-between gap-3">
	                    <div>
	                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">图文能力</span>
	                      <p className="mt-2 font-medium text-slate-900">封面、卡片、信息图、diagram 与导出包</p>
	                      <p className="mt-1 text-xs leading-5 text-slate-500">
	                        后台根据最终正文生成视觉规格，再渲染成可复制、下载和人工确认的资产。
	                      </p>
	                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                      图文包
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="block text-xs font-medium text-slate-500">视觉模式</span>
                      <select
                        name="visualMode"
                        value={visualMode}
                        onChange={(event) => setVisualMode(event.target.value as VisualRequestMode)}
                        className="w-full rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-sm"
                      >
                        {visualModeOptions.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs font-medium text-slate-500">风格</span>
                      <select
                        name="visualStyle"
                        value={visualStyle}
                        onChange={(event) => setVisualStyle(event.target.value as VisualRequestStyle)}
                        className="w-full rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-sm"
                      >
                        {visualStyleOptions.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs font-medium text-slate-500">布局</span>
                      <select
                        name="visualLayout"
                        value={visualLayout}
                        onChange={(event) => setVisualLayout(event.target.value as VisualRequestLayout)}
                        className="w-full rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-sm"
                      >
                        {visualLayoutOptions.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs font-medium text-slate-500">配色</span>
                      <select
                        name="visualPalette"
                        value={visualPalette}
                        onChange={(event) => setVisualPalette(event.target.value as VisualRequestPalette)}
                        className="w-full rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-sm"
                      >
                        {visualPaletteOptions.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="block text-xs font-medium text-slate-500">比例</span>
                      <select
                        name="visualAspect"
                        value={visualAspect}
                        onChange={(event) => setVisualAspect(event.target.value as VisualRequestAspect)}
                        className="w-full rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-sm"
                      >
                        {visualAspectOptions.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-900/10 bg-slate-50 px-3 py-2">
                      <span>
                        <span className="block text-xs font-medium text-slate-700">导出 HTML/Markdown</span>
                        <span className="block text-[11px] leading-4 text-slate-500">打包成可下载资产</span>
                      </span>
                      <input
                        name="exportHtml"
                        type="checkbox"
                        checked={exportHtml}
                        onChange={(event) => setExportHtml(event.target.checked)}
                        className="h-4 w-4"
                      />
                    </label>
                  </div>
                </div>

                <label className="rounded-2xl border border-slate-900/10 bg-white p-4 text-sm text-slate-700">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">安全模式</span>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">先人工确认</p>
                      <p className="text-xs leading-5 text-slate-500">关闭后会在通过检查后直接进入发布队列</p>
                    </div>
                    <input type="checkbox" checked={safeMode} onChange={(event) => setSafeMode(event.target.checked)} className="h-4 w-4" />
                  </div>
                </label>

                <label className="rounded-2xl border border-slate-900/10 bg-white p-4 text-sm text-slate-700">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">发布账号</span>
                  <select value={selectedXAccountId} onChange={(event) => setSelectedXAccountId(event.target.value)} className="w-full">
                    {profile?.xAccounts.length ? (
                      profile.xAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          @{account.handle} · {account.status}
                          {account.isDefault ? ' · 默认' : ''}
                        </option>
                      ))
                    ) : (
                      <option value="">未连接 X 账号</option>
                    )}
                  </select>
                </label>
              </div>
            </div>
          </details>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button size="lg" disabled={runLoading} onClick={() => void runPipeline()}>
              {runLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {runLoading ? '正在生成…' : '开始生成'}
            </Button>
            <Button size="lg" variant="outline" disabled={runLoading || !intent.trim()} onClick={() => void runPipeline(intent)}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              再来一版
            </Button>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-900/10 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            现在：{currentStageLabel}
          </div>

          {runDetail?.result ? (
            <button
              type="button"
              onClick={scrollToResultSection}
              className="mt-3 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
            >
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              结果已生成，查看下方结果
            </button>
          ) : null}

          {(runLoading || Object.keys(stageEvents).length > 0) ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {stageProgressForDisplay.map((stage) => (
                <div
                  key={stage.key}
                  className={cn(
                    'rounded-2xl border px-3 py-3 text-sm',
                    stage.tone === 'done' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
                    stage.tone === 'active' && 'border-sky-200 bg-sky-50 text-sky-800',
                    stage.tone === 'danger' && 'border-red-200 bg-red-50 text-red-700',
                    stage.tone === 'idle' && 'border-slate-900/10 bg-white text-slate-500'
                  )}
                >
                  <p className="font-medium">{stage.title}</p>
                  <p className="mt-1 text-xs leading-5">{stage.summary ?? (stage.tone === 'idle' ? '等待中' : stage.event?.label ?? '处理中')}</p>
                </div>
              ))}
            </div>
          ) : null}
        </article>

        <article className="do-panel p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">结果区</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">{qualityGateFailed ? '未交付结果' : '生成结果'}</h2>
            </div>
            {runStart?.runId ? (
              <span className="rounded-full border border-slate-900/10 bg-slate-100 px-3 py-1 text-xs text-slate-600">
                runId: {runStart.runId.slice(0, 8)}…
              </span>
            ) : null}
          </div>

          {!runDetail?.result ? (
            runLoading ? (
              <LoadingState title="正在生成结果" description="完成后会直接出现在这里，你无需切换页面。" />
            ) : (
              <EmptyState title="结果会出现在这里" description="先写一句话并点击“开始生成”，结果准备好后会直接显示。" />
            )
          ) : (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 md:grid-cols-[minmax(0,0.85fr)_1.15fr]">
                <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">当前状态</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {deliveryCopy.title}
                  </p>
                  <p className={cn('mt-2 text-sm leading-6', deliveryCopy.tone === 'danger' ? 'font-medium text-red-600' : 'text-slate-500')}>
                    {deliveryCopy.description}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">这一版重点</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {qualityGateFailed ? (
                      <>
                        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">坏稿已拦截</span>
                        <span className="rounded-full border border-slate-900/10 bg-white px-3 py-1.5 text-xs text-slate-600">
                          {sourceFailureView ? '请补充可靠来源或改成非最新主题' : '请再来一版或缩小主题'}
                        </span>
                      </>
                    ) : qualityHighlights.length ? qualityHighlights.map((item) => (
                      <span key={item} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{item}</span>
                    )) : null}
                    {!qualityGateFailed && cleanedWhySummary.length ? cleanedWhySummary.map((item) => (
                      <span key={item} className="rounded-full border border-slate-900/10 bg-white px-3 py-1.5 text-xs text-slate-600">{item}</span>
                    )) : null}
                    {!qualityGateFailed && !cleanedWhySummary.length && !qualityHighlights.length ? (
                      <span className="text-sm text-slate-500">这次主要按你输入的这句话直接生成。</span>
                    ) : null}
                  </div>
                </div>
              </div>

              {operationHubCards.length ? (
                <section
                  data-testid="operation-hub-overview"
                  className="rounded-[24px] border border-slate-900/10 bg-white p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">智能中枢概览</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-950">数据、治理、生成、资产和人工确认在同一条链路里</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        后台已完成阶段编排，前台只展示可操作状态和下一步，不暴露模型路由或调试细节。
                      </p>
                    </div>
                    {operationNextActionLabels.length ? (
                      <div className="flex flex-wrap gap-2 sm:max-w-sm sm:justify-end">
                        {operationNextActionLabels.slice(0, 4).map((label) => (
                          <span key={label} className="rounded-full border border-slate-900/10 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {operationHubCards.map((card) => (
                      <div
                        key={card.title}
                        className={cn(
                          'rounded-2xl border p-3',
                          card.tone === 'ready' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
                          card.tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900',
                          card.tone === 'blocked' && 'border-red-200 bg-red-50 text-red-800',
                          card.tone === 'neutral' && 'border-slate-900/10 bg-slate-50 text-slate-700'
                        )}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">{card.title}</p>
                        <p className="mt-2 text-sm font-semibold">{card.value}</p>
                        <p className="mt-1 line-clamp-3 text-xs leading-5 opacity-80">{card.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {primarySourceEvidenceCard ? (
                <a
                  data-testid="primary-source-evidence-card"
                  href={primarySourceEvidenceCard.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 transition hover:border-emerald-300 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                >
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{primarySourceEvidenceCard.title}</p>
                      <p className="mt-1 break-words font-medium text-emerald-950">{primarySourceEvidenceCard.sourceTitle}</p>
                      <p className="mt-1 leading-6 text-emerald-800">{primarySourceEvidenceCard.description}</p>
                    </div>
                  </div>
                </a>
              ) : null}

              <div className="rounded-[24px] border border-slate-900/10 bg-slate-950 p-5 text-white shadow-inner shadow-slate-900/30">
                {qualityGateFailed ? (
                  <div className="rounded-2xl border border-red-300/40 bg-red-500/10 p-5">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-red-200" />
                      <div>
                        <p className="text-sm font-semibold text-red-100">
                          {sourceFailureView?.title ?? qualityFailureView?.title ?? '这版还没达到可发布标准'}
                        </p>
                        <p className="mt-2 text-sm leading-7 text-red-100/80">
                          {sourceFailureView?.description ??
                            qualityFailureView?.description ??
                            'DraftOrbit 已拦截坏稿，没有把它交给你发布。建议直接再来一版，或把主题写得更具体。'}
                        </p>
                      </div>
                    </div>
                    {sourceFailureView ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={handleSourceUrlRetry}>
                          {sourceFailureView.primaryAction}
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="border-red-200/30 bg-red-950/20 text-red-50 hover:bg-red-950/30" onClick={handleNonFreshRetry}>
                          {sourceFailureView.secondaryAction}
                        </Button>
                      </div>
                    ) : qualityFailureView ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={() => void runPipeline(intent)}>
                          <RefreshCcw className="mr-2 h-4 w-4" />
                          {qualityFailureView.primaryAction}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-red-200/30 bg-red-950/20 text-red-50 hover:bg-red-950/30"
                          onClick={focusIntentInput}
                        >
                          {qualityFailureView.secondaryAction}
                        </Button>
                      </div>
                    ) : null}
                    {sourceFailureView && sourceCandidateArtifacts.length ? (
                      <div className="mt-4 grid gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-100/70">候选来源</p>
                        {sourceCandidateArtifacts.map((artifact) => (
                          <a
                            key={`${artifact.title ?? artifact.url}-${artifact.url}`}
                            href={artifact.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-2xl border border-red-200/30 bg-red-950/20 px-3 py-2 text-sm text-red-50 transition hover:bg-red-950/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-100/60"
                          >
                            <span className="block font-medium">{artifact.title ?? artifact.url}</span>
                            <span className="mt-1 block break-all text-xs text-red-100/70">{artifact.url}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : manualMode ? (
                  <textarea
                    value={manualDraft}
                    onChange={(event) => setManualDraft(event.target.value)}
                    className="min-h-[220px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-white placeholder:text-slate-400"
                  />
                ) : previewMode === 'thread' ? (
                  <div className="grid gap-3">
                    {threadPreview.map((post) => (
                      <div key={`${post.label}-${post.text.slice(0, 24)}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">{post.label}</span>
                          <span className="text-[11px] text-slate-400">{post.role}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-50">{post.text}</p>
                      </div>
                    ))}
                  </div>
                ) : previewMode === 'article' && articlePreview ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">标题</p>
                      <h3 className="mt-3 text-xl font-semibold leading-8 text-white">{articlePreview.title}</h3>
                    </div>
                    {articlePreview.lead ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">导语</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-50">{articlePreview.lead}</p>
                      </div>
                    ) : null}
                    {articlePreview.sections.map((section) => (
                      <div key={section.heading} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-sm font-semibold text-white">{section.heading}</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-50">{section.body}</p>
                      </div>
                    ))}
                    {articlePreview.ending ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">结尾</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-50">{articlePreview.ending}</p>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="whitespace-pre-wrap text-base leading-8 text-slate-50">{cleanedResultText}</p>
                  </div>
                )}
              </div>

              {riskReminderItems.length ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">风险提醒</p>
                  <ul className="mt-3 space-y-2 text-sm text-amber-900">
                    {riskReminderItems.map((flag) => (
                      <li key={flag} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : runDetail.format === 'article' ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>当前长文先通过复制方式发布到 X 文章编辑器，暂不进入推文/串推发布队列。</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>当前没有明显风险，可以进入下一步。</span>
                  </div>
                </div>
              )}

              <section className="rounded-[24px] border border-slate-900/10 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">图文资产</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-950">可发布卡片与封面</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-500">
                      后台已完成封面、卡片、信息图、diagram 与导出包，普通用户只需要预览、复制和下载。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyAction === 'retry-assets' || failedVisualAssetCards.length + visualHardFails.length === 0}
                      onClick={() => void handleRetryImages()}
                    >
                      {busyAction === 'retry-assets' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                      只重试图片/图文资产
                    </Button>
                    {!qualityGateFailed && readyVisualAssetCards.length && visualAssetsZipUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <a href={visualAssetsZipUrl} download>
                          <Download className="mr-2 h-4 w-4" />
                          下载全部图文资产
                        </a>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        <Download className="mr-2 h-4 w-4" />
                        暂无可下载资产
                      </Button>
                    )}
                  </div>
                </div>

                {readyVisualAssetCards.length ? (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {readyVisualAssetCards.map((asset) => (
                      <article key={asset.id ?? `${asset.kind}-${asset.cue}`} className="overflow-hidden rounded-2xl border border-slate-900/10 bg-slate-50">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900/10 bg-white px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-slate-900/10 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                              {asset.label}
                            </span>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700">
                              已生成
                            </span>
                          </div>
                          {asset.assetUrl ? (
                            <a
                              href={asset.assetUrl}
                              download
                              className="inline-flex items-center rounded-lg border border-slate-900/10 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:border-slate-900/20 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30"
                            >
                              <Download className="mr-1 h-3.5 w-3.5" />
                              下载 SVG
                            </a>
                          ) : null}
                        </div>
                        <div className="bg-slate-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={asset.assetUrl ?? ''} alt={`${asset.label}：${asset.cue}`} className="h-auto w-full object-cover" />
                        </div>
                        <div className="space-y-1 bg-white px-3 py-3">
                          <p className="text-sm font-medium leading-6 text-slate-900">{asset.cue}</p>
                          {asset.reason ? <p className="text-xs leading-5 text-slate-500">{asset.reason}</p> : null}
                          <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-slate-400">
                            {asset.width && asset.height ? <span>{asset.width}×{asset.height}</span> : null}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-900/15 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
                    {qualityGateFailed
                      ? '这版未达到可发布标准，图文资产不会展示，避免把坏稿当成成品。'
                      : withImage
                        ? '图片还没有 ready。若生成失败，文字仍会保留，你可以再来一版。'
                        : '本次没有请求配图，因此只展示轻量视觉规划。'}
                  </div>
                )}

                {readyExportAssetCards.length ? (
                  <div className="mt-4 rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">导出包</p>
                        <p className="mt-1 text-sm text-slate-700">Markdown / HTML 已生成，适合手动发布、归档或继续编辑。</p>
                      </div>
                      {visualAssetsZipUrl ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={visualAssetsZipUrl} download>
                            <Download className="mr-2 h-4 w-4" />
                            下载导出包
                          </a>
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {readyExportAssetCards.map((asset) => (
                        <div key={asset.id ?? asset.label} className="rounded-xl border border-slate-900/10 bg-white p-3">
	                          <div className="flex flex-wrap items-center gap-2">
	                            <span className="rounded-full border border-slate-900/10 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
	                              {asset.label}
	                            </span>
	                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-900">{asset.reason ?? asset.cue}</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {asset.assetUrl ? (
                              <Button asChild variant="outline" size="sm">
                                <a href={asset.assetUrl} download>
                                  <Download className="mr-2 h-4 w-4" />
                                  {asset.exportFormat === 'html' ? '导出 HTML' : '下载 Markdown'}
                                </a>
                              </Button>
                            ) : null}
                            {asset.exportFormat === 'markdown' ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void copyAssetText(asset.assetUrl, 'Markdown')}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                复制 Markdown
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {failedVisualAssetCards.length || visualHardFails.length ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">部分图片资产没有达到可发布标准。</p>
                        <p className="mt-1 text-xs leading-5 text-amber-800">
                          文本已保留；失败图片不会作为完成 evidence。需要时请点击“再来一版”重新生成图文。
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <details className="min-w-0 rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">查看依据与配图建议</summary>
                <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">这次参考了什么</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {runDetail.result.evidenceSummary.length ? runDetail.result.evidenceSummary.map((item) => (
                        <span key={item} className="max-w-full break-words rounded-full border border-slate-900/10 bg-white px-3 py-1 text-xs text-slate-600">{item}</span>
                      )) : <span className="text-xs text-slate-500">本次主要基于你的意图完成生成。</span>}
                    </div>
                    {sourceEvidenceArtifacts.length ? (
                      <div className="mt-3 grid gap-2">
                        {sourceEvidenceArtifacts.map((artifact) => (
                          <a
                            key={`${artifact.title ?? artifact.url}-${artifact.url ?? artifact.markdownPath}`}
                            href={artifact.evidenceUrl ?? artifact.url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 rounded-2xl border border-slate-900/10 bg-white px-3 py-2 text-xs text-slate-600 transition hover:border-slate-900/20 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30"
                          >
                            <span className="block break-words font-medium text-slate-800">{artifact.title ?? artifact.url ?? artifact.kind}</span>
                            <span className="mt-1 block break-all text-slate-400">
                              {artifact.status === 'ready' ? '来源已抓取' : artifact.status === 'skipped' ? '候选来源，等待确认' : '来源抓取失败'}
                              {artifact.url ? ` · ${artifact.url}` : ''}
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">主视觉方向</p>
                    {runDetail.result.visualPlan ? (
                      <div className="mt-3 space-y-3">
                        <div className="min-w-0 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                            {formatVisualAssetLabel(runDetail.result.visualPlan.primaryAsset)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {visualAnchorTags.map((keyword) => (
                              <span key={keyword} className="max-w-full break-words rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs text-emerald-700">{keyword}</span>
                            ))}
                          </div>
                        </div>
                        <div className="grid gap-3">
                          {runDetail.result.visualPlan.items.map((item) => (
                            <div key={`${item.kind}-${item.cue}`} className="min-w-0 rounded-2xl border border-slate-900/10 bg-white p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="max-w-full break-words rounded-full border border-slate-900/10 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{formatVisualAssetLabel(item.kind)}</span>
                                <span className="max-w-full break-words rounded-full border border-slate-900/10 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{item.type}</span>
                                <span className="max-w-full break-words rounded-full border border-slate-900/10 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{item.layout}</span>
                                <span className="max-w-full break-words rounded-full border border-slate-900/10 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{item.style}</span>
                                <span className="max-w-full break-words rounded-full border border-slate-900/10 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{item.palette}</span>
                              </div>
                              <p className="mt-2 break-words text-sm font-medium text-slate-900">{item.cue}</p>
                              <p className="mt-1 break-words text-xs leading-5 text-slate-500">{item.reason}</p>
                            </div>
                          ))}
                        </div>
                        {visualAssetCards.length ? (
                          <div className="grid gap-3">
                            {visualAssetCards.map((asset) => (
                              <div key={asset.id} className="min-w-0 rounded-2xl border border-slate-900/10 bg-white p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0 flex flex-wrap items-center gap-2">
                                    <span className="max-w-full break-words rounded-full border border-slate-900/10 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                                      {asset.label}
                                    </span>
                                    <span
                                      className={cn(
                                        'rounded-full border px-2 py-1 text-[11px]',
                                        asset.status === 'ready'
                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                          : asset.status === 'generating'
                                            ? 'border-sky-200 bg-sky-50 text-sky-700'
                                            : 'border-rose-200 bg-rose-50 text-rose-700'
                                      )}
                                    >
                                      {asset.statusLabel}
                                    </span>
                                  </div>
                                  {asset.promptPath ? (
                                    <span className="block min-w-0 max-w-full break-all font-mono text-[11px] text-slate-400">
                                      {asset.promptPath}
                                    </span>
                                  ) : null}
                                </div>
                                {asset.canPreview ? (
                                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-900/10 bg-slate-100">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={asset.assetUrl} alt={`${asset.label}：${asset.cue}`} className="h-auto w-full object-cover" />
                                  </div>
                                ) : null}
                                <p className="mt-2 break-words text-sm font-medium text-slate-900">{asset.cue}</p>
                                {asset.reason ? <p className="mt-1 break-words text-xs leading-5 text-slate-500">{asset.reason}</p> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {qualityGateFailed ? (
                          <span className="text-xs text-slate-500">这版未达到可发布标准，图文建议暂不展示，避免继续污染主题。</span>
                        ) : visualAnchorTags.length ? visualAnchorTags.map((keyword) => (
                          <span key={keyword} className="max-w-full break-words rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">{keyword}</span>
                        )) : <span className="text-xs text-slate-500">本次没有请求配图，或暂不需要配图建议。</span>}
                      </div>
                    )}
                  </div>
                </div>
                {runDetail.result.derivativeReadiness ? (
                  <div className="mt-4 border-t border-slate-900/10 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">衍生准备度</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Object.entries(runDetail.result.derivativeReadiness)
                        .filter(([, value]) => Boolean(value))
                        .map(([key, value]) => (
                          <span
                            key={key}
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs',
                              value?.ready ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-900/10 bg-white text-slate-500'
                            )}
                          >
                            {key} {Math.round(value?.score ?? 0)}
                          </span>
                        ))}
                    </div>
                  </div>
                ) : null}
                {SHOW_ROUTING_DEBUG_PANEL && qualityGateFailed && (qualityGateHardFails.length || visualHardFails.length || qualityGateNotes.length || runDetail.result.routing) ? (
                  <div className="mt-4 border-t border-slate-900/10 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">技术细节</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {qualityGateHardFails.map((flag) => (
                        <span key={flag} className="rounded-full border border-slate-900/10 bg-white px-3 py-1 text-xs text-slate-600">
                          {flag}
                        </span>
                      ))}
                      {visualHardFails.map((flag) => (
                        <span key={flag} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">
                          {flag}
                        </span>
                      ))}
                      {runDetail.result.routing?.routingTier ? (
                        <span className="rounded-full border border-slate-900/10 bg-white px-3 py-1 text-xs text-slate-600">
                          routingTier: {runDetail.result.routing.routingTier}
                        </span>
                      ) : null}
                    </div>
                    {qualityGateNotes.length ? (
                      <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-500">
                        {qualityGateNotes.map((note) => (
                          <li key={note}>• {note}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </details>

              <details className="rounded-2xl border border-slate-900/10 bg-white p-4">
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">查看原始文本 / 复制模式</summary>
                <pre className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {qualityGateFailed ? '这版未达到可发布标准，坏稿已被后台拦截，原始文本不会展示。' : cleanedResultText}
                </pre>
              </details>

              <div className="flex flex-wrap gap-3">
                <Button variant="outline" disabled={qualityGateFailed} onClick={() => setManualMode((prev) => !prev)}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  {manualMode ? '回看原结果' : '手动编辑'}
                </Button>
                <Button
                  variant="outline"
                  disabled={qualityGateFailed}
                  onClick={() => {
                    void navigator.clipboard.writeText(manualMode ? manualDraft : cleanedResultText);
                    pushToast({
                      title: runDetail.format === 'article' ? '长文已复制' : '已复制结果文本',
                      description: runDetail.format === 'article' ? '请粘贴到 X 文章编辑器继续发布。' : undefined,
                      variant: 'success'
                    });
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {qualityGateFailed ? '未达标，不能复制' : runDetail.format === 'article' ? '复制长文' : '复制文本'}
                </Button>
                <Button
                  disabled={qualityGateFailed || busyAction === 'queue-result' || (!selectedAccount && runDetail.format !== 'article')}
                  onClick={() => void handleQueueAction()}
                >
                  {busyAction === 'queue-result' ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : qualityGateFailed ? (
                    <AlertTriangle className="mr-2 h-4 w-4" />
                  ) : runDetail.format === 'article' ? (
                    <Copy className="mr-2 h-4 w-4" />
                  ) : !selectedAccount ? (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  ) : safeMode ? (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  {qualityGateFailed
                    ? '未达标，不能发布'
                    : runDetail.format === 'article'
                      ? '复制到 X 文章编辑器'
                      : !selectedAccount
                      ? '连接 X 后才能发布'
                      : safeMode
                        ? '加入待确认'
                        : '进入发布队列'}
                </Button>
                {!selectedAccount && runDetail.format !== 'article' ? (
                  <Button asChild variant="outline">
                    <Link href={buildAppTaskHref('connect_x_self') ?? '/app?nextAction=connect_x_self'}>先连接 X 账号</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </article>
      </section>

      {activeTaskAction && activeTaskMeta ? (
        <OperatorTaskPanel
          action={activeTaskAction}
          meta={activeTaskMeta}
          profile={profile}
          queue={queue}
          busyAction={busyAction}
          xbind={searchParams.get('xbind')}
          highlight={searchParams.get('highlight')}
          published={searchParams.get('published')}
          onClose={() => router.replace('/app')}
          onConnectSelfX={connectSelfAction}
          onConnectTargetX={connectTargetAction}
          onImportUrls={importUrlsAction}
          onConnectObsidian={connectObsidianAction}
          onConnectLocalFiles={connectLocalFilesAction}
          onRebuildProfile={rebuildProfileAction}
          onConfirmPublish={confirmQueueItemAction}
          onExportArticle={exportQueueItemAction}
        />
      ) : null}
    </AppShell>
  );
}
