import type { OpsQueueStats, OpsQueuesResponse, OpsVisibility, WorkspaceRoleValue } from '@draftorbit/shared';

function sanitizeQueueStats(
  stats: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  },
  visibility: OpsVisibility
): OpsQueueStats {
  return {
    waiting: stats.waiting,
    active: stats.active,
    completed: stats.completed,
    failed: visibility.canViewFailureDetails ? stats.failed : null,
    delayed: visibility.canViewFailureDetails ? stats.delayed : null,
    paused: visibility.canViewFailureDetails ? stats.paused : null
  };
}

export function buildOpsVisibility(role: WorkspaceRoleValue): OpsVisibility {
  if (role === 'OWNER' || role === 'ADMIN') {
    return {
      role,
      accessTier: 'FULL',
      canViewPerQueue: true,
      canViewFailureDetails: true,
      redactedFields: []
    };
  }

  if (role === 'EDITOR') {
    return {
      role,
      accessTier: 'LIMITED',
      canViewPerQueue: true,
      canViewFailureDetails: false,
      redactedFields: ['queues.*.failed', 'queues.*.delayed', 'queues.*.paused', 'summary.failed', 'summary.delayed', 'summary.paused']
    };
  }

  return {
    role,
    accessTier: 'OVERVIEW',
    canViewPerQueue: false,
    canViewFailureDetails: false,
    redactedFields: ['queues', 'summary.failed', 'summary.delayed', 'summary.paused']
  };
}

export function sanitizeOpsQueues(
  queues: Record<
    string,
    {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
      paused: number;
    }
  >,
  visibility: OpsVisibility
): OpsQueuesResponse {
  const entries = Object.entries(queues);

  const summary = entries.reduce<OpsQueueStats>(
    (acc, [, stats]) => {
      acc.waiting += stats.waiting;
      acc.active += stats.active;
      acc.completed += stats.completed;
      acc.failed = (acc.failed ?? 0) + stats.failed;
      acc.delayed = (acc.delayed ?? 0) + stats.delayed;
      acc.paused = (acc.paused ?? 0) + stats.paused;
      return acc;
    },
    {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0
    }
  );

  return {
    visibility,
    summary: sanitizeQueueStats(
      {
        waiting: summary.waiting,
        active: summary.active,
        completed: summary.completed,
        failed: summary.failed ?? 0,
        delayed: summary.delayed ?? 0,
        paused: summary.paused ?? 0
      },
      visibility
    ),
    queues: visibility.canViewPerQueue
      ? Object.fromEntries(entries.map(([name, stats]) => [name, sanitizeQueueStats(stats, visibility)]))
      : null,
    hiddenQueueCount: visibility.canViewPerQueue ? 0 : entries.length
  };
}
