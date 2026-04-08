'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE_URL, setToken } from '../../../lib/api';

function Spinner() {
  return (
    <div
      className="h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900"
      role="status"
      aria-label="加载中"
    />
  );
}

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('正在完成登录…');

  useEffect(() => {
    const state = searchParams.get('state');
    const code = searchParams.get('code');

    if (!state || !code) {
      setPhase('error');
      setMessage('缺少授权参数，请重新登录。');
      const t = setTimeout(() => router.replace('/'), 3000);
      return () => clearTimeout(t);
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/auth/x/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`,
          { cache: 'no-store' }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            typeof data?.message === 'string'
              ? data.message
              : Array.isArray(data?.message)
                ? data.message.join(' ')
                : '登录失败，请重试。';
          throw new Error(msg);
        }
        if (!data?.token) throw new Error('未收到令牌，请重试。');
        if (!cancelled) {
          setToken(data.token);
          router.replace('/app?from=auth-login');
        }
      } catch (e) {
        if (cancelled) return;
        setPhase('error');
        setMessage(e instanceof Error ? e.message : '登录失败');
        setTimeout(() => router.replace('/app?from=auth-login'), 3000);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4">
      {phase === 'loading' ? <Spinner /> : null}
      <p className={`text-center text-sm ${phase === 'error' ? 'text-red-600' : 'text-slate-600'}`}>{message}</p>
      {phase === 'error' ? <p className="text-center text-xs text-slate-400">3 秒后返回首页…</p> : null}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
          <Spinner />
          <p className="text-sm text-slate-600">正在完成登录…</p>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
