import { IsIn } from 'class-validator';

export class CheckoutBodyDto {
  @IsIn(['PRO', 'PREMIUM'])
  plan!: 'PRO' | 'PREMIUM';
}
