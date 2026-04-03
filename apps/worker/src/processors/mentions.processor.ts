import { Job } from 'bullmq';
import { ReplyRiskLevel, prisma } from '@draftorbit/db';
import { MentionsJobPayload } from '@draftorbit/shared';
import { writeJobAudit } from '../common/job-utils';

export async function processMentionsJob(job: Job<MentionsJobPayload>) {
  const { replyJobId } = job.data;

  const replyJob = await prisma.replyJob.findUnique({ where: { id: replyJobId } });
  if (!replyJob) {
    throw new Error(`Reply job not found: ${replyJobId}`);
  }

  const existing = await prisma.replyCandidate.count({ where: { replyJobId } });
  if (existing === 0) {
    await prisma.replyCandidate.createMany({
      data: [
        {
          replyJobId,
          content: '感谢你的关注！这是一个自动生成的回复候选。',
          riskLevel: ReplyRiskLevel.LOW,
          riskScore: '0.12'
        },
        {
          replyJobId,
          content: '谢谢反馈，我们会继续优化。',
          riskLevel: ReplyRiskLevel.LOW,
          riskScore: '0.08'
        }
      ]
    });
  }

  await writeJobAudit({
    workspaceId: replyJob.workspaceId,
    action: 'SYNC',
    resourceType: 'reply_job',
    resourceId: replyJob.id,
    payload: {
      seededCandidates: existing === 0
    }
  });

  return { replyJobId, candidatesSeeded: existing === 0 };
}
