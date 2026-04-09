-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ActivityEntityType" AS ENUM ('AUTH', 'USER', 'TEAM', 'PRODUCT', 'STORY', 'TASK', 'SPRINT');

-- CreateEnum
CREATE TYPE "public"."BackupStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."DraftEntityType" AS ENUM ('PRODUCT', 'STORY', 'TASK', 'TASK_MESSAGE');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('platform_admin', 'product_owner', 'scrum_master', 'team_member', 'qa_member');

-- CreateEnum
CREATE TYPE "public"."RoleDefinitionScope" AS ENUM ('SYSTEM', 'PRODUCT');

-- CreateEnum
CREATE TYPE "public"."ScheduledJobFailurePolicy" AS ENUM ('RETRY', 'FAIL');

-- CreateEnum
CREATE TYPE "public"."ScheduledJobRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."ScheduledJobState" AS ENUM ('IDLE', 'RUNNING', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."SprintStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."StoryStatus" AS ENUM ('DRAFT', 'READY', 'IN_SPRINT', 'DONE');

-- CreateTable
CREATE TABLE "public"."ActivityLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "teamId" TEXT,
    "productId" TEXT,
    "entityType" "public"."ActivityEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productId" TEXT,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BackupRecord" (
    "id" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "status" "public"."BackupStatus" NOT NULL DEFAULT 'RUNNING',
    "filename" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "uploadedLocation" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductMember" (
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roleKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductMember_pkey" PRIMARY KEY ("productId","userId")
);

-- CreateTable
CREATE TABLE "public"."ProductTeam" (
    "productId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTeam_pkey" PRIMARY KEY ("productId","teamId")
);

-- CreateTable
CREATE TABLE "public"."RoleDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scope" "public"."RoleDefinitionScope" NOT NULL,
    "isBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScheduledJob" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "state" "public"."ScheduledJobState" NOT NULL DEFAULT 'IDLE',
    "intervalMinutes" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "retryDelayMinutes" INTEGER NOT NULL DEFAULT 15,
    "failurePolicy" "public"."ScheduledJobFailurePolicy" NOT NULL DEFAULT 'RETRY',
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ScheduledJobRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "public"."ScheduledJobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "logFilePath" TEXT,
    "outputSummary" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Sprint" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "teamId" TEXT,
    "name" TEXT NOT NULL,
    "goal" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "public"."SprintStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SprintMetricDaily" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "completedPoints" INTEGER NOT NULL,
    "scopePoints" INTEGER NOT NULL,
    "remainingPoints" INTEGER NOT NULL,

    CONSTRAINT "SprintMetricDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Task" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sprintId" TEXT,
    "assigneeId" TEXT,
    "parentTaskId" TEXT,
    "sourceMessageId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "boardOrder" INTEGER NOT NULL DEFAULT 0,
    "effortPoints" INTEGER,
    "estimatedHours" DOUBLE PRECISION,
    "remainingHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskMessage" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "parentMessageId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskStatusHistory" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TaskUnfinishedSprint" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "sprintId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL,
    "boardOrder" INTEGER NOT NULL,
    "storyId" TEXT,
    "storyTitle" TEXT,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "effortPoints" INTEGER,
    "estimatedHours" DOUBLE PRECISION,
    "actualHours" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskUnfinishedSprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TeamMember" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId","userId")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "public"."Role" NOT NULL DEFAULT 'team_member',
    "passwordHash" TEXT,
    "gitlabId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "public"."DraftEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "productId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserStory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "storyPoints" INTEGER NOT NULL,
    "status" "public"."StoryStatus" NOT NULL DEFAULT 'DRAFT',
    "backlogRank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowColumn" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkflowColumn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityLog_actorUserId_createdAt_idx" ON "public"."ActivityLog"("actorUserId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ActivityLog_entityType_entityId_createdAt_idx" ON "public"."ActivityLog"("entityType" ASC, "entityId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ActivityLog_productId_createdAt_idx" ON "public"."ActivityLog"("productId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ActivityLog_teamId_createdAt_idx" ON "public"."ActivityLog"("teamId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "public"."ApiKey"("keyHash" ASC);

