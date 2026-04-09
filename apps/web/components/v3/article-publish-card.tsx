'use client';

import { CheckCircle2, Copy, ExternalLink, Loader2, Send, ShieldCheck } from 'lucide-react';
import type { XArticlePublishCapability } from '@draftorbit/shared';
import { Button } from '../ui/button';

type ArticlePublishCardProps = {
  capability: XArticlePublishCapability;
  draftText: string;
  articleUrl: string;
  saving: boolean;
  publishedUrl?: string | null;
  onArticleUrlChange: (value: string) => void;
  onCopy: () => Promise<void>;
  onCopyAndOpen: () => Promise<void>;
  onOpenX: () => void;
  onSaveUrl: (url: string) => Promise<void>;
  onNativePublish?: () => Promise<void>;
};

function ManualExportCard(props: ArticlePublishCardProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
      <div className="flex items-start gap-2 text-sm text-sky-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{props.capability.description}</span>
      </div>
      <ol className="space-y-2 rounded-2xl border border-sky-200/70 bg-white/80 px-4 py-3 text-sm text-slate-700">
        <li>1. 复制这篇长文。</li>
        <li>2. 打开 X 网页端，把内容粘贴到文章编辑器。</li>
        <li>3. 发布后把最终文章链接贴回来，系统会把它记为“已发布”。</li>
      </ol>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => void props.onCopy()} disabled={!props.draftText.trim()}>
          <Copy className="mr-2 h-4 w-4" />
          只复制长文
        </Button>
        <Button onClick={() => void props.onCopyAndOpen()} disabled={!props.draftText.trim()}>
          <ExternalLink className="mr-2 h-4 w-4" />
          复制并去 X 发布
        </Button>
      </div>
      <div className="space-y-2 rounded-2xl border border-sky-200/70 bg-white/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">发布后把文章链接贴回来</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={props.articleUrl}
            onChange={(event) => props.onArticleUrlChange(event.target.value)}
            placeholder="https://x.com/i/articles/..."
            className="min-w-0 flex-1"
          />
          <Button disabled={props.saving || !props.articleUrl.trim()} onClick={() => void props.onSaveUrl(props.articleUrl)}>
            {props.saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            保存文章链接
          </Button>
        </div>
        <p className="text-xs leading-5 text-sky-700">保存后，这篇长文会从“待处理”移到“已发布”，后续 agent 就能继续追踪这篇文章。</p>
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

function NativePublishCard(props: ArticlePublishCardProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-2 text-sm text-emerald-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{props.capability.description}</span>
      </div>
      <div className="rounded-2xl border border-emerald-200/70 bg-white/80 px-4 py-3 text-sm text-slate-700">
        当前账号支持直接发布长文。确认内容和风险后，可以直接发到 X；如果你想手动处理，也可以先复制正文备用。
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => void props.onCopy()} disabled={!props.draftText.trim()}>
          <Copy className="mr-2 h-4 w-4" />
          复制长文备用
        </Button>
        <Button onClick={() => void props.onNativePublish?.()} disabled={!props.onNativePublish}>
          <Send className="mr-2 h-4 w-4" />
          直接发布到 X
        </Button>
      </div>
    </div>
  );
}

export function ArticlePublishCard(props: ArticlePublishCardProps) {
  return props.capability.mode === 'manual_x_web'
    ? <ManualExportCard {...props} />
    : <NativePublishCard {...props} />;
}
