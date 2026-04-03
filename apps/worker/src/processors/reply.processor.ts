import { Job } from 'bullmq';
import { ReplyJobStatus } from '@draftorbit/db';
import { prisma } from '@draftorbit/db';
import { ReplyJobPayload } from '@draftorbit/shared';
import { toErrorMessage, writeJobAudit } from '../common/job-utils';

export async function processReplyJob(job: Job<ReplyJobPayload>) {
  const { replyJobId } = job.data;

  const replyJob = await prisma.replyJob.findUnique({ where: { id: replyJobId } });
  if (!replyJob) {
    throw new Error(`Reply job not found: ${replyJobId}`);
  }

  if (replyJob.status === ReplyJobStatus.SUCCEEDED) {
    return { skipped: true };
  }

  await prisma.replyJob.update({
    where: { id: replyJobId },
    data: {
      status: ReplyJobStatus.RUNNING,
      attempts: { increment: 1 },
      lastError: null
    }
  });

  try {
    await prisma.replyJob.update({
      where: { id: replyJobId },
      data: { status: ReplyJobStatus.SUCCEEDED }
    });

    await writeJobAudit({
      workspaceId: replyJob.workspaceId,
      action: 'REPLY',
      resourceType: 'reply_job',
      resourceId: replyJob.id,
      payload: {
        message: 'Reply job executed by stub processor'
      }
    });

    return { success: true };
  } catch (error) {
    const message = toErrorMessage(error);
    const summarized = `REPLY_ERROR: ${message}`;

    await prisma.replyJob.update({
      where: { id: replyJobId },
      data: {
        status: ReplyJobStatus.FAILED,
        lastError: summarized
      }
    });

    await writeJobAudit({
      workspaceId: replyJob.workspaceId,
      action: 'REPLY',
      resourceType: 'reply_job',
      resourceId: replyJob.id,
      payload: {
        errorCode: 'REPLY_ERROR',
        errorSummary: message
      }
    });

    throw error;
  }
}
