'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { TopicEntity } from '@draftorbit/shared';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { WorkspaceRecovery, isWorkspaceMissing, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { createTopic, fetchTopics } from '../../lib/queries';

export default function TopicsPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<TopicEntity[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeCount = useMemo(() => rows.filter((x) => x.status === 'ACTIVE').length, [rows]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchTopics({ pageSize: 200 }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await createTopic({ title: title.trim(), description: description.trim() || undefined });
      setTitle('');
      setDescription('');
      pushToast({ title: '选题创建成功', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '创建失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WorkbenchShell title="选题中心" description="方向输入与选题沉淀，支持后续草稿链路复用。">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        当前共 {rows.length} 个选题，其中活跃 {activeCount} 个。
      </div>

      <form onSubmit={onSubmit} className="grid gap-2 rounded-lg border border-gray-200 p-3">
        <input
          placeholder="新增选题标题（必填）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={submitting}
        />
        <textarea
          placeholder="选题描述（可选）"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={submitting}
        />
        <button
          className="w-fit rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
          disabled={submitting || !title.trim()}
        >
          {submitting ? '创建中...' : '创建选题'}
        </button>
      </form>

      {loading ? <LoadingState label="正在加载选题列表..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="选题加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={isWorkspaceMissing(error) ? <WorkspaceRecovery onRecovered={load} /> : undefined}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="还没有选题" description="先创建一个选题，再进入草稿工坊生成内容。" />
      ) : null}

      <div className="space-y-2">
        {rows.map((item) => (
          <div key={item.id} className="rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-gray-900">{item.title}</p>
                <p className="text-xs text-gray-500">{item.description || '无描述'}</p>
              </div>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{item.status}</span>
            </div>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}
