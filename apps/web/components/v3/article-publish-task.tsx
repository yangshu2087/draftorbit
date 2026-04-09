'use client';

import { CheckCircle2, Copy, ExternalLink, Loader2, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { XArticlePublishCapability } from '@draftorbit/shared';
import { Button } from '../ui/button';

type ArticlePublishTaskProps = {
  capability: XArticlePublishCapability;
  draftText: string | null;
  runId: string | null;
  publishedUrl?: string | null;
  busyAction: string | null;
  onCopy: (text: string) => Promise<void>;
  onOpenX: () => void;
  onSaveUrl: (runId: string, url: string) => Promise<void>;
  onNativePublish?: (runId: string) => Promise<void>;
};

export function ArticlePublishTask(props: ArticlePublishTaskProps) {
  const [articleUrlInput, setArticleUrlInput] = useState('');

  useEffect(() => {
    if (props.publishedUrl) setArticleUrlInput(props.publishedUrl);
  }, [props.publishedUrl]);

  if (props.capability.mode === 'native_x_api') {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          当前账号支持直接发布长文。确认后可直接发到 X；如需手动处理，也可以先复制正文备用。
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button className="w-full" variant="outline" disabled={!props.draftText} onClick={() => props.draftText ? void props.onCopy(props.draftText) : undefined}>
            <Copy className="mr-2 h-4 w-4" />
            复制长文备用
          </Button>
          <Button className="w-full" disabled={!props.onNativePublish || !props.runId} onClick={() => props.runId ? void props.onNativePublish?.(props.runId) : undefined}>
            <Send className="mr-2 h-4 w-4" />
            直接发布到 X
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{props.capability.description}</span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          className="w-full"
          disabled={props.busyAction === 'export-article' || !props.draftText}
          onClick={() => props.draftText ? void props.onCopy(props.draftText) : undefined}
        >
          {props.busyAction === 'export-article' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
          复制长文
        </Button>
        <Button className="w-full" variant="outline" onClick={props.onOpenX}>
          <ExternalLink className="mr-2 h-4 w-4" />
          打开 X 网页端
        </Button>
      </div>
      <div className="space-y-3 rounded-2xl border border-sky-200/70 bg-white px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">发布后把文章链接贴回来</p>
        <input
          value={articleUrlInput}
          onChange={(event) => setArticleUrlInput(event.target.value)}
          placeholder="https://x.com/i/articles/..."
        />
        <Button
          className="w-full"
          disabled={props.busyAction === 'complete-article' || !props.runId || !articleUrlInput.trim()}
          onClick={() => props.runId ? void props.onSaveUrl(props.runId, articleUrlInput) : undefined}
        >
          {props.busyAction === 'complete-article' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
          保存文章链接
        </Button>
        <p className="text-xs leading-5 text-slate-500">保存后，这篇长文会从待处理移到已发布，你下次回来也能继续追踪。</p>
        {props.publishedUrl ? (
          <a
            href={props.publishedUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 underline decoration-sky-300 underline-offset-4"
          >
            <ExternalLink className="h-4 w-4" />
            查看已记录文章
          </a>
        ) : null}
      </div>
    </div>
  );
}
