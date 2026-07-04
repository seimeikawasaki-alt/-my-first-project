import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const prisma = new PrismaClient();

/** Today's work date = midnight of the current JST calendar day, as a UTC Date
 *  (matches how Attendance.workDate and Shift.shiftDate are stored). */
function getTodayWorkDate(): Date {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()));
}

// GET /api/v1/dashboard/today — admin: live counts for today
router.get('/today', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const today = getTodayWorkDate();

  const [attendance, shifts, pendingRequests] = await Promise.all([
    prisma.attendance.findMany({ where: { workDate: today } }),
    prisma.shift.findMany({ where: { shiftDate: today, status: 'PUBLISHED', shiftTypeId: { not: null } } }),
    prisma.shiftRequest.count({ where: { status: 'PENDING' } }),
  ]);

  // Currently working = punched in and not yet out
  const workingRows = attendance.filter(a => a.status === 'PUNCHED_IN' || a.status === 'ON_BREAK');
  // Anyone who has punched in today (to detect absences)
  const punchedInSet = new Set(attendance.filter(a => a.punchIn).map(a => a.userId));
  // Absent = scheduled (published shift today) but no punch-in
  const absentShifts = shifts.filter(s => !punchedInSet.has(s.userId));

  const userIds = [...new Set([
    ...workingRows.map(a => a.userId),
    ...absentShifts.map(s => s.userId),
  ])];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, userCode: true, lastName: true, firstName: true },
  });
  const nameOf = new Map(users.map(u => [u.id, { userCode: u.userCode, name: `${u.lastName} ${u.firstName}` }]));

  const working = workingRows.map(a => ({
    userId: a.userId,
    userCode: nameOf.get(a.userId)?.userCode ?? '',
    name: nameOf.get(a.userId)?.name ?? '',
    onBreak: a.status === 'ON_BREAK',
  }));
  const absent = absentShifts.map(s => ({
    userId: s.userId,
    userCode: nameOf.get(s.userId)?.userCode ?? '',
    name: nameOf.get(s.userId)?.name ?? '',
  }));

  sendSuccess(res, {
    working,
    absent,
    scheduledCount: shifts.length,
    pendingRequests,
  });
}));

export default router;
