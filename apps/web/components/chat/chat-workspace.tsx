'use client';

import { Clock, Loader2, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { XAccountEntity } from '@draftorbit/shared';
import { HistoryList, type HistoryItem } from '../workspace/history-list';
import {
  ReasoningPanel,
  STEP_ORDER,
  type StepKey,
  type StepRow
} from '../workspace/reasoning-panel';
import { ResultCard, type PackageResult } from '../workspace/result-card';
import { Button } from '../ui/button';
import { XLogo } from '../icons/x-logo';
import { clearToken, getUserFromToken, setToken } from '../../lib/api';
import { fetchGenerationStream } from '../../lib/sse-stream';
import {
  createLocalSession,
  fetchGeneration,
  fetchHistory,
  fetchOpsDashboard,
  fetchUsageOverview,
  fetchXAccounts,
  publishTweet,
  startXAccountOAuthBind,
  startGeneration,
  startXOAuth
} from '../../lib/queries';
import { cn } from '../../lib/utils';

type GenType = 'TWEET' | 'THREAD' | 'LONG';
type Lang = 'zh' | 'en';

type OpsSnapshot = {
  nextAction?: string;
  blockingReason?: string | null;
  degraded?: boolean;
  data?: {
    counters?: {
      topics?: number;
      drafts?: number;
      publishJobs?: number;
      replyJobs?: number;
      activeXAccounts?: number;
    };
  };
};

type UsageSnapshot = {
  nextAction?: string;
  blockingReason?: string | null;
  degraded?: boolean;
  data?: {
    summary?: {
      modelRouting?: {
        freeHitRate?: number;
        fallbackRate?: number;
        avgQualityScore?: number;
      };
    };
  };
};

const OBJECTIVE_OPTIONS = [
  { value: '涨粉', label: '涨粉' },
  { value: '互动', label: '互动' },
  { value: '转化', label: '转化' },
  { value: '品牌', label: '品牌认知' }
] as const;

const AUDIENCE_OPTIONS = [
  { value: '创作者', label: '创作者' },
  { value: '独立开发者', label: '独立开发者' },
  { value: '品牌运营', label: '品牌运营' },
  { value: 'AI 从业者', label: 'AI 从业者' }
] as const;

const TONE_OPTIONS = [
  { value: '专业清晰', label: '专业清晰' },
  { value: '口语亲和', label: '口语亲和' },
  { value: '观点锋利', label: '观点锋利' }
] as const;

const POST_TYPE_OPTIONS = [
  { value: '观点短推', label: '观点短推' },
  { value: '教程清单', label: '教程清单' },
  { value: '案例复盘', label: '案例复盘' },
  { value: '热点点评', label: '热点点评' }
] as const;

const CTA_OPTIONS = [
  { value: '欢迎留言讨论', label: '欢迎留言讨论' },
  { value: '同意请点赞转发', label: '同意请点赞转发' },
  { value: '关注获取后续更新', label: '关注获取后续更新' }
] as const;

const TOPIC_PRESETS = [
  { value: 'AI 产品增长', label: 'AI 产品增长' },
  { value: 'X 运营方法', label: 'X 运营方法' },
  { value: '创作效率提升', label: '创作效率提升' },
  { value: '行业趋势洞察', label: '行业趋势洞察' }
] as const;

function sortSteps(rows: StepRow[]): StepRow[] {
  const order: string[] = [...STEP_ORDER, 'error'];
  return [...rows].sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step));
}

function mergeStepEvent(prev: StepRow[], ev: { step: string; status: string; content?: string }): StepRow[] {
  const map = new Map(prev.map((s) => [s.step, { ...s }]));
  if (ev.step === 'error') {
    map.set('error', {
      step: 'error',
      status: ev.status === 'failed' ? 'failed' : 'done',
      content: ev.content
    });
    return sortSteps([...map.values()]);
  }
  const key = ev.step as StepKey;
  if (!STEP_ORDER.includes(key as (typeof STEP_ORDER)[number])) return prev;
  const existing = map.get(key);
  const status =
    ev.status === 'running'
      ? 'running'
      : ev.status === 'done'
        ? 'done'
        : ev.status === 'failed'
          ? 'failed'
          : (existing?.status ?? 'pending');
  let content = ev.content !== undefined ? ev.content : existing?.content;
  if (key === 'PACKAGE' && status === 'done' && content) {
    try {
      const pkg = JSON.parse(content) as PackageResult;
      content = `主文已就绪（${pkg.charCount} 字）· 变体 ${pkg.variants?.length ?? 0} 个`;
    } catch {
      /* keep raw */
    }
  }
  map.set(key, { step: key, status, content });
  return sortSteps([...map.values()]);
}

