import { Module } from '@nestjs/common';
import { LearningSourcesController } from './learning-sources.controller';
import { LearningSourcesService } from './learning-sources.service';

@Module({
  controllers: [LearningSourcesController],
  providers: [LearningSourcesService],
  exports: [LearningSourcesService]
})
export class LearningSourcesModule {}
