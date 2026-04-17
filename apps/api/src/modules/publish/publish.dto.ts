import { IsOptional, IsString, IsUUID } from 'class-validator';

export class GenerationIdBodyDto {
  @IsUUID()
  generationId!: string;

  @IsOptional()
  @IsUUID()
  xAccountId?: string;
}

export class DraftPublishBodyDto {
  @IsUUID()
  draftId!: string;

  @IsOptional()
  @IsString()
  scheduledFor?: string;

  @IsOptional()
  @IsUUID()
  xAccountId?: string;
}
