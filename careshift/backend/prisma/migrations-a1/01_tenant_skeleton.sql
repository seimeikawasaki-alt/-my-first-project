-- Phase A-1 ステージ(1): テナント骨格の追加(設計書§1.1・§9・§13-2)
-- 新テーブル(Tenant/ServiceType/Office/StaffAssignment)の作成、
-- Group→Unit リネーム、全業務テーブルへの tenantId(nullable) 追加。
-- NOT NULL 化・インデックスはステージ(3) 03_tenant_notnull.sql で行う
-- (ガードレール6: NOT NULL追加とデータ移行を同一マイグレーションで行わない)。
--
-- 適用: psql "$DATABASE_URL" -f prisma/migrations-a1/01_tenant_skeleton.sql

-- ---- 新テーブル ----
CREATE TABLE IF NOT EXISTS "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'STANDARD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServiceType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "insuranceKind" TEXT NOT NULL DEFAULT 'KAIGO',
    CONSTRAINT "ServiceType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceType_code_key" ON "ServiceType"("code");

CREATE TABLE IF NOT EXISTS "Office" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 50,
    "avgUsers" INTEGER,
    "fullTimeWeeklyHours" INTEGER NOT NULL DEFAULT 40,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StaffAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "officeId" TEXT NOT NULL,
    "jobCategory" TEXT NOT NULL DEFAULT 'CARE_WORKER',
    "employmentType" TEXT NOT NULL DEFAULT 'FULL_TIME',
    "weeklyContractHours" INTEGER NOT NULL DEFAULT 40,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffAssignment_userId_officeId_key" ON "StaffAssignment"("userId", "officeId");
CREATE INDEX IF NOT EXISTS "StaffAssignment_officeId_idx" ON "StaffAssignment"("officeId");

-- ---- Group → Unit リネーム(既存リレーション=UserGroup.groupId等は名称維持) ----
ALTER TABLE "Group" RENAME TO "Unit";
ALTER TABLE "Unit" ADD COLUMN IF NOT EXISTS "officeId" TEXT;
CREATE INDEX IF NOT EXISTS "Unit_officeId_idx" ON "Unit"("officeId");

-- ---- 全業務テーブルへ tenantId(nullable) 追加 ----
ALTER TABLE "User"                 ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Unit"                 ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ShiftType"            ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Shift"                ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Attendance"           ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "SalaryItem"           ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Payroll"              ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PayrollDetail"        ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ShiftRequest"         ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ShiftRequirement"     ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ShiftRule"            ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "StaffConstraint"      ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ShiftGenerationLog"   ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "GroupShiftConfig"     ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "StaffShiftStats"      ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PaidLeaveGrant"       ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PaidLeaveUsage"       ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "OvertimeLimitConfig"  ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "OvertimeMonthlyStats" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ShiftSwapRequest"     ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ShiftSwapResponse"    ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AuditLog"             ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Qualification"        ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "StaffQualification"   ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "StaffBankAccount"     ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PayrollTransferBatch" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "StaffLifecycleEvent"  ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "OffboardingChecklist" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
