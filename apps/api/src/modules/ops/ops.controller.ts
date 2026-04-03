import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../common/auth.guard';
import { QueueService } from '../../common/queue.service';

@Controller('ops')
@UseGuards(AuthGuard)
export class OpsController {
  constructor(@Inject(QueueService) private readonly queue: QueueService) {}

  @Get('queues')
  async queues() {
    const queues = await this.queue.getQueueStats();
    return {
      ok: true,
      queues,
      now: new Date().toISOString()
    };
  }
}
