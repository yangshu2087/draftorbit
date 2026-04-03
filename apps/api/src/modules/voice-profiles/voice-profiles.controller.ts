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
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength
} from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { VoiceProfilesService } from './voice-profiles.service';

class CreateVoiceProfileDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}

class UpdateVoiceProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sampleCount?: number;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('voice-profiles')
@UseGuards(AuthGuard)
export class VoiceProfilesController {
  constructor(@Inject(VoiceProfilesService) private readonly service: VoiceProfilesService) {}

  @Get()
  async list(@Req() req: RequestWithUser) {
    return this.service.list((req.user as AuthUser).userId);
  }

  @Post()
  async create(@Req() req: RequestWithUser, @Body() body: CreateVoiceProfileDto) {
    return this.service.create((req.user as AuthUser).userId, body);
  }

  @Patch(':id')
  async update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: UpdateVoiceProfileDto
  ) {
    return this.service.update((req.user as AuthUser).userId, id, body);
  }

  @Post(':id/rebuild')
  async rebuild(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.rebuildStub((req.user as AuthUser).userId, id);
  }
}
