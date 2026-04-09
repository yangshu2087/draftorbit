import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  DraftStatus,
  GenerationStatus,
  GenerationType,
  PublishChannel,
  PublishJobStatus,
  WorkspaceRole,
  XAccountStatus
} from '@draftorbit/db';
import { normalizeXArticleUrl } from '@draftorbit/shared';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';

function extractTweetText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r.text === 'string') return r.text;
    if (typeof r.content === 'string') return r.content;
    if (typeof r.tweet === 'string') return r.tweet;
  }
  throw new BadRequestException('生成结果格式无效，无法发布单条推文');
}

function extractThreadTexts(result: unknown): string[] {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    const raw = r.texts ?? r.thread ?? r.tweets;
    if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
      return raw as string[];
    }
    if (typeof r.text === 'string') return [r.text];
    if (typeof r.tweet === 'string') return [r.tweet];
  }
  if (typeof result === 'string') return [result];
  throw new BadRequestException('生成结果格式无效，无法发布串推');
}

@Injectable()
export class PublishService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueService) private readonly queue: QueueService
  ) {}

  private async resolveWorkspace(userId: string): Promise<{ workspaceId: string; role: WorkspaceRole }> {
    const member = await this.prisma.db.workspaceMember.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });

    if (!member) {
      throw new ForbiddenException('当前用户未绑定任何工作区');
    }

    return { workspaceId: member.workspaceId, role: member.role };
  }

  private async createAndQueuePublishJob(
    userId: string,
    channel: PublishChannel,
    texts: string[],
    options: { generationId?: string; draftId?: string; scheduledFor?: Date; xAccountId?: string } = {}
  ) {
    if (!options.generationId && !options.draftId) {
      throw new BadRequestException('必须指定 generationId 或 draftId');
    }

    const { workspaceId } = await this.resolveWorkspace(userId);
    const xAccount = await this.resolvePublishAccount(workspaceId, options.xAccountId);

    let generationType: string | null = null;
    if (options.generationId) {
      const generation = await this.prisma.db.generation.findUnique({
        where: { id: options.generationId }
      });

      if (!generation) throw new NotFoundException('生成记录不存在');
      if (generation.userId !== userId) throw new ForbiddenException('无权操作该生成');
      if (generation.status !== GenerationStatus.DONE) {
        throw new BadRequestException('生成未完成，无法发布');
      }
      generationType = generation.type;
    }

    const publishJob = await this.prisma.db.publishJob.create({
      data: {
        workspaceId,
        userId,
        xAccountId: xAccount?.id ?? null,
        generationId: options.generationId ?? null,
        draftId: options.draftId ?? null,
        channel,
        payload: {
          texts,
          source: 'manual-trigger',
          generationType,
          xAccountId: xAccount?.id ?? null
        },
        status: PublishJobStatus.QUEUED,
        scheduledFor: options.scheduledFor ?? null
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'PUBLISH',
        resourceType: 'publish_job',
        resourceId: publishJob.id,
        payload: {
          generationId: options.generationId ?? null,
          draftId: options.draftId ?? null,
          channel,
          textCount: texts.length,
          scheduledFor: options.scheduledFor?.toISOString() ?? null,
          xAccountId: xAccount?.id ?? null
        }
      }
    });

    await this.queue.enqueuePublish(publishJob.id, options.scheduledFor);

    return {
      traceId: publishJob.id,
      publishJobId: publishJob.id,
      status: publishJob.status,
      generationId: options.generationId ?? null,
      draftId: options.draftId ?? null,
      requestedXAccountId: options.xAccountId ?? null,
      resolvedXAccountId: xAccount?.id ?? null,
      xAccountId: xAccount?.id ?? null,
      channel,
      queuedAt: publishJob.createdAt,
      scheduledFor: publishJob.scheduledFor
    };
  }

  private async resolvePublishAccount(workspaceId: string, xAccountId?: string) {
    if (xAccountId) {
      const explicit = await this.prisma.db.xAccount.findFirst({
        where: {
          id: xAccountId,
          workspaceId
        }
      });
      if (!explicit) throw new NotFoundException('指定的 X 账号不存在');
      if (explicit.status !== XAccountStatus.ACTIVE) {
        throw new BadRequestException('指定的 X 账号不可用，请先恢复为 ACTIVE');
      }
      return explicit;
    }

    return this.prisma.db.xAccount.findFirst({
      where: {
        workspaceId,
        status: XAccountStatus.ACTIVE
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });
  }

  async publishTweet(userId: string, generationId: string, xAccountId?: string) {
    const generation = await this.prisma.db.generation.findUnique({ where: { id: generationId } });
    if (!generation) throw new NotFoundException('生成记录不存在');
    const text = extractTweetText(generation.result);
    return this.createAndQueuePublishJob(userId, PublishChannel.X_TWEET, [text], { generationId, xAccountId });
  }

  async publishThread(userId: string, generationId: string, xAccountId?: string) {
    const generation = await this.prisma.db.generation.findUnique({ where: { id: generationId } });
    if (!generation) throw new NotFoundException('生成记录不存在');
    const texts = extractThreadTexts(generation.result);
    if (texts.length === 0) throw new BadRequestException('串推内容为空');
    return this.createAndQueuePublishJob(userId, PublishChannel.X_THREAD, texts, { generationId, xAccountId });
  }

  async publishDraft(
    userId: string,
    draftId: string,
    scheduledFor?: string,
    xAccountId?: string
  ) {
    const draft = await this.prisma.db.draft.findUnique({
      where: { id: draftId }
    });

    if (!draft) throw new NotFoundException('草稿不存在');
    if (draft.userId !== userId) throw new ForbiddenException('无权发布该草稿');
    if (draft.status !== DraftStatus.APPROVED) {
      throw new BadRequestException('草稿尚未审批，不能发布');
    }

    const text = draft.latestContent?.trim();
    if (!text) throw new BadRequestException('草稿内容为空，不能发布');

    let scheduledDate: Date | undefined;
    if (scheduledFor) {
      const parsed = new Date(scheduledFor);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('scheduledFor 时间格式错误');
      }
      scheduledDate = parsed;
    }

    const result = await this.createAndQueuePublishJob(
      userId,
      PublishChannel.X_TWEET,
      [text],
      {
        draftId,
        scheduledFor: scheduledDate,
        xAccountId
      }
    );

    await this.prisma.db.draft.update({
      where: { id: draftId },
      data: {
        status: DraftStatus.QUEUED
      }
    });

    return result;
  }

  async completeManualArticlePublish(
    userId: string,
    generationId: string,
    rawUrl: string,
    xAccountId?: string
  ) {
    const normalizedUrl = normalizeXArticleUrl(rawUrl);
    if (!normalizedUrl) {
      throw new BadRequestException({
        code: 'INVALID_ARTICLE_URL',
        message: '请输入有效的 X 文章链接（https://x.com/...）',
        details: {
          nextAction: 'export_article',
          blockingReason: 'INVALID_ARTICLE_URL'
        }
      });
    }

    const generation = await this.prisma.db.generation.findUnique({
      where: { id: generationId }
    });
    if (!generation) throw new NotFoundException('生成记录不存在');
    if (generation.userId !== userId) throw new ForbiddenException('无权操作该生成');
    if (generation.status !== GenerationStatus.DONE) {
      throw new BadRequestException('生成未完成，无法记录文章发布结果');
    }
    if (generation.type !== GenerationType.LONG) {
      throw new BadRequestException('当前内容不是长文，不能记录为 X 文章发布');
    }

    const { workspaceId } = await this.resolveWorkspace(userId);
    const xAccount = xAccountId
      ? await this.resolvePublishAccount(workspaceId, xAccountId)
      : await this.prisma.db.xAccount.findFirst({
          where: { workspaceId, status: XAccountStatus.ACTIVE },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
        });

    const publishedAt = new Date();
    const record = await this.prisma.db.publishRecord.upsert({
      where: { generationId },
      update: {
        externalTweetId: normalizedUrl,
        publishedAt
      },
      create: {
        userId,
        workspaceId,
        generationId,
        externalTweetId: normalizedUrl,
        publishedAt
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'PUBLISH',
        resourceType: 'publish_record',
        resourceId: record.id,
        payload: {
          generationId,
          mode: 'manual_x_web',
          externalUrl: normalizedUrl,
          xAccountId: xAccount?.id ?? null
        }
      }
    });

    return {
      traceId: record.id,
      publishRecordId: record.id,
      generationId,
      status: 'MANUAL_RECORDED' as const,
      externalUrl: normalizedUrl,
      publishedAt: record.publishedAt,
      xAccountId: xAccount?.id ?? null,
      xAccountHandle: xAccount?.handle ?? null
    };
  }

  async listJobs(
    userId: string,
    options: {
      limit?: number;
      page?: number;
      pageSize?: number;
      status?: PublishJobStatus;
    } = {}
  ) {
    const { workspaceId } = await this.resolveWorkspace(userId);
    const takeFromLimit = options.limit ? Math.min(Math.max(options.limit, 1), 500) : undefined;
    const pageSize = options.pageSize ? Math.min(Math.max(options.pageSize, 1), 200) : undefined;
    const take = pageSize ?? takeFromLimit ?? 100;
    const page = options.page && options.page > 0 ? options.page : 1;
    const skip = (page - 1) * take;

    return this.prisma.db.publishJob.findMany({
      where: {
        workspaceId,
        ...(options.status ? { status: options.status } : {})
      },
      include: {
        xAccount: {
          select: {
            id: true,
            handle: true,
            status: true,
            isDefault: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip
    });
  }

  async retryJob(userId: string, publishJobId: string) {
    const { workspaceId } = await this.resolveWorkspace(userId);
    const job = await this.prisma.db.publishJob.findFirst({
      where: {
        id: publishJobId,
        workspaceId
      }
    });
    if (!job) throw new NotFoundException('发布任务不存在');

    await this.prisma.db.publishJob.update({
      where: { id: publishJobId },
      data: {
        status: PublishJobStatus.QUEUED,
        lastError: null
      }
    });

    await this.queue.enqueuePublish(publishJobId, job.scheduledFor ?? undefined);

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'UPDATE',
        resourceType: 'publish_job',
        resourceId: publishJobId,
        payload: {
          retry: true
        }
      }
    });

    return {
      traceId: publishJobId,
      publishJobId,
      retried: true,
      xAccountId: job.xAccountId ?? null
    };
  }

  async getPublishRecord(userId: string, generationId: string) {
    const [record, jobs] = await Promise.all([
      this.prisma.db.publishRecord.findUnique({
        where: { generationId },
        include: { generation: true }
      }),
      this.prisma.db.publishJob.findMany({
        where: { generationId, userId },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ]);

    if (!record && jobs.length === 0) throw new NotFoundException('发布记录不存在');
    if (record && record.userId !== userId) throw new ForbiddenException('无权查看该记录');

    return {
      generationId,
      latestRecord: record,
      jobs
    };
  }
}
