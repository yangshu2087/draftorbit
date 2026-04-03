import { Module } from '@nestjs/common';
import { VoiceProfilesController } from './voice-profiles.controller';
import { VoiceProfilesService } from './voice-profiles.service';

@Module({
  controllers: [VoiceProfilesController],
  providers: [VoiceProfilesService],
  exports: [VoiceProfilesService]
})
export class VoiceProfilesModule {}
