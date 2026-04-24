import { Module } from '@nestjs/common';
import { V3Module } from '../v3/v3.module';
import { V4Controller } from './v4.controller';
import { V4Service } from './v4.service';

@Module({
  imports: [V3Module],
  controllers: [V4Controller],
  providers: [V4Service],
  exports: [V4Service]
})
export class V4Module {}
