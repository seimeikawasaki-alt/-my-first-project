-- Phase A-1 ステージ(3): tenantId の NOT NULL 化+インデックス追加
-- 必ず 01_tenant_skeleton.sql → バックフィル(a1-tenant-backfill.ts) の後に適用する。
--
-- 適用: psql "$DATABASE_URL" -f prisma/migrations-a1/03_tenant_notnull.sql
--
-- DEFAULT 'tenant-default' は A-1→A-2 間の暫定ブリッジ
-- (既存APIのcreateを改修せずに NOT NULL を満たすため。schema.prisma と一致)。
-- A-2 でテナントコンテキスト注入が入った時点で扱いを見直す。

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'User', 'Unit', 'ShiftType', 'Shift', 'Attendance', 'SalaryItem',
    'Payroll', 'PayrollDetail', 'ShiftRequest', 'ShiftRequirement', 'ShiftRule',
    'StaffConstraint', 'ShiftGenerationLog', 'GroupShiftConfig', 'StaffShiftStats',
    'PaidLeaveGrant', 'PaidLeaveUsage', 'OvertimeLimitConfig', 'OvertimeMonthlyStats',
    'ShiftSwapRequest', 'ShiftSwapResponse', 'AuditLog',
    'Qualification', 'StaffQualification', 'StaffBankAccount', 'PayrollTransferBatch',
    'StaffLifecycleEvent', 'OffboardingChecklist',
    'Office', 'StaffAssignment'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- 安全網: バックフィル漏れがあっても既定テナントで充当してから制約を張る
    EXECUTE format('UPDATE %I SET "tenantId" = ''tenant-default'' WHERE "tenantId" IS NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "tenantId" SET DEFAULT ''tenant-default''', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "tenantId" SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("tenantId")', t || '_tenantId_idx', t);
  END LOOP;
END $$;
