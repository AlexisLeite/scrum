ALTER TABLE "public"."TaskMessage"
ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "editedByUserId" TEXT;

CREATE TABLE "public"."TaskMessageRevision" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editorUserId" TEXT,

    CONSTRAINT "TaskMessageRevision_pkey" PRIMARY KEY ("id")
);

INSERT INTO "public"."TaskMessageRevision" ("id", "messageId", "version", "body", "editedAt", "editorUserId")
SELECT
    'tmr_' || substr(md5("id"), 1, 24),
    "id",
    1,
    "body",
    "createdAt",
    "authorUserId"
FROM "public"."TaskMessage";

CREATE INDEX "TaskMessage_editedByUserId_editedAt_idx" ON "public"."TaskMessage"("editedByUserId", "editedAt");
CREATE UNIQUE INDEX "TaskMessageRevision_messageId_version_key" ON "public"."TaskMessageRevision"("messageId", "version");
CREATE INDEX "TaskMessageRevision_messageId_editedAt_idx" ON "public"."TaskMessageRevision"("messageId", "editedAt");
CREATE INDEX "TaskMessageRevision_editorUserId_editedAt_idx" ON "public"."TaskMessageRevision"("editorUserId", "editedAt");

ALTER TABLE "public"."TaskMessage"
ADD CONSTRAINT "TaskMessage_editedByUserId_fkey" FOREIGN KEY ("editedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."TaskMessageRevision"
ADD CONSTRAINT "TaskMessageRevision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."TaskMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."TaskMessageRevision"
ADD CONSTRAINT "TaskMessageRevision_editorUserId_fkey" FOREIGN KEY ("editorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
