import { IsOptional, IsString, IsUUID } from 'class-validator';

export class GenerationIdBodyDto {
  @IsUUID()
  generationId!: string;
}

export class DraftPublishBodyDto {
  @IsUUID()
  draftId!: string;

  @IsOptional()
  @IsString()
  scheduledFor?: string;
}
