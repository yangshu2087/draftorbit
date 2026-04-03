import { Job } from 'bullmq';
import { MediaAssetStatus, prisma } from '@draftorbit/db';
import { ImageJobPayload } from '@draftorbit/shared';
import { toErrorMessage, writeJobAudit } from '../common/job-utils';

export async function processImageJob(job: Job<ImageJobPayload>) {
  const { mediaAssetId } = job.data;

  const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
  if (!asset) {
    throw new Error(`Media asset not found: ${mediaAssetId}`);
  }

  try {
    const outputUrl =
      asset.outputUrl || `https://cdn.draftorbit.local/generated/${asset.id}.png`;

    const updated = await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        outputUrl,
        status: MediaAssetStatus.READY,
        metadata: {
          ...((asset.metadata as Record<string, unknown>) ?? {}),
          generatedAt: new Date().toISOString(),
          generator: 'image-worker-stub'
        }
      }
    });

    await writeJobAudit({
      workspaceId: updated.workspaceId,
      userId: updated.userId,
      action: 'UPDATE',
      resourceType: 'media_asset',
      resourceId: updated.id,
      payload: {
        outputUrl
      }
    });

    return { mediaAssetId: updated.id, outputUrl };
  } catch (error) {
    await prisma.mediaAsset.update({
      where: { id: mediaAssetId },
      data: {
        status: MediaAssetStatus.FAILED,
        metadata: {
          ...((asset.metadata as Record<string, unknown>) ?? {}),
          error: toErrorMessage(error)
        }
      }
    });
    throw error;
  }
}
