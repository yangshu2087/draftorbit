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
import { ProviderType } from '@draftorbit/db';
import type { AuthUser } from '@draftorbit/shared';
import { AuthGuard } from '../../common/auth.guard';
import { withRequestId } from '../../common/response-with-request-id';
import { ProvidersService } from './providers.service';

type RequestWithUser = {
  user: AuthUser;
};

type UpsertProviderBody = {
  id?: string;
  name: string;
  providerType: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  modelAllowlist?: string[];
  isEnabled?: boolean;
};

type ToggleProviderBody = {
  isEnabled: boolean;
};

type RouteTextBody = {
  prompt: string;
  taskType: string;
  model?: string;
  providerType?: ProviderType;
  temperature?: number;
};

@Controller('providers')
@UseGuards(AuthGuard)
export class ProvidersController {
  constructor(@Inject(ProvidersService) private readonly providersService: ProvidersService) {}

  @Get()
  async list(@Req() req: RequestWithUser) {
    const data = await this.providersService.list(req.user.userId);
    return withRequestId(req, data);
  }

  @Get('byok-status')
  async byokStatus(@Req() req: RequestWithUser) {
    const data = await this.providersService.byokStatus(req.user.userId);
    return withRequestId(req, data);
  }

  @Post()
  async upsert(@Req() req: RequestWithUser, @Body() body: UpsertProviderBody) {
    const data = await this.providersService.upsert(req.user.userId, body);
    return withRequestId(req, data);
  }

  @Patch(':id/toggle')
  async toggle(@Req() req: RequestWithUser, @Param('id') id: string, @Body() body: ToggleProviderBody) {
    const data = await this.providersService.toggle(req.user.userId, id, body.isEnabled);
    return withRequestId(req, data);
  }

  @Post('route-text')
  async routeText(@Req() req: RequestWithUser, @Body() body: RouteTextBody) {
    const data = await this.providersService.routeText(req.user.userId, body);
    return withRequestId(req, data);
  }
}
