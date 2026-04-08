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
    title: '先连接你的 X 账号',
    description: '连上后就能直接生成，并准备正式发出。',
    primaryLabel: '连接 X 账号',
    tone: 'connect'
  },
  connect_learning_source: {
    title: '补一个学习来源',
    description: '补一个样本或资料，让下一条更贴近你想要的方向。',
    primaryLabel: '继续补充',
    tone: 'connect'
  },
  rebuild_profile: {
    title: '先更新你的风格画像',
    description: '更新后，下一条会更像你平时的表达。',
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
