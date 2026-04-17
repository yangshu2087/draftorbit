import { Suspense } from 'react';
import OperatorApp from '../../components/v3/operator-app';
import { AppShell } from '../../components/v3/shell';
import { LoadingState } from '../../components/ui/state-feedback';

export default function AppPage() {
  return (
    <Suspense
      fallback={
        <AppShell eyebrow="生成器" title="你说一句话，DraftOrbit 帮你产出可发的 X 内容" description="默认先生成，再由你决定是否发出去。">
          <LoadingState title="正在加载生成器" description="读取你的账号、画像和待处理状态。" />
        </AppShell>
      }
    >
      <OperatorApp />
    </Suspense>
  );
}
