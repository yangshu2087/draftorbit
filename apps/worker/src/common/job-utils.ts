import { prisma } from '@draftorbit/db';

export async function writeJobAudit(input: {
  workspaceId: string;
  userId?: string | null;
  action: 'CREATE' | 'UPDATE' | 'SYNC' | 'PUBLISH' | 'REPLY';
  resourceType: string;
  resourceId?: string | null;
  payload?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      payload: (input.payload ?? {}) as any
    }
  });
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
