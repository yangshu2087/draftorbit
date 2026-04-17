import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ApprovalStatus, ReplyJobStatus, ReplyRiskLevel, XAccountStatus } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';
import { QueueService } from '../../common/queue.service';
import { WorkspaceContextService } from '../../common/workspace-context.service';

@Injectable()
export class ReplyJobsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(WorkspaceContextService) private readonly workspaceContext: WorkspaceContextService
  ) {}

  async list(
    userId: string,
    options: {
      page?: number;
      pageSize?: number;
      status?: ReplyJobStatus;
    } = {}
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const pageSize = options.pageSize ? Math.min(Math.max(options.pageSize, 1), 200) : 100;
    const page = options.page && options.page > 0 ? options.page : 1;
    const skip = (page - 1) * pageSize;

    return this.prisma.db.replyJob.findMany({
      where: {
        workspaceId,
        ...(options.status ? { status: options.status } : {})
      },
      include: {
        xAccount: {
          select: {
            id: true,
            handle: true,
            status: true
          }
        },
        candidates: {
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip
    });
  }

  async syncMentions(userId: string, input: { xAccountId?: string; sourcePostId?: string }) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);
    const xAccount = await this.resolveReplyAccount(workspaceId, input.xAccountId);

    const job = await this.prisma.db.replyJob.create({
      data: {
        workspaceId,
        xAccountId: xAccount.id,
        sourcePostId: input.sourcePostId ?? null,
        status: ReplyJobStatus.QUEUED,
        payload: {
          mode: 'mentions-sync',
          source: 'x-api-stub',
          syncedAt: new Date().toISOString(),
          xAccountId: xAccount.id,
          xHandle: xAccount.handle
        }
      }
    });

    await this.queue.enqueueMentionsSync(job.id);

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'SYNC',
        resourceType: 'reply_job',
        resourceId: job.id,
        payload: {
          mode: 'mentions-sync',
          xAccountId: xAccount.id
        }
      }
    });

    return {
      ...job,
      traceId: job.id,
      requestedXAccountId: input.xAccountId ?? null,
      resolvedXAccountId: xAccount.id,
      xAccountId: xAccount.id
    };
  }

  async addCandidate(
    userId: string,
    replyJobId: string,
    input: { content: string; riskLevel?: ReplyRiskLevel; riskScore?: number }
  ) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const job = await this.prisma.db.replyJob.findFirst({ where: { id: replyJobId, workspaceId } });
    if (!job) throw new NotFoundException('Reply Job 不存在');

    const candidate = await this.prisma.db.replyCandidate.create({
      data: {
        replyJobId,
        content: input.content,
        riskLevel: input.riskLevel ?? ReplyRiskLevel.LOW,
        riskScore: String(input.riskScore ?? 0.1)
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'CREATE',
        resourceType: 'reply_candidate',
        resourceId: candidate.id,
        payload: {
          riskLevel: candidate.riskLevel,
          riskScore: candidate.riskScore
        }
      }
    });

    return {
      ...candidate,
      traceId: candidate.id,
      replyJobId,
      xAccountId: job.xAccountId ?? null
    };
  }

  async approveCandidate(userId: string, replyJobId: string, candidateId: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const candidate = await this.prisma.db.replyCandidate.findFirst({
      where: {
        id: candidateId,
        replyJobId,
        replyJob: {
          workspaceId
        }
      },
      include: {
        replyJob: {
          select: { xAccountId: true }
        }
      }
    });

    if (!candidate) throw new NotFoundException('Reply candidate 不存在');

    const approved = await this.prisma.db.replyCandidate.update({
      where: { id: candidateId },
      data: {
        approvalStatus: ApprovalStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date()
      }
    });

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'APPROVE',
        resourceType: 'reply_candidate',
        resourceId: candidateId
      }
    });

    return {
      ...approved,
      traceId: approved.id,
      xAccountId: candidate.replyJob.xAccountId ?? null
    };
  }

  async sendApproved(userId: string, replyJobId: string, candidateId?: string) {
    const workspaceId = await this.workspaceContext.getDefaultWorkspaceId(userId);

    const job = await this.prisma.db.replyJob.findFirst({
      where: { id: replyJobId, workspaceId },
      include: {
        candidates: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (!job) throw new NotFoundException('Reply Job 不存在');

    const target = candidateId
      ? job.candidates.find((c) => c.id === candidateId)
      : job.candidates.find((c) => c.approvalStatus === ApprovalStatus.APPROVED);

    if (!target) {
      throw new BadRequestException('没有可发送的已审批候选回复');
    }

    if (target.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new BadRequestException('候选回复尚未审批，不能发送');
    }

    const updated = await this.prisma.db.replyJob.update({
      where: { id: replyJobId },
      data: {
        status: ReplyJobStatus.QUEUED,
        payload: {
          ...((job.payload as Record<string, unknown>) ?? {}),
          approvedCandidateId: target.id,
          approvedContent: target.content
        }
      }
    });

    await this.queue.enqueueReply(replyJobId);

    await this.prisma.db.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'REPLY',
        resourceType: 'reply_job',
        resourceId: replyJobId,
        payload: {
          candidateId: target.id
        }
      }
    });

    return {
      ...updated,
      traceId: updated.id,
      requestedCandidateId: candidateId ?? null,
      approvedCandidateId: target.id,
      xAccountId: job.xAccountId ?? null
    };
  }

  private async resolveReplyAccount(workspaceId: string, xAccountId?: string) {
    if (xAccountId) {
      const account = await this.prisma.db.xAccount.findFirst({
        where: {
          id: xAccountId,
          workspaceId
        }
      });
      if (!account) throw new NotFoundException('指定的 X 账号不存在');
      if (account.status !== XAccountStatus.ACTIVE) {
        throw new BadRequestException('指定的 X 账号不可用，请先恢复为 ACTIVE');
      }
      return account;
    }

    const fallback = await this.prisma.db.xAccount.findFirst({
      where: {
        workspaceId,
        status: XAccountStatus.ACTIVE
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });

    if (!fallback) {
      throw new BadRequestException('当前工作区未绑定可用 X 账号，请先完成账号绑定');
    }

    return fallback;
  }
}
