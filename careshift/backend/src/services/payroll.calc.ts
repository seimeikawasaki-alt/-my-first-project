// Pure payroll math — no DB / Prisma imports so it is unit-testable in isolation.
// The exact rounding rules from the spec are implemented here:
//   - intermediate values keep 4 decimals
//   - time is minute-precision expressed to 2 decimals
//   - final money is truncated to whole yen (1円未満切り捨て)

// ---- Constants ------------------------------------------------------------

/** Monthly overtime threshold: weekday minutes beyond this are overtime. */
export const OVERTIME_THRESHOLD_MINUTES = 40 * 60; // 月40時間
/** Standard monthly working hours, used to derive an hourly rate for 月給制. */
export const STANDARD_MONTHLY_HOURS = 160;
/** Default 雇用保険料 rate (総支給額 × rate); overridable per item. */
export const DEFAULT_EMPLOYMENT_INSURANCE_RATE = 0.006;

// ---- Types ----------------------------------------------------------------

export interface WorkSummary {
  workDays: number;
  totalWorkMinutes: number;
  /** Weekday minutes up to the 40h/month threshold (paid as 基本給). */
  regularMinutes: number;
  /** Weekday minutes beyond the 40h/month threshold. */
  overtimeMinutes: number;
  /** Late-night (22:00–05:00) minutes — an additive 0.25 premium. */
  lateNightMinutes: number;
  /** Minutes worked on 休日 (isHolidayWork). */
  holidayWorkMinutes: number;
  /** Minutes worked on 法定休日 (no source flag yet → 0). */
  legalHolidayWorkMinutes: number;
}

export interface AttendanceLike {
  workMinutes: number | null;
  lateNightMinutes: number;
  isHolidayWork: boolean;
}

export interface SalaryItemLike {
  id: string;
  code: string | null;
  name: string;
  itemType: string; // INCOME | DEDUCTION
  calcType: string; // AUTO | MANUAL | FIXED | HOURLY
  calcFormula: string | null;
  sortOrder: number;
}

export interface UserWage {
  hourlyWage: number | null;
  monthlySalary: number | null;
}

export interface PayrollDetailCalc {
  salaryItemId: string;
  code: string | null;
  name: string;
  itemType: string;
  amount: number; // yen, already floored
  sortOrder: number;
}

// ---- Rounding helpers -----------------------------------------------------

