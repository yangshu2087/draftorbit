'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { finishXAccountOAuthBind } from '../../../../lib/queries';

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
  const [message, setMessage] = useState('正在完成账号绑定…');

  useEffect(() => {
    const state = searchParams.get('state');
    const code = searchParams.get('code');

    if (!state || !code) {
      setPhase('error');
      setMessage('缺少授权参数，请返回后重试。');
      const t = setTimeout(() => router.replace('/chat?xbind=error'), 2200);
      return () => clearTimeout(t);
    }

    let cancelled = false;

    (async () => {
      try {
        await finishXAccountOAuthBind(state, code);
        if (!cancelled) {
          setMessage('绑定成功，正在返回聊天中枢…');
          setTimeout(() => router.replace('/chat?xbind=success'), 400);
        }
      } catch (e) {
        if (cancelled) return;
        setPhase('error');
        setMessage(e instanceof Error ? e.message : '绑定失败');
        setTimeout(() => router.replace('/chat?xbind=error'), 2500);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4">
      {phase === 'loading' ? <Spinner /> : null}
      <p className={`text-center text-sm ${phase === 'error' ? 'text-red-600' : 'text-slate-700'}`}>{message}</p>
      {phase === 'error' ? <p className="text-center text-xs text-slate-400">即将返回聊天中枢…</p> : null}
    </div>
  );
}

export default function XAccountOAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white">
          <Spinner />
          <p className="text-sm text-slate-600">正在完成账号绑定…</p>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
