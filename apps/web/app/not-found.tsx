import Link from 'next/link';
import { Button } from '../components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-gray-900">页面不存在</p>
        <p className="mt-2 text-sm text-gray-500">你访问的地址可能已变更，请返回工作台继续操作。</p>
        <Button asChild className="mt-4" size="sm">
          <Link href="/dashboard">进入工作台</Link>
        </Button>
      </div>
    </div>
  );
}
