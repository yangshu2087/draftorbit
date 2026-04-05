'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { Button } from '../ui/button';
import { clearToken, getUserFromToken } from '../../lib/api';
import { cn } from '../../lib/utils';

const NAV_GROUPS = [
  {
    label: '准备',
    items: [
      { href: '/x-accounts', label: 'X 账号' },
      { href: '/topics', label: '选题中心' },
      { href: '/learning', label: '学习来源' },
      { href: '/voice-profiles', label: '文风画像' },
      { href: '/playbooks', label: '运营手册' }
    ]
  },
  {
    label: '生产',
    items: [
      { href: '/drafts', label: '草稿工坊' },
      { href: '/naturalization', label: '自然润色' },
      { href: '/media', label: '配图素材' }
    ]
  },
  {
    label: '执行',
    items: [
      { href: '/publish-queue', label: '发布队列' },
      { href: '/workflow', label: '流程模板' }
    ]
  },
  {
    label: '互动',
    items: [{ href: '/reply-queue', label: '回复互动' }]
  },
  {
    label: '系统',
    items: [
      { href: '/dashboard', label: '运营总览' },
      { href: '/providers', label: '模型服务中心' },
      { href: '/usage', label: '订阅与用量' },
      { href: '/audit', label: '操作日志' }
    ]
  }
] as const;

const STAGES = [
  { key: '准备', routes: ['/x-accounts', '/topics', '/learning', '/voice-profiles', '/playbooks'] },
  { key: '生产', routes: ['/drafts', '/naturalization', '/media'] },
  { key: '执行', routes: ['/publish-queue', '/workflow'] },
  { key: '互动', routes: ['/reply-queue'] },
  { key: '系统', routes: ['/dashboard', '/providers', '/usage', '/audit'] }
] as const;

const NEXT_ACTIONS: Array<{ match: string; href: string; label: string }> = [
  { match: '/x-accounts', href: '/topics', label: '下一步：新建选题' },
  { match: '/topics', href: '/drafts', label: '下一步：生成草稿' },
  { match: '/learning', href: '/voice-profiles', label: '下一步：维护文风画像' },
  { match: '/voice-profiles', href: '/playbooks', label: '下一步：配置运营手册' },
  { match: '/playbooks', href: '/drafts', label: '下一步：进入草稿工坊' },
  { match: '/drafts', href: '/publish-queue', label: '下一步：进入发布队列' },
  { match: '/naturalization', href: '/media', label: '下一步：准备配图素材' },
  { match: '/media', href: '/publish-queue', label: '下一步：提交发布任务' },
  { match: '/publish-queue', href: '/reply-queue', label: '下一步：处理互动回复' },
  { match: '/reply-queue', href: '/dashboard', label: '下一步：查看运营漏斗' },
  { match: '/workflow', href: '/dashboard', label: '下一步：回看运营总览' },
  { match: '/dashboard', href: '/providers', label: '下一步：查看模型路由' },
  { match: '/providers', href: '/usage', label: '下一步：查看用量成本' },
  { match: '/usage', href: '/audit', label: '下一步：核对操作日志' },
  { match: '/audit', href: '/x-accounts', label: '下一步：回到准备阶段' }
];

function resolveCurrentStage(pathname: string): string | null {
  for (const stage of STAGES) {
    if (stage.routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
      return stage.key;
    }
  }
  return null;
}

function resolveNextAction(pathname: string): { href: string; label: string } | null {
  const found = NEXT_ACTIONS.find((item) => pathname === item.match || pathname.startsWith(`${item.match}/`));
  return found ?? null;
}

export function WorkbenchShell(props: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUserFromToken();
  const currentStage = resolveCurrentStage(pathname);
  const nextAction = resolveNextAction(pathname);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fdf8f5_0,#f6f7fb_45%,#f3f5fb_100%)] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-900/10 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-lg font-semibold tracking-tight text-slate-900">
              DraftOrbit
            </Link>
            <span className="hidden rounded-full border border-[#f5cdbd] bg-[#fff5f0] px-2.5 py-0.5 text-[11px] font-medium text-[#a64b2a] sm:inline">
              内容运营工作台
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {user?.handle ? (
              <span className="rounded-full border border-slate-900/10 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                @{user.handle}
              </span>
            ) : null}
            <Button variant="outline" size="sm" asChild>
              <Link href="/pricing">订阅</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearToken();
                router.push('/');
              }}
            >
              退出
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-4 py-5 lg:grid-cols-[258px_1fr]">
        <aside className="do-panel bg-white/80 p-3 backdrop-blur">
          <nav className="space-y-4">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <p className="px-3 pt-1 text-[11px] font-semibold tracking-[0.14em] text-slate-400">{group.label}</p>
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'block rounded-xl px-3 py-2.5 text-[13px] font-medium transition',
                        active
                          ? 'bg-gradient-to-r from-slate-900 to-slate-700 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <main className="do-panel space-y-5 bg-white/85 p-5 backdrop-blur">
          <div className="rounded-2xl border border-slate-900/10 bg-gradient-to-r from-white to-slate-50/85 p-4">
            <h1 className="text-2xl font-semibold">{props.title}</h1>
            {props.description ? <p className="mt-1.5 text-sm leading-6 text-slate-500">{props.description}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {STAGES.map((stage) => {
                const active = currentStage === stage.key;
                return (
                  <span
                    key={stage.key}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium',
                      active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {stage.key}
                  </span>
                );
              })}

              {nextAction ? (
                <Link
                  href={nextAction.href}
                  className="ml-auto rounded-full border border-slate-900/15 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 transition hover:border-slate-900/30 hover:text-slate-900"
                >
                  {nextAction.label}
                </Link>
              ) : null}
            </div>
          </div>
          {props.children}
        </main>
      </div>
    </div>
  );
}
