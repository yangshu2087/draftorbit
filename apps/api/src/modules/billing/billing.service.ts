import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
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

const BILLING_CURRENCY = 'USD';
const TRIAL_DAYS = 7;
const PAYPAL_API_BASE = (process.env.PAYPAL_API_BASE ?? 'https://api-m.sandbox.paypal.com').replace(
  /\/$/,
  ''
);
const PLAN_PRICING_USD_CENTS: Record<'PRO' | 'PREMIUM', number> = {
  PRO: 1900,
  PREMIUM: 5900
};

const DAILY_LIMITS: Record<string, number> = {
  PRO: 999999,
  PREMIUM: 999999
};

const MONTHLY_LIMITS: Record<string, number> = {
  PRO: 300,
  PREMIUM: 999999
};

function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case 'active':
      return SubscriptionStatus.ACTIVE;
    case 'trialing':
      return SubscriptionStatus.TRIALING;
    case 'past_due':
      return SubscriptionStatus.PAST_DUE;
    default:
      return SubscriptionStatus.CANCELED;
  }
}

function mapPayPalSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
      return SubscriptionStatus.ACTIVE;
    case 'APPROVAL_PENDING':
    case 'APPROVED':
      return SubscriptionStatus.TRIALING;
    case 'SUSPENDED':
      return SubscriptionStatus.PAST_DUE;
    case 'CANCELLED':
    case 'EXPIRED':
      return SubscriptionStatus.CANCELED;
    default:
      return SubscriptionStatus.ACTIVE;
  }
}

function pickHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return typeof value === 'string' ? value : undefined;
}

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  create_time?: string;
  resource_type?: string;
  summary?: string;
  resource?: {
    id?: string;
    custom_id?: string;
    status?: string;
    plan_id?: string;
    billing_info?: {
      next_billing_time?: string;
      failed_payments_count?: number;
    };
  };
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async fetchPayPalAccessToken(): Promise<string> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException('PayPal credentials not configured');
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!res.ok) {
      const text = await res.text();
      throw new InternalServerErrorException(`PayPal token request failed: ${text}`);
    }

    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) {
      throw new InternalServerErrorException('PayPal token response missing access_token');
    }
    return json.access_token;
  }

  private async verifyPayPalWebhookSignature(
    payloadRaw: Buffer,
    headers: Record<string, string | string[] | undefined>
  ) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      this.logger.warn('PAYPAL_WEBHOOK_ID is not set; skip signature verification');
      return;
    }

    const transmissionId = pickHeader(headers, 'paypal-transmission-id');
    const transmissionTime = pickHeader(headers, 'paypal-transmission-time');
    const transmissionSig = pickHeader(headers, 'paypal-transmission-sig');
    const certUrl = pickHeader(headers, 'paypal-cert-url');
    const authAlgo = pickHeader(headers, 'paypal-auth-algo');

    if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
      const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
      if (isProd) {
        throw new BadRequestException('PayPal webhook verification headers missing');
      }
      this.logger.warn('PayPal webhook verification headers missing in non-production, skip verify');
      return;
    }

    const accessToken = await this.fetchPayPalAccessToken();
    let webhookEvent: unknown;
    try {
      webhookEvent = JSON.parse(payloadRaw.toString('utf-8'));
    } catch {
      throw new BadRequestException('Invalid PayPal webhook payload');
    }

    const verifyRes = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: webhookEvent
      })
    });

    if (!verifyRes.ok) {
      const text = await verifyRes.text();
      throw new BadRequestException(`PayPal webhook verify failed: ${text}`);
    }

    const verify = (await verifyRes.json()) as { verification_status?: string };
    if ((verify.verification_status ?? '').toUpperCase() !== 'SUCCESS') {
      throw new BadRequestException('PayPal webhook signature verification failed');
    }
  }

  private resolvePlanByPayPalResource(resource: PayPalWebhookEvent['resource']) {
    const planId = resource?.plan_id ?? '';
    const proPlanId = process.env.PAYPAL_PLAN_ID_PRO ?? '';
    const premiumPlanId = process.env.PAYPAL_PLAN_ID_PREMIUM ?? '';
    if (planId && premiumPlanId && planId === premiumPlanId) return SubscriptionPlan.PREMIUM;
    if (planId && proPlanId && planId === proPlanId) return SubscriptionPlan.PRO;
    return undefined;
  }

  private trialWindowEnd(from = new Date()) {
    return new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  }

  private toSubscriptionView(sub: {
    id: string;
    userId: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const now = Date.now();
    const trialEndsAt = sub.trialEndsAt?.toISOString() ?? null;
    const currentPeriodEnd = sub.currentPeriodEnd?.toISOString() ?? null;
    const isTrialing = sub.status === SubscriptionStatus.TRIALING;
    const trialExpired = Boolean(sub.trialEndsAt) && (sub.trialEndsAt?.getTime() ?? 0) <= now;

    return {
      id: sub.id,
      userId: sub.userId,
      plan: sub.plan,
      status: sub.status,
      stripeCustomerId: sub.stripeCustomerId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      currentPeriodEnd,
      currency: BILLING_CURRENCY,
      isTrialing,
      trialEndsAt,
      trialExpired,
      createdAt: sub.createdAt.toISOString(),
      updatedAt: sub.updatedAt.toISOString()
    };
  }

  private async ensureTrialOrPaidSubscription(userId: string) {
    const now = new Date();
    let sub = await this.prisma.db.subscription.findUnique({ where: { userId } });

    if (!sub) {
      sub = await this.prisma.db.subscription.create({
        data: {
          userId,
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.TRIALING,
          trialEndsAt: this.trialWindowEnd(now),
          currentPeriodEnd: this.trialWindowEnd(now)
        }
      });
      return sub;
    }

    if (sub.plan === SubscriptionPlan.FREE) {
      sub = await this.prisma.db.subscription.update({
        where: { id: sub.id },
        data: {
          plan: SubscriptionPlan.PRO,
          status: SubscriptionStatus.TRIALING,
          trialEndsAt: sub.trialEndsAt ?? this.trialWindowEnd(now),
          currentPeriodEnd: sub.currentPeriodEnd ?? this.trialWindowEnd(now)
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

  getPlans() {
    return {
      currency: BILLING_CURRENCY,
      trialDays: TRIAL_DAYS,
      plans: [
        {
          key: 'PRO',
          name: 'Pro',
          priceMonthlyUsd: 19,
          priceMonthlyUsdCents: PLAN_PRICING_USD_CENTS.PRO,
          features: ['每月 300 次内容生成', '完整生产与发布链路', 'X 账号运营工作台']
        },
        {
          key: 'PREMIUM',
          name: 'Premium',
          priceMonthlyUsd: 59,
          priceMonthlyUsdCents: PLAN_PRICING_USD_CENTS.PREMIUM,
          features: ['不限量内容生成', '全链路运营能力', '优先处理与高级分析']
        }
      ]
    };
  }

  async getSubscription(userId: string) {
    const sub = await this.ensureTrialOrPaidSubscription(userId);
    return this.toSubscriptionView(sub);
  }

  async getUsageSummary(userId: string) {
    const sub = await this.ensureTrialOrPaidSubscription(userId);
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
      status: sub.status,
      limits: {
        daily: DAILY_LIMITS[planKey] ?? DAILY_LIMITS.PRO,
        monthly: MONTHLY_LIMITS[planKey] ?? MONTHLY_LIMITS.PRO
      },
      isTrialing: sub.status === SubscriptionStatus.TRIALING,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null
    };
  }

  async createCheckoutSession(userId: string, plan: 'PRO' | 'PREMIUM'): Promise<{ url: string }> {
    if (!stripe) {
      throw new BadRequestException('Stripe not configured');
    }

    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    const unitAmount = PLAN_PRICING_USD_CENTS[plan];
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
            currency: BILLING_CURRENCY.toLowerCase(),
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
        trial_period_days: TRIAL_DAYS,
        metadata: { userId, plan }
      }
    });

    const url = session.url;
    if (!url) throw new InternalServerErrorException('Stripe checkout URL missing');
    return { url };
  }

  async handlePayPalWebhook(
    payload: Buffer,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ received: boolean }> {
    await this.verifyPayPalWebhookSignature(payload, headers);

    let event: PayPalWebhookEvent;
    try {
      event = JSON.parse(payload.toString('utf-8')) as PayPalWebhookEvent;
    } catch {
      throw new BadRequestException('Invalid PayPal webhook payload');
    }
    const eventType = String(event.event_type ?? '');
    const resource = event.resource ?? {};
    const userId = typeof resource.custom_id === 'string' ? resource.custom_id : undefined;

    if (!eventType) {
      this.logger.warn('PayPal webhook missing event_type');
      return { received: true };
    }

    if (!userId) {
      this.logger.warn(`PayPal webhook missing resource.custom_id for event=${eventType}`);
      return { received: true };
    }

    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });
    if (!user) {
      this.logger.warn(`PayPal webhook custom_id not found: ${userId}`);
      return { received: true };
    }

    const existing = await this.prisma.db.subscription.findUnique({ where: { userId } });
    const planFromResource = this.resolvePlanByPayPalResource(resource);
    const plan = planFromResource ?? existing?.plan ?? SubscriptionPlan.PRO;

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.CREATED':
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
      case 'BILLING.SUBSCRIPTION.UPDATED':
      case 'BILLING.SUBSCRIPTION.SUSPENDED':
      case 'BILLING.SUBSCRIPTION.CANCELLED':
      case 'BILLING.SUBSCRIPTION.EXPIRED':
      case 'BILLING.SUBSCRIPTION.RE-ACTIVATED':
      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        const statusOverride =
          eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED'
            ? SubscriptionStatus.PAST_DUE
            : mapPayPalSubscriptionStatus(String(resource.status ?? 'ACTIVE'));

        const nextBillingTime = resource.billing_info?.next_billing_time
          ? new Date(resource.billing_info.next_billing_time)
          : existing?.currentPeriodEnd ?? null;

        await this.prisma.db.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan,
            status: statusOverride,
            trialEndsAt: statusOverride === SubscriptionStatus.TRIALING ? this.trialWindowEnd() : null,
            currentPeriodEnd: nextBillingTime
          },
          update: {
            plan,
            status: statusOverride,
            currentPeriodEnd: nextBillingTime
          }
        });
        break;
      }
      case 'PAYMENT.SALE.COMPLETED':
      case 'PAYMENT.CAPTURE.COMPLETED': {
        if (existing) {
          await this.prisma.db.subscription.update({
            where: { id: existing.id },
            data: {
              status: SubscriptionStatus.ACTIVE
            }
          });
        }
        break;
      }
      case 'PAYMENT.SALE.REFUNDED':
      case 'PAYMENT.SALE.REVERSED':
      case 'PAYMENT.CAPTURE.REFUNDED':
      case 'PAYMENT.CAPTURE.DENIED': {
        if (existing) {
          await this.prisma.db.subscription.update({
            where: { id: existing.id },
            data: {
              status: SubscriptionStatus.PAST_DUE
            }
          });
        }
        break;
      }
      default:
        break;
    }

    return { received: true };
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
        let mappedStatus: SubscriptionStatus = SubscriptionStatus.TRIALING;
        let trialEndsAt: Date | null = null;
        let periodEnd: Date | null = null;

        if (stripeSubId) {
          try {
            const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
            mappedStatus = mapStripeSubscriptionStatus(String(stripeSub.status));
            trialEndsAt = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null;
            periodEnd = stripeSub.current_period_end
              ? new Date(stripeSub.current_period_end * 1000)
              : null;
          } catch {
            mappedStatus = SubscriptionStatus.TRIALING;
          }
        }

        await this.prisma.db.subscription.upsert({
          where: { userId },
          create: {
            userId,
            plan: prismaPlan,
            status: mappedStatus,
            stripeCustomerId: customerId,
            stripeSubscriptionId: stripeSubId,
            trialEndsAt,
            currentPeriodEnd: periodEnd
          },
          update: {
            plan: prismaPlan,
            status: mappedStatus,
            stripeCustomerId: customerId,
            stripeSubscriptionId: stripeSubId,
            trialEndsAt,
            currentPeriodEnd: periodEnd
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
            trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
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
            plan: dbSub.plan === SubscriptionPlan.PREMIUM ? SubscriptionPlan.PREMIUM : SubscriptionPlan.PRO,
            status: SubscriptionStatus.CANCELED,
            stripeSubscriptionId: null,
            trialEndsAt: null,
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
