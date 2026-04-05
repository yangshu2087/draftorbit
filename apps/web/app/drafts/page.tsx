'use client';

import { FormEvent, useEffect, useState } from 'react';
import type { DraftEntity, XAccountEntity } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { buildRecoveryExtra, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import {
  approveDraft,
  createDraft,
  fetchDrafts,
  fetchXAccounts,
  publishDraft,
  qualityCheckDraft
} from '../../lib/queries';

const DRAFT_TEMPLATES = [
  {
    key: 'hotspot',
    label: '热点点评',
    title: '热点事件观点速评',
    content: '事件背景：\\n核心判断：\\n对创作者的影响：\\n可立即执行的动作：'
  },
  {
    key: 'product',
    label: '产品更新',
    title: '本周产品更新说明',
    content: '本次更新亮点：\\n用户收益：\\n使用建议：\\n下一步计划：'
  },
  {
    key: 'review',
    label: '案例复盘',
    title: '案例复盘：从策略到结果',
    content: '案例背景：\\n执行策略：\\n关键数据：\\n复盘结论：'
  }
] as const;

const TONE_OPTIONS = ['专业清晰', '口语亲和', '观点锋利'] as const;
const CTA_OPTIONS = ['欢迎留言讨论', '同意请点赞转发', '关注获取后续更新'] as const;

function statusLabel(status: DraftEntity['status']) {
  const map: Record<DraftEntity['status'], string> = {
    DRAFT: '草稿',
    PENDING_APPROVAL: '待审批',
    APPROVED: '已通过',
    REJECTED: '已驳回',
    QUEUED: '已入队',
    PUBLISHED: '已发布',
    FAILED: '失败'
  };
  return map[status] ?? status;
}

export default function DraftsPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<DraftEntity[]>([]);
  const [templateKey, setTemplateKey] = useState<(typeof DRAFT_TEMPLATES)[number]['key']>('hotspot');
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number]>('专业清晰');
  const [cta, setCta] = useState<(typeof CTA_OPTIONS)[number]>('欢迎留言讨论');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [xAccounts, setXAccounts] = useState<XAccountEntity[]>([]);
  const [selectedXAccountId, setSelectedXAccountId] = useState('');
  const [qualityMap, setQualityMap] = useState<
    Record<
      string,
      {
        passed: boolean;
        score: number;
        blockers: Array<{ code: string; message: string }>;
        warnings: Array<{ code: string; message: string }>;
      }
    >
  >({});

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchDrafts({ pageSize: 200 }));
    } catch (e) {
      setError(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await fetchXAccounts({ pageSize: 50, status: 'ACTIVE' });
        setXAccounts(rows);
        const defaultAccount = rows.find((item) => item.isDefault) ?? rows[0];
        if (defaultAccount) {
          setSelectedXAccountId(defaultAccount.id);
        }
      } catch {
        setXAccounts([]);
        setSelectedXAccountId('');
      }
    })();
  }, []);

  useEffect(() => {
    const tpl = DRAFT_TEMPLATES.find((item) => item.key === templateKey);
    if (!tpl) return;
    setTitle((prev) => (prev.trim() ? prev : tpl.title));
    setContent((prev) => (prev.trim() ? prev : tpl.content));
  }, [templateKey]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || saving) return;
    setSaving(true);
    try {
      const finalContent = `${content.trim()}\n\n【语气】${tone}\n【引导】${cta}`;
      await createDraft({ title: title.trim(), content: finalContent, language: 'zh' });
      setTitle('');
      setContent('');
      pushToast({ title: '草稿保存成功', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '保存失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const runQualityCheck = async (draftId: string) => {
    setActionBusyId(draftId);
    try {
      const report = await qualityCheckDraft(draftId);
      setQualityMap((prev) => ({
        ...prev,
        [draftId]: {
          passed: report.passed,
          score: report.score,
          blockers: report.blockers,
          warnings: report.warnings
        }
      }));
      pushToast({
        title: report.passed ? '质量检查通过' : '质量检查未通过',
        description: `质量分 ${report.score}`,
        variant: report.passed ? 'success' : 'error'
      });
    } catch (err) {
      pushToast({ title: '质量检查失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const approve = async (draftId: string) => {
    setActionBusyId(draftId);
    try {
      await approveDraft(draftId);
      pushToast({ title: '审批通过', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '审批失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  const enqueuePublish = async (draftId: string) => {
    setActionBusyId(draftId);
    try {
      await publishDraft({ draftId, xAccountId: selectedXAccountId || undefined });
      pushToast({ title: '已加入发布队列', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '入队失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <WorkbenchShell title="草稿工坊" description="先选模板与风格，再补正文，随后完成审批与发布。">
      <form onSubmit={submit} className="do-panel grid gap-2.5 p-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value as (typeof DRAFT_TEMPLATES)[number]['key'])}>
            {DRAFT_TEMPLATES.map((tpl) => (
              <option key={tpl.key} value={tpl.key}>
                {tpl.label}
              </option>
            ))}
          </select>
          <select value={tone} onChange={(e) => setTone(e.target.value as (typeof TONE_OPTIONS)[number])}>
            {TONE_OPTIONS.map((item) => (
              <option key={item} value={item}>
                语气：{item}
              </option>
            ))}
          </select>
          <select value={cta} onChange={(e) => setCta(e.target.value as (typeof CTA_OPTIONS)[number])}>
            {CTA_OPTIONS.map((item) => (
              <option key={item} value={item}>
                引导：{item}
              </option>
            ))}
          </select>
        </div>
        <select
          value={selectedXAccountId}
          onChange={(e) => setSelectedXAccountId(e.target.value)}
          disabled={saving || xAccounts.length === 0}
        >
          {xAccounts.length === 0 ? <option value="">发布账号：默认账号</option> : null}
          {xAccounts.map((item) => (
            <option key={item.id} value={item.id}>
              发布账号：@{item.handle}
              {item.isDefault ? '（默认）' : ''}
            </option>
          ))}
        </select>
        <input
          placeholder="草稿标题（可按需调整）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
        />
        <textarea
          rows={4}
          placeholder="草稿正文（正文支持手工编辑）"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={saving}
        />
        <button
          className="w-fit rounded-xl bg-slate-900 px-3.5 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving || !title.trim() || !content.trim()}
        >
          {saving ? '保存中...' : '保存草稿'}
        </button>
      </form>

      {loading ? <LoadingState label="正在加载草稿..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="草稿加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="还没有草稿" description="先创建第一条草稿，然后进行审批发布。" />
      ) : null}

      <div className="space-y-2">
        {rows.map((row) => {
          const busy = actionBusyId === row.id;
          const report = qualityMap[row.id];
          return (
            <div key={row.id} className="do-card-compact">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{row.title || '无标题'}</p>
                  <p className="text-xs text-slate-500">
                    状态：{statusLabel(row.status)} · 版本：{row.currentVersion} · 语言：{row.language}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-lg border border-slate-900/12 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => void runQualityCheck(row.id)}
                    disabled={busy}
                  >
                    质量检查
                  </button>
                  <button
                    className="rounded-lg border border-slate-900/12 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => void approve(row.id)}
                    disabled={busy}
                  >
                    {busy ? '处理中...' : '通过审批'}
                  </button>
                  <button
                    className="rounded-lg border border-slate-900/12 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    onClick={() => void enqueuePublish(row.id)}
                    disabled={busy}
                  >
                    入发布队列
                  </button>
                </div>
              </div>

              {report ? (
                <div className="mt-2 rounded-lg border border-slate-900/10 bg-slate-50/75 p-2 text-xs">
                  <p className="font-semibold">质量分：{report.score}</p>
                  {report.blockers.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-red-600">
                      {report.blockers.map((b) => (
                        <li key={b.code}>{b.message}</li>
                      ))}
                    </ul>
                  ) : null}
                  {report.warnings.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-600">
                      {report.warnings.map((w) => (
                        <li key={w.code}>{w.message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <pre className="mt-2 overflow-auto rounded-lg border border-slate-900/8 bg-slate-50/80 p-2 text-xs text-slate-600">
                {row.latestContent || '无内容'}
              </pre>
            </div>
          );
        })}
      </div>
    </WorkbenchShell>
  );
}
