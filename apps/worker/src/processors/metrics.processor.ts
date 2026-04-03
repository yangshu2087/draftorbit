import { Job } from 'bullmq';
import { prisma } from '@draftorbit/db';
import { MetricsJobPayload } from '@draftorbit/shared';
import { writeJobAudit } from '../common/job-utils';

export async function processMetricsJob(job: Job<MetricsJobPayload>) {
  const { workspaceId } = job.data;

  const [usageEvents, publishJobs, replyJobs] = await Promise.all([
    prisma.usageLog.count({ where: { workspaceId } }),
    prisma.publishJob.count({ where: { workspaceId } }),
    prisma.replyJob.count({ where: { workspaceId } })
  ]);

  await writeJobAudit({
    workspaceId,
    action: 'SYNC',
    resourceType: 'metrics',
    payload: {
      usageEvents,
      publishJobs,
      replyJobs
    }
  });

  return { workspaceId, usageEvents, publishJobs, replyJobs };
}
