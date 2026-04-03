import { GenerationType } from '@draftorbit/db';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class StartGenerationDto {
  @IsString()
  @MinLength(1)
  prompt!: string;

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
