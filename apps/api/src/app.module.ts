import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from './core.module';
import { HealthController } from './health.controller';
import { AuthModule } from './modules/auth/auth.module';
import { GenerateModule } from './modules/generate/generate.module';
import { PublishModule } from './modules/publish/publish.module';
import { HistoryModule } from './modules/history/history.module';
import { BillingModule } from './modules/billing/billing.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { TopicsModule } from './modules/topics/topics.module';
import { DraftsModule } from './modules/drafts/drafts.module';
import { XAccountsModule } from './modules/x-accounts/x-accounts.module';
import { LearningSourcesModule } from './modules/learning-sources/learning-sources.module';
import { VoiceProfilesModule } from './modules/voice-profiles/voice-profiles.module';
import { PlaybooksModule } from './modules/playbooks/playbooks.module';
import { NaturalizationModule } from './modules/naturalization/naturalization.module';
import { MediaModule } from './modules/media/media.module';
import { ReplyJobsModule } from './modules/reply-jobs/reply-jobs.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { UsageModule } from './modules/usage/usage.module';
import { AuditModule } from './modules/audit/audit.module';
import { OpsModule } from './modules/ops/ops.module';
import { V2Module } from './modules/v2/v2.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    CoreModule,
    AuthModule,
    GenerateModule,
    PublishModule,
    HistoryModule,
    BillingModule,
    WorkspacesModule,
    TopicsModule,
    DraftsModule,
    XAccountsModule,
    LearningSourcesModule,
    VoiceProfilesModule,
    PlaybooksModule,
    NaturalizationModule,
    MediaModule,
    ReplyJobsModule,
    WorkflowModule,
    ProvidersModule,
    UsageModule,
    AuditModule,
    OpsModule,
    V2Module
  ]
})
export class AppModule {}
