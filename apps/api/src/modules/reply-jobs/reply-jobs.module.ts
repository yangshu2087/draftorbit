import { Module } from '@nestjs/common';
import { ReplyJobsController } from './reply-jobs.controller';
import { ReplyJobsService } from './reply-jobs.service';

@Module({
  controllers: [ReplyJobsController],
  providers: [ReplyJobsService],
  exports: [ReplyJobsService]
})
export class ReplyJobsModule {}
