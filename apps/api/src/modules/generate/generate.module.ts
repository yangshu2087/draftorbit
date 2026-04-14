import { Module } from '@nestjs/common';
import { GenerateController } from './generate.controller';
import { GenerateService } from './generate.service';
import { ContentCoachingModule } from './content-coaching.module';

@Module({
  imports: [ContentCoachingModule],
  controllers: [GenerateController],
  providers: [GenerateService],
  exports: [GenerateService]
})
export class GenerateModule {}
