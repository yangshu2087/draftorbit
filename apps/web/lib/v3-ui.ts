export type ShellNavItem = {
  href: string;
  label: string;
};

export type TaskPanelTone = 'connect' | 'queue';

export type TaskPanelMeta = {
  title: string;
  description: string;
  primaryLabel: string;
  tone: TaskPanelTone;
};

type ShellNavInput = {
  hasToken: boolean;
  publicMode: boolean;
};

const SIGNED_IN_NAV: ShellNavItem[] = [{ href: '/app', label: '生成器' }];

const TASK_PANEL_META: Record<string, TaskPanelMeta> = {
  connect_x_self: {
    title: '连接 X 账号后再发布会更顺',
    description: '现在就能先生成；连上之后再发布，也能让后续学习你的风格更稳。',
    primaryLabel: '连接 X 账号',
    tone: 'connect'
  },
  connect_learning_source: {
    title: '补一个学习来源',
    description: '补一个样本或资料，让下一条更贴近你想要的方向；不影响你先生成。',
    primaryLabel: '继续补充',
    tone: 'connect'
  },
  rebuild_profile: {
    title: '补建风格画像，让下一条更像你',
    description: '你现在可以先生成，之后再补建画像让后续表达更稳。',
    primaryLabel: '重建画像',
    tone: 'connect'
  },
  open_queue: {
    title: '先看这条内容下一步怎么处理',
    description: '这里只处理当前这条，不让你跳去后台列表。',
    primaryLabel: '查看当前状态',
    tone: 'queue'
  },
  confirm_publish: {
    title: '确认这条内容是否发出',
    description: '快速看一眼文案和风险，再决定是否发出。',
    primaryLabel: '查看待确认内容',
    tone: 'queue'
  },
  export_article: {
    title: '先复制这篇长文再去发布',
    description: '当前先通过复制方式发布到 X 文章编辑器，避免误走推文队列。',
    primaryLabel: '复制长文',
    tone: 'queue'
  }
};

export function getShellNavItems(input: ShellNavInput): ShellNavItem[] {
  if (input.hasToken) return SIGNED_IN_NAV;
  if (input.publicMode) return [];
  return [];
}

export function buildAppTaskHref(
  action?: string | null,
  params?: Record<string, string | null | undefined>
): string | null {
  if (!action || !TASK_PANEL_META[action]) return null;
  const query = new URLSearchParams({ nextAction: action });
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) query.set(key, value);
  }
  return `/app?${query.toString()}`;
}

export function getTaskPanelMeta(action?: string | null): TaskPanelMeta | null {
  if (!action) return null;
  return TASK_PANEL_META[action] ?? null;
}
