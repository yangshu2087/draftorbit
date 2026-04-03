import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import type { AuthUser } from '@draftorbit/shared';

const DAILY_LIMITS: Record<string, number> = {
  FREE: 3,
  PRO: 999999,
  PREMIUM: 999999
};

const MONTHLY_LIMITS: Record<string, number> = {
  FREE: 999999,
  PRO: 100,
  PREMIUM: 999999
};

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async assertCanGenerate(user: AuthUser): Promise<void> {
    const plan = user.plan ?? 'FREE';
    const dailyLimit = DAILY_LIMITS[plan] ?? 3;
    const monthlyLimit = MONTHLY_LIMITS[plan] ?? 100;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [dailyCount, monthlyCount] = await Promise.all([
      this.prisma.db.generation.count({
        where: { userId: user.userId, createdAt: { gte: todayStart } }
      }),
      this.prisma.db.generation.count({
        where: { userId: user.userId, createdAt: { gte: monthStart } }
      })
    ]);

    if (plan === 'FREE' && dailyCount >= dailyLimit) {
      throw new ForbiddenException(`免费用户每日限 ${dailyLimit} 次生成，请升级订阅`);
    }

    if (plan === 'PRO' && monthlyCount >= monthlyLimit) {
      throw new ForbiddenException(`Pro 用户每月限 ${monthlyLimit} 次生成，请升级至 Premium`);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('未登录');

    await this.assertCanGenerate(user);
    return true;
  }
}
