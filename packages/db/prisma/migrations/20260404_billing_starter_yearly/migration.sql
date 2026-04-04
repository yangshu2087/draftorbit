-- AlterEnum
ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'STARTER';

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BillingInterval') THEN
    CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');
  END IF;
END$$;

-- AlterTable
ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY';
