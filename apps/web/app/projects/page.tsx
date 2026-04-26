import { Suspense } from 'react';
import ProjectsPage from '../../components/v3/projects-page';
import { AppShell } from '../../components/v3/shell';
import { LoadingState } from '../../components/ui/state-feedback';

export default function ProjectsRoutePage() {
  return (
    <Suspense
      fallback={
        <AppShell eyebrow="项目运营" title="把 X 运营沉淀成项目" description="读取项目上下文和最近生成结果。">
          <LoadingState title="正在加载项目工作台" description="准备你的项目运营入口。" />
        </AppShell>
      }
    >
      <ProjectsPage />
    </Suspense>
  );
}
