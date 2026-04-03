import { Module } from '@nestjs/common';
import { XAccountsController } from './x-accounts.controller';
import { XAccountsService } from './x-accounts.service';

@Module({
  controllers: [XAccountsController],
  providers: [XAccountsService],
  exports: [XAccountsService]
})
export class XAccountsModule {}
