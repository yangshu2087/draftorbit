import { Job } from 'bullmq';
import { DraftStatus, PublishChannel, PublishJobStatus, XAccountStatus } from '@draftorbit/db';
import { decryptSecret } from '@draftorbit/shared';
import { prisma } from '@draftorbit/db';
import { TwitterApi } from 'twitter-api-v2';
import { PublishJobPayload } from '@draftorbit/shared';
import { toErrorMessage, writeJobAudit } from '../common/job-utils';

type PublishJobBody = {
  texts?: string[];
};

function normalizeTexts(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const { texts } = payload as PublishJobBody;
  if (!Array.isArray(texts)) return [];
  return texts.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

async function finalizeDraftStatus(draftId: string | null | undefined, status: DraftStatus) {
  if (!draftId) return;
  try {
    await prisma.draft.update({
      where: { id: draftId },
      data: {
        status,
        ...(status === DraftStatus.PUBLISHED ? { publishedAt: new Date(), lastError: null } : {}),
        ...(status === DraftStatus.FAILED ? { lastError: '发布任务执行失败' } : {})
      }
    });
  } catch {
    // draft may be deleted; do not fail job finalization
  }
}

async function markManualFallback(publishJobId: string, reason: string, texts: string[]) {
  const publishJob = await prisma.publishJob.findUniqueOrThrow({ where: { id: publishJobId } });
  const manualId = `manual-${publishJob.id}`;
  const copyText = texts.join('\n\n');

  await prisma.publishRecord.upsert({
    where: { generationId: publishJob.generationId ?? `legacy-${publishJob.id}` },
    create: {
      userId: publishJob.userId,
      workspaceId: publishJob.workspaceId,
      generationId: publishJob.generationId ?? `legacy-${publishJob.id}`,
      externalTweetId: manualId,
      publishedAt: new Date()
    },
    update: {
      externalTweetId: manualId,
      publishedAt: new Date(),
      workspaceId: publishJob.workspaceId
    }
  });

  await prisma.postHistory.create({
    data: {
      workspaceId: publishJob.workspaceId,
      xAccountId: publishJob.xAccountId ?? null,
      draftId: publishJob.draftId ?? null,
      externalPostId: manualId,
      url: null,
      rawPayload: {
        ...(publishJob.payload as Record<string, unknown>),
        manualFallback: true,
        reason,
        copyText
      } as any
    }
  });

  await prisma.publishJob.update({
    where: { id: publishJobId },
    data: {
      status: PublishJobStatus.SUCCEEDED,
      externalPostId: manualId,
      payload: {
        ...(publishJob.payload as Record<string, unknown>),
        manualFallback: true,
        manualReason: reason,
        copyText
      } as any,
      lastError: null
    }
  });

  await finalizeDraftStatus(publishJob.draftId, DraftStatus.PUBLISHED);

  await writeJobAudit({
    workspaceId: publishJob.workspaceId,
    userId: publishJob.userId,
    action: 'PUBLISH',
    resourceType: 'publish_job',
    resourceId: publishJob.id,
    payload: {
      manualFallback: true,
      reason
    }
  });

  return {
    manualFallback: true,
    reason,
    copyText
  };
}

export async function processPublishJob(job: Job<PublishJobPayload>) {
  const { publishJobId } = job.data;

  const publishJob = await prisma.publishJob.findUnique({ where: { id: publishJobId } });
  if (!publishJob) {
    throw new Error(`Publish job not found: ${publishJobId}`);
  }

  if (publishJob.status === PublishJobStatus.SUCCEEDED && publishJob.externalPostId) {
    return { tweetId: publishJob.externalPostId, skipped: true };
  }

  await prisma.publishJob.update({
    where: { id: publishJobId },
    data: {
      status: PublishJobStatus.RUNNING,
      attempts: { increment: 1 },
      lastError: null
    }
  });

  try {
    const texts = normalizeTexts(publishJob.payload);

    if (texts.length === 0) {
      throw new Error(`Publish payload missing texts: ${publishJob.id}`);
    }

    const targetXAccount = publishJob.xAccountId
      ? await prisma.xAccount.findFirst({
          where: {
            id: publishJob.xAccountId,
            workspaceId: publishJob.workspaceId
          }
        })
      : await prisma.xAccount.findFirst({
          where: {
            workspaceId: publishJob.workspaceId,
            status: XAccountStatus.ACTIVE
          },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
        });

    const forceManual = (process.env.PUBLISH_FORCE_MANUAL ?? 'false').toLowerCase() === 'true';
    if (forceManual) {
      return markManualFallback(publishJob.id, 'FORCE_MANUAL_MODE', texts);
    }

    if (!targetXAccount) {
      return markManualFallback(publishJob.id, 'MISSING_X_ACCOUNT', texts);
    }

    if (targetXAccount.status !== XAccountStatus.ACTIVE) {
      return markManualFallback(publishJob.id, 'X_ACCOUNT_NOT_ACTIVE', texts);
    }

    if (!targetXAccount.accessTokenEnc) {
      return markManualFallback(
        publishJob.id,
        'MISSING_X_ACCOUNT_TOKEN',
        texts
      );
    }

    const client = new TwitterApi(decryptSecret(targetXAccount.accessTokenEnc));

    let tweetId: string;
    if (publishJob.channel === PublishChannel.X_THREAD) {
      const thread = await client.v2.tweetThread(texts.map((text) => ({ text })));
      const first = thread[0];
      tweetId = first?.data?.id;
      if (!tweetId) throw new Error('Thread publish failed: no tweet id returned');
    } else {
      const result = await client.v2.tweet(texts[0]);
      tweetId = result.data.id;
    }

    await prisma.publishRecord.upsert({
      where: { generationId: publishJob.generationId ?? `legacy-${publishJob.id}` },
      create: {
        userId: publishJob.userId,
        workspaceId: publishJob.workspaceId,
        generationId: publishJob.generationId ?? `legacy-${publishJob.id}`,
        externalTweetId: tweetId,
        publishedAt: new Date()
      },
      update: {
        externalTweetId: tweetId,
        publishedAt: new Date(),
        workspaceId: publishJob.workspaceId
      }
    });

    await prisma.postHistory.create({
      data: {
        workspaceId: publishJob.workspaceId,
        xAccountId: targetXAccount.id,
        draftId: publishJob.draftId ?? null,
        externalPostId: tweetId,
        url: `https://x.com/${targetXAccount.handle.replace(/^@/, '')}/status/${tweetId}`,
        rawPayload: publishJob.payload as any
      }
    });

    await prisma.publishJob.update({
      where: { id: publishJobId },
      data: {
        status: PublishJobStatus.SUCCEEDED,
        externalPostId: tweetId,
        lastError: null
      }
    });

    await finalizeDraftStatus(publishJob.draftId, DraftStatus.PUBLISHED);

    await writeJobAudit({
      workspaceId: publishJob.workspaceId,
      userId: publishJob.userId,
      action: 'PUBLISH',
      resourceType: 'publish_job',
      resourceId: publishJob.id,
      payload: {
        tweetId,
        channel: publishJob.channel,
        xAccountId: targetXAccount.id,
        xHandle: targetXAccount.handle
      }
    });

    return { tweetId };
  } catch (error) {
    const message = toErrorMessage(error);
    const summarized = `PUBLISH_ERROR: ${message}`;

    await prisma.publishJob.update({
      where: { id: publishJobId },
      data: {
        status: PublishJobStatus.FAILED,
        lastError: summarized
      }
    });

    await finalizeDraftStatus(publishJob.draftId, DraftStatus.FAILED);

    await writeJobAudit({
      workspaceId: publishJob.workspaceId,
      userId: publishJob.userId,
      action: 'PUBLISH',
      resourceType: 'publish_job',
      resourceId: publishJob.id,
      payload: {
        errorCode: 'PUBLISH_ERROR',
        errorSummary: message
      }
    });

    throw error;
  }
}
