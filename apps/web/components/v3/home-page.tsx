'use client';

import Link from 'next/link';
import { ArrowRight, BrainCircuit, CheckCircle2, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { ErrorState } from '../ui/state-feedback';
import { AppShell } from './shell';
import { createLocalSession, startGoogleOAuth, startXOAuth } from '../../lib/queries';
import { getToken, setToken } from '../../lib/api';
import { toUiError, type UiError } from '../../lib/ui-error';

const outcomeSteps = [
  '理解你的目标与 X 语境',
  '自动学习你的历史风格与外部样本',
  '生成可发短推 / 串推 / 长文与配图建议',
  '做合规与风险检查，再交给你确认发布'
];

const promiseCards = [
  {
    icon: BrainCircuit,
    title: '强推理在后台自动完成',
    description: '不再让用户手填目标、受众、CTA。你只说一句话，剩下交给 Agent 编排。'
  },
  {
    icon: ShieldCheck,
    title: '默认人工确认，降低封号风险',
    description: '生成结果先进入待确认队列。你看到账号命中、风险分与建议动作，再决定是否发布。'
  },
  {
    icon: Rocket,
    title: '真正服务于 X 自动化运营',
    description: '不是通用 AI Chat，也不是复杂 dashboard，而是专注 X 的运营中枢。'
  }
];

export default function HomePage() {
  const [loading, setLoading] = useState<'x' | 'google' | 'local' | null>(null);
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
              进入 Operator
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
                setPageError(toUiError(error, '拉起 X 登录失败，请稍后重试'));
                setLoading(null);
              }
            })();
          }}
        >
          {loading === 'x' ? '正在跳转 X 登录…' : '用 X 登录开始'}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={loading !== null}
          onClick={() => {
            void (async () => {
              setLoading('google');
              setPageError(null);
              try {
                const { url } = await startGoogleOAuth();
                window.location.href = url;
              } catch (error) {
                setPageError(toUiError(error, '拉起 Google 登录失败，请稍后重试'));
                setLoading(null);
              }
            })();
          }}
        >
          {loading === 'google' ? '正在跳转 Google…' : 'Google 登录'}
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
                  setPageError(toUiError(error, '本地体验登录失败，请检查本地服务'));
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
      eyebrow="DraftOrbit V3"
      title="一句话下指令，自动产出可发的 X 内容结果包"
      description="DraftOrbit 是面向 X 自动化运营的 AI Operator：自动学习你的历史表达、研究平台语境、规划 hook 与结构、生成草稿与配图建议，并在发布前做风险检查。"
      actions={ctaButtons}
    >
      {pageError ? <ErrorState error={pageError} /> : null}

      <section className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[28px] border border-slate-900/8 bg-slate-950 p-8 text-white shadow-[0_30px_80px_rgba(15,23,42,0.25)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200">
            <Sparkles className="h-3.5 w-3.5" />
            Agent-first X Operations
          </div>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">不用再搭工作台。你只负责说目标。</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            比如：
            <span className="font-medium text-white">“参考我最近的风格，写一条关于 AI 产品冷启动的观点短推，并给配图方向。”</span>
            系统会自动完成研究、推理、草稿、人味化和发布前检查。
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {outcomeSteps.map((item, index) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">0{index + 1}</p>
                <p className="mt-2 text-sm leading-6 text-slate-100">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {promiseCards.map((card) => {
            const Icon = card.icon;
            return (
              <article key={card.title} className="do-panel p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-950">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
              </article>
            );
          })}

          <article className="do-panel-soft p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">结果导向</p>
            <ul className="mt-3 space-y-3 text-sm text-slate-700">
              {['默认中文优先', '支持短推 / 串推 / 长文 / 文+图', '支持接入 X 历史、目标账号、Obsidian、本地文件、URL'].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Button asChild variant="ghost" className="mt-4 px-0 text-slate-900">
              <Link href="/pricing">查看 Starter / Growth / Max 套餐</Link>
            </Button>
          </article>
        </div>
      </section>
    </AppShell>
  );
}
