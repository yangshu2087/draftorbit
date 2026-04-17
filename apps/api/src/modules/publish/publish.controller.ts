import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { PublishJobStatus } from '@draftorbit/db';
import type { AuthUser } from '@draftorbit/shared';

interface RequestWithUser {
  user?: AuthUser;
}
import { AuthGuard } from '../../common/auth.guard';
import { PublishService } from './publish.service';
import { DraftPublishBodyDto, GenerationIdBodyDto } from './publish.dto';
import { PrismaService } from '../../common/prisma.service';
import { withRequestId } from '../../common/response-with-request-id';

@Controller('publish')
@UseGuards(AuthGuard)
export class PublishController {
  constructor(
    @Inject(PublishService) private readonly publish: PublishService,
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Post('tweet')
  async publishTweet(@Req() req: RequestWithUser, @Body() body: GenerationIdBodyDto) {
    const user = req.user as AuthUser;
    const result = await this.publish.publishTweet(user.userId, body.generationId, body.xAccountId);
    return withRequestId(req, result);
  }

  @Post('thread')
  async publishThread(@Req() req: RequestWithUser, @Body() body: GenerationIdBodyDto) {
    const user = req.user as AuthUser;
    const result = await this.publish.publishThread(user.userId, body.generationId, body.xAccountId);
    return withRequestId(req, result);
  }

  @Post('draft')
  async publishDraft(@Req() req: RequestWithUser, @Body() body: DraftPublishBodyDto) {
    const user = req.user as AuthUser;
    const result = await this.publish.publishDraft(
      user.userId,
      body.draftId,
      body.scheduledFor,
      body.xAccountId
    );
    return withRequestId(req, result);
  }

  @Get('jobs')
  async listJobs(
    @Req() req: RequestWithUser,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: PublishJobStatus
  ) {
    const user = req.user as AuthUser;
    return this.publish.listJobs(user.userId, {
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status
    });
  }

  @Get('jobs/:publishJobId')
  async getJob(@Req() req: RequestWithUser, @Param('publishJobId') publishJobId: string) {
    const user = req.user as AuthUser;
    return this.prisma.db.publishJob.findFirst({ where: { id: publishJobId, userId: user.userId } });
  }

  @Post('jobs/:publishJobId/retry')
  async retry(@Req() req: RequestWithUser, @Param('publishJobId') publishJobId: string) {
    const user = req.user as AuthUser;
    const result = await this.publish.retryJob(user.userId, publishJobId);
    return withRequestId(req, result);
  }

  @Get(':generationId')
  async getRecord(@Req() req: RequestWithUser, @Param('generationId') generationId: string) {
    const user = req.user as AuthUser;
    return this.publish.getPublishRecord(user.userId, generationId);
  }
}
