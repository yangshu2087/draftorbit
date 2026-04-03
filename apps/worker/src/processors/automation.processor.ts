import { Job } from 'bullmq';
import { WorkflowRunStatus, prisma } from '@draftorbit/db';
import { AutomationJobPayload } from '@draftorbit/shared';
import { toErrorMessage, writeJobAudit } from '../common/job-utils';

export async function processAutomationJob(job: Job<AutomationJobPayload>) {
  const { workflowRunId } = job.data;

  const run = await prisma.workflowRun.findUnique({ where: { id: workflowRunId } });
  if (!run) {
    throw new Error(`Workflow run not found: ${workflowRunId}`);
  }

  try {
    await prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: {
        status: WorkflowRunStatus.RUNNING,
        startedAt: new Date()
      }
    });

    const output = {
      message: 'Workflow executed by automation worker stub',
      finishedAt: new Date().toISOString()
    };

    const completed = await prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: {
        status: WorkflowRunStatus.SUCCEEDED,
        output: output as any,
        finishedAt: new Date()
      }
    });

    await writeJobAudit({
      workspaceId: completed.workspaceId,
      userId: completed.triggerUserId,
      action: 'SYNC',
      resourceType: 'workflow_run',
      resourceId: completed.id,
      payload: output
    });

    return output;
  } catch (error) {
    const message = toErrorMessage(error);
    await prisma.workflowRun.update({
      where: { id: workflowRunId },
      data: {
        status: WorkflowRunStatus.FAILED,
        lastError: message,
        finishedAt: new Date()
      }
    });

    await writeJobAudit({
      workspaceId: run.workspaceId,
      userId: run.triggerUserId,
      action: 'UPDATE',
      resourceType: 'workflow_run',
      resourceId: run.id,
      payload: {
        error: message
      }
    });

    throw error;
  }
}
