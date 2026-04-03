'use client';

import { Clock, Loader2, Send, Sparkles, Twitter } from 'lucide-react';
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
import { clearToken, getUserFromToken, setToken } from '../lib/api';
import { fetchGenerationStream } from '../lib/sse-stream';
import {
  createLocalSession,
  fetchGeneration,
  fetchHistory,
  publishTweet,
  startGoogleOAuth,
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
  if (p === 'FREE') return '免费版';
  if (p === 'PRO') return 'Pro';
  if (p === 'PREMIUM') return '高级版';
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
  const [googleLoading, setGoogleLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  const refreshUser = useCallback(() => {
    setUser(getUserFromToken());
  }, []);

  useEffect(() => {
    refreshUser();
    const onFocus = () => refreshUser();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshUser]);

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

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const { url } = await startGoogleOAuth();
      window.location.href = url;
    } catch {
      setGoogleLoading(false);
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
      <div className="min-h-screen bg-white text-gray-900">
        <header className="border-b border-gray-100 bg-white/90 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
            <span className="text-lg font-bold tracking-tight text-gray-900">DraftOrbit</span>
            <Button
              type="button"
              size="sm"
              className="gap-2"
              onClick={handleXLogin}
              disabled={oauthLoading}
            >
              {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Twitter className="h-4 w-4" />}
              用 Twitter 登录
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 pb-24 pt-20">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-5xl font-bold tracking-tight text-gray-900">AI 帮你写推文</h1>
            <p className="mt-6 text-lg text-gray-500">
              输入一句话，AI 推理生成高质量推文，一键发布到 X
            </p>
            <Button
              type="button"
              size="lg"
              className="mt-10 h-14 w-full max-w-md rounded-xl text-base shadow-md transition hover:shadow-lg"
              onClick={handleXLogin}
              disabled={oauthLoading}
            >
              {oauthLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              用 Twitter 登录，免费试用
            </Button>
            <div className="mx-auto mt-3 flex w-full max-w-md gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
              >
                {googleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Google 登录
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleLocalLogin}
                disabled={localLoading}
              >
                {localLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                本地登录
              </Button>
            </div>
          </div>

          <div className="mx-auto mt-24 grid max-w-4xl gap-8 md:grid-cols-3">
            {[
              {
                title: '风格学习',
                desc: '分析你的历史推文，学习你的写作风格',
                icon: Sparkles
              },
              {
                title: '推理生成',
                desc: '热点追踪 → 大纲 → 草稿 → 去AI化，全流程可见',
                icon: Send
              },
              {
                title: '一键发布',
                desc: '生成即发布，支持推文、长推文、推文串',
                icon: Twitter
              }
            ].map(({ title, desc, icon: Icon }) => (
              <div
                key={title}
                className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition hover:border-gray-200 hover:shadow-md"
              >
                <Icon className="h-8 w-8 text-blue-600" />
                <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
        </main>

        <footer className="border-t border-gray-100 py-8 text-center text-sm text-gray-400">
          DraftOrbit © 2026
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 lg:px-6">
          <span className="text-lg font-bold tracking-tight">DraftOrbit</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-gray-600 sm:inline">@{user.handle}</span>
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
              {planLabel(user.plan)}
            </span>
            <Link href="/settings" className="text-gray-500 transition hover:text-gray-800">
              设置
            </Link>
            <Link href="/dashboard" className="text-gray-500 transition hover:text-gray-800">
              工作台
            </Link>
            <Button type="button" variant="outline" size="sm" onClick={logout}>
              退出
            </Button>
          </div>
        </div>
      </header>

      <div className="border-b border-gray-100 bg-blue-50/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 text-xs text-blue-900 lg:px-6">
          <span className="rounded bg-blue-600 px-2 py-0.5 text-white">新手指引</span>
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
        <aside className="hidden w-72 shrink-0 border-r border-gray-100 bg-gray-50/30 lg:block lg:min-h-[calc(100vh-3.5rem)] lg:p-5">
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
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={useStyle}
                  onChange={(e) => setUseStyle(e.target.checked)}
                  disabled={isGenerating}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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

      <div className="border-t border-gray-100 bg-gray-50/50 lg:hidden">
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className="flex w-full items-center justify-center gap-2 py-3 text-sm font-medium text-gray-700"
        >
          <Clock className="h-4 w-4" />
          历史记录
        </button>
        {historyOpen && (
          <div className="max-h-[50vh] overflow-y-auto border-t border-gray-100 bg-white px-4 pb-6 pt-2">
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
