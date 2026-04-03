import { BadRequestException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@draftorbit/db';
import { PrismaService } from '../../common/prisma.service';

let stripe: any = null;
try {
  const Stripe = require('stripe');
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
} catch {
  // stripe optional at runtime
}

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

function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return SubscriptionStatus.ACTIVE;
    case 'past_due':
      return SubscriptionStatus.PAST_DUE;
    default:
      return SubscriptionStatus.CANCELED;
  }
}

@Injectable()
export class BillingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getSubscription(userId: string) {
    let sub = await this.prisma.db.subscription.findUnique({ where: { userId } });
    if (!sub) {
      sub = await this.prisma.db.subscription.create({
        data: {
          userId,
          plan: SubscriptionPlan.FREE,
          status: SubscriptionStatus.ACTIVE
        }
      });
    }
    return sub;
  }

  async getUsageSummary(userId: string) {
    const sub = await this.getSubscription(userId);
    const planKey = sub.plan;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [dailyCount, monthlyCount] = await Promise.all([
      this.prisma.db.generation.count({
        where: { userId, createdAt: { gte: todayStart } }
      }),
      this.prisma.db.generation.count({
        where: { userId, createdAt: { gte: monthStart } }
      })
    ]);

    return {
      dailyCount,
      monthlyCount,
      plan: planKey,
      limits: {
        daily: DAILY_LIMITS[planKey] ?? DAILY_LIMITS.FREE,
        monthly: MONTHLY_LIMITS[planKey] ?? MONTHLY_LIMITS.FREE
      }
    };
  }

  async createCheckoutSession(userId: string, plan: 'PRO' | 'PREMIUM'): Promise<{ url: string }> {
    if (!stripe) {
      throw new BadRequestException('Stripe not configured');
    }

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const unitAmount = plan === 'PRO' ? 1290 : 3990;
    const name = plan === 'PRO' ? 'DraftOrbit PRO' : 'DraftOrbit PREMIUM';

    const existing = await this.prisma.db.subscription.findUnique({ where: { userId } });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(existing?.stripeCustomerId
        ? { customer: existing.stripeCustomerId }
        : { customer_creation: 'always' as const }),
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name },
            recurring: { interval: 'month' },
            unit_amount: unitAmount
          },
          quantity: 1
        }
      ],
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancel`,
      metadata: { userId, plan },
      subscription_data: {
        metadata: { userId, plan }
      }
    });

    const url = session.url;
    if (!url) throw new InternalServerErrorException('Stripe checkout URL missing');
    return { url };
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<{ received: boolean }> {
    if (!stripe) {
      throw new InternalServerErrorException('Stripe not configured');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new InternalServerErrorException('Stripe webhook not configured');
    }

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      throw new BadRequestException(`Webhook signature verification failed: ${err?.message ?? err}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId as string | undefined;
        const plan = session.metadata?.plan as string | undefined;
        if (!userId || (plan !== 'PRO' && plan !== 'PREMIUM')) break;

        const stripeSubId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        const customerId =
          typeof session.customer === 'string' ? session.customer : session.customer?.id;
        if (!stripeSubId || !customerId) break;

        const prismaPlan = plan === 'PREMIUM' ? SubscriptionPlan.PREMIUM : SubscriptionPlan.PRO;
        await this.prisma.db.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: prismaPlan,
            status: SubscriptionStatus.ACTIVE,
            stripeCustomerId: customerId,
            stripeSubscriptionId: stripeSubId,
            currentPeriodEnd: null
          },
          update: {
            plan: prismaPlan,
            status: SubscriptionStatus.ACTIVE,
            stripeCustomerId: customerId,
            stripeSubscriptionId: stripeSubId
          }
        });
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const stripeSubId = sub.id as string;
        const dbSub = await this.prisma.db.subscription.findFirst({
          where: { stripeSubscriptionId: stripeSubId }
        });
        if (!dbSub) break;

        const planMeta = sub.metadata?.plan as string | undefined;
        const plan =
          planMeta === 'PREMIUM'
            ? SubscriptionPlan.PREMIUM
            : planMeta === 'PRO'
              ? SubscriptionPlan.PRO
              : dbSub.plan;

        await this.prisma.db.subscription.update({
          where: { id: dbSub.id },
          data: {
            plan,
            status: mapStripeSubscriptionStatus(String(sub.status)),
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null
          }
        });
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const stripeSubId = sub.id as string;
        const dbSub = await this.prisma.db.subscription.findFirst({
          where: { stripeSubscriptionId: stripeSubId }
        });
        if (!dbSub) break;

        await this.prisma.db.subscription.update({
          where: { id: dbSub.id },
          data: {
            plan: SubscriptionPlan.FREE,
            status: SubscriptionStatus.ACTIVE,
            stripeSubscriptionId: null,
            currentPeriodEnd: null
          }
        });
        break;
      }
      default:
        break;
    }

    return { received: true };
  }
}
