CREATE TYPE "public"."ApiKeyKind" AS ENUM ('MCP_ACCESS', 'INCIDENT_REPORT');

ALTER TABLE "public"."ApiKey"
  ADD COLUMN "kind" "public"."ApiKeyKind" NOT NULL DEFAULT 'MCP_ACCESS',
  ADD COLUMN "storyId" TEXT;

CREATE INDEX "ApiKey_kind_createdAt_idx" ON "public"."ApiKey"("kind" ASC, "createdAt" ASC);
CREATE INDEX "ApiKey_storyId_createdAt_idx" ON "public"."ApiKey"("storyId" ASC, "createdAt" ASC);

ALTER TABLE "public"."ApiKey"
  ADD CONSTRAINT "ApiKey_storyId_fkey"
  FOREIGN KEY ("storyId") REFERENCES "public"."UserStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
