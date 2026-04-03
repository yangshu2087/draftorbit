import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import type { AuthUser } from '@draftorbit/shared';

type RequestWithUser = { user: AuthUser };
import { AuthGuard } from '../../common/auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('local/session')
  async localSession() {
    return this.authService.createLocalSession();
  }

  @Get('x/authorize')
  authorize() {
    return this.authService.generateXAuthLink();
  }

  @Get('x/callback')
  async callback(@Query('state') state: string, @Query('code') code: string) {
    if (!state || !code) throw new BadRequestException('Missing state or code');
    return this.authService.handleCallback(state, code);
  }

  @Get('google/authorize')
  googleAuthorize() {
    return this.authService.generateGoogleAuthLink();
  }

  @Get('google/callback')
  async googleCallback(@Query('state') state: string, @Query('code') code: string) {
    if (!state || !code) throw new BadRequestException('Missing state or code');
    return this.authService.handleGoogleCallback(state, code);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() req: RequestWithUser) {
    const user = await this.authService.getMe(req.user.userId);
    if (!user) return null;
    return user;
  }
}
