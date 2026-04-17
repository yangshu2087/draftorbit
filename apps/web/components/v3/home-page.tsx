'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { ErrorState } from '../ui/state-feedback';
import { AppShell } from './shell';
import { createLocalSession, startXOAuth } from '../../lib/queries';
import { getToken, setToken } from '../../lib/api';
import { toUiError, type UiError } from '../../lib/ui-error';

const starterBullets = [
  '写下一句话',
  '拿到一版结果',
  '决定要不要发'
];

const examplePrompt = '参考我最近的表达风格，写一条关于 AI 产品冷启动的观点短推。';
const exampleOutput = '冷启动最难的不是没人看见，而是你自己还没想清楚：你到底替谁解决什么问题。';

export default function HomePage() {
  const [loading, setLoading] = useState<'x' | 'local' | null>(null);
  const [pageError, setPageError] = useState<UiError | null>(null);
  const [allowLocalLogin, setAllowLocalLogin] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const enabled = process.env.NEXT_PUBLIC_ENABLE_LOCAL_LOGIN === 'true';
    const host = typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase();
    setHasSession(Boolean(getToken()));
    setAllowLocalLogin(enabled || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local'));
  }, []);

  const ctaButtons = useMemo(
    () => (
      <>
        {hasSession ? (
          <Button asChild size="lg">
            <Link href="/app">
              进入生成器
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <>
            <Button
              size="lg"
              disabled={loading !== null}
              onClick={() => {
                void (async () => {
                  setLoading('x');
                  setPageError(null);
                  try {
                    const { url } = await startXOAuth();
                    window.location.href = url;
                  } catch (error) {
                    setPageError(toUiError(error, '拉起 X 登录失败，请稍后重试。'));
                    setLoading(null);
                  }
                })();
              }}
            >
              {loading === 'x' ? '正在跳转 X 登录…' : '用 X 登录开始'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {allowLocalLogin ? (
              <Button
                size="lg"
                variant="ghost"
                disabled={loading !== null}
                onClick={() => {
                  void (async () => {
                    setLoading('local');
                    setPageError(null);
                    try {
                      const { token } = await createLocalSession();
                      setToken(token);
                      window.location.href = '/app';
                    } catch (error) {
                      setPageError(toUiError(error, '本地体验登录失败，请检查本地服务。'));
                      setLoading(null);
                    }
                  })();
                }}
              >
                {loading === 'local' ? '正在创建本地会话…' : '本机快速体验'}
              </Button>
            ) : null}
          </>
        )}
      </>
    ),
    [allowLocalLogin, hasSession, loading]
  );

  return (
    <AppShell
      publicMode
      eyebrow="DraftOrbit"
      title="你说一句话，DraftOrbit 帮你产出可发的 X 内容"
      description="登录后直接写一句话。DraftOrbit 会先帮你生成结果，再由你决定是否发出去。"
      actions={ctaButtons}
    >
      {pageError ? <ErrorState error={pageError} /> : null}

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="do-panel p-6 sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            <Sparkles className="h-3.5 w-3.5" />
            一句话开始
          </div>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            只要一句目标，就开始生成。
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            你只需要写出今天想发什么。DraftOrbit 会先帮你生成，再由你决定要不要发出去。
          </p>

          <div className="mt-8 rounded-[28px] border border-slate-900/10 bg-slate-950 p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">示例输入</p>
            <p className="mt-3 text-base leading-7 text-slate-50">{examplePrompt}</p>
            <div className="mt-6 border-t border-white/10 pt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">生成结果示意</p>
              <p className="mt-3 text-base leading-7 text-slate-100">{exampleOutput}</p>
            </div>
          </div>
        </article>

        <article className="do-panel-soft p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">开始后就这三步</p>
          <div className="mt-5 space-y-3">
            {starterBullets.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-900/10 bg-white px-4 py-4 text-sm text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-900/10 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">现在就开始</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              如果你已经知道今天想发什么，登录后就直接进入生成器。
            </p>
            {hasSession ? (
              <Button asChild className="mt-4 w-full">
                <Link href="/app">
                  进入生成器
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        </article>
      </section>
    </AppShell>
  );
}
