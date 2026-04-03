'use client';

import { FormEvent, useEffect, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { WorkspaceRecovery, isWorkspaceMissing, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import {
  applyOperationTemplate,
  createWorkflowTemplate,
  fetchOperationTemplates,
  fetchWorkflowRuns,
  fetchWorkflowTemplates,
  runPresetPipeline,
  runWorkflowTemplate
} from '../../lib/queries';

export default function WorkflowPage() {
  const { pushToast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [operationTemplates, setOperationTemplates] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [topicInput, setTopicInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, r, operation] = await Promise.all([
        fetchWorkflowTemplates(),
        fetchWorkflowRuns(),
        fetchOperationTemplates()
      ]);
      setTemplates(t);
      setRuns(r);
      setOperationTemplates(operation);
    } catch (e) {
      setError(e);
      setTemplates([]);
      setRuns([]);
      setOperationTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim() || busy) return;
    setBusy(true);
    try {
      await createWorkflowTemplate({
        name: name.trim(),
        key: key.trim(),
        config: {
          steps: ['draft', 'naturalize', 'publish']
        }
      });
      setName('');
      setKey('');
      pushToast({ title: '模板创建成功', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '创建失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const applyTemplate = async (templateKey: string) => {
    if (!topicInput.trim()) {
      pushToast({ title: '请先填写主题', description: '运营模板需要一个主题字段', variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      await applyOperationTemplate(templateKey, {
        topic: topicInput.trim(),
        tone: '中文口语化，观点明确',
        cta: '你认同吗？欢迎留言交流。'
      });
      pushToast({ title: '模板草稿已生成', description: '请前往草稿工坊查看。', variant: 'success' });
    } catch (err) {
      pushToast({ title: '生成失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const runPipeline = async () => {
    setBusy(true);
    try {
      await runPresetPipeline({ trigger: 'manual' });
      pushToast({ title: '已触发标准流水线', variant: 'success' });
      await load();
    } catch (err) {
      pushToast({ title: '触发失败', description: normalizeErrorMessage(err), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkbenchShell title="模板与流程" description="运营模板中心 + 工作流执行中心。">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-sm font-semibold">运营模板中心</p>
        <p className="mt-1 text-xs text-gray-500">输入主题后，可一键生成对应类型草稿。</p>
        <input
          className="mt-2"
          placeholder="例如：AI 内容运营如何提升互动率"
          value={topicInput}
          onChange={(e) => setTopicInput(e.target.value)}
          disabled={busy}
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {operationTemplates.map((item) => (
            <button
              key={item.key}
              className="rounded border border-gray-200 bg-white p-2 text-left hover:bg-gray-50"
              onClick={() => void applyTemplate(String(item.key))}
              disabled={busy}
            >
              <p className="text-sm font-semibold">{String(item.name)}</p>
              <p className="mt-1 text-xs text-gray-500">{String(item.description)}</p>
            </button>
          ))}
        </div>
      </div>

      <button
        className="w-fit rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
        onClick={() => void runPipeline()}
        disabled={busy}
      >
        一键执行标准链路（选题 → 草稿 → 自然化 → 配图 → 审批发布）
      </button>

      <form onSubmit={submit} className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-3">
        <input placeholder="模板名称" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        <input placeholder="模板 key (唯一)" value={key} onChange={(e) => setKey(e.target.value)} disabled={busy} />
        <button className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={busy}>
          创建模板
        </button>
      </form>

      {loading ? <LoadingState label="正在加载模板与运行记录..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="工作流数据加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={isWorkspaceMissing(error) ? <WorkspaceRecovery onRecovered={load} /> : undefined}
        />
      ) : null}

      {!loading && !error && templates.length === 0 && runs.length === 0 ? (
        <EmptyState title="暂无工作流模板与运行记录" description="可以先创建模板，或直接使用预设链路。" />
      ) : null}

      <section className="space-y-2">
        <p className="text-sm font-medium">模板列表</p>
        {templates.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3"
          >
            <div>
              <p className="text-sm font-medium">
                {item.name} <span className="text-xs text-gray-500">({item.key})</span>
              </p>
            </div>
            <button
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50"
              onClick={async () => {
                try {
                  await runWorkflowTemplate(item.id, { trigger: 'manual' });
                  pushToast({ title: '模板已执行', variant: 'success' });
                  await load();
                } catch (err) {
                  pushToast({ title: '执行失败', description: normalizeErrorMessage(err), variant: 'error' });
                }
              }}
            >
              执行
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <p className="text-sm font-medium">执行记录</p>
        {runs.map((run) => (
          <div key={run.id} className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm">
              {run.template?.name || run.templateId} · <span className="font-medium">{run.status}</span>
            </p>
            <p className="text-xs text-gray-500">{new Date(run.createdAt).toLocaleString('zh-CN')}</p>
          </div>
        ))}
      </section>
    </WorkbenchShell>
  );
}
