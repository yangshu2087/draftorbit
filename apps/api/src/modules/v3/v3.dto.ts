import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  IsInt
} from 'class-validator';

export class V3RunChatDto {
  @IsString()
  @MinLength(1)
  intent!: string;

  @IsIn(['tweet', 'thread', 'article'])
  format!: 'tweet' | 'thread' | 'article';

  @IsBoolean()
  withImage!: boolean;

  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsBoolean()
  safeMode?: boolean;
}

export class V3ConnectTargetDto {
  @IsString()
  @MinLength(1)
  handleOrUrl!: string;
}

export class V3ConnectObsidianDto {
  @IsString()
  @MinLength(1)
  vaultPath!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includePatterns?: string[];
}

export class V3ConnectLocalFilesDto {
  @IsArray()
  @IsString({ each: true })
  paths!: string[];
}

export class V3ConnectUrlsDto {
  @IsArray()
  @IsUrl(undefined, { each: true })
  urls!: string[];
}

export class V3PublishPrepareDto {
  @IsString()
  @MinLength(1)
  runId!: string;

  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsBoolean()
  safeMode?: boolean;
}

export class V3PublishConfirmDto {
  @IsString()
  @MinLength(1)
  runId!: string;

  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsBoolean()
  safeMode?: boolean;
}

export class V3PublishArticleCompleteDto {
  @IsString()
  @MinLength(1)
  runId!: string;

  @IsString()
  @MinLength(1)
  url!: string;

  @IsOptional()
  @IsString()
  xAccountId?: string;
}

export class V3BillingCheckoutDto {
  @IsIn(['STARTER', 'PRO', 'PREMIUM'])
  plan!: 'STARTER' | 'PRO' | 'PREMIUM';

  @IsIn(['MONTHLY', 'YEARLY'])
  cycle!: 'MONTHLY' | 'YEARLY';
}

export class V3QueueQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
