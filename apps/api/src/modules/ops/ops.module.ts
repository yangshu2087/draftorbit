import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { UsageModule } from '../usage/usage.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [UsageModule, AuditModule],
  controllers: [OpsController],
  providers: [OpsService]
})
export class OpsModule {}
