import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@draftorbit/shared';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { withRequestId } from '../../common/response-with-request-id';
import { UsageService } from './usage.service';

class AddCreditsDto {
  @IsInt()
  @Min(1)
  @Max(100000)
  amount!: number;

  @IsString()
  @MinLength(1)
  reason!: string;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('usage')
@UseGuards(AuthGuard)
export class UsageController {
  constructor(@Inject(UsageService) private readonly service: UsageService) {}

  @Get('summary')
  async summary(@Req() req: RequestWithUser) {
    const result = await this.service.summary((req.user as AuthUser).userId);
    return withRequestId(req, result);
  }

  @Get('overview')
  async overview(
    @Req() req: RequestWithUser,
    @Query('eventsLimit') eventsLimit?: string,
    @Query('days') days?: string
  ) {
    const parsedEventsLimit = eventsLimit ? Number(eventsLimit) : 50;
    const parsedDays = days ? Number(days) : 14;
    const result = await this.service.overview((req.user as AuthUser).userId, {
      eventsLimit: Number.isFinite(parsedEventsLimit) ? parsedEventsLimit : 50,
      trendDays: Number.isFinite(parsedDays) ? parsedDays : 14
    });
    return withRequestId(req, result);
  }

  @Get('events')
  async events(@Req() req: RequestWithUser, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 100;
    return this.service.listEvents((req.user as AuthUser).userId, Number.isFinite(parsed) ? parsed : 100);
  }

  @Get('trends')
  async trends(@Req() req: RequestWithUser, @Query('days') days?: string) {
    const parsed = days ? Number(days) : 14;
    const result = await this.service.trends((req.user as AuthUser).userId, Number.isFinite(parsed) ? parsed : 14);
    return withRequestId(req, result);
  }

  @Post('credits/add')
  async addCredits(@Req() req: RequestWithUser, @Body() body: AddCreditsDto) {
    const result = await this.service.addCredits((req.user as AuthUser).userId, body.amount, body.reason);
    return withRequestId(req, result);
  }
}
