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
      { href: '/x-accounts', label: 'X 账号管理' },
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
      { href: '/naturalization', label: '自然化润色' },
      { href: '/media', label: '配图与素材' }
    ]
  },
  {
    label: '执行',
    items: [
      { href: '/publish-queue', label: '发布队列' },
      { href: '/workflow', label: '模板与流程' }
    ]
  },
  {
    label: '互动',
    items: [{ href: '/reply-queue', label: '回复队列' }]
  },
  {
    label: '系统',
    items: [
      { href: '/dashboard', label: '运营总览' },
      { href: '/providers', label: '模型服务中心' },
      { href: '/usage', label: '用量与计费' },
      { href: '/audit', label: '审计日志' }
    ]
  }
] as const;

export function WorkbenchShell(props: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUserFromToken();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="font-semibold text-gray-900">
            DraftOrbit
          </Link>
          <div className="flex items-center gap-2">
            {user?.handle ? (
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700">@{user.handle}</span>
            ) : null}
            <Button
              variant="outline"
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

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border border-gray-200 bg-white p-2">
          <nav className="space-y-3">
            {NAV_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1">
                <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">{group.label}</p>
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'block rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                        active && 'bg-gray-900 text-white hover:bg-gray-900 hover:text-white'
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

        <main className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <h1 className="text-xl font-semibold">{props.title}</h1>
            {props.description ? <p className="mt-1 text-sm text-gray-500">{props.description}</p> : null}
          </div>
          {props.children}
        </main>
      </div>
    </div>
  );
}
