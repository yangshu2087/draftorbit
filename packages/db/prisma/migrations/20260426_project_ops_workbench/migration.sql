-- Link generated runs back to a workspace-scoped content project so project ops pages can audit output history.
ALTER TABLE "Generation" ADD COLUMN "contentProjectId" TEXT;

ALTER TABLE "Generation"
  ADD CONSTRAINT "Generation_contentProjectId_fkey"
  FOREIGN KEY ("contentProjectId") REFERENCES "ContentProject"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Generation_workspaceId_contentProjectId_createdAt_idx"
  ON "Generation"("workspaceId", "contentProjectId", "createdAt");
