import { PrismaClient } from '@prisma/client';
import { calculateGrantDays, checkFiveDaysCompliance, type ComplianceStatus } from './paidLeave.calc.js';

const prisma = new PrismaClient();

export * from './paidLeave.calc.js';

/** 会計年度（4月起算）。 */
export function fiscalYearOf(date: Date): number {
  return date.getUTCMonth() + 1 >= 4 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/** 週所定労働日数の推定（フルタイム=5、パート等は勤務可能曜日 or 雇用形態から）。 */
export function weeklyWorkDaysOf(
  user: { employmentType: string },
  constraint: { availableDays: string | null } | null,
): number {
  if (user.employmentType === 'FULL_TIME') return 5;
  if (constraint?.availableDays) {
    try {
      const days = JSON.parse(constraint.availableDays) as number[];
      if (Array.isArray(days) && days.length > 0) return Math.min(5, days.length);
    } catch { /* ignore */ }
  }
  return user.employmentType === 'CONTRACT' ? 4 : 4;
}

export interface GrantResult {
  userId: string;
  grantedDays: number;
  fiscalYear: number;
}

/**
 * 入社6ヶ月経過かつ当年度未付与のスタッフに自動付与する。
 * （簡略化: 付与は年度単位。基準日は実行日。有効期限は2年。）
 */
export async function runAutoGrant(asOf: Date = new Date()): Promise<GrantResult[]> {
  const fiscalYear = fiscalYearOf(asOf);
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: 'ADMIN' }, hireDate: { not: null } },
    select: { id: true, employmentType: true, hireDate: true },
  });
  const constraints = await prisma.staffConstraint.findMany({ where: { userId: { in: users.map(u => u.id) } } });
  const constraintMap = new Map(constraints.map(c => [c.userId, c]));

  const results: GrantResult[] = [];
  for (const u of users) {
    if (!u.hireDate) continue;
    const wwd = weeklyWorkDaysOf(u, constraintMap.get(u.id) ?? null);
    const days = calculateGrantDays(u.hireDate, wwd, asOf);
    if (days <= 0) continue;

    const existing = await prisma.paidLeaveGrant.findFirst({ where: { userId: u.id, fiscalYear } });
    if (existing) continue;

    const grantDate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
    const expiryDate = new Date(grantDate);
    expiryDate.setUTCFullYear(expiryDate.getUTCFullYear() + 2);

    await prisma.paidLeaveGrant.create({
      data: { userId: u.id, grantDate, grantedDays: days, expiryDate, usedDays: 0, remainingDays: days, fiscalYear },
    });
    results.push({ userId: u.id, grantedDays: days, fiscalYear });
  }
  return results;
}

/** 有効期限（付与から2年）を過ぎた付与の残日数を0にする。 */
export async function expireOldGrants(asOf: Date = new Date()): Promise<number> {
  const res = await prisma.paidLeaveGrant.updateMany({
    where: { expiryDate: { lt: asOf }, remainingDays: { gt: 0 } },
    data: { remainingDays: 0 },
  });
  return res.count;
}

/** 手動付与。 */
export async function grantManual(userId: string, grantedDays: number, asOf: Date = new Date()) {
  const fiscalYear = fiscalYearOf(asOf);
  const grantDate = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const expiryDate = new Date(grantDate);
  expiryDate.setUTCFullYear(expiryDate.getUTCFullYear() + 2);
  return prisma.paidLeaveGrant.create({
    data: { userId, grantDate, grantedDays, expiryDate, usedDays: 0, remainingDays: grantedDays, fiscalYear },
  });
}

export async function getBalance(userId: string, asOf: Date = new Date()) {
  const grants = await prisma.paidLeaveGrant.findMany({ where: { userId }, orderBy: { grantDate: 'desc' } });
  const usages = await prisma.paidLeaveUsage.findMany({ where: { userId }, orderBy: { usedDate: 'desc' } });
  const remainingDays = grants
    .filter(g => g.expiryDate >= asOf)
    .reduce((sum, g) => sum + g.remainingDays, 0);
  return { remainingDays, grants, usages };
}

/** 最新付与を基準に年5日取得義務の状況を返す。 */
export async function complianceOf(userId: string, asOf: Date = new Date()): Promise<ComplianceStatus & { grantDate: Date | null; grantedDays: number }> {
  const latest = await prisma.paidLeaveGrant.findFirst({ where: { userId }, orderBy: { grantDate: 'desc' } });
  if (!latest) {
    return { required: false, usedDays: 0, remainingRequired: 0, daysUntilDeadline: 0, riskLevel: 'SAFE', grantDate: null, grantedDays: 0 };
  }
  const deadline = new Date(latest.grantDate);
  deadline.setUTCFullYear(deadline.getUTCFullYear() + 1);
  const usages = await prisma.paidLeaveUsage.findMany({
    where: { userId, status: 'APPROVED', usedDate: { gte: latest.grantDate, lt: deadline } },
  });
  const usedDays = usages.reduce((sum, u) => sum + u.days, 0);
  const status = checkFiveDaysCompliance(latest.grantedDays, usedDays, latest.grantDate, asOf);
  return { ...status, grantDate: latest.grantDate, grantedDays: latest.grantedDays };
}

/** 有給申請（PENDING）。消化元は残日数のある最古の有効な付与。 */
export async function requestUsage(userId: string, usedDate: Date, days: number, reason: string | null) {
  const grant = await prisma.paidLeaveGrant.findFirst({
    where: { userId, remainingDays: { gte: days }, expiryDate: { gte: new Date() } },
    orderBy: { grantDate: 'asc' },
  });
  if (!grant) throw new Error('INSUFFICIENT_BALANCE');
  return prisma.paidLeaveUsage.create({
    data: { userId, grantId: grant.id, usedDate, days, reason, status: 'PENDING' },
  });
}

/** 有給申請の承認 → 付与から消化し、勤怠に PAID_LEAVE を作成。 */
export async function approveUsage(usageId: string) {
  const usage = await prisma.paidLeaveUsage.findUnique({ where: { id: usageId } });
  if (!usage) throw new Error('NOT_FOUND');
  if (usage.status !== 'PENDING') throw new Error('ALREADY_REVIEWED');

  const grant = await prisma.paidLeaveGrant.findUnique({ where: { id: usage.grantId } });
  if (!grant || grant.remainingDays < usage.days) throw new Error('INSUFFICIENT_BALANCE');

  // 勤怠に PAID_LEAVE を作成（同日既存があれば作らない）
  const workDate = new Date(Date.UTC(usage.usedDate.getUTCFullYear(), usage.usedDate.getUTCMonth(), usage.usedDate.getUTCDate()));
  let attendance = await prisma.attendance.findFirst({ where: { userId: usage.userId, workDate } });
  if (!attendance) {
    attendance = await prisma.attendance.create({
      data: { userId: usage.userId, workDate, status: 'PAID_LEAVE', notes: '有給休暇', workMinutes: null },
    });
  } else {
    await prisma.attendance.update({ where: { id: attendance.id }, data: { status: 'PAID_LEAVE' } });
  }

  await prisma.paidLeaveGrant.update({
    where: { id: grant.id },
    data: { usedDays: grant.usedDays + usage.days, remainingDays: grant.remainingDays - usage.days },
  });
  return prisma.paidLeaveUsage.update({
    where: { id: usageId },
    data: { status: 'APPROVED', attendanceId: attendance.id, reviewedAt: new Date() },
  });
}
