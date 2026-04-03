import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@draftorbit/db';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  db = prisma;

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}
