import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const prisma = new PrismaClient();

/** Midnight of the current JST calendar day, as a UTC Date (matches how
 *  Attendance.workDate and Shift.shiftDate are stored). */
function getTodayWorkDate(): Date {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

function jstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  VACATION: '休暇希望', PREFERRED: '希望シフト', CHANGE: 'シフト変更申請',
};

function timeHHMM(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
}

// GET /api/v1/dashboard/today — admin: live status for today
router.get('/today', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const today = getTodayWorkDate();
  const now = jstNow();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const [openAttendances, todayAttendances, shifts, pending, activeStaff, confirmedPayrolls, pendingRequests] = await Promise.all([
    // Currently on the clock (any date) = punched in, not out
    prisma.attendance.findMany({ where: { punchIn: { not: null }, punchOut: null } }),
    // Today's records (to detect absences / not-punched-out)
    prisma.attendance.findMany({ where: { workDate: today } }),
    // Today's published work shifts
    prisma.shift.findMany({ where: { shiftDate: today, status: 'PUBLISHED', shiftTypeId: { not: null } } }),
    prisma.shiftRequest.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { isActive: true, role: { not: 'ADMIN' } } }),
    prisma.payroll.count({ where: { year, month, status: 'CONFIRMED' } }),
    prisma.shiftRequest.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 5 }),
  ]);

  const punchedInToday = new Set(todayAttendances.filter(a => a.punchIn).map(a => a.userId));
  const absentShifts = shifts.filter(s => !punchedInToday.has(s.userId));
  const notPunchedOutRows = todayAttendances.filter(a => a.punchIn && !a.punchOut);

  // Resolve names for everyone referenced
  const ids = [...new Set([
    ...openAttendances.map(a => a.userId),
    ...absentShifts.map(s => s.userId),
    ...notPunchedOutRows.map(a => a.userId),
    ...pendingRequests.map(r => r.userId),
  ])];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, userCode: true, lastName: true, firstName: true },
  });
  const info = new Map(users.map(u => [u.id, { userCode: u.userCode, name: `${u.lastName} ${u.firstName}` }]));
  const nameOf = (uid: string) => info.get(uid)?.name ?? '';
  const codeOf = (uid: string) => info.get(uid)?.userCode ?? '';

  sendSuccess(res, {
    working: openAttendances.map(a => ({ userId: a.userId, userCode: codeOf(a.userId), name: nameOf(a.userId), onBreak: a.status === 'ON_BREAK' })),
    workingCount: openAttendances.length,
    nightWorkingCount: openAttendances.filter(a => a.isNightShift).length,
    absent: absentShifts.map(s => ({ userId: s.userId, userCode: codeOf(s.userId), name: nameOf(s.userId) })),
    notPunchedOut: notPunchedOutRows.map(a => ({
      userId: a.userId, userCode: codeOf(a.userId), name: nameOf(a.userId),
      punchIn: a.punchIn ? timeHHMM(a.punchIn) : null,
    })),
    scheduledCount: shifts.length,
    pendingRequests: pending,
    payrollUnconfirmed: Math.max(0, activeStaff - confirmedPayrolls),
    recentRequests: pendingRequests.map(r => ({
      id: r.id,
      name: nameOf(r.userId),
      requestType: REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType,
      targetDate: r.targetDate ? r.targetDate.toISOString() : null,
    })),
  });
}));

// GET /api/v1/dashboard/me — staff: today's shift, month summary, alerts
router.get('/me', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const today = getTodayWorkDate();
  const now = jstNow();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const [shiftTypes, todayShiftRow, monthShifts, unclosed] = await Promise.all([
    prisma.shiftType.findMany(),
    prisma.shift.findFirst({ where: { userId, shiftDate: today, status: 'PUBLISHED', shiftTypeId: { not: null } } }),
    prisma.shift.findMany({ where: { userId, shiftDate: { gte: monthStart, lt: monthEnd }, status: 'PUBLISHED', shiftTypeId: { not: null } } }),
    // A past day (before today) with a punch-in but no punch-out = 打刻忘れ
    prisma.attendance.findFirst({
      where: { userId, punchIn: { not: null }, punchOut: null, workDate: { lt: today } },
      orderBy: { workDate: 'desc' },
    }),
  ]);

  const typeMap = new Map(shiftTypes.map(t => [t.id, t]));

  const todayType = todayShiftRow?.shiftTypeId ? typeMap.get(todayShiftRow.shiftTypeId) : null;
  const todayShift = todayType ? {
    name: todayType.name,
    startTime: todayType.startTime,
    endTime: todayType.endTime,
    breakMinutes: todayType.breakMinutes,
    color: todayType.color,
    isNightShift: todayType.isNightShift,
  } : null;

  const workDays = monthShifts.length;
  const nightCount = monthShifts.filter(s => s.shiftTypeId && typeMap.get(s.shiftTypeId)?.isNightShift).length;

  const notices: { text: string }[] = [];
  if (workDays > 0) notices.push({ text: `${month}月のシフトが公開されています` });
  const lastMonth = month === 1 ? 12 : month - 1;
  const lastMonthYear = month === 1 ? year - 1 : year;
  const confirmedLast = await prisma.payroll.findFirst({
    where: { userId, year: lastMonthYear, month: lastMonth, status: 'CONFIRMED' },
  });
  if (confirmedLast) notices.push({ text: `${lastMonth}月分の給与明細が確定しました` });

  sendSuccess(res, {
    todayShift,
    monthSummary: { workDays, nightCount, offDays: Math.max(0, daysInMonth - workDays) },
    missingPunchOut: unclosed ? { date: unclosed.workDate.toISOString() } : null,
    notices,
  });
}));

export default router;
