import { GenerationType } from '@draftorbit/db';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested
} from 'class-validator';

export type GenerateStartMode = 'brief' | 'advanced';

export class BriefInputDto {
  @IsString()
  @MinLength(1)
  objective!: string;

  @IsString()
  @MinLength(1)
  audience!: string;

  @IsString()
  @MinLength(1)
  tone!: string;

  @IsString()
  @MinLength(1)
  postType!: string;

  @IsString()
  @MinLength(1)
  cta!: string;

  @IsString()
  @MinLength(1)
  topicPreset!: string;
}

export class AdvancedInputDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  customPrompt?: string;
}

export class StartGenerationDto {
  @IsOptional()
  @IsIn(['brief', 'advanced'])
  mode?: GenerateStartMode;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => BriefInputDto)
  brief?: BriefInputDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AdvancedInputDto)
  advanced?: AdvancedInputDto;

  // Backward compatibility for legacy prompt-first callers.
  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;

  @IsOptional()
  @IsEnum(GenerationType)
  type?: GenerationType;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsBoolean()
  useStyle?: boolean;
}
