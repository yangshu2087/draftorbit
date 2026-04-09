import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { GenerationStatus, GenerationType, XAccountStatus } from '@draftorbit/db';
import { normalizeXArticleUrl, resolveXArticlePublishCapability } from '@draftorbit/shared';
import { PrismaService } from '../../common/prisma.service';
import type {
  ArticlePublishPreparation,
  ArticlePublishRecordResult,
  XArticlePublisherProvider
} from './x-article-publisher';

@Injectable()
export class ManualXWebArticlePublisher implements XArticlePublisherProvider {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCapability() {
    return resolveXArticlePublishCapability();
  }

  async prepare(_runId: string, _userId: string): Promise<ArticlePublishPreparation> {
    return {
      capability: resolveXArticlePublishCapability()
    };
  }

  private async resolveWorkspace(userId: string) {
    const member = await this.prisma.db.workspaceMember.findFirst({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });

    if (!member) {
      throw new ForbiddenException('当前用户未绑定任何工作区');
    }

    return { workspaceId: member.workspaceId };
  }

  private async resolvePublishAccount(workspaceId: string, xAccountId?: string) {
    if (xAccountId) {
      const explicit = await this.prisma.db.xAccount.findFirst({
        where: { id: xAccountId, workspaceId }
      });
      if (!explicit) throw new NotFoundException('指定的 X 账号不存在');
      if (explicit.status !== XAccountStatus.ACTIVE) {
        throw new BadRequestException('指定的 X 账号不可用，请先恢复为 ACTIVE');
      }
      return explicit;
    }

    return this.prisma.db.xAccount.findFirst({
      where: { workspaceId, status: XAccountStatus.ACTIVE },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });
  }

  async recordManualCompletion(
    runId: string,
    userId: string,
    url: string,
    xAccountId?: string
  ): Promise<ArticlePublishRecordResult> {
    const normalizedUrl = normalizeXArticleUrl(url);
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
      where: { id: runId }
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
    const xAccount = await this.resolvePublishAccount(workspaceId, xAccountId);
    const publishedAt = new Date();
    const record = await this.prisma.db.publishRecord.upsert({
      where: { generationId: runId },
      update: {
        externalTweetId: normalizedUrl,
        publishedAt
      },
      create: {
        userId,
        workspaceId,
        generationId: runId,
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
          generationId: runId,
          mode: 'manual_x_web',
          externalUrl: normalizedUrl,
          xAccountId: xAccount?.id ?? null
        }
      }
    });

    return {
      traceId: record.id,
      publishRecordId: record.id,
      generationId: runId,
      status: 'MANUAL_RECORDED',
      externalUrl: normalizedUrl,
      publishedAt: record.publishedAt,
      xAccountId: xAccount?.id ?? null,
      xAccountHandle: xAccount?.handle ?? null
    };
  }
}