function normalizeResult(raw: unknown): PackageResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.tweet !== 'string') return null;
  const tweet = r.tweet;
  const quality =
    r.quality && typeof r.quality === 'object'
      ? (r.quality as PackageResult['quality'])
      : undefined;
  const routing =
    r.routing && typeof r.routing === 'object'
      ? (r.routing as PackageResult['routing'])
      : undefined;
  const budget =
    r.budget && typeof r.budget === 'object'
      ? (r.budget as PackageResult['budget'])
      : undefined;
  const stepLatencyMs =
    r.stepLatencyMs && typeof r.stepLatencyMs === 'object'
      ? (r.stepLatencyMs as PackageResult['stepLatencyMs'])
      : undefined;
  const stepExplain =
    r.stepExplain && typeof r.stepExplain === 'object'
      ? (r.stepExplain as PackageResult['stepExplain'])
      : undefined;
  return {
    tweet,
    charCount: typeof r.charCount === 'number' ? r.charCount : [...tweet].length,
    imageKeywords: Array.isArray(r.imageKeywords) ? r.imageKeywords.map(String) : [],
    variants: Array.isArray(r.variants)
      ? (r.variants as { tone?: string; text?: string }[])
          .filter((v) => typeof v?.tone === 'string' && typeof v?.text === 'string')
          .map((v) => ({ tone: v.tone as string, text: v.text as string }))
      : [],
    quality,
    routing,
    budget,
    stepLatencyMs,
    stepExplain
  };
}

function planLabel(plan?: string | null): string {
  const p = (plan ?? 'FREE').toUpperCase();
  if (p === 'FREE') return '试用中';
  if (p === 'STARTER') return 'Starter';
  if (p === 'PRO') return 'Growth';
  if (p === 'PREMIUM') return 'Max';
  return p;
}

function actionToHint(action?: string): string {
  const map: Record<string, string> = {
    create_workspace: '先创建工作区',
    bind_x_account: '先绑定 X 账号',
    top_up_credits: '当前额度不足，先升级订阅',
    create_topic: '先生成第一条内容',
    run_generation: '先按简报生成草稿',
    approve_or_publish_drafts: '草稿已就绪，进入发布队列',
    sync_mentions: '先同步 mentions 再生成回复',
    inspect_degraded_segments: '系统部分降级，请稍后重试',
    monitor_operations: '继续监控并稳定发布',
    run_first_generation: '从一句话意图开始第一条内容',
    review_pending_drafts: '处理待审批草稿',
    queue_approved_drafts: '将已审批内容入队发布',
    improve_prompt_quality: '质量偏低，建议重写',
    review_model_routing: '回退率偏高，检查模型路由',
    inspect_usage_segments: '用量聚合降级，稍后刷新',
    retry_usage_overview: '重试加载用量概览'
  };
  if (!action) return '按简报一键生成';
  return map[action] ?? action;
}

