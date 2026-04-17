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
import { ReplyJobStatus, ReplyRiskLevel } from '@draftorbit/db';
import type { AuthUser } from '@draftorbit/shared';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength
} from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { withRequestId } from '../../common/response-with-request-id';
import { ReplyJobsService } from './reply-jobs.service';

class SyncMentionsDto {
  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsString()
  sourcePostId?: string;
}

class AddCandidateDto {
  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsEnum(ReplyRiskLevel)
  riskLevel?: ReplyRiskLevel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  riskScore?: number;
}

class SendReplyDto {
  @IsOptional()
  @IsString()
  candidateId?: string;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('reply-jobs')
@UseGuards(AuthGuard)
export class ReplyJobsController {
  constructor(@Inject(ReplyJobsService) private readonly service: ReplyJobsService) {}

  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: ReplyJobStatus
  ) {
    return this.service.list((req.user as AuthUser).userId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status
    });
  }

  @Post('sync-mentions')
  async syncMentions(@Req() req: RequestWithUser, @Body() body: SyncMentionsDto) {
    const result = await this.service.syncMentions((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Post(':id/candidates')
  async addCandidate(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: AddCandidateDto
  ) {
    const result = await this.service.addCandidate((req.user as AuthUser).userId, id, body);
    return withRequestId(req, result);
  }

  @Post(':id/candidates/:candidateId/approve')
  async approveCandidate(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('candidateId') candidateId: string
  ) {
    const result = await this.service.approveCandidate((req.user as AuthUser).userId, id, candidateId);
    return withRequestId(req, result);
  }

  @Post(':id/send')
  async send(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: SendReplyDto
  ) {
    const result = await this.service.sendApproved((req.user as AuthUser).userId, id, body.candidateId);
    return withRequestId(req, result);
  }
}
