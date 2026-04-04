import { IsIn } from 'class-validator';

export class CheckoutBodyDto {
  @IsIn(['STARTER', 'PRO', 'PREMIUM'])
  plan!: 'STARTER' | 'PRO' | 'PREMIUM';

  @IsIn(['MONTHLY', 'YEARLY'])
  cycle!: 'MONTHLY' | 'YEARLY';
}
