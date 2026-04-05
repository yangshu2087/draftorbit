import { IsIn, IsNumber, IsOptional, Min } from 'class-validator';

export class CheckoutBodyDto {
  @IsIn(['STARTER', 'PRO', 'PREMIUM'])
  plan!: 'STARTER' | 'PRO' | 'PREMIUM';

  @IsIn(['MONTHLY', 'YEARLY'])
  cycle!: 'MONTHLY' | 'YEARLY';
}

export class CancelSubscriptionBodyDto {
  @IsOptional()
  @IsIn(['AT_PERIOD_END', 'IMMEDIATE'])
  mode?: 'AT_PERIOD_END' | 'IMMEDIATE';
}

export class RefundBodyDto {
  @IsIn(['PARTIAL', 'FULL'])
  mode!: 'PARTIAL' | 'FULL';

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  amountUsd?: number;

  @IsOptional()
  @IsIn(['requested_by_customer', 'duplicate', 'fraudulent'])
  reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent';
}
