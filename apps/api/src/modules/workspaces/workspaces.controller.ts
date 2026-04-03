import { Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@draftorbit/shared';
import { AuthGuard } from '../../common/auth.guard';
import { WorkspacesService } from './workspaces.service';

interface RequestWithUser {
  user?: AuthUser;
}

@Controller('workspaces')
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(@Inject(WorkspacesService) private readonly service: WorkspacesService) {}

  @Get('me')
  async me(@Req() req: RequestWithUser) {
    return this.service.getMyWorkspace((req.user as AuthUser).userId);
  }

  @Post('bootstrap')
  async bootstrap(@Req() req: RequestWithUser) {
    return this.service.bootstrapDefaultWorkspace((req.user as AuthUser).userId);
  }
}