/** Keep 4 decimal places for intermediate values. */
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
/** Time in hours, minute-precision expressed to 2 decimals. */
export function minutesToHours2(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
/** Final money: truncate to whole yen (1円未満切り捨て). */
export function floorYen(n: number): number {
  return Math.floor(round4(n));
}

// ---- Pure aggregation -----------------------------------------------------

/**
 * Aggregate a month's attendance rows into a WorkSummary.
 * Overtime follows the spec: weekday minutes over 40h/month. Holiday work is
 * tracked separately and excluded from the overtime threshold.
 */
export function summarizeAttendance(records: AttendanceLike[]): WorkSummary {
  let weekdayMinutes = 0;
  let holidayWorkMinutes = 0;
  let lateNightMinutes = 0;
  let workDays = 0;

  for (const r of records) {
    const wm = r.workMinutes ?? 0;
    if (wm > 0) workDays += 1;
    if (r.isHolidayWork) holidayWorkMinutes += wm;
    else weekdayMinutes += wm;
    lateNightMinutes += r.lateNightMinutes ?? 0;
  }

  const overtimeMinutes = Math.max(0, weekdayMinutes - OVERTIME_THRESHOLD_MINUTES);
  const regularMinutes = weekdayMinutes - overtimeMinutes;

  return {
    workDays,
    totalWorkMinutes: weekdayMinutes + holidayWorkMinutes,
    regularMinutes,
    overtimeMinutes,
    lateNightMinutes,
    holidayWorkMinutes,
    legalHolidayWorkMinutes: 0,
  };
}

// ---- Item calculation -----------------------------------------------------

/** Hourly rate: 時給制は時給、月給制は 月給 ÷ 所定労働時間. */
export function hourlyRateOf(user: UserWage): number {
  if (user.hourlyWage != null) return user.hourlyWage;
  if (user.monthlySalary != null) return user.monthlySalary / STANDARD_MONTHLY_HOURS;
  return 0;
}

/**
 * Compute every payroll line for a user from the salary-item master.
 * INCOME items are computed first so AUTO deductions (雇用保険料) can reference
 * the resulting 総支給額. MANUAL amounts are preserved across recalculation
 * when `existingManual` supplies a prior value.
 */
export function calcPayrollItems(
  user: UserWage,
  summary: WorkSummary,
  items: SalaryItemLike[],
  existingManual?: Map<string, number>,
): PayrollDetailCalc[] {
  const hourly = hourlyRateOf(user);
  const isMonthly = user.monthlySalary != null;

  const autoIncome = (item: SalaryItemLike): number => {
    switch (item.code) {
      case 'BASIC':
        return isMonthly
          ? (user.monthlySalary ?? 0)
          : hourly * minutesToHours2(summary.regularMinutes);
      case 'OVERTIME':
        return hourly * 1.25 * minutesToHours2(summary.overtimeMinutes);
      case 'LATE_NIGHT':
        return hourly * 0.25 * minutesToHours2(summary.lateNightMinutes);
      case 'HOLIDAY':
        return hourly * 1.35 * minutesToHours2(summary.holidayWorkMinutes);
      case 'LEGAL_HOLIDAY':
        return hourly * 1.6 * minutesToHours2(summary.legalHolidayWorkMinutes);
      default:
        return 0;
    }
  };

  const resolveAmount = (item: SalaryItemLike, totalIncome: number): number => {
    if (item.calcType === 'MANUAL') {
      return existingManual?.get(item.id) ?? 0;
    }
    if (item.calcType === 'FIXED') {
      const v = item.calcFormula ? parseFloat(item.calcFormula) : 0;
      return Number.isFinite(v) ? v : 0;
    }
    // AUTO / HOURLY
    if (item.itemType === 'DEDUCTION' && item.code === 'EMPLOYMENT_INSURANCE') {
      const rate = item.calcFormula ? parseFloat(item.calcFormula) : DEFAULT_EMPLOYMENT_INSURANCE_RATE;
      return totalIncome * (Number.isFinite(rate) ? rate : DEFAULT_EMPLOYMENT_INSURANCE_RATE);
    }
    if (item.itemType === 'INCOME') return autoIncome(item);
    return 0;
  };

  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);

  // Pass 1: income items → 総支給額
  const incomeDetails: PayrollDetailCalc[] = [];
  let totalIncome = 0;
  for (const item of sorted.filter(i => i.itemType === 'INCOME')) {
    const amount = floorYen(resolveAmount(item, 0));
    totalIncome += amount;
    incomeDetails.push({ salaryItemId: item.id, code: item.code, name: item.name, itemType: item.itemType, amount, sortOrder: item.sortOrder });
  }

  // Pass 2: deduction items (may depend on totalIncome)
  const deductionDetails: PayrollDetailCalc[] = [];
  for (const item of sorted.filter(i => i.itemType === 'DEDUCTION')) {
    const amount = floorYen(resolveAmount(item, totalIncome));
    deductionDetails.push({ salaryItemId: item.id, code: item.code, name: item.name, itemType: item.itemType, amount, sortOrder: item.sortOrder });
  }

  return [...incomeDetails, ...deductionDetails].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sumByType(details: PayrollDetailCalc[]) {
  const totalIncome = details.filter(d => d.itemType === 'INCOME').reduce((s, d) => s + d.amount, 0);
  const totalDeduction = details.filter(d => d.itemType === 'DEDUCTION').reduce((s, d) => s + d.amount, 0);
  return { totalIncome, totalDeduction, netPay: totalIncome - totalDeduction };
}
