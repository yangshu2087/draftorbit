import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@draftorbit/shared';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { NaturalizationService } from './naturalization.service';

class NaturalizePreviewDto {
  @IsString()
  @MinLength(1)
  text!: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  strictness?: 'low' | 'medium' | 'high';
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('naturalization')
@UseGuards(AuthGuard)
export class NaturalizationController {
  constructor(@Inject(NaturalizationService) private readonly service: NaturalizationService) {}

  @Post('preview')
  async preview(@Req() req: RequestWithUser, @Body() body: NaturalizePreviewDto) {
    return this.service.preview((req.user as AuthUser).userId, body);
  }
}
