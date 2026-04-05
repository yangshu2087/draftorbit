'use client';

import { useEffect, useState } from 'react';
import type { ReplyJobEntity } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { buildRecoveryExtra, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { approveReplyCandidate, fetchReplyJobs, sendReplyJob, syncMentions } from '../../lib/queries';

const REPLY_STATUS_LABELS: Record<ReplyJobEntity['status'], string> = {
  PENDING: '待处理',
  QUEUED: '排队中',
  RUNNING: '执行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
  CANCELED: '已取消'
};

export default function ReplyQueuePage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<ReplyJobEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchReplyJobs({ pageSize: 100 }));
    } catch (e) {
      setRows([]);
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const doSync = async () => {
    setSyncing(true);
    try {
      await syncMentions();
      pushToast({ title: '已触发 mentions 拉取', variant: 'success' });
      await load();
    } catch (e) {
      pushToast({ title: '拉取失败', description: normalizeErrorMessage(e), variant: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  const doApprove = async (replyJobId: string, candidateId: string) => {
    setBusyId(candidateId);
    try {
      await approveReplyCandidate(replyJobId, candidateId);
      pushToast({ title: '候选回复已审批', variant: 'success' });
      await load();
    } catch (e) {
      pushToast({ title: '审批失败', description: normalizeErrorMessage(e), variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const doSend = async (replyJobId: string, candidateId?: string) => {
    setBusyId(candidateId ?? replyJobId);
    try {
      await sendReplyJob(replyJobId, candidateId);
      pushToast({ title: '已提交发送', variant: 'success' });
      await load();
    } catch (e) {
      pushToast({ title: '发送失败', description: normalizeErrorMessage(e), variant: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <WorkbenchShell title="回复队列" description="mentions 拉取、候选回复审批与发送执行。">
      <button
        className="w-fit rounded-xl bg-slate-900 px-3.5 py-2 text-sm text-white disabled:opacity-50"
        onClick={() => void doSync()}
        disabled={syncing}
      >
        {syncing ? '拉取中...' : '拉取 mentions（stub）'}
      </button>

      {loading ? <LoadingState label="正在加载回复任务..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="回复任务加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="暂无回复任务" description="先拉取 mentions 或创建回复任务。" />
      ) : null}

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="do-card">
            <p className="text-sm font-medium">
              回复任务 {row.id.slice(0, 8)} · {REPLY_STATUS_LABELS[row.status]}
            </p>
            {row.lastError ? <p className="mt-1 text-xs text-red-600">{row.lastError}</p> : null}
            <div className="mt-2 space-y-2">
              {(row.candidates ?? []).map((candidate) => (
                <div key={candidate.id} className="rounded-lg border border-slate-900/10 bg-slate-50/70 p-2.5">
                  <p className="text-sm text-slate-700">{candidate.content}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    风险 {candidate.riskLevel} / {candidate.riskScore} · 审批 {candidate.approvalStatus}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      className="rounded-lg border border-slate-900/12 px-2.5 py-1 text-xs text-slate-700 hover:bg-white disabled:opacity-50"
                      onClick={() => void doApprove(row.id, candidate.id)}
                      disabled={busyId === candidate.id}
                    >
                      审批
                    </button>
                    <button
                      className="rounded-lg border border-slate-900/12 px-2.5 py-1 text-xs text-slate-700 hover:bg-white disabled:opacity-50"
                      onClick={() => void doSend(row.id, candidate.id)}
                      disabled={busyId === candidate.id}
                    >
                      发送
                    </button>
                  </div>
                </div>
              ))}

              {(row.candidates ?? []).length === 0 ? (
                <p className="text-xs text-slate-500">暂无候选回复，可先执行 mentions 拉取。</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}
