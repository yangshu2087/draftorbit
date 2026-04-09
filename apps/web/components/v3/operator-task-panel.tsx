'use client';

import { CheckCircle2, Copy, ExternalLink, Loader2, RefreshCcw, Sparkles, UploadCloud, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { EmptyState, SuccessNotice } from '../ui/state-feedback';
import type { V3ProfileResponse, V3QueueResponse } from '../../lib/queries';
import type { TaskPanelMeta } from '../../lib/v3-ui';
import { cn } from '../../lib/utils';

type Props = {
  action: string;
  meta: TaskPanelMeta;
  profile: V3ProfileResponse | null;
  queue: V3QueueResponse | null;
  busyAction: string | null;
  xbind?: string | null;
  highlight?: string | null;
  published?: string | null;
  onClose: () => void;
  onConnectSelfX: () => Promise<void>;
  onConnectTargetX: (value: string) => Promise<void>;
  onImportUrls: (urls: string[]) => Promise<void>;
  onConnectObsidian: (value: string) => Promise<void>;
  onConnectLocalFiles: (paths: string[]) => Promise<void>;
  onRebuildProfile: () => Promise<void>;
  onConfirmPublish: (runId: string) => Promise<void>;
  onExportArticle: (text: string) => Promise<void>;
  articleDraftText?: string | null;
  articlePublishedUrl?: string | null;
  onOpenXArticle: () => void;
  onCompleteArticlePublish: (runId: string, url: string) => Promise<void>;
};

type LearningMode = 'target' | 'url' | 'obsidian' | 'files';

function panelToneClass(tone: TaskPanelMeta['tone']) {
  return tone === 'queue'
    ? 'border-amber-200 bg-amber-50/70'
    : 'border-sky-200 bg-sky-50/70';
}

function ConnectedAccountSummary(props: { profile: V3ProfileResponse | null }) {
  if (!props.profile?.xAccounts.length) {
    return (
      <EmptyState
        title="还没有连接 X 账号"
        description="先完成账号连接，后续生成会更像你本人，也能进入正式发布流程。"
      />
    );
  }

  return (
    <div className="space-y-3">
      {props.profile.xAccounts.map((account) => (
        <div key={account.id} className="rounded-2xl border border-slate-900/10 bg-white px-4 py-3 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">@{account.handle}</p>
              <p className="mt-1 text-xs text-slate-500">
                {account.status}
                {account.isDefault ? ' · 默认账号' : ''}
              </p>
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OperatorTaskPanel(props: Props) {
  const [learningMode, setLearningMode] = useState<LearningMode>('target');
  const [targetInput, setTargetInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [obsidianPath, setObsidianPath] = useState('');
  const [localPaths, setLocalPaths] = useState('');
  const [articleUrlInput, setArticleUrlInput] = useState('');

  const selectedReview = useMemo(() => {
    const review = props.queue?.review ?? [];
    if (!review.length) return null;
    if (props.highlight) {
      return review.find((item) => item.runId === props.highlight) ?? review[0];
    }
    return review[0];
  }, [props.highlight, props.queue?.review]);

  const highlightedPublished = useMemo(() => {
    if (!props.highlight) return null;
    return props.queue?.published.find((item) => item.runId === props.highlight) ?? null;
  }, [props.highlight, props.queue?.published]);

  const articleTargetRunId = selectedReview?.runId ?? props.highlight ?? null;
  const articleRecordedUrl = props.articlePublishedUrl ?? highlightedPublished?.externalPostId ?? null;
  const articlePreviewText = props.articleDraftText ?? selectedReview?.text ?? null;

  useEffect(() => {
    if (articleRecordedUrl) {
      setArticleUrlInput(articleRecordedUrl);
    }
  }, [articleRecordedUrl]);

  const summaryNotice = useMemo(() => {
    if (props.xbind === 'success') return '连接已完成，回到主界面后就可以继续生成。';
    if (props.xbind === 'error') return '这次连接没有完成，你可以直接在这里重新发起连接。';
    if (props.published && props.action === 'export_article') return '这篇长文的发布链接已记录。现在可以关闭面板，继续生成下一条。';
    if (props.published) return '这条内容已经进入发布队列。你可以关闭面板后继续生成下一条。';
    return null;
  }, [props.action, props.published, props.xbind]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30 backdrop-blur-[2px]">
      <div className="flex h-full w-full max-w-[520px] flex-col border-l border-slate-900/10 bg-white shadow-2xl">
        <div className={cn('border-b px-5 py-4', panelToneClass(props.meta.tone))}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">当前必须完成</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">{props.meta.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{props.meta.description}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={props.onClose} aria-label="关闭任务面板">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {summaryNotice ? <SuccessNotice message={summaryNotice} /> : null}

          {props.action === 'connect_x_self' ? (
            <>
              <ConnectedAccountSummary profile={props.profile} />
              <Button
                className="w-full"
                disabled={props.busyAction === 'x-self'}
                onClick={() => {
                  void (async () => {
                    try {
                      await props.onConnectSelfX();
                    } catch {}
                  })();
                }}
              >
                {props.busyAction === 'x-self' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                {props.profile?.xAccounts.length ? '重新连接 X 账号' : props.meta.primaryLabel}
              </Button>
            </>
          ) : null}

          {props.action === 'rebuild_profile' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">当前风格画像</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {props.profile?.styleSummary ?? '还没有可用画像。先连接自己的 X 账号，再点一次重建。'}
                </p>
                <p className="mt-3 text-xs text-slate-500">样本数：{props.profile?.styleSampleCount ?? 0}</p>
              </div>
              <Button
                className="w-full"
                disabled={props.busyAction === 'rebuild-profile'}
                onClick={() => {
                  void (async () => {
                    try {
                      await props.onRebuildProfile();
                    } catch {}
                  })();
                }}
              >
                {props.busyAction === 'rebuild-profile' ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                )}
                {props.meta.primaryLabel}
              </Button>
            </div>
          ) : null}

          {props.action === 'connect_learning_source' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  ['target', '目标账号 / 推文'],
                  ['url', 'URL'],
                  ['obsidian', 'Obsidian'],
                  ['files', '本地文件']
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      'rounded-full border px-3 py-2 text-xs transition',
                      learningMode === value
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-900/10 bg-white text-slate-600 hover:border-slate-900/20'
                    )}
                    onClick={() => setLearningMode(value as LearningMode)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {learningMode === 'target' ? (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-slate-600">先补一个最像你想学习的账号或推文链接就够了。</p>
                  <input
                    value={targetInput}
                    onChange={(event) => setTargetInput(event.target.value)}
                    placeholder="@someone 或 https://x.com/..."
                  />
                  <Button
                    className="w-full"
                    disabled={props.busyAction === 'x-target' || !targetInput.trim()}
                    onClick={() => {
                      void (async () => {
                        try {
                          await props.onConnectTargetX(targetInput.trim());
                          setTargetInput('');
                        } catch {}
                      })();
                    }}
                  >
                    {props.busyAction === 'x-target' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    添加学习样本
                  </Button>
                </div>
              ) : null}

              {learningMode === 'url' ? (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-slate-600">每行一个链接，适合文章、产品页或外部说明材料。</p>
                  <textarea
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                    placeholder={'https://example.com/post\nhttps://x.com/...'}
                  />
                  <Button
                    className="w-full"
                    disabled={props.busyAction === 'urls' || !urlInput.trim()}
                    onClick={() => {
                      void (async () => {
                        try {
                          await props.onImportUrls(urlInput.split('\n').map((item) => item.trim()).filter(Boolean));
                          setUrlInput('');
                        } catch {}
                      })();
                    }}
                  >
                    {props.busyAction === 'urls' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                    导入 URL
                  </Button>
                </div>
              ) : null}

              {learningMode === 'obsidian' ? (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-slate-600">给一个 vault 路径即可，系统会自动学习其中内容。</p>
                  <input value={obsidianPath} onChange={(event) => setObsidianPath(event.target.value)} placeholder="/Users/you/Notes" />
                  <Button
                    className="w-full"
                    disabled={props.busyAction === 'obsidian' || !obsidianPath.trim()}
                    onClick={() => {
                      void (async () => {
                        try {
                          await props.onConnectObsidian(obsidianPath.trim());
                          setObsidianPath('');
                        } catch {}
                      })();
                    }}
                  >
                    {props.busyAction === 'obsidian' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                    接入 Obsidian
                  </Button>
                </div>
              ) : null}

              {learningMode === 'files' ? (
                <div className="space-y-3">
                  <p className="text-sm leading-6 text-slate-600">每行一个文件路径，适合已有资料或归档目录。</p>
                  <textarea
                    value={localPaths}
                    onChange={(event) => setLocalPaths(event.target.value)}
                    placeholder={'/Users/you/Desktop/notes.md\n/Users/you/Desktop/brief.pdf'}
                  />
                  <Button
                    className="w-full"
                    disabled={props.busyAction === 'local-files' || !localPaths.trim()}
                    onClick={() => {
                      void (async () => {
                        try {
                          await props.onConnectLocalFiles(localPaths.split('\n').map((item) => item.trim()).filter(Boolean));
                          setLocalPaths('');
                        } catch {}
                      })();
                    }}
                  >
                    {props.busyAction === 'local-files' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                    导入本地文件
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {(props.action === 'open_queue' || props.action === 'confirm_publish' || props.action === 'export_article') ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-900/10 bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  待确认 {props.queue?.review.length ?? 0}
                </span>
                <span className="rounded-full border border-slate-900/10 bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  已排队 {props.queue?.queued.length ?? 0}
                </span>
                <span className="rounded-full border border-slate-900/10 bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  已发布 {props.queue?.published.length ?? 0}
                </span>
              </div>

              {selectedReview ? (
                <div className="space-y-4 rounded-2xl border border-slate-900/10 bg-white p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">当前待确认内容</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-900">{selectedReview.text ?? '结果包待刷新'}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedReview.riskFlags.length ? selectedReview.riskFlags.map((flag) => (
                      <span key={flag} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">
                        {flag}
                      </span>
                    )) : (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
                        当前没有明显风险
                      </span>
                    )}
                  </div>

                  {selectedReview.format === 'article' ? (
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                        当前长文走 X 网页端发布：复制正文、去 X 完成发布，再把最终文章链接贴回来。
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button
                          className="w-full"
                          disabled={props.busyAction === 'export-article' || !articlePreviewText}
                          onClick={() => {
                            const text = articlePreviewText;
                            if (!text) return;
                            void (async () => {
                              try {
                                await props.onExportArticle(text);
                              } catch {}
                            })();
                          }}
                        >
                          {props.busyAction === 'export-article' ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Copy className="mr-2 h-4 w-4" />
                          )}
                          复制长文
                        </Button>
                        <Button className="w-full" variant="outline" onClick={props.onOpenXArticle}>
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
                          disabled={props.busyAction === 'complete-article' || !articleTargetRunId || !articleUrlInput.trim()}
                          onClick={() => {
                            if (!articleTargetRunId) return;
                            void (async () => {
                              try {
                                await props.onCompleteArticlePublish(articleTargetRunId, articleUrlInput);
                              } catch {}
                            })();
                          }}
                        >
                          {props.busyAction === 'complete-article' ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                          )}
                          保存文章链接
                        </Button>
                        <p className="text-xs leading-5 text-slate-500">保存后，这篇长文会从待处理移到已发布，你下次回来也能继续追踪。</p>
                        {articleRecordedUrl ? (
                          <a
                            href={articleRecordedUrl}
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
                  ) : (
                    <Button
                      className="w-full"
                      disabled={props.busyAction === `confirm-${selectedReview.runId}`}
                      onClick={() => {
                        void (async () => {
                          try {
                            await props.onConfirmPublish(selectedReview.runId);
                          } catch {}
                        })();
                      }}
                    >
                      {props.busyAction === `confirm-${selectedReview.runId}` ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      确认发布
                    </Button>
                  )}
                </div>
              ) : (
                props.action === 'export_article' && articleRecordedUrl ? (
                  <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>这篇长文已经记录为已发布。</span>
                    </div>
                    <a
                      href={articleRecordedUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-4"
                    >
                      <ExternalLink className="h-4 w-4" />
                      查看已记录文章
                    </a>
                  </div>
                ) : (
                  <EmptyState
                    title="当前没有待确认内容"
                    description="这次任务没有卡在确认步骤。你可以关闭面板后继续生成下一条。"
                  />
                )
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
