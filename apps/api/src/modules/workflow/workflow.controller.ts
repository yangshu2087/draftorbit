import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@draftorbit/shared';
import { IsBoolean, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthGuard } from '../../common/auth.guard';
import { WorkflowService } from './workflow.service';

class CreateWorkflowTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  key!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

class RunWorkflowDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

class ApplyOperationTemplateDto {
  @IsString()
  @MinLength(1)
  topic!: string;

  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  cta?: string;
}

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('workflow')
@UseGuards(AuthGuard)
export class WorkflowController {
  constructor(@Inject(WorkflowService) private readonly service: WorkflowService) {}

  @Get('templates')
  async listTemplates(@Req() req: RequestWithUser) {
    return this.service.listTemplates((req.user as AuthUser).userId);
  }

  @Post('templates')
  async createTemplate(@Req() req: RequestWithUser, @Body() body: CreateWorkflowTemplateDto) {
    return this.service.createTemplate((req.user as AuthUser).userId, body);
  }

  @Post('templates/:id/run')
  async runTemplate(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: RunWorkflowDto
  ) {
    return this.service.runTemplate((req.user as AuthUser).userId, id, body.input);
  }

  @Get('runs')
  async listRuns(@Req() req: RequestWithUser) {
    return this.service.listRuns((req.user as AuthUser).userId);
  }

  @Get('operation-templates')
  async listOperationTemplates() {
    return this.service.listOperationTemplates();
  }

  @Post('operation-templates/:key/apply')
  async applyOperationTemplate(
    @Req() req: RequestWithUser,
    @Param('key') key: string,
    @Body() body: ApplyOperationTemplateDto
  ) {
    return this.service.applyOperationTemplate((req.user as AuthUser).userId, key, body);
  }

  @Post('presets/pipeline/run')
  async runPresetPipeline(
    @Req() req: RequestWithUser,
    @Body() body: RunWorkflowDto
  ) {
    return this.service.runPresetPipeline((req.user as AuthUser).userId, body.input);
  }
}
