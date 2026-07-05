import { PrismaClient } from '@prisma/client';
import { judgeAlertLevel, fiscalMonthsUpTo, type AlertLevel } from './overtime.calc.js';

const prisma = new PrismaClient();

export * from './overtime.calc.js';

export interface OvertimeConfig {
  monthlyLimitHours: number;
  yearlyLimitHours: number;
  specialMonthlyLimit: number;
  specialYearlyLimit: number;
  warningThresholdRate: number;
}

const DEFAULT_CONFIG: OvertimeConfig = {
  monthlyLimitHours: 45,
  yearlyLimitHours: 360,
  specialMonthlyLimit: 100,
  specialYearlyLimit: 720,
  warningThresholdRate: 0.8,
};

export async function getOvertimeConfig(): Promise<OvertimeConfig> {
  const c = await prisma.overtimeLimitConfig.findFirst();
  return c ?? DEFAULT_CONFIG;
}

export async function upsertOvertimeConfig(data: Partial<OvertimeConfig>): Promise<OvertimeConfig> {
  const existing = await prisma.overtimeLimitConfig.findFirst();
  if (existing) {
    return prisma.overtimeLimitConfig.update({ where: { id: existing.id }, data });
  }
  return prisma.overtimeLimitConfig.create({ data: { ...DEFAULT_CONFIG, ...data } });
}

export interface OvertimeStatusRow {
  userId: string;
  monthlyOvertimeHours: number;
  yearlyTotalHours: number;
  alertLevel: AlertLevel;
}

/** 会計年度4月〜対象月の勤怠から、各スタッフの月次残業と年度累計を集計する。 */
export async function computeOvertimeStatus(year: number, month: number): Promise<OvertimeStatusRow[]> {
  const config = await getOvertimeConfig();
  const months = fiscalMonthsUpTo(year, month);
  const start = new Date(Date.UTC(months[0].year, months[0].month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1)); // 対象月末+1

  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: 'ADMIN' } },
    select: { id: true },
  });
  const attendance = await prisma.attendance.findMany({
    where: { workDate: { gte: start, lt: end }, userId: { in: users.map(u => u.id) } },
    select: { userId: true, workDate: true, overtimeMinutes: true },
  });

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const rows: OvertimeStatusRow[] = users.map(u => {
    const mine = attendance.filter(a => a.userId === u.id);
    const monthlyMin = mine.filter(a => a.workDate >= monthStart && a.workDate < end).reduce((s, a) => s + (a.overtimeMinutes ?? 0), 0);
    const yearlyMin = mine.reduce((s, a) => s + (a.overtimeMinutes ?? 0), 0);
    const monthlyOvertimeHours = Math.round((monthlyMin / 60) * 10) / 10;
    const yearlyTotalHours = Math.round((yearlyMin / 60) * 10) / 10;
    const monthAlert = judgeAlertLevel(monthlyOvertimeHours, config.monthlyLimitHours, config.warningThresholdRate);
    const yearAlert = judgeAlertLevel(yearlyTotalHours, config.yearlyLimitHours, config.warningThresholdRate);
    // より深刻な方を採用
    const rank = { NORMAL: 0, WARNING: 1, EXCEEDED: 2 } as const;
    const alertLevel = rank[monthAlert] >= rank[yearAlert] ? monthAlert : yearAlert;
    return { userId: u.id, monthlyOvertimeHours, yearlyTotalHours, alertLevel };
  });

  // 集計を保存（アラート判定用）
  for (const r of rows) {
    await prisma.overtimeMonthlyStats.upsert({
      where: { userId_year_month: { userId: r.userId, year, month } },
      update: { overtimeHours: r.monthlyOvertimeHours, yearlyTotal: r.yearlyTotalHours, alertLevel: r.alertLevel },
      create: { userId: r.userId, year, month, overtimeHours: r.monthlyOvertimeHours, yearlyTotal: r.yearlyTotalHours, alertLevel: r.alertLevel },
    });
  }
  return rows;
}

/** シフト生成で配慮すべき（WARNING/EXCEEDED の）スタッフ ID 集合。 */
export async function overloadedUserIds(year: number, month: number): Promise<Set<string>> {
  try {
    const rows = await computeOvertimeStatus(year, month);
    return new Set(rows.filter(r => r.alertLevel !== 'NORMAL').map(r => r.userId));
  } catch {
    return new Set();
  }
}
