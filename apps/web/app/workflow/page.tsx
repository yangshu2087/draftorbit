'use client';

import { useEffect, useMemo, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { buildRecoveryExtra, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import {
  applyOperationTemplate,
  fetchOperationTemplates,
  fetchWorkflowRuns,
  fetchWorkflowTemplates,
  runPresetPipeline,
  runWorkflowTemplate
} from '../../lib/queries';

const TOPIC_PRESETS = [
  'AI 内容运营如何提升互动率',
  '新产品发布前一周如何做预热',
  '案例复盘：从 0 到 1 的增长路径'
] as const;

const AUDIENCE_OPTIONS = ['中文创作者', '独立开发者', '产品运营团队'] as const;
const TONE_OPTIONS = ['专业清晰', '口语亲和', '有观点'] as const;
const CTA_OPTIONS = ['欢迎留言交流', '同意的话点个赞', '关注获取下一篇实战'] as const;

export default function WorkflowPage() {
  const { pushToast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [operationTemplates, setOperationTemplates] = useState<any[]>([]);
  const [topicInput, setTopicInput] = useState<string>(TOPIC_PRESETS[0]);
  const [audience, setAudience] = useState<(typeof AUDIENCE_OPTIONS)[number]>('中文创作者');
  const [tone, setTone] = useState<(typeof TONE_OPTIONS)[number]>('专业清晰');
  const [cta, setCta] = useState<(typeof CTA_OPTIONS)[number]>('欢迎留言交流');
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

  const selectedTemplateCount = useMemo(() => operationTemplates.length, [operationTemplates]);

  const applyTemplate = async (templateKey: string) => {
    if (!topicInput.trim()) {
      pushToast({ title: '请先填写主题', description: '运营模板需要一个主题字段', variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      await applyOperationTemplate(templateKey, {
        topic: topicInput.trim(),
        audience,
        tone,
        cta
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
    <WorkbenchShell title="流程模板" description="仅保留内置流程模板，通过可选项快速生成并执行。">
      <div className="do-panel-soft p-4">
        <p className="do-section-title">运营模板中心</p>
        <p className="mt-1 text-xs text-slate-500">
          已内置 {selectedTemplateCount} 个模板，优先选择参数后生成草稿。
        </p>

        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select value={topicInput} onChange={(e) => setTopicInput(e.target.value)}>
            {TOPIC_PRESETS.map((item) => (
              <option key={item} value={item}>
                主题：{item}
              </option>
            ))}
          </select>
          <select value={audience} onChange={(e) => setAudience(e.target.value as (typeof AUDIENCE_OPTIONS)[number])}>
            {AUDIENCE_OPTIONS.map((item) => (
              <option key={item} value={item}>
                受众：{item}
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

        <input
          className="mt-2"
          placeholder="或输入自定义主题（仅主题支持手工输入）"
          value={topicInput}
          onChange={(e) => setTopicInput(e.target.value)}
          disabled={busy}
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {operationTemplates.map((item) => (
            <button
              key={item.key}
              className="rounded-lg border border-slate-900/10 bg-white p-2.5 text-left hover:bg-slate-50"
              onClick={() => void applyTemplate(String(item.key))}
              disabled={busy}
            >
              <p className="text-sm font-semibold">{String(item.name)}</p>
              <p className="mt-1 text-xs text-slate-500">{String(item.description)}</p>
            </button>
          ))}
        </div>
      </div>

      <button
        className="w-fit rounded-xl border border-slate-900/12 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        onClick={() => void runPipeline()}
        disabled={busy}
      >
        一键执行标准链路（选题 → 草稿 → 自然化 → 配图 → 审批发布）
      </button>

      {loading ? <LoadingState label="正在加载模板与运行记录..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="工作流数据加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {!loading && !error && templates.length === 0 && runs.length === 0 ? (
        <EmptyState title="暂无工作流模板与运行记录" description="可以先创建模板，或直接使用预设链路。" />
      ) : null}

      <section className="space-y-2">
        <p className="text-sm font-medium">模板列表（内置）</p>
        {templates.map((item) => (
          <div
            key={item.id}
            className="do-card-compact flex flex-wrap items-center justify-between gap-2"
          >
            <div>
              <p className="text-sm font-medium">
                {item.name} <span className="text-xs text-slate-500">({item.key})</span>
              </p>
            </div>
            <button
              className="rounded-lg border border-slate-900/12 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
          <div key={run.id} className="do-card-compact">
            <p className="text-sm">
              {run.template?.name || run.templateId} · <span className="font-medium">{run.status}</span>
            </p>
            <p className="text-xs text-slate-500">{new Date(run.createdAt).toLocaleString('zh-CN')}</p>
          </div>
        ))}
      </section>
    </WorkbenchShell>
  );
}
