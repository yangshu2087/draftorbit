import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  RawBodyRequest,
  Req,
  UseGuards
} from '@nestjs/common';
import type { AuthUser } from '@draftorbit/shared';

interface RequestWithUser { user?: AuthUser; body?: any; rawBody?: Buffer; }
import { AuthGuard } from '../../common/auth.guard';
import { BillingService } from './billing.service';
import {
  CancelSubscriptionBodyDto,
  CheckoutBodyDto,
  RefundBodyDto
} from './billing.dto';
import { withRequestId } from '../../common/response-with-request-id';

@Controller('billing')
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  @Get('plans')
  plans() {
    return this.billing.getPlans();
  }

  @Get('subscription')
  @UseGuards(AuthGuard)
  async subscription(@Req() req: RequestWithUser) {
    const user = req.user as AuthUser;
    return this.billing.getSubscription(user.userId);
  }

  @Get('usage')
  @UseGuards(AuthGuard)
  async usage(@Req() req: RequestWithUser) {
    const user = req.user as AuthUser;
    return this.billing.getUsageSummary(user.userId);
  }

  @Post('checkout')
  @UseGuards(AuthGuard)
  async checkout(@Req() req: RequestWithUser, @Body() body: CheckoutBodyDto) {
    const user = req.user as AuthUser;
    const result = await this.billing.createCheckoutSession(user.userId, body.plan, body.cycle);
    return withRequestId(req, result);
  }

  @Post('subscription/cancel')
  @UseGuards(AuthGuard)
  async cancelSubscription(@Req() req: RequestWithUser, @Body() body: CancelSubscriptionBodyDto) {
    const user = req.user as AuthUser;
    const result = await this.billing.cancelSubscription(user.userId, body.mode ?? 'AT_PERIOD_END');
    return withRequestId(req, result);
  }

  @Post('refund')
  @UseGuards(AuthGuard)
  async refund(@Req() req: RequestWithUser, @Body() body: RefundBodyDto) {
    const user = req.user as AuthUser;
    const result = await this.billing.createRefund(user.userId, body);
    return withRequestId(req, result);
  }

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<RequestWithUser>
  ) {
    const raw = req.rawBody;
    if (!Buffer.isBuffer(raw)) {
      throw new BadRequestException('Expected raw body for Stripe webhook');
    }
    return this.billing.handleWebhook(raw, signature ?? '');
  }

  @Post('paypal/webhook')
  @HttpCode(200)
  async paypalWebhook(
    @Req() req: RawBodyRequest<RequestWithUser>,
    @Headers() headers: Record<string, string | string[] | undefined>
  ) {
    const raw = req.rawBody;
    if (!Buffer.isBuffer(raw)) {
      throw new BadRequestException('Expected raw body for PayPal webhook');
    }

    return this.billing.handlePayPalWebhook(raw, headers);
  }
}
