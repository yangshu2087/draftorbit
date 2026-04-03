'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { API_BASE_URL, setToken } from '../../../lib/api';

function GoogleCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState('正在完成 Google 登录...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const state = searchParams.get('state');
    const code = searchParams.get('code');
    if (!state || !code) {
      setError('缺少 state/code 参数');
      setTimeout(() => router.replace('/'), 2000);
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/auth/google/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (!res.ok || !data?.token) {
          throw new Error(data?.message || 'Google 登录失败');
        }
        setToken(data.token);
        router.replace('/dashboard');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Google 登录失败');
        setTimeout(() => router.replace('/'), 2000);
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="text-center">
        <p className="text-sm text-gray-600">{message}</p>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-white text-sm text-gray-600">
          正在完成 Google 登录...
        </div>
      }
    >
      <GoogleCallbackInner />
    </Suspense>
  );
}

