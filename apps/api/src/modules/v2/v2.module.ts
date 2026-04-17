import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { GenerateModule } from '../generate/generate.module';
import { LearningSourcesModule } from '../learning-sources/learning-sources.module';
import { OpsModule } from '../ops/ops.module';
import { PublishModule } from '../publish/publish.module';
import { ReplyJobsModule } from '../reply-jobs/reply-jobs.module';
import { UsageModule } from '../usage/usage.module';
import { VoiceProfilesModule } from '../voice-profiles/voice-profiles.module';
import { XAccountsModule } from '../x-accounts/x-accounts.module';
import { V2Controller } from './v2.controller';
import { V2Service } from './v2.service';

@Module({
  imports: [
    GenerateModule,
    LearningSourcesModule,
    XAccountsModule,
    VoiceProfilesModule,
    PublishModule,
    ReplyJobsModule,
    OpsModule,
    UsageModule,
    BillingModule
  ],
  controllers: [V2Controller],
  providers: [V2Service],
  exports: [V2Service]
})
export class V2Module {}