export default function ChatWorkspacePage() {
  const [user, setUser] = useState(() => getUserFromToken());
  const [type, setType] = useState<GenType>('TWEET');
  const [language, setLanguage] = useState<Lang>('zh');
  const [useStyle, setUseStyle] = useState(true);
  const [objective, setObjective] = useState<(typeof OBJECTIVE_OPTIONS)[number]['value']>('互动');
  const [audience, setAudience] = useState<(typeof AUDIENCE_OPTIONS)[number]['value']>('创作者');
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number]['value']>('专业清晰');
  const [postType, setPostType] = useState<(typeof POST_TYPE_OPTIONS)[number]['value']>('观点短推');
  const [cta, setCta] = useState<(typeof CTA_OPTIONS)[number]['value']>('欢迎留言讨论');
  const [topicPreset, setTopicPreset] = useState<(typeof TOPIC_PRESETS)[number]['value']>('AI 产品增长');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [result, setResult] = useState<PackageResult | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [xAccounts, setXAccounts] = useState<XAccountEntity[]>([]);
  const [selectedXAccountId, setSelectedXAccountId] = useState('');
  const [entryHint, setEntryHint] = useState<string | null>(null);
  const [allowLocalLogin, setAllowLocalLogin] = useState(
    process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN === 'true'
  );
  const [opsSnapshot, setOpsSnapshot] = useState<OpsSnapshot | null>(null);
  const [usageSnapshot, setUsageSnapshot] = useState<UsageSnapshot | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const refreshUser = useCallback(() => {
    setUser(getUserFromToken());
  }, []);

  useEffect(() => {
    refreshUser();
    const onFocus = () => refreshUser();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = window.location.hostname.toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (isLocalHost || host.endsWith('.local')) {
      setAllowLocalLogin(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const from = params.get('from');
    const xbind = params.get('xbind');
    if (xbind === 'success') {
      setEntryHint('已完成 X 账号绑定，可直接继续生成与发布。');
    } else if (xbind === 'error') {
      setEntryHint('X 账号绑定未完成，请稍后重试。');
    } else if (from) {
      setEntryHint(`页面「${from}」已并入 V2 聊天中枢。`);
    }

    if (from || xbind) {
      const cleaned = `${window.location.pathname}${window.location.hash}`;
      window.history.replaceState({}, '', cleaned);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    if (!getUserFromToken()) return;
    setHistoryLoading(true);
    try {
      const rows = await fetchHistory();
      setHistory(
        (rows as HistoryItem[]).map((r) => ({
          id: r.id,
          prompt: r.prompt,
          type: r.type,
          createdAt: typeof r.createdAt === 'string' ? r.createdAt : String(r.createdAt),
          status: r.status
        }))
      );
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadXAccounts = useCallback(async () => {
    if (!getUserFromToken()) return;
    try {
      const rows = await fetchXAccounts({ pageSize: 50 });
      setXAccounts(rows);
      const defaultAccount = rows.find((row) => row.isDefault) ?? rows[0];
      if (defaultAccount) {
        setSelectedXAccountId(defaultAccount.id);
      }
    } catch {
      setXAccounts([]);
      setSelectedXAccountId('');
    }
  }, []);

  const loadOperationStatus = useCallback(async () => {
    if (!getUserFromToken()) return;
    setStatusLoading(true);
    try {
      const [ops, usage] = await Promise.all([
        fetchOpsDashboard(),
        fetchUsageOverview({ eventsLimit: 20, days: 14 })
      ]);
      setOpsSnapshot(ops as OpsSnapshot);
      setUsageSnapshot(usage as UsageSnapshot);
    } catch {
      setOpsSnapshot(null);
      setUsageSnapshot(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadHistory();
      void loadXAccounts();
      void loadOperationStatus();
    }
  }, [user, loadHistory, loadXAccounts, loadOperationStatus]);

  const runStream = useCallback(async (id: string) => {
    setIsGenerating(true);
    setSteps([]);
    setResult(null);
    try {
      await fetchGenerationStream(id, (ev) => {
        setSteps((prev) => mergeStepEvent(prev, ev));
        if (ev.step === 'PACKAGE' && ev.status === 'done' && ev.content) {
          try {
            const pkg = normalizeResult(JSON.parse(ev.content));
            if (pkg) setResult(pkg);
          } catch {
            /* ignore */
          }
        }
        if (ev.step === 'error' && ev.status === 'failed') {
          setIsGenerating(false);
        }
      });
    } catch (e) {
      setSteps((prev) =>
        mergeStepEvent(prev, {
          step: 'error',
          status: 'failed',
          content: e instanceof Error ? e.message : String(e)
        })
      );
    } finally {
      setIsGenerating(false);
      void loadHistory();
      void loadOperationStatus();
    }
  }, [loadHistory, loadOperationStatus]);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;

    const advancedPrompt = customPrompt.trim();
    const useAdvanced = advancedOpen && advancedPrompt.length > 0;

    setResult(null);
    setSteps([]);
    setIsGenerating(true);
    try {
      const { generationId: id } = await startGeneration({
        mode: useAdvanced ? 'advanced' : 'brief',
        brief: {
          objective,
          audience,
          tone,
          postType,
          cta,
          topicPreset
        },
        advanced: useAdvanced
          ? {
              customPrompt: advancedPrompt
            }
          : undefined,
        type,
        language,
        useStyle
      });
      setGenerationId(id);
      await runStream(id);
    } catch (e) {
      setIsGenerating(false);
      setSteps((prev) =>
        mergeStepEvent(prev, {
          step: 'error',
          status: 'failed',
          content: e instanceof Error ? e.message : String(e)
        })
      );
    }
  }, [
    audience,
    advancedOpen,
    cta,
    customPrompt,
    isGenerating,
    language,
    objective,
    postType,
    runStream,
    tone,
    topicPreset,
    type,
    useStyle
  ]);

  const handleHistorySelect = useCallback(async (id: string) => {
    setHistoryOpen(false);
    setGenerationId(id);
    try {
      const gen = await fetchGeneration(id);
      const g = gen as Record<string, unknown>;
      setCustomPrompt(typeof g.prompt === 'string' ? g.prompt : '');
      setAdvancedOpen(true);
      if (typeof g.type === 'string' && ['TWEET', 'THREAD', 'LONG'].includes(g.type)) {
        setType(g.type as GenType);
      }
      if (typeof g.language === 'string' && (g.language === 'zh' || g.language === 'en')) {
        setLanguage(g.language as Lang);
      }
      const pkg = normalizeResult(g.result);
      setResult(pkg);
      setSteps([]);
      setIsGenerating(false);
    } catch {
      /* ignore */
    }
  }, []);

  const handleXLogin = async () => {
    setOauthLoading(true);
    try {
      const { url } = await startXOAuth();
      window.location.href = url;
    } catch {
      setOauthLoading(false);
    }
  };

  const handleBindXAccount = async () => {
    if (oauthLoading) return;
    setOauthLoading(true);
    try {
      const { url } = await startXAccountOAuthBind();
      window.location.href = url;
    } catch {
      setOauthLoading(false);
    }
  };

  const handleLocalLogin = async () => {
    setLocalLoading(true);
    try {
      const session = await createLocalSession();
      if (session?.token) {
        setToken(session.token);
        refreshUser();
      }
    } catch {
      // ignore
    } finally {
      setLocalLoading(false);
    }
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setHistory([]);
    setResult(null);
    setGenerationId(null);
    setSteps([]);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,#faf7f4_0,#f5f7fb_42%,#f2f4fa_100%)] text-slate-900">
        <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-6">
          <h1 className="mb-12 text-center text-4xl font-semibold tracking-tight">登录您的账户</h1>

          <div className="w-full rounded-full border border-[#f5a48b] bg-white p-1">
            <Button
              type="button"
              size="lg"
              className="h-14 w-full rounded-full bg-black text-base text-white transition hover:bg-black/90"
              onClick={handleXLogin}
              disabled={oauthLoading}
            >
              {oauthLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <XLogo className="mr-2 h-4 w-4" />
              )}
              使用 X 登录，免费试用
            </Button>
          </div>

          <p className="mt-4 text-sm text-slate-500">新用户可直接免费试用</p>

          {allowLocalLogin ? (
            <div className="do-panel mt-8 w-full p-4">
              <p className="text-sm font-medium text-slate-700">本地部署调试入口</p>
              <p className="mt-1 text-xs text-slate-500">仅在本机/自托管开发环境使用</p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 w-full"
                onClick={handleLocalLogin}
                disabled={localLoading}
              >
                {localLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                本地登录
              </Button>
            </div>
          ) : null}

          <div className="mt-14 grid w-full gap-4 sm:grid-cols-3">
            {[
              {
                title: '风格学习',
                desc: '分析历史内容，学习写作风格',
                icon: Sparkles
              },
              {
                title: '推理生成',
                desc: '选题到草稿，完整链路可见',
                icon: Send
              },
              {
                title: '发布执行',
                desc: '审批后进入发布队列执行',
                icon: XLogo
              }
            ].map(({ title, desc, icon: Icon }) => (
              <div
                key={title}
                className="do-card p-5 text-left"
              >
                <Icon className="h-6 w-6 text-slate-700" />
                <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-900/10 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 lg:px-6">
          <span className="text-lg font-bold tracking-tight">DraftOrbit</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-600 sm:inline">@{user.handle}</span>
            <span className="rounded-full border border-slate-900/10 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              {planLabel(user.plan)}
            </span>
            <Link href="/settings" className="text-slate-500 transition hover:text-slate-800">
              设置
            </Link>
            <Link href="/pricing" className="text-slate-500 transition hover:text-slate-800">
              订阅
            </Link>
            <Button type="button" variant="outline" size="sm" onClick={logout}>
              退出
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-900/10 bg-slate-100/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 text-xs text-blue-900 lg:px-6">
          <span className="rounded bg-slate-900 px-2 py-0.5 text-white">新手指引</span>
          <Link href="#compose" className="underline-offset-2 hover:underline">
            1) 选择目标与主题
          </Link>
          <span>→</span>
          <Link href="#reasoning" className="underline-offset-2 hover:underline">
            2) 查看推理步骤
          </Link>
          <span>→</span>
          <Link href="#result" className="underline-offset-2 hover:underline">
            3) 审阅结果包
          </Link>
          <span>→</span>
          <Link href="#publish" className="underline-offset-2 hover:underline">
            4) 人工确认后发布
          </Link>
        </div>
      </div>

      {entryHint ? (
        <div className="border-b border-emerald-200 bg-emerald-50/80">
          <div className="mx-auto max-w-6xl px-4 py-2 text-xs text-emerald-800 lg:px-6">{entryHint}</div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-6xl flex-col lg:flex-row lg:gap-0">
        <aside className="hidden w-72 shrink-0 border-r border-slate-900/10 bg-slate-50/40 lg:block lg:min-h-[calc(100vh-3.5rem)] lg:p-5">
          <HistoryList
            items={history}
            loading={historyLoading}
            activeId={generationId}
            onSelect={handleHistorySelect}
          />
        </aside>

        <main className="flex-1 px-4 py-8 lg:px-10 lg:py-12">
          <div className="mx-auto max-w-3xl">
            <div id="compose" className="rounded-2xl border border-slate-900/10 bg-slate-50/65 p-4">
              <p className="text-xs font-semibold tracking-[0.14em] text-slate-500">Brief-first 生成</p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                <select value={objective} onChange={(e) => setObjective(e.target.value as typeof objective)} disabled={isGenerating}>
                  {OBJECTIVE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      目标：{item.label}
                    </option>
                  ))}
                </select>
                <select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} disabled={isGenerating}>
                  {AUDIENCE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      受众：{item.label}
                    </option>
                  ))}
                </select>
                <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} disabled={isGenerating}>
                  {TONE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      语气：{item.label}
                    </option>
                  ))}
                </select>
                <select value={postType} onChange={(e) => setPostType(e.target.value as typeof postType)} disabled={isGenerating}>
                  {POST_TYPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      类型：{item.label}
                    </option>
                  ))}
                </select>
                <select value={cta} onChange={(e) => setCta(e.target.value as typeof cta)} disabled={isGenerating}>
                  {CTA_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      CTA：{item.label}
                    </option>
                  ))}
                </select>
                <div className="rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-xs text-slate-500">
                  主题模板（点击选择）
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {TOPIC_PRESETS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs transition',
                      topicPreset === item.value
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'
                    )}
                    onClick={() => setTopicPreset(item.value)}
                    disabled={isGenerating}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 rounded-xl border border-slate-900/10 bg-white px-3 py-2 text-xs text-slate-600">
                当前简报：{objective} · {audience} · {tone} · {postType} · {cta} · {topicPreset}
              </div>

              <button
                type="button"
                className="mt-3 text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
                onClick={() => setAdvancedOpen((v) => !v)}
                disabled={isGenerating}
              >
                {advancedOpen ? '收起高级输入' : '展开高级输入（可选）'}
              </button>

              {advancedOpen ? (
                <textarea
                  className="mt-2 min-h-[110px] w-full resize-y text-sm"
                  placeholder="可选：补充背景、禁用词、引用链接或额外要求。留空则完全使用简报生成。"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  disabled={isGenerating}
                />
              ) : null}
            </div>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={useStyle}
                  onChange={(e) => setUseStyle(e.target.checked)}
                  disabled={isGenerating}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
                从历史推文学习风格
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={handleBindXAccount}
                  disabled={oauthLoading}
                >
                  {oauthLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  绑定附加 X 账号
                </Button>
                <select
                  className="text-sm"
                  value={selectedXAccountId}
                  onChange={(e) => setSelectedXAccountId(e.target.value)}
                  disabled={isGenerating || xAccounts.length === 0}
                >
                  {xAccounts.length === 0 ? <option value="">默认发布账号</option> : null}
                  {xAccounts.map((row) => (
                    <option key={row.id} value={row.id}>
                      发布账号：@{row.handle}
                      {row.isDefault ? '（默认）' : ''}
                    </option>
                  ))}
                </select>
                <select
                  className="text-sm"
                  value={type}
                  onChange={(e) => setType(e.target.value as GenType)}
                  disabled={isGenerating}
                >
                  <option value="TWEET">单条推文</option>
                  <option value="THREAD">推文串</option>
                  <option value="LONG">长推文</option>
                </select>
                <select
                  className="text-sm"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Lang)}
                  disabled={isGenerating}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            <Button
              type="button"
              className="mt-6 h-12 w-full gap-2 rounded-xl text-base shadow-md transition hover:shadow-lg"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              {advancedOpen && customPrompt.trim() ? '按高级补充生成' : '按简报一键生成'}
            </Button>

            {(isGenerating || steps.length > 0) && (
              <div id="reasoning">
                <ReasoningPanel steps={steps} isGenerating={isGenerating} />
              </div>
            )}

            {result && (
              <div id="result">
                <div id="publish">
                  <ResultCard
                    result={result}
                    generationId={generationId}
                    publishBusy={publishBusy}
                    onPublish={async () => {
                      if (!generationId) return;
                      setPublishBusy(true);
                      try {
                        await publishTweet(generationId, selectedXAccountId || undefined);
                        await loadOperationStatus();
                      } finally {
                        setPublishBusy(false);
                      }
                    }}
                    onRegenerate={() => void handleGenerate()}
                  />
                </div>
              </div>
            )}

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">当前环节状态</span>
                {statusLoading ? <span className="text-slate-500">刷新中…</span> : null}
              </div>
              <p className="mt-2">
                下一步：{actionToHint(opsSnapshot?.nextAction ?? usageSnapshot?.nextAction)}
              </p>
              {opsSnapshot?.blockingReason || usageSnapshot?.blockingReason ? (
                <p className="mt-1 text-amber-700">
                  阻塞原因：{opsSnapshot?.blockingReason ?? usageSnapshot?.blockingReason}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-3 text-slate-600">
                <span>主题 {opsSnapshot?.data?.counters?.topics ?? 0}</span>
                <span>草稿 {opsSnapshot?.data?.counters?.drafts ?? 0}</span>
                <span>发布任务 {opsSnapshot?.data?.counters?.publishJobs ?? 0}</span>
                <span>回复任务 {opsSnapshot?.data?.counters?.replyJobs ?? 0}</span>
                {typeof usageSnapshot?.data?.summary?.modelRouting?.freeHitRate === 'number' ? (
                  <span>
                    免费命中 {(usageSnapshot.data.summary.modelRouting.freeHitRate * 100).toFixed(0)}%
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </main>
      </div>

      <div className="border-t border-slate-900/10 bg-slate-50/60 lg:hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className="flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-slate-700"
        >
          <Clock className="h-4 w-4" />
          历史记录
        </button>
        {historyOpen && (
          <div className="max-h-[50vh] overflow-y-auto border-t border-slate-900/10 bg-white px-4 pb-6 pt-2">
            <HistoryList
              items={history}
              loading={historyLoading}
              activeId={generationId}
              onSelect={handleHistorySelect}
            />
          </div>
        )}
      </div>
    </div>
  );
}
