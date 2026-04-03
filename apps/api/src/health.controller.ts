import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import { QueueService } from './common/queue.service';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueService) private readonly queue: QueueService
  ) {}

  private async readiness() {
    const dependencies = {
      db: false,
      redis: false
    };

    try {
      await this.prisma.db.$queryRawUnsafe('SELECT 1');
      dependencies.db = true;
    } catch {
      dependencies.db = false;
    }

    try {
      dependencies.redis = (await this.queue.ping()) === 'PONG';
    } catch {
      dependencies.redis = false;
    }

    return {
      ok: dependencies.db && dependencies.redis,
      dependencies
    };
  }

  @Get()
  async health() {
    const ready = await this.readiness();
    return {
      ok: ready.ok,
      service: 'draftorbit-api',
      live: true,
      ready: ready.ok,
      dependencies: ready.dependencies,
      now: new Date().toISOString()
    };
  }

  @Get('live')
  live() {
    return {
      ok: true,
      service: 'draftorbit-api',
      now: new Date().toISOString()
    };
  }

  @Get('ready')
  async ready() {
    const report = await this.readiness();
    if (!report.ok) {
      throw new ServiceUnavailableException({
        code: 'SERVICE_NOT_READY',
        message: '服务尚未就绪',
        details: report.dependencies
      });
    }
    return {
      ok: true,
      service: 'draftorbit-api',
      dependencies: report.dependencies,
      now: new Date().toISOString()
    };
  }
}
