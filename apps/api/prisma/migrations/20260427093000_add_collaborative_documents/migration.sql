-- CreateEnum
CREATE TYPE "CollaborativeDocumentType" AS ENUM (
  'PRODUCT_DESCRIPTION',
  'STORY_DESCRIPTION',
  'TASK_DESCRIPTION',
  'SPRINT_GOAL',
  'TASK_MESSAGE_BODY'
);

-- CreateTable
CREATE TABLE "CollaborativeDocument" (
  "id" TEXT NOT NULL,
  "documentType" "CollaborativeDocumentType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "productId" TEXT,
  "yjsState" BYTEA NOT NULL,
  "markdownSnapshot" TEXT NOT NULL DEFAULT '',
  "lastEditedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CollaborativeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CollaborativeDocument_documentType_entityId_key"
  ON "CollaborativeDocument"("documentType", "entityId");

-- CreateIndex
CREATE INDEX "CollaborativeDocument_productId_updatedAt_idx"
  ON "CollaborativeDocument"("productId", "updatedAt");

-- CreateIndex
CREATE INDEX "CollaborativeDocument_lastEditedByUserId_updatedAt_idx"
  ON "CollaborativeDocument"("lastEditedByUserId", "updatedAt");

-- AddForeignKey
ALTER TABLE "CollaborativeDocument"
  ADD CONSTRAINT "CollaborativeDocument_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaborativeDocument"
  ADD CONSTRAINT "CollaborativeDocument_lastEditedByUserId_fkey"
  FOREIGN KEY ("lastEditedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
