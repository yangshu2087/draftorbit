import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DraftStatus } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class DraftsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async list(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      status?: DraftStatus;
    } = {}
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const pageSize = options.pageSize ? Math.min(Math.max(options.pageSize, 1), 200) : 100;
    const page = options.page && options.page > 0 ? options.page : 1;
    const skip = (page - 1) * pageSize;

    return this.prisma.db.draft.findMany({
      where: {
        workspaceId,
        ...(options.status ? { status: options.status } : {})
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        versions: {
          orderBy: { versionNo: 'desc' },
          take: 3
        }
      },
      take: pageSize,
      skip
    });
  }

  async create(userId: string, title: string, content: string, language = 'zh') {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const draft = await this.prisma.db.draft.create({
      data: {
        workspaceId,
        userId,
        title,
        language,
        status: DraftStatus.DRAFT,
        latestContent: content,
        currentVersion: 1,
        versions: {
          create: {
            versionNo: 1,
            content,
            createdById: userId
          }
        }
      },
      include: { versions: true }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'draft',
        resourceId: draft.id
      }
    });

    return draft;
  }

  private async evaluateQuality(
    workspaceId: string,
    draftId: string,
    content: string
  ): Promise<{
    passed: boolean;
    score: number;
    blockers: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
  }> {
    const blockers: Array<{ code: string; message: string }> = [];
    const warnings: Array<{ code: string; message: string }> = [];
    let score = 100;

    const normalized = content.trim();
    const charCount = [...normalized].length;

    if (charCount < 20) {
      blockers.push({
        code: 'LENGTH_TOO_SHORT',
        message: '正文过短，无法形成可发布内容（至少 20 字）'
      });
      score -= 40;
    }

    if (charCount > 280) {
      warnings.push({
        code: 'LENGTH_TOO_LONG',
        message: '正文超过 280 字，作为单条 X 推文可能超长'
      });
      score -= 10;
    }

    const duplicateCount = await this.prisma.db.draft.count({
      where: {
        workspaceId,
        id: { not: draftId },
        latestContent: normalized
      }
    });

    if (duplicateCount > 0) {
      blockers.push({
        code: 'DUPLICATE_CONTENT',
        message: '内容与历史草稿重复，请修改后再审批'
      });
      score -= 30;
    }

    const sensitiveWords = ['诈骗', '赌博', '裸聊', '仇恨', '暴力'];
    const hits = sensitiveWords.filter((w) => normalized.includes(w));
    if (hits.length > 0) {
      blockers.push({
        code: 'SENSITIVE_WORDS',
        message: `检测到高风险词：${hits.join('、')}`
      });
      score -= 30;
    }

    const hasCTA = /(关注|转发|评论|留言|私信|点击|了解更多|立即|试用|欢迎交流)/.test(normalized);
    if (!hasCTA) {
      warnings.push({
        code: 'CTA_MISSING',
        message: '建议补充行动引导（如“欢迎评论/转发/关注”）'
      });
      score -= 8;
    }

    return {
      passed: blockers.length === 0,
      score: Math.max(0, score),
      blockers,
      warnings
    };
  }

  async qualityCheck(userId: string, draftId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const draft = await this.prisma.db.draft.findUnique({ where: { id: draftId } });

    if (!draft || draft.workspaceId !== workspaceId) {
      throw new NotFoundException('草稿不存在');
    }

    const content = draft.latestContent?.trim() ?? '';
    if (!content) {
      return {
        draftId,
        passed: false,
        score: 0,
        blockers: [
          {
            code: 'EMPTY_CONTENT',
            message: '草稿内容为空'
          }
        ],
        warnings: []
      };
    }

    const report = await this.evaluateQuality(workspaceId, draftId, content);
    return {
      draftId,
      ...report
    };
  }

  async approve(userId: string, draftId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const draft = await this.prisma.db.draft.findUnique({ where: { id: draftId } });

    if (!draft || draft.workspaceId !== workspaceId) {
      throw new NotFoundException('草稿不存在');
    }

    if (!draft.latestContent?.trim()) {
      throw new BadRequestException('草稿内容为空，不能审批');
    }

    const quality = await this.evaluateQuality(workspaceId, draftId, draft.latestContent);
    if (!quality.passed) {
      throw new BadRequestException({
        code: 'QUALITY_GATE_BLOCKED',
        message: '审批前质量校验未通过',
        details: quality
      });
    }

    const updated = await this.prisma.db.draft.update({
      where: { id: draftId },
      data: {
        status: DraftStatus.APPROVED,
        approvedAt: new Date()
      }
    });

    await this.prisma.db.approvalRequest.create({
      data: {
        workspaceId,
        resourceType: 'draft',
        resourceId: draftId,
        requesterId: userId,
        approverId: userId,
        status: 'APPROVED',
        note: 'Auto-approved by draft owner'
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'APPROVE',
        resourceType: 'draft',
        resourceId: draftId,
        payload: {
          qualityScore: quality.score,
          warnings: quality.warnings
        }
      }
    });

    return {
      ...updated,
      quality
    };
  }
}
