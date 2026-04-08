'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Database, Link2, Loader2, RefreshCcw, Sparkles, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, LoadingState, SuccessNotice } from '../ui/state-feedback';
import { useToast } from '../ui/toast';
import {
  connectLocalKnowledgeFiles,
  connectObsidianVault,
  connectSelfX,
  connectTargetX,
  fetchProfile,
  importKnowledgeUrls,
  rebuildProfile,
  type V3ProfileResponse
} from '../../lib/queries';
import { toUiError, type UiError } from '../../lib/ui-error';
import { AppShell } from './shell';

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ConnectPage() {
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const [profile, setProfile] = useState<V3ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<UiError | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [targetInput, setTargetInput] = useState('');
  const [obsidianPath, setObsidianPath] = useState('');
  const [localPaths, setLocalPaths] = useState('');
  const [urlList, setUrlList] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const payload = await fetchProfile();
      setProfile(payload);
    } catch (error) {
      setPageError(toUiError(error, '加载 Connect 数据失败，请稍后重试。'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    const xbind = searchParams.get('xbind');
    if (xbind === 'success') setNotice('X 账号绑定完成。系统现在可以学习你的历史表达并用于生成。');
    if (xbind === 'error') setNotice('X 账号绑定未完成，请稍后重试。');
    if (!xbind && searchParams.get('from') === 'app') {
      const intent = searchParams.get('intent');
      if (intent === 'rebuild_profile') {
        setNotice('按建议动作进入 Connect：先重建风格画像，再返回 Operator 继续生成。');
      } else if (intent === 'connect_learning_source') {
        setNotice('按建议动作进入 Connect：补充学习来源后，生成结果会更有依据。');
      } else if (intent === 'connect_x_self') {
        setNotice('按建议动作进入 Connect：请先连接你的 X 账号。');
      }
    }
  }, [searchParams]);

  const sourcesByConnector = useMemo(() => {
    const rows = profile?.sources ?? [];
    return {
      xTarget: rows.filter((item) => item.connector === 'x_target'),
      obsidian: rows.filter((item) => item.connector === 'obsidian'),
      localFile: rows.filter((item) => item.connector === 'local_file'),
      urls: rows.filter((item) => item.connector === 'url')
    };
  }, [profile?.sources]);

  if (loading) {
    return (
      <AppShell eyebrow="Connect" title="连接后系统会自动学什么？" description="接入你的账号、知识库或目标样本后，DraftOrbit 会自动构建风格画像与证据层。">
        <LoadingState title="正在读取连接状态" description="检查 X 账号、知识来源与风格画像。" />
      </AppShell>
    );
  }

  if (pageError) {
    return (
      <AppShell eyebrow="Connect" title="连接后系统会自动学什么？" description="接入你的账号、知识库或目标样本后，DraftOrbit 会自动构建风格画像与证据层。">
        <ErrorState error={pageError} onRetry={() => void loadProfile()} actionHref="/app" actionLabel="返回 Operator" />
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="Connect"
      title="连接后系统会自动学什么？"
      description="你不需要手动配置风格项。把账号、链接和知识源接进来，系统会自动学习你的表达习惯、目标样本和外部证据。"
      actions={<Button asChild variant="outline"><Link href="/app">返回 Operator</Link></Button>}
    >
      {notice ? <SuccessNotice message={notice} /> : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <article className="do-panel p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">任务 1</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">连接你自己的 X 账号</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">成功后系统会读取你的历史内容，建立 Style DNA，并在生成时自动匹配你的稳定表达方式。</p>
              </div>
              <Button
                disabled={busyAction === 'x-self'}
                onClick={() => {
                  void (async () => {
                    setBusyAction('x-self');
                    try {
                      const { url } = await connectSelfX();
                      window.location.href = url;
                    } catch (error) {
                      setPageError(toUiError(error, '拉起 X 绑定失败，请稍后重试。'));
                      setBusyAction(null);
                    }
                  })();
                }}
              >
                {busyAction === 'x-self' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                连接 X 账号
              </Button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(profile?.xAccounts ?? []).length ? profile?.xAccounts.map((account) => (
                <div key={account.id} className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">@{account.handle}</p>
                  <p className="mt-2 text-xs text-slate-500">状态：{account.status}{account.isDefault ? ' · 默认账号' : ''}</p>
                  <p className="mt-1 text-xs text-slate-500">token 到期：{formatDate(account.tokenExpiresAt)}</p>
                </div>
              )) : <EmptyState title="还没有连接自己的 X 账号" description="连接后，生成结果会明显更像你本人。" />}
            </div>
          </article>

          <article className="do-panel p-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">任务 2</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">添加目标账号 / 推文链接</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">你只需要给一个 @handle 或 x.com 链接，系统会自动学习其结构和表达模式，但不会照抄。</p>
                <input value={targetInput} onChange={(event) => setTargetInput(event.target.value)} placeholder="@askOkara 或 https://x.com/xxx/status/..." className="mt-4 w-full" />
                <Button
                  className="mt-3"
                  disabled={busyAction === 'x-target' || !targetInput.trim()}
                  onClick={() => {
                    void (async () => {
                      setBusyAction('x-target');
                      try {
                        await connectTargetX(targetInput.trim());
                        pushToast({ title: '目标样本已接入', description: '后续生成会自动参考其模式，但保持你的差异化表达。', variant: 'success' });
                        setTargetInput('');
                        await loadProfile();
                      } catch (error) {
                        setPageError(toUiError(error, '接入目标账号失败，请稍后重试。'));
                      } finally {
                        setBusyAction(null);
                      }
                    })();
                  }}
                >
                  {busyAction === 'x-target' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  添加学习样本
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">已接入的目标样本</p>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  {sourcesByConnector.xTarget.length ? sourcesByConnector.xTarget.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-900/10 bg-white px-3 py-2">
                      <p className="break-all">{item.sourceRef}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(item.createdAt)}</p>
                    </div>
                  )) : <p className="text-xs text-slate-500">还没有目标账号样本。</p>}
                </div>
              </div>
            </div>
          </article>

          <article className="do-panel p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">任务 3</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">接入知识源</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">支持 Obsidian、本地文件路径与 URL。成功后系统会把它们纳入证据层，用于选题、写作和配图上下文。</p>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">Obsidian Vault</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">准备一个本地 vault 路径；默认学习其中的 Markdown 内容。</p>
                <input value={obsidianPath} onChange={(event) => setObsidianPath(event.target.value)} placeholder="/Users/you/Notes" className="mt-3 w-full" />
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  disabled={busyAction === 'obsidian' || !obsidianPath.trim()}
                  onClick={() => {
                    void (async () => {
                      setBusyAction('obsidian');
                      try {
                        await connectObsidianVault({ vaultPath: obsidianPath.trim() });
                        pushToast({ title: 'Obsidian 已接入', description: '系统会自动从 Markdown 中提取知识线索。', variant: 'success' });
                        setObsidianPath('');
                        await loadProfile();
                      } catch (error) {
                        setPageError(toUiError(error, '接入 Obsidian 失败。'));
                      } finally {
                        setBusyAction(null);
                      }
                    })();
                  }}
                >
                  {busyAction === 'obsidian' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                  接入 Obsidian
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">本地文件路径</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">每行一个路径。适合 txt / md / pdf / docx 的归档目录。</p>
                <textarea value={localPaths} onChange={(event) => setLocalPaths(event.target.value)} placeholder={'/Users/you/Desktop/notes.md\n/Users/you/Desktop/brief.pdf'} className="mt-3 min-h-[120px] w-full" />
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  disabled={busyAction === 'local-files' || !localPaths.trim()}
                  onClick={() => {
                    void (async () => {
                      setBusyAction('local-files');
                      try {
                        const paths = localPaths.split('\n').map((item) => item.trim()).filter(Boolean);
                        await connectLocalKnowledgeFiles({ paths });
                        pushToast({ title: '本地文件已接入', description: '系统会把这些路径记录为知识源，并进入学习队列。', variant: 'success' });
                        setLocalPaths('');
                        await loadProfile();
                      } catch (error) {
                        setPageError(toUiError(error, '接入本地文件失败。'));
                      } finally {
                        setBusyAction(null);
                      }
                    })();
                  }}
                >
                  {busyAction === 'local-files' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  接入本地文件
                </Button>
              </div>

              <div className="rounded-2xl border border-slate-900/10 bg-slate-50 p-4">
                <p className="font-medium text-slate-900">URL / 网页证据</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">每行一个 URL，适合文章、产品页、说明页和目标推文链接。</p>
                <textarea value={urlList} onChange={(event) => setUrlList(event.target.value)} placeholder={'https://example.com/post\nhttps://x.com/...'} className="mt-3 min-h-[120px] w-full" />
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  disabled={busyAction === 'urls' || !urlList.trim()}
                  onClick={() => {
                    void (async () => {
                      setBusyAction('urls');
                      try {
                        const urls = urlList.split('\n').map((item) => item.trim()).filter(Boolean);
                        await importKnowledgeUrls({ urls });
                        pushToast({ title: 'URL 已接入', description: '后续生成会自动引用这些链接中的知识线索。', variant: 'success' });
                        setUrlList('');
                        await loadProfile();
                      } catch (error) {
                        setPageError(toUiError(error, '接入 URL 失败。'));
                      } finally {
                        setBusyAction(null);
                      }
                    })();
                  }}
                >
                  {busyAction === 'urls' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                  接入 URL
                </Button>
              </div>
            </div>
          </article>
        </div>

        <aside className="space-y-6">
          <article className="do-panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">风格画像</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-950">系统自动总结你的 Style DNA</h3>
              </div>
              <Button
                variant="outline"
                disabled={busyAction === 'rebuild-profile'}
                onClick={() => {
                  void (async () => {
                    setBusyAction('rebuild-profile');
                    try {
                      await rebuildProfile();
                      pushToast({ title: '风格画像已重建', description: '新的生成会优先匹配最新风格。', variant: 'success' });
                      await loadProfile();
                    } catch (error) {
                      setPageError(toUiError(error, '重建风格画像失败。'));
                    } finally {
                      setBusyAction(null);
                    }
                  })();
                }}
              >
                {busyAction === 'rebuild-profile' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                重建画像
              </Button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">{profile?.styleSummary ?? '尚未完成风格分析。先连接自己的 X 账号，再点击重建画像。'}</p>
            <div className="mt-4 rounded-2xl border border-slate-900/10 bg-slate-50 p-4 text-xs text-slate-500">
              <div>样本数：{profile?.styleSampleCount ?? 0}</div>
              <div className="mt-1">最近分析：{formatDate(profile?.styleLastAnalyzedAt)}</div>
            </div>
          </article>

          <article className="do-panel p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">已接入知识源概览</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-700">
              {[
                { label: '目标账号 / 推文', count: sourcesByConnector.xTarget.length },
                { label: 'Obsidian', count: sourcesByConnector.obsidian.length },
                { label: '本地文件', count: sourcesByConnector.localFile.length },
                { label: 'URL', count: sourcesByConnector.urls.length }
              ].map((item) => (
                <li key={item.label} className="flex items-center justify-between rounded-2xl border border-slate-900/10 bg-slate-50 px-4 py-3">
                  <span>{item.label}</span>
                  <span className="rounded-full border border-slate-900/10 bg-white px-2.5 py-1 text-xs text-slate-500">{item.count}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4" />
                <p>接入完成后，回到 Operator，系统会自动把这些来源纳入研究与生成链路。</p>
              </div>
            </div>
          </article>
        </aside>
      </section>
    </AppShell>
  );
}