-- CreateIndex
CREATE INDEX "ApiKey_productId_createdAt_idx" ON "public"."ApiKey"("productId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ApiKey_userId_createdAt_idx" ON "public"."ApiKey"("userId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "BackupRecord_initiatedByUserId_startedAt_idx" ON "public"."BackupRecord"("initiatedByUserId" ASC, "startedAt" ASC);

-- CreateIndex
CREATE INDEX "BackupRecord_status_startedAt_idx" ON "public"."BackupRecord"("status" ASC, "startedAt" ASC);

-- CreateIndex
CREATE INDEX "Product_isSystem_idx" ON "public"."Product"("isSystem" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Product_key_key" ON "public"."Product"("key" ASC);

-- CreateIndex
CREATE INDEX "Product_ownerId_idx" ON "public"."Product"("ownerId" ASC);

-- CreateIndex
CREATE INDEX "ProductMember_userId_productId_idx" ON "public"."ProductMember"("userId" ASC, "productId" ASC);

-- CreateIndex
CREATE INDEX "ProductTeam_teamId_idx" ON "public"."ProductTeam"("teamId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RoleDefinition_key_key" ON "public"."RoleDefinition"("key" ASC);

-- CreateIndex
CREATE INDEX "RoleDefinition_scope_title_idx" ON "public"."RoleDefinition"("scope" ASC, "title" ASC);

-- CreateIndex
CREATE INDEX "ScheduledJob_enabled_nextRunAt_priority_idx" ON "public"."ScheduledJob"("enabled" ASC, "nextRunAt" ASC, "priority" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJob_key_key" ON "public"."ScheduledJob"("key" ASC);

-- CreateIndex
CREATE INDEX "ScheduledJobRun_jobId_createdAt_idx" ON "public"."ScheduledJobRun"("jobId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Sprint_productId_idx" ON "public"."Sprint"("productId" ASC);

-- CreateIndex
CREATE INDEX "Sprint_status_idx" ON "public"."Sprint"("status" ASC);

-- CreateIndex
CREATE INDEX "Sprint_teamId_idx" ON "public"."Sprint"("teamId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "SprintMetricDaily_sprintId_date_key" ON "public"."SprintMetricDaily"("sprintId" ASC, "date" ASC);

-- CreateIndex
CREATE INDEX "SprintMetricDaily_sprintId_idx" ON "public"."SprintMetricDaily"("sprintId" ASC);

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "public"."Task"("assigneeId" ASC);

-- CreateIndex
CREATE INDEX "Task_parentTaskId_idx" ON "public"."Task"("parentTaskId" ASC);

-- CreateIndex
CREATE INDEX "Task_sourceMessageId_idx" ON "public"."Task"("sourceMessageId" ASC);

-- CreateIndex
CREATE INDEX "Task_sprintId_idx" ON "public"."Task"("sprintId" ASC);

-- CreateIndex
CREATE INDEX "Task_sprintId_status_boardOrder_idx" ON "public"."Task"("sprintId" ASC, "status" ASC, "boardOrder" ASC);

-- CreateIndex
CREATE INDEX "Task_storyId_idx" ON "public"."Task"("storyId" ASC);

-- CreateIndex
CREATE INDEX "TaskMessage_authorUserId_createdAt_idx" ON "public"."TaskMessage"("authorUserId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "TaskMessage_parentMessageId_createdAt_idx" ON "public"."TaskMessage"("parentMessageId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "TaskMessage_taskId_createdAt_idx" ON "public"."TaskMessage"("taskId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "TaskStatusHistory_taskId_changedAt_idx" ON "public"."TaskStatusHistory"("taskId" ASC, "changedAt" ASC);

-- CreateIndex
CREATE INDEX "TaskUnfinishedSprint_sprintId_status_boardOrder_idx" ON "public"."TaskUnfinishedSprint"("sprintId" ASC, "status" ASC, "boardOrder" ASC);

-- CreateIndex
CREATE INDEX "TaskUnfinishedSprint_taskId_idx" ON "public"."TaskUnfinishedSprint"("taskId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TaskUnfinishedSprint_taskId_sprintId_key" ON "public"."TaskUnfinishedSprint"("taskId" ASC, "sprintId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "public"."Team"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_gitlabId_key" ON "public"."User"("gitlabId" ASC);

-- CreateIndex
CREATE INDEX "UserDraft_entityType_entityId_updatedAt_idx" ON "public"."UserDraft"("entityType" ASC, "entityId" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "UserDraft_productId_updatedAt_idx" ON "public"."UserDraft"("productId" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserDraft_userId_entityType_entityId_key" ON "public"."UserDraft"("userId" ASC, "entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "UserDraft_userId_updatedAt_idx" ON "public"."UserDraft"("userId" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "UserStory_productId_backlogRank_idx" ON "public"."UserStory"("productId" ASC, "backlogRank" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowColumn_productId_name_key" ON "public"."WorkflowColumn"("productId" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowColumn_productId_sortOrder_key" ON "public"."WorkflowColumn"("productId" ASC, "sortOrder" ASC);

-- AddForeignKey
ALTER TABLE "public"."ActivityLog" ADD CONSTRAINT "ActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityLog" ADD CONSTRAINT "ActivityLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityLog" ADD CONSTRAINT "ActivityLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApiKey" ADD CONSTRAINT "ApiKey_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BackupRecord" ADD CONSTRAINT "BackupRecord_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductMember" ADD CONSTRAINT "ProductMember_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductMember" ADD CONSTRAINT "ProductMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTeam" ADD CONSTRAINT "ProductTeam_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductTeam" ADD CONSTRAINT "ProductTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ScheduledJobRun" ADD CONSTRAINT "ScheduledJobRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."ScheduledJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sprint" ADD CONSTRAINT "Sprint_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Sprint" ADD CONSTRAINT "Sprint_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "public"."TaskMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "public"."Sprint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "public"."UserStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskMessage" ADD CONSTRAINT "TaskMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskMessage" ADD CONSTRAINT "TaskMessage_parentMessageId_fkey" FOREIGN KEY ("parentMessageId") REFERENCES "public"."TaskMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskMessage" ADD CONSTRAINT "TaskMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskUnfinishedSprint" ADD CONSTRAINT "TaskUnfinishedSprint_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "public"."Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TaskUnfinishedSprint" ADD CONSTRAINT "TaskUnfinishedSprint_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserDraft" ADD CONSTRAINT "UserDraft_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserDraft" ADD CONSTRAINT "UserDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserStory" ADD CONSTRAINT "UserStory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowColumn" ADD CONSTRAINT "WorkflowColumn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

