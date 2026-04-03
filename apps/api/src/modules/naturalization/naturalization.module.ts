import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { NaturalizationController } from './naturalization.controller';
import { NaturalizationService } from './naturalization.service';

@Module({
  imports: [ProvidersModule],
  controllers: [NaturalizationController],
  providers: [NaturalizationService],
  exports: [NaturalizationService]
})
export class NaturalizationModule {}
