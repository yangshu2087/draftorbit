import { Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@draftorbit/shared';

interface RequestWithUser { user?: AuthUser; }
import { AuthGuard } from '../../common/auth.guard';
import { HistoryService } from './history.service';

@Controller('history')
@UseGuards(AuthGuard)
export class HistoryController {
  constructor(@Inject(HistoryService) private readonly history: HistoryService) {}

  @Post('analyze')
  async analyze(@Req() req: RequestWithUser) {
    const user = req.user as AuthUser;
    return this.history.analyzeStyle(user.userId);
  }

  @Get('style')
  async style(@Req() req: RequestWithUser) {
    const user = req.user as AuthUser;
    return this.history.getStyle(user.userId);
  }
}
