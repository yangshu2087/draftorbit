import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@draftorbit/shared';
import { AuthGuard } from '../../common/auth.guard';
import { QueueService } from '../../common/queue.service';
import { OpsService } from './ops.service';

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('ops')
@UseGuards(AuthGuard)
export class OpsController {
  constructor(
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(OpsService) private readonly opsService: OpsService
  ) {}

  @Get('queues')
  async queues() {
    const queues = await this.queue.getQueueStats();
    return {
      ok: true,
      queues,
      now: new Date().toISOString()
    };
  }

  @Get('dashboard')
  async dashboard(@Req() req: RequestWithUser) {
    return this.opsService.dashboardOverview((req.user as AuthUser).userId);
  }
}
