import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from '@nestjs/common';
import { ProviderType } from '@draftorbit/db';
import type { AuthUser } from '@draftorbit/shared';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength
} from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { ProvidersService } from './providers.service';

class UpsertProviderDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(ProviderType)
  providerType!: ProviderType;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsArray()
  modelAllowlist?: string[];

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

class ToggleProviderDto {
  @IsBoolean()
  isEnabled!: boolean;
}

class RouteTextDto {
  @IsString()
  @MinLength(1)
  prompt!: string;

  @IsString()
  @MinLength(1)
  taskType!: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsEnum(ProviderType)
  providerType?: ProviderType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('providers')
@UseGuards(AuthGuard)
export class ProvidersController {
  constructor(@Inject(ProvidersService) private readonly service: ProvidersService) {}

  @Get()
  async list(@Req() req: RequestWithUser) {
    return this.service.list((req.user as AuthUser).userId);
  }

  @Get('byok/status')
  async byokStatus(@Req() req: RequestWithUser) {
    return this.service.byokStatus((req.user as AuthUser).userId);
  }

  @Post()
  async upsert(@Req() req: RequestWithUser, @Body() body: UpsertProviderDto) {
    return this.service.upsert((req.user as AuthUser).userId, body);
  }

  @Patch(':id/toggle')
  async toggle(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: ToggleProviderDto
  ) {
    return this.service.toggle((req.user as AuthUser).userId, id, body.isEnabled);
  }

  @Post('route/text')
  async routeText(@Req() req: RequestWithUser, @Body() body: RouteTextDto) {
    return this.service.routeText((req.user as AuthUser).userId, body);
  }
}
