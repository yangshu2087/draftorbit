import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TopicStatus } from '@draftorbit/db';
import type { AuthUser } from '@draftorbit/shared';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { TopicsService } from './topics.service';

class CreateTopicDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('topics')
@UseGuards(AuthGuard)
export class TopicsController {
  constructor(@Inject(TopicsService) private readonly service: TopicsService) {}

  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: TopicStatus
  ) {
    return this.service.list((req.user as AuthUser).userId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status
    });
  }

  @Post()
  async create(@Req() req: RequestWithUser, @Body() body: CreateTopicDto) {
    return this.service.create((req.user as AuthUser).userId, body.title, body.description);
  }
}
