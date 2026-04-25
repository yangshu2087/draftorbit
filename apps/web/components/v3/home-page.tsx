'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Sparkles, WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { ErrorState } from '../ui/state-feedback';
import { AppShell } from './shell';
import { createLocalSession, startXOAuth } from '../../lib/queries';
import { getToken, setToken } from '../../lib/api';
import { toUiError, type UiError } from '../../lib/ui-error';

const capabilityCards = [
  {
    title: '风格学习',
    description: '分析历史内容，学习写作风格',
    icon: 'sparkles'
  },
  {
    title: '推理生成',
    description: '理解到草稿，完整链路可见',
    icon: 'send'
  },
  {
    title: '发布执行',
    description: '审批后进入发布队列执行',
    icon: 'x'
  }
] as const;

function CapabilityIcon(props: { icon: (typeof capabilityCards)[number]['icon'] }) {
  if (props.icon === 'sparkles') return <Sparkles className="h-5 w-5" />;
  if (props.icon === 'send') return <ArrowRight className="h-5 w-5 -rotate-45" />;
  return <span className="text-2xl font-medium leading-none">𝕏</span>;
}

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

  const startXLogin = () => {
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
  };

  const startLocalLogin = () => {
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
  };

  return (
    <AppShell publicMode>
      <section className="flex min-h-[calc(100vh-9rem)] items-center justify-center py-10 sm:py-16">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/80 px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            DraftOrbit
          </div>

          <h1 className="mt-7 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            {hasSession ? '已登录，可进入生成器' : '登录您的账户'}
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
            {hasSession
              ? '继续用一句话生成可发布内容；发布前仍会由你人工确认。'
              : '用 X 登录后，DraftOrbit 会学习风格、生成草稿，并把发布动作放进确认队列。'}
          </p>

          <div className="mt-10 flex w-full max-w-[480px] flex-col items-center gap-3">
            {hasSession ? (
              <Button asChild size="lg" className="h-14 w-full rounded-full text-base shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
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
                  onClick={startXLogin}
                  className="h-14 w-full rounded-full bg-black text-base text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)] hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-500"
                >
                  <span className="mr-2 text-lg leading-none">𝕏</span>
                  {loading === 'x' ? '正在跳转 X 登录…' : '使用 X 登录，免费试用'}
                </Button>
                <p className="text-sm text-slate-500">新用户可直接免费试用</p>
                {allowLocalLogin ? (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={loading !== null}
                      onClick={startLocalLogin}
                      className="rounded-full px-4 text-slate-500 hover:bg-white hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                    >
                      {loading === 'local' ? '正在创建本地会话…' : '本机快速体验'}
                    </Button>
                    <Button asChild size="sm" variant="outline" className="rounded-full bg-white/70 px-4">
                      <Link href="/v4">
                        V4 图文工作台
                        <WandSparkles className="ml-2 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>

          {pageError ? <div className="mt-6 w-full max-w-xl text-left"><ErrorState error={pageError} /></div> : null}

          <div className="mt-14 grid w-full max-w-[520px] gap-4 sm:grid-cols-3">
            {capabilityCards.map((card) => (
              <article
                key={card.title}
                className="group rounded-2xl border border-slate-900/10 bg-white/85 p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-700 transition group-hover:bg-slate-50 group-hover:text-slate-950">
                  <CapabilityIcon icon={card.icon} />
                </div>
                <h2 className="mt-4 text-sm font-semibold text-slate-950">{card.title}</h2>
                <p className="mt-2 text-xs leading-5 text-slate-500">{card.description}</p>
              </article>
            ))}
          </div>

          <div className="mt-10 flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            发布前始终需要你确认，不会自动发出
          </div>
        </div>
      </section>
    </AppShell>
  );
}
