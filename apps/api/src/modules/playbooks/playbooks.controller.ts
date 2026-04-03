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
import type { AuthUser } from '@draftorbit/shared';
import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { PlaybooksService } from './playbooks.service';

class CreatePlaybookDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}

class UpdatePlaybookDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsObject()
  rules?: Record<string, unknown>;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('playbooks')
@UseGuards(AuthGuard)
export class PlaybooksController {
  constructor(@Inject(PlaybooksService) private readonly service: PlaybooksService) {}

  @Get()
  async list(@Req() req: RequestWithUser) {
    return this.service.list((req.user as AuthUser).userId);
  }

  @Post()
  async create(@Req() req: RequestWithUser, @Body() body: CreatePlaybookDto) {
    return this.service.create((req.user as AuthUser).userId, body);
  }

  @Patch(':id')
  async update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: UpdatePlaybookDto
  ) {
    return this.service.update((req.user as AuthUser).userId, id, body);
  }
}
