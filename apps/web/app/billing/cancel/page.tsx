import Link from 'next/link';

export default function BillingCancelPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">你已取消本次支付</h1>
      <p className="mt-3 text-slate-600">
        没关系，你可以稍后随时回来继续开通试用。当前账号和数据不会受影响。
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/pricing"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          返回定价页
        </Link>
        <Link
          href="/chat"
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          返回聊天中枢
        </Link>
      </div>
    </main>
  );
}
