import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { XAccountStatus } from '@draftorbit/db';
import type { AuthUser } from '@draftorbit/shared';
import { IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { XAccountsService } from './x-accounts.service';

class BindXAccountDto {
  @IsString()
  @MinLength(1)
  twitterUserId!: string;

  @IsString()
  @MinLength(1)
  handle!: string;

  @IsOptional()
  @IsEnum(XAccountStatus)
  status?: XAccountStatus;

  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}

class UpdateXAccountStatusDto {
  @IsEnum(XAccountStatus)
  status!: XAccountStatus;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('x-accounts')
@UseGuards(AuthGuard)
export class XAccountsController {
  constructor(@Inject(XAccountsService) private readonly service: XAccountsService) {}

  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: XAccountStatus
  ) {
    return this.service.list((req.user as AuthUser).userId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      status
    });
  }

  @Post('bind-manual')
  async bindManual(@Req() req: RequestWithUser, @Body() body: BindXAccountDto) {
    return this.service.bindManual((req.user as AuthUser).userId, body);
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: UpdateXAccountStatusDto
  ) {
    return this.service.updateStatus((req.user as AuthUser).userId, id, body.status);
  }

  @Post(':id/refresh-token')
  async refreshToken(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.service.refreshTokenStub((req.user as AuthUser).userId, id);
  }
}
