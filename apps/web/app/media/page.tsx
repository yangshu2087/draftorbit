'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { WorkbenchShell } from '../../components/shell/workbench-shell';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/page-states';
import { useToast } from '../../components/ui/toast';
import { buildRecoveryExtra, normalizeErrorMessage } from '../../components/ui/workspace-recovery';
import { fetchMediaAssets, generateMediaPlaceholder, uploadMediaPlaceholder } from '../../lib/queries';

const STYLE_OPTIONS = ['科技感', '极简风', '商业插画', '产品海报'] as const;
const SCENE_OPTIONS = ['太空轨道', '办公场景', '数据大屏', '移动端界面'] as const;

export default function MediaPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [style, setStyle] = useState<(typeof STYLE_OPTIONS)[number]>('科技感');
  const [scene, setScene] = useState<(typeof SCENE_OPTIONS)[number]>('太空轨道');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [extraPrompt, setExtraPrompt] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const resolvedPrompt = useMemo(() => {
    const base = `${style} ${scene}，适配 X 内容配图`;
    return extraPrompt.trim() ? `${base}，${extraPrompt.trim()}` : base;
  }, [style, scene, extraPrompt]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchMediaAssets());
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

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    if (generating) return;
    setGenerating(true);
    try {
      await generateMediaPlaceholder({ prompt: resolvedPrompt });
      pushToast({ title: '配图任务已创建', variant: 'success' });
      await load();
    } catch (e) {
      pushToast({ title: '创建失败', description: normalizeErrorMessage(e), variant: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const upload = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim() || uploading) return;
    setUploading(true);
    try {
      await uploadMediaPlaceholder({ sourceUrl: url.trim() });
      setUrl('');
      pushToast({ title: '资源已上传', variant: 'success' });
      await load();
    } catch (e) {
      pushToast({ title: '上传失败', description: normalizeErrorMessage(e), variant: 'error' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <WorkbenchShell title="配图素材" description="优先选择风格与场景，一键生成配图任务。">
      <form onSubmit={generate} className="do-panel grid gap-2.5 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <select value={style} onChange={(e) => setStyle(e.target.value as (typeof STYLE_OPTIONS)[number])}>
            {STYLE_OPTIONS.map((item) => (
              <option key={item} value={item}>
                风格：{item}
              </option>
            ))}
          </select>
          <select value={scene} onChange={(e) => setScene(e.target.value as (typeof SCENE_OPTIONS)[number])}>
            {SCENE_OPTIONS.map((item) => (
              <option key={item} value={item}>
                场景：{item}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="w-fit text-xs font-medium text-slate-600 underline underline-offset-2"
          onClick={() => setAdvancedOpen((v) => !v)}
          disabled={generating}
        >
          {advancedOpen ? '收起高级输入' : '展开高级输入（可选补充描述）'}
        </button>

        {advancedOpen ? (
          <input
            placeholder="补充描述（可选）"
            value={extraPrompt}
            onChange={(e) => setExtraPrompt(e.target.value)}
            disabled={generating}
          />
        ) : null}

        <div className="rounded-xl border border-slate-900/10 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          当前提示词：{resolvedPrompt}
        </div>

        <button className="w-fit rounded-xl bg-slate-900 px-3.5 py-2 text-sm text-white disabled:opacity-60" disabled={generating}>
          {generating ? '创建中...' : '生成配图任务'}
        </button>
      </form>

      <form onSubmit={upload} className="do-panel grid gap-2.5 p-4">
        <input
          placeholder="粘贴外部图片 URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={uploading}
        />
        <button className="w-fit rounded-xl border border-slate-900/12 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60" disabled={uploading || !url.trim()}>
          {uploading ? '上传中...' : '上传素材'}
        </button>
      </form>

      {loading ? <LoadingState label="正在加载配图素材..." /> : null}
      {!loading && error ? (
        <ErrorState
          title="素材加载失败"
          message={normalizeErrorMessage(error)}
          actionText="重试"
          onAction={() => void load()}
          extra={buildRecoveryExtra(error, load)}
        />
      ) : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState title="暂无素材记录" description="先创建配图任务或上传一张素材。"/>
      ) : null}

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="do-card-compact">
            <p className="text-sm font-medium">{row.name || row.id}</p>
            <p className="text-xs text-slate-500">
              来源：{row.sourceType} · 状态：{row.status}
            </p>
            <p className="mt-1 break-all text-xs text-slate-600">{row.outputUrl || row.sourceUrl || '—'}</p>
          </div>
        ))}
      </div>
    </WorkbenchShell>
  );
}
