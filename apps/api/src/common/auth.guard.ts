import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import type { AuthUser } from '@draftorbit/shared';
import { requireEnv } from './env';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader) throw new UnauthorizedException('缺少 Authorization Header');

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new UnauthorizedException('无效 token');

    try {
      const payload = jwt.verify(token, requireEnv('JWT_SECRET')) as AuthUser;
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('token 校验失败');
    }
  }
}
