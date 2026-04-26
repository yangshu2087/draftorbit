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
  IsInt,
  ValidateNested
} from 'class-validator';
import {
  VISUAL_REQUEST_ASPECTS,
  VISUAL_REQUEST_LAYOUTS,
  VISUAL_REQUEST_MODES,
  VISUAL_REQUEST_PALETTES,
  VISUAL_REQUEST_STYLES
} from '../generate/visual-request';


export class V3VisualRequestDto {
  @IsOptional()
  @IsIn(VISUAL_REQUEST_MODES)
  mode?: typeof VISUAL_REQUEST_MODES[number];

  @IsOptional()
  @IsIn(VISUAL_REQUEST_STYLES)
  style?: typeof VISUAL_REQUEST_STYLES[number];

  @IsOptional()
  @IsIn(VISUAL_REQUEST_LAYOUTS)
  layout?: typeof VISUAL_REQUEST_LAYOUTS[number];

  @IsOptional()
  @IsIn(VISUAL_REQUEST_PALETTES)
  palette?: typeof VISUAL_REQUEST_PALETTES[number];

  @IsOptional()
  @IsIn(VISUAL_REQUEST_ASPECTS)
  aspect?: typeof VISUAL_REQUEST_ASPECTS[number];

  @IsOptional()
  @IsBoolean()
  exportHtml?: boolean;
}

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

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => V3VisualRequestDto)
  visualRequest?: V3VisualRequestDto;

  @IsOptional()
  @IsString()
  contentProjectId?: string;
}

export class V3CreateProjectDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['generic_x_ops', 'skilltrust_x_ops'])
  preset?: 'generic_x_ops' | 'skilltrust_x_ops';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class V3UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class V3ProjectGenerateDto {
  @IsString()
  @MinLength(1)
  intent!: string;

  @IsOptional()
  @IsIn(['tweet', 'thread', 'article'])
  format?: 'tweet' | 'thread' | 'article';

  @IsOptional()
  @IsBoolean()
  withImage?: boolean;

  @IsOptional()
  @IsString()
  xAccountId?: string;

  @IsOptional()
  @IsBoolean()
  safeMode?: boolean;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => V3VisualRequestDto)
  visualRequest?: V3VisualRequestDto;

  @IsOptional()
  @IsArray()
  @IsUrl(undefined, { each: true })
  sourceUrls?: string[];
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

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => V3VisualRequestDto)
  visualRequest?: V3VisualRequestDto;
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

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => V3VisualRequestDto)
  visualRequest?: V3VisualRequestDto;
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
