import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';
import { LearningSourceType } from '@draftorbit/db';
import type { AuthUser } from '@draftorbit/shared';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { LearningSourcesService } from './learning-sources.service';

class CreateLearningSourceDto {
  @IsEnum(LearningSourceType)
  sourceType!: LearningSourceType;

  @IsString()
  @MinLength(1)
  sourceRef!: string;

  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class ToggleLearningSourceDto {
  @IsBoolean()
  isEnabled!: boolean;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('learning-sources')
@UseGuards(AuthGuard)
export class LearningSourcesController {
  constructor(@Inject(LearningSourcesService) private readonly service: LearningSourcesService) {}

  @Get()
  async list(@Req() req: RequestWithUser) {
    return this.service.list((req.user as AuthUser).userId);
  }

  @Post()
  async create(@Req() req: RequestWithUser, @Body() body: CreateLearningSourceDto) {
    return this.service.create((req.user as AuthUser).userId, body);
  }

  @Patch(':id/toggle')
  async toggle(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: ToggleLearningSourceDto
  ) {
    return this.service.toggle((req.user as AuthUser).userId, id, body.isEnabled);
  }

  @Post(':id/run')
  async run(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.runLearning((req.user as AuthUser).userId, id);
  }
}
