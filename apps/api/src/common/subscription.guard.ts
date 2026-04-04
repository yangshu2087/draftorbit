import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@draftorbit/db';
import { PrismaService } from './prisma.service';
import type { AuthUser } from '@draftorbit/shared';
import { getBillingTrialDays, getPlanLimits, planDisplayLabel } from '../modules/billing/plan-catalog';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  private trialWindowEnd() {
    const trialDays = getBillingTrialDays();
    return new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  }

  private isBypassMode() {
    return (process.env.AUTH_MODE ?? '').trim() === 'self_host_no_login';
  }

  private async resolveSubscription(user: AuthUser) {
    const now = new Date();
    let sub = await this.prisma.db.subscription.findUnique({ where: { userId: user.userId } });

    if (!sub) {
      const trialEndsAt = this.trialWindowEnd();
      sub = await this.prisma.db.subscription.create({
        data: {
          userId: user.userId,
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.TRIALING,
          trialEndsAt,
          currentPeriodEnd: trialEndsAt
        }
      });
      return sub;
    }

    if (sub.plan === SubscriptionPlan.FREE) {
      const trialEndsAt = sub.trialEndsAt ?? this.trialWindowEnd();
      sub = await this.prisma.db.subscription.update({
        where: { id: sub.id },
        data: {
          plan: SubscriptionPlan.STARTER,
          status: SubscriptionStatus.TRIALING,
          trialEndsAt,
          currentPeriodEnd: sub.currentPeriodEnd ?? trialEndsAt
        }
      });
      return sub;
    }

    if (
      sub.status === SubscriptionStatus.TRIALING &&
      sub.trialEndsAt &&
      sub.trialEndsAt.getTime() <= now.getTime()
    ) {
      sub = await this.prisma.db.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.CANCELED
        }
      });
    }

    return sub;
  }

  async assertCanGenerate(user: AuthUser): Promise<void> {
    if (this.isBypassMode()) return;

    const sub = await this.resolveSubscription(user);
    const plan = sub.plan;
    const limits = getPlanLimits(plan);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (sub.status === SubscriptionStatus.TRIALING) {
      const trialEndsAt = sub.trialEndsAt;
      if (!trialEndsAt || trialEndsAt.getTime() <= Date.now()) {
        throw new ForbiddenException('试用已结束，请先开通订阅后继续使用。');
      }
    }

    if (sub.status === SubscriptionStatus.CANCELED || sub.status === SubscriptionStatus.PAST_DUE) {
      throw new ForbiddenException('当前订阅不可用，请先完成续费后继续使用。');
    }

    const [dailyCount, monthlyCount] = await Promise.all([
      this.prisma.db.generation.count({
        where: { userId: user.userId, createdAt: { gte: todayStart } }
      }),
      this.prisma.db.generation.count({
        where: { userId: user.userId, createdAt: { gte: monthStart } }
      })
    ]);

    if (dailyCount >= limits.daily) {
      throw new ForbiddenException(`${planDisplayLabel(plan)} 每日限 ${limits.daily} 次生成，请升级方案后继续。`);
    }

    if (monthlyCount >= limits.monthly) {
      throw new ForbiddenException(`${planDisplayLabel(plan)} 每月限 ${limits.monthly} 次生成，请升级方案后继续。`);
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
