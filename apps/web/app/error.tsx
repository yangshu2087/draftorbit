'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '../components/ui/button';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-xl border border-red-200/90 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-red-700">页面发生错误</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">{error.message || '出现未知错误，请稍后重试。'}</p>
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={reset}>
            重新加载
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/app">回到 Operator</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
