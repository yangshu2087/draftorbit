-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIALING';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
