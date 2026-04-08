import Link from 'next/link';

export default function BillingSuccessPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">支付已完成</h1>
      <p className="mt-3 text-slate-600">
        我们正在同步你的订阅状态。通常会在几秒内生效，如未刷新请稍后回到账单页查看。
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/pricing"
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          返回定价页
        </Link>
        <Link
          href="/app"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          前往生成器
        </Link>
      </div>
    </main>
  );
}
