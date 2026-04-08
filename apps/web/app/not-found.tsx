import Link from 'next/link';
import { Button } from '../components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="do-panel w-full max-w-lg p-6 text-center">
        <p className="text-lg font-semibold text-slate-900">页面不存在</p>
        <p className="mt-2 text-sm text-slate-500">你访问的地址可能已变更，请返回生成器继续操作。</p>
        <Button asChild className="mt-4" size="sm">
          <Link href="/app">进入生成器</Link>
        </Button>
      </div>
    </div>
  );
}
