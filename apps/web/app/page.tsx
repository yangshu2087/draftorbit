'use client';

import { Clock, Loader2, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { HistoryList, type HistoryItem } from '../components/workspace/history-list';
import {
  ReasoningPanel,
  STEP_ORDER,
  type StepKey,
  type StepRow
} from '../components/workspace/reasoning-panel';
import { ResultCard, type PackageResult } from '../components/workspace/result-card';
import { Button } from '../components/ui/button';
import { XLogo } from '../components/icons/x-logo';
import { clearToken, getUserFromToken, setToken } from '../lib/api';
import { fetchGenerationStream } from '../lib/sse-stream';
import {
  createLocalSession,
  fetchGeneration,
  fetchHistory,
  publishTweet,
  startGeneration,
  startXOAuth
} from '../lib/queries';
import { cn } from '../lib/utils';

type GenType = 'TWEET' | 'THREAD' | 'LONG';
type Lang = 'zh' | 'en';

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
  return {
    tweet,
    charCount: typeof r.charCount === 'number' ? r.charCount : [...tweet].length,
    imageKeywords: Array.isArray(r.imageKeywords) ? r.imageKeywords.map(String) : [],
    variants: Array.isArray(r.variants)
      ? (r.variants as { tone?: string; text?: string }[])
          .filter((v) => typeof v?.tone === 'string' && typeof v?.text === 'string')
          .map((v) => ({ tone: v.tone as string, text: v.text as string }))
      : []
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

export default function HomePage() {
  const [user, setUser] = useState(() => getUserFromToken());
  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState<GenType>('TWEET');
  const [language, setLanguage] = useState<Lang>('zh');
  const [useStyle, setUseStyle] = useState(true);
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
  const [allowLocalLogin, setAllowLocalLogin] = useState(
    process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN === 'true'
  );

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

  useEffect(() => {
    if (user) void loadHistory();
  }, [user, loadHistory]);

  const runStream = useCallback(async (id: string) => {
    setIsGenerating(true);
    setSteps([]);
    setResult(null);
    try {
      await fetchGenerationStream(id, (ev) => {
        setSteps((prev) => mergeStepEvent(prev, ev));
        if (ev.step === 'PACKAGE' && ev.status === 'done' && ev.content) {
          try {
            const pkg = JSON.parse(ev.content) as PackageResult;
            setResult({
              tweet: pkg.tweet,
              charCount: pkg.charCount ?? [...pkg.tweet].length,
              imageKeywords: pkg.imageKeywords ?? [],
              variants: pkg.variants ?? []
            });
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
    }
  }, [loadHistory]);

  const handleGenerate = useCallback(async () => {
    const p = prompt.trim();
    if (!p || isGenerating) return;
    setResult(null);
    setSteps([]);
    setIsGenerating(true);
    try {
      const { generationId: id } = await startGeneration({
        prompt: p,
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
  }, [prompt, type, language, useStyle, isGenerating, runStream]);

  const handleHistorySelect = useCallback(async (id: string) => {
    setHistoryOpen(false);
    setGenerationId(id);
    try {
      const gen = await fetchGeneration(id);
      const g = gen as Record<string, unknown>;
      setPrompt(typeof g.prompt === 'string' ? g.prompt : '');
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
            <Link href="/dashboard" className="text-slate-500 transition hover:text-slate-800">
              工作台
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
          <Link href="/topics" className="underline-offset-2 hover:underline">
            1) 新建选题
          </Link>
          <span>→</span>
          <Link href="/drafts" className="underline-offset-2 hover:underline">
            2) 生成草稿
          </Link>
          <span>→</span>
          <Link href="/drafts" className="underline-offset-2 hover:underline">
            3) 质量检查 + 审批
          </Link>
          <span>→</span>
          <Link href="/publish-queue" className="underline-offset-2 hover:underline">
            4) 进入发布队列
          </Link>
        </div>
      </div>

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
            <textarea
              className="min-h-[120px] w-full resize-y text-base"
              placeholder="描述你想发的推文，或粘贴一段灵感..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isGenerating}
            />

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
              disabled={isGenerating || !prompt.trim()}
            >
              {isGenerating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              生成推文
            </Button>

            {(isGenerating || steps.length > 0) && (
              <ReasoningPanel steps={steps} isGenerating={isGenerating} />
            )}

            {result && (
              <ResultCard
                result={result}
                generationId={generationId}
                publishBusy={publishBusy}
                onPublish={async () => {
                  if (!generationId) return;
                  setPublishBusy(true);
                  try {
                    await publishTweet(generationId);
                  } finally {
                    setPublishBusy(false);
                  }
                }}
                onRegenerate={() => void handleGenerate()}
              />
            )}
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
