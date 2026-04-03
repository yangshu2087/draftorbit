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
import { IsObject, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { MediaService } from './media.service';

class UploadPlaceholderDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsUrl({ require_tld: false })
  sourceUrl!: string;

  @IsOptional()
  @IsString()
  draftId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class GeneratePlaceholderDto {
  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsOptional()
  @IsString()
  draftId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

class LinkDraftDto {
  @IsString()
  @MinLength(1)
  draftId!: string;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('media')
@UseGuards(AuthGuard)
export class MediaController {
  constructor(@Inject(MediaService) private readonly service: MediaService) {}

  @Get()
  async list(@Req() req: RequestWithUser) {
    return this.service.list((req.user as AuthUser).userId);
  }

  @Post('upload-placeholder')
  async uploadPlaceholder(@Req() req: RequestWithUser, @Body() body: UploadPlaceholderDto) {
    return this.service.uploadPlaceholder((req.user as AuthUser).userId, body);
  }

  @Post('generate-placeholder')
  async generatePlaceholder(@Req() req: RequestWithUser, @Body() body: GeneratePlaceholderDto) {
    return this.service.generatePlaceholder((req.user as AuthUser).userId, body);
  }

  @Patch(':id/link-draft')
  async linkDraft(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: LinkDraftDto) {
    return this.service.linkDraft((req.user as AuthUser).userId, id, body.draftId);
  }
}
