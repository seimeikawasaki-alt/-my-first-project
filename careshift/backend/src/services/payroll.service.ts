import { PrismaClient } from '@prisma/client';
import {
  summarizeAttendance,
  calcPayrollItems,
  sumByType,
  type WorkSummary,
  type SalaryItemLike,
  type UserWage,
} from './payroll.calc.js';

const prisma = new PrismaClient();

// Re-export the pure calculation API so callers can `import` everything from
// the service module (the pure implementations live in payroll.calc.ts and are
// unit-tested there without a DB).
export * from './payroll.calc.js';

// ---- DB-backed functions --------------------------------------------------

/** Fetch + aggregate one staff member's month of attendance. */
export async function calcWorkSummary(userId: string, year: number, month: number): Promise<WorkSummary> {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const records = await prisma.attendance.findMany({
    where: { userId, workDate: { gte: start, lt: end } },
    select: { workMinutes: true, overtimeMinutes: true, lateNightMinutes: true, isHolidayWork: true, isNightShift: true },
  });
  return summarizeAttendance(records);
}

export interface ExecutePayrollResult {
  processed: string[];      // payroll ids upserted
  skippedLocked: string[];  // userIds skipped because already CONFIRMED
}

/**
 * Calculate (or recalculate) payroll for a month.
 * CONFIRMED payrolls are locked and skipped. Existing MANUAL amounts are
 * preserved so a recalculation does not wipe admin-entered figures.
 */
export async function executePayroll(
  year: number,
  month: number,
  userIds?: string[],
): Promise<ExecutePayrollResult> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { not: 'ADMIN' },
      ...(userIds && userIds.length > 0 ? { id: { in: userIds } } : {}),
    },
    select: { id: true, hourlyWage: true, monthlySalary: true },
  });

  const items = (await prisma.salaryItem.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })) as unknown as SalaryItemLike[];

  const processed: string[] = [];
  const skippedLocked: string[] = [];

  for (const user of users) {
    const existing = await prisma.payroll.findUnique({
      where: { userId_year_month: { userId: user.id, year, month } },
    });
    if (existing?.status === 'CONFIRMED') {
      skippedLocked.push(user.id);
      continue;
    }

    // Preserve prior MANUAL amounts across recalculation
    let existingManual: Map<string, number> | undefined;
    if (existing) {
      const prevDetails = await prisma.payrollDetail.findMany({ where: { payrollId: existing.id } });
      existingManual = new Map(prevDetails.map(d => [d.salaryItemId, Number(d.amount)]));
    }

    const summary = await calcWorkSummary(user.id, year, month);
    const wage: UserWage = {
      hourlyWage: user.hourlyWage != null ? Number(user.hourlyWage) : null,
      monthlySalary: user.monthlySalary != null ? Number(user.monthlySalary) : null,
    };
    const details = calcPayrollItems(wage, summary, items, existingManual);
    const { totalIncome, totalDeduction, netPay } = sumByType(details);

    const payroll = await prisma.payroll.upsert({
      where: { userId_year_month: { userId: user.id, year, month } },
      update: {
        status: 'CALCULATED',
        totalIncome, totalDeduction, netPay,
        workDays: summary.workDays,
        workMinutes: summary.totalWorkMinutes,
        overtimeMinutes: summary.overtimeMinutes,
        lateNightMinutes: summary.lateNightMinutes,
      },
      create: {
        userId: user.id, year, month,
        status: 'CALCULATED',
        totalIncome, totalDeduction, netPay,
        workDays: summary.workDays,
        workMinutes: summary.totalWorkMinutes,
        overtimeMinutes: summary.overtimeMinutes,
        lateNightMinutes: summary.lateNightMinutes,
      },
    });

    await prisma.payrollDetail.deleteMany({ where: { payrollId: payroll.id } });
    await prisma.payrollDetail.createMany({
      data: details.map(d => ({
        payrollId: payroll.id,
        salaryItemId: d.salaryItemId,
        amount: d.amount,
        sortOrder: d.sortOrder,
      })),
    });

    processed.push(payroll.id);
  }

  return { processed, skippedLocked };
}
