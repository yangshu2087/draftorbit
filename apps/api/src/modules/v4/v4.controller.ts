import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@draftorbit/shared';
import { AuthGuard } from '../../common/auth.guard';
import { SubscriptionGuard } from '../../common/subscription.guard';
import { withRequestId } from '../../common/response-with-request-id';
import { V4StudioRunDto } from './v4.dto';
import { V4Service } from './v4.service';

type RequestWithUser = {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthUser;
};

@Controller('v4')
export class V4Controller {
  constructor(
    @Inject(V4Service) private readonly v4: V4Service,
    @Inject(SubscriptionGuard) private readonly subscriptionGuard: SubscriptionGuard
  ) {}

  @Get('studio/capabilities')
  capabilities(@Req() req: RequestWithUser) {
    return withRequestId(req, this.v4.getCapabilities());
  }

  @Post('studio/run')
  @UseGuards(AuthGuard)
  async runStudio(@Req() req: RequestWithUser, @Body() body: V4StudioRunDto) {
    await this.subscriptionGuard.assertCanGenerate(req.user as AuthUser);
    const result = await this.v4.runStudio((req.user as AuthUser).userId, body);
    return withRequestId(req, result);
  }

  @Get('studio/runs/:id')
  @UseGuards(AuthGuard)
  async getStudioRun(@Req() req: RequestWithUser, @Param('id') id: string) {
    const result = await this.v4.getStudioRun((req.user as AuthUser).userId, id);
    return withRequestId(req, result);
  }
}
