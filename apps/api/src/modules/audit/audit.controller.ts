import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { AuditActionType } from '@draftorbit/db';
import type { AuthUser } from '@draftorbit/shared';
import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { AuditService } from './audit.service';

class ListAuditQuery {
  @IsOptional()
  @IsEnum(AuditActionType)
  action?: AuditActionType;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('audit')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(@Inject(AuditService) private readonly service: AuditService) {}

  @Get('logs')
  async logs(@Req() req: RequestWithUser, @Query() query: ListAuditQuery) {
    return this.service.list((req.user as AuthUser).userId, {
      action: query.action,
      resourceType: query.resourceType,
      limit: query.limit ? Number(query.limit) : 100
    });
  }

  @Get('summary')
  async summary(@Req() req: RequestWithUser) {
    return this.service.summary((req.user as AuthUser).userId);
  }
}
