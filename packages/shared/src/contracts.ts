export const QUEUE_NAMES = {
  GENERATE: 'generate-queue',
  PUBLISH: 'publish-queue',
  LEARNING: 'learning-queue',
  IMAGE: 'image-queue',
  MENTIONS: 'mentions-queue',
  METRICS: 'metrics-queue',
  AUTOMATION: 'automation-queue',
  REPLY: 'reply-queue'
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const STEP_ORDER = [
  'HOTSPOT',
  'OUTLINE',
  'DRAFT',
  'HUMANIZE',
  'IMAGE',
  'PACKAGE'
] as const;

export type StepName = (typeof STEP_ORDER)[number];

export const STEP_LABELS: Record<StepName, string> = {
  HOTSPOT: '热点追踪',
  OUTLINE: '结构大纲',
  DRAFT: '草稿生成',
  HUMANIZE: '去 AI 痕迹',
  IMAGE: '配图建议',
  PACKAGE: '发布包'
};
