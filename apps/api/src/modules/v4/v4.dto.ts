import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUrl, MinLength, ValidateNested } from 'class-validator';
import {
  VISUAL_REQUEST_ASPECTS,
  VISUAL_REQUEST_LAYOUTS,
  VISUAL_REQUEST_MODES,
  VISUAL_REQUEST_PALETTES,
  VISUAL_REQUEST_STYLES
} from '../generate/visual-request';
import { V4_STUDIO_FORMATS } from './v4-studio.contract';

export class V4StudioVisualRequestDto {
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

export class V4StudioExportRequestDto {
  @IsOptional()
  @IsBoolean()
  markdown?: boolean;

  @IsOptional()
  @IsBoolean()
  html?: boolean;

  @IsOptional()
  @IsBoolean()
  bundle?: boolean;
}

export class V4StudioRunDto {
  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsIn(V4_STUDIO_FORMATS)
  format!: typeof V4_STUDIO_FORMATS[number];

  @IsOptional()
  @IsUrl({ require_tld: false })
  sourceUrl?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => V4StudioVisualRequestDto)
  visualRequest?: V4StudioVisualRequestDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => V4StudioExportRequestDto)
  exportRequest?: V4StudioExportRequestDto;
}
