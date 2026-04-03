import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { DraftStatus } from '@draftorbit/db';
import type { AuthUser } from '@draftorbit/shared';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { DraftsService } from './drafts.service';

class CreateDraftDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  content!: string;

  @IsOptional()
  @IsString()
  language?: string;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('drafts')
@UseGuards(AuthGuard)
export class DraftsController {
  constructor(@Inject(DraftsService) private readonly service: DraftsService) {}

  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: DraftStatus
  ) {
    return this.service.list((req.user as AuthUser).userId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status
    });
  }

  @Post()
  async create(@Req() req: RequestWithUser, @Body() body: CreateDraftDto) {
    return this.service.create(
      (req.user as AuthUser).userId,
      body.title,
      body.content,
      body.language ?? 'zh'
    );
  }

  @Post(':id/approve')
  async approve(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.approve((req.user as AuthUser).userId, id);
  }

  @Post(':id/quality-check')
  async qualityCheck(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.qualityCheck((req.user as AuthUser).userId, id);
  }
}
