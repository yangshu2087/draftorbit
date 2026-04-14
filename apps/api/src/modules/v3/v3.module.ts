import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { GenerateModule } from '../generate/generate.module';
import { ContentCoachingModule } from '../generate/content-coaching.module';
import { HistoryModule } from '../history/history.module';
import { LearningSourcesModule } from '../learning-sources/learning-sources.module';
import { PublishModule } from '../publish/publish.module';
import { XAccountsModule } from '../x-accounts/x-accounts.module';
import { V3Controller } from './v3.controller';
import { V3Service } from './v3.service';

@Module({
  imports: [GenerateModule, ContentCoachingModule, LearningSourcesModule, XAccountsModule, HistoryModule, PublishModule, BillingModule],
  controllers: [V3Controller],
  providers: [V3Service],
  exports: [V3Service]
})
export class V3Module {}
