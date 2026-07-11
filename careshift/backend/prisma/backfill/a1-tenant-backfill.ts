/**
 * Phase A-1 ステージ(2): テナントバックフィル(設計書§9「移行」)
 *
 * 実行タイミング: 01_tenant_skeleton.sql 適用後、03_tenant_notnull.sql 適用前。
 * 実行方法:       cd backend && npx tsx prisma/backfill/a1-tenant-backfill.ts
 *
 * 内容:
 *   1. 既定テナント(既定法人)・サービス種別・既定事業所を作成
 *      (Office.name は環境変数 FACILITY_NAME を優先採用)
 *   2. 全業務テーブルの tenantId(NULL) を 'tenant-default' で埋める
 *   3. Unit.officeId(NULL) を既定事業所で埋める
 *   4. 既存Userごとに StaffAssignment を1件生成
 *      (jobCategory='CARE_WORKER' 仮置き / 月給制=FULL_TIME・時給制=PART_TIME)
 *
 * 何度実行しても安全(冪等)。
 *
 * 注意: 本スクリプトは生SQLを使用する。これは「移行途中(nullable期)のDB」を
 * どの世代の生成済みクライアントからでも操作できるようにするための例外であり、
 * アプリケーションコードでは生SQLを使用しないこと(A-2のテナント分離の前提)。
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ID = 'tenant-default';
const OFFICE_ID = 'office-default';

// tenantId を持つ全業務テーブル(schema.prisma と一致させること)
const TENANT_TABLES = [
  'User', 'Unit', 'ShiftType', 'Shift', 'Attendance', 'SalaryItem',
  'Payroll', 'PayrollDetail', 'ShiftRequest', 'ShiftRequirement', 'ShiftRule',
  'StaffConstraint', 'ShiftGenerationLog', 'GroupShiftConfig', 'StaffShiftStats',
  'PaidLeaveGrant', 'PaidLeaveUsage', 'OvertimeLimitConfig', 'OvertimeMonthlyStats',
  'ShiftSwapRequest', 'ShiftSwapResponse', 'AuditLog',
  'Qualification', 'StaffQualification', 'StaffBankAccount', 'PayrollTransferBatch',
  'StaffLifecycleEvent', 'OffboardingChecklist',
];

async function main() {
  console.log('[a1-backfill] start');

  // 1. 既定テナント・サービス種別・既定事業所
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Tenant" (id, name, plan, "isActive", "createdAt", "updatedAt")
    VALUES ('${TENANT_ID}', '既定法人', 'STANDARD', true, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);

  const serviceTypes = [
    ['svc-tokuyo', 'TOKUYO', '特別養護老人ホーム'],
    ['svc-roken', 'ROKEN', '介護老人保健施設'],
    ['svc-gh', 'GH', '認知症対応型共同生活介護(グループホーム)'],
    ['svc-daycare', 'DAYCARE', '通所介護(デイサービス)'],
    ['svc-yuryo', 'YURYO', '有料老人ホーム(特定施設)'],
  ];
  for (const [id, code, name] of serviceTypes) {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ServiceType" (id, code, name, "insuranceKind")
      VALUES ('${id}', '${code}', '${name}', 'KAIGO')
      ON CONFLICT (code) DO NOTHING
    `);
  }

  const officeName = (process.env.FACILITY_NAME || '既定事業所').replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`
    INSERT INTO "Office" (id, "tenantId", name, "serviceTypeId", capacity, "avgUsers", "fullTimeWeeklyHours", "isActive", "createdAt", "updatedAt")
    VALUES ('${OFFICE_ID}', '${TENANT_ID}', '${officeName}', 'svc-tokuyo', 50, 45, 40, true, now(), now())
    ON CONFLICT (id) DO NOTHING
  `);
  console.log(`[a1-backfill] tenant/office ready (office="${officeName}")`);

  // 2. tenantId バックフィル
  for (const table of TENANT_TABLES) {
    const n = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "tenantId" = '${TENANT_ID}' WHERE "tenantId" IS NULL`,
    );
    if (n > 0) console.log(`[a1-backfill] ${table}: ${n} rows`);
  }

  // 3. Unit.officeId
  const nUnits = await prisma.$executeRawUnsafe(
    `UPDATE "Unit" SET "officeId" = '${OFFICE_ID}' WHERE "officeId" IS NULL`,
  );
  console.log(`[a1-backfill] Unit.officeId: ${nUnits} rows`);

  // 4. StaffAssignment(既存Userごとに1件。月給制=FULL_TIME / 時給制=PART_TIME)
  const nAssign = await prisma.$executeRawUnsafe(`
    INSERT INTO "StaffAssignment"
      (id, "tenantId", "userId", "officeId", "jobCategory", "employmentType", "weeklyContractHours", "createdAt", "updatedAt")
    SELECT
      gen_random_uuid()::text, '${TENANT_ID}', u.id, '${OFFICE_ID}', 'CARE_WORKER',
      CASE WHEN u."monthlySalary" IS NOT NULL THEN 'FULL_TIME' ELSE 'PART_TIME' END,
      CASE WHEN u."monthlySalary" IS NOT NULL THEN 40 ELSE 24 END,
      now(), now()
    FROM "User" u
    WHERE NOT EXISTS (
      SELECT 1 FROM "StaffAssignment" sa WHERE sa."userId" = u.id AND sa."officeId" = '${OFFICE_ID}'
    )
  `);
  console.log(`[a1-backfill] StaffAssignment: ${nAssign} rows`);

  console.log('[a1-backfill] done');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
