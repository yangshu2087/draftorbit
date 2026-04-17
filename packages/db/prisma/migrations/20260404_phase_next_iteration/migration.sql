-- X account default routing
ALTER TABLE "XAccount"
  ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "XAccount_workspaceId_isDefault_idx"
  ON "XAccount"("workspaceId", "isDefault");

-- Publish job account routing
ALTER TABLE "PublishJob"
  ADD COLUMN IF NOT EXISTS "xAccountId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PublishJob_xAccountId_fkey'
  ) THEN
    ALTER TABLE "PublishJob"
      ADD CONSTRAINT "PublishJob_xAccountId_fkey"
      FOREIGN KEY ("xAccountId") REFERENCES "XAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "PublishJob_workspaceId_xAccountId_status_createdAt_idx"
  ON "PublishJob"("workspaceId", "xAccountId", "status", "createdAt");

-- Usage telemetry enrichment
ALTER TABLE "UsageLog"
  ADD COLUMN IF NOT EXISTS "modelUsed" TEXT,
  ADD COLUMN IF NOT EXISTS "routingTier" TEXT,
  ADD COLUMN IF NOT EXISTS "fallbackDepth" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "requestCostUsd" NUMERIC(10, 6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "qualityScore" NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS "trialMode" BOOLEAN NOT NULL DEFAULT false;
