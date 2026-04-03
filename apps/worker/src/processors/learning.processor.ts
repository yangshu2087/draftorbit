import { Job } from 'bullmq';
import { prisma } from '@draftorbit/db';
import { LearningJobPayload } from '@draftorbit/shared';
import { toErrorMessage, writeJobAudit } from '../common/job-utils';

export async function processLearningJob(job: Job<LearningJobPayload>) {
  const { learningSourceId, workspaceId, userId } = job.data;

  const source = await prisma.learningSource.findUnique({ where: { id: learningSourceId } });
  if (!source) {
    throw new Error(`Learning source not found: ${learningSourceId}`);
  }

  try {
    await prisma.learningSource.update({
      where: { id: learningSourceId },
      data: {
        metadata: {
          ...((source.metadata as Record<string, unknown>) ?? {}),
          lastRunAt: new Date().toISOString(),
          lastRunBy: 'worker'
        }
      }
    });

    const profileName = `AutoProfile-${source.sourceType}`;

    await prisma.voiceProfile.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: profileName
        }
      },
      update: {
        sampleCount: { increment: 3 },
        lastLearnedAt: new Date()
      },
      create: {
        workspaceId,
        name: profileName,
        profile: {
          sourceType: source.sourceType,
          sourceRef: source.sourceRef,
          language: 'zh',
          style: 'learning-stub'
        },
        sampleCount: 3,
        lastLearnedAt: new Date()
      }
    });

    await writeJobAudit({
      workspaceId,
      userId,
      action: 'SYNC',
      resourceType: 'learning_source',
      resourceId: learningSourceId,
      payload: {
        message: 'Learning job completed',
        sourceType: source.sourceType
      }
    });

    return { ok: true, learningSourceId };
  } catch (error) {
    await writeJobAudit({
      workspaceId,
      userId,
      action: 'UPDATE',
      resourceType: 'learning_source',
      resourceId: learningSourceId,
      payload: {
        error: toErrorMessage(error)
      }
    });
    throw error;
  }
}
