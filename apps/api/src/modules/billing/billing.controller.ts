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
import { CheckoutBodyDto } from './billing.dto';

@Controller('billing')
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

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
    return this.billing.createCheckoutSession(user.userId, body.plan);
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
}
