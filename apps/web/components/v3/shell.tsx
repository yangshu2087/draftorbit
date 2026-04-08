'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bot, CreditCard, LogOut, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '../ui/button';
import { clearToken, getToken, getUserFromToken } from '../../lib/api';
import { cn } from '../../lib/utils';

const signedInNav = [
  { href: '/app', label: 'Operator', icon: Bot }
];

const publicNav = [
  { href: '/pricing', label: 'Pricing', icon: CreditCard }
];

export function planLabel(plan?: string | null): string {
  const normalized = (plan ?? 'STARTER').toUpperCase();
  if (normalized === 'PREMIUM') return 'Max';
  if (normalized === 'PRO') return 'Growth';
  if (normalized === 'STARTER') return 'Starter';
  if (normalized === 'FREE') return 'Trial';
  return normalized;
}

export function AppShell(props: {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  publicMode?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [userBrief, setUserBrief] = useState<ReturnType<typeof getUserFromToken>>(null);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    const sync = () => {
      setUserBrief(getUserFromToken());
      setHasToken(Boolean(getToken()));
    };
    sync();
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, []);

  const navItems = useMemo(() => {
    if (hasToken) return signedInNav;
    if (props.publicMode) return publicNav;
    return [];
  }, [hasToken, props.publicMode]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fdfdfd_0,#f6f7fb_45%,#eef2ff_100%)] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href={hasToken ? '/app' : '/'} className="flex items-center gap-2 text-lg font-semibold tracking-tight text-slate-950">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                <Sparkles className="h-4 w-4" />
              </span>
              <span>DraftOrbit</span>
            </Link>
            <span className="hidden rounded-full border border-slate-900/10 bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500 md:inline-flex">
              X AI Operator
            </span>
          </div>

          <nav className="hidden items-center gap-1 rounded-full border border-slate-900/10 bg-white/90 p-1 shadow-sm md:flex">
            {navItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition',
                    active ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {userBrief ? (
              <>
                <span className="hidden rounded-full border border-slate-900/10 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-flex">
                  @{userBrief.handle}
                </span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  {planLabel(userBrief.plan)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearToken();
                    router.push('/');
                    router.refresh();
                  }}
                >
                  <LogOut className="mr-1 h-3.5 w-3.5" />
                  退出
                </Button>
              </>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/pricing">查看套餐</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6">
        {(props.eyebrow || props.title || props.description || props.actions) && (
          <section className="flex flex-col gap-4 rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:items-end sm:justify-between">
            <div>
              {props.eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{props.eyebrow}</p>
              ) : null}
              {props.title ? <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{props.title}</h1> : null}
              {props.description ? <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{props.description}</p> : null}
            </div>
            {props.actions ? <div className="flex flex-wrap items-center gap-3">{props.actions}</div> : null}
          </section>
        )}

        {props.children}
      </main>
    </div>
  );
}
