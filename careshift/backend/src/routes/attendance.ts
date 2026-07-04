import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { calcLateNightMinutes, calcWorkMinutes, shiftBaseMinutes, rollOvernight } from '../utils/workTime.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const prisma = new PrismaClient();

const attendanceCreateSchema = z.object({
  userId: z.string().min(1, 'スタッフは必須です'),
  workDate: z.string().min(1, '日付は必須です'),
  shiftTypeId: z.string().optional().nullable(),
  punchIn: z.string().datetime().optional().nullable(),
  punchOut: z.string().datetime().optional().nullable(),
  breakStart: z.string().datetime().optional().nullable(),
  breakEnd: z.string().datetime().optional().nullable(),
  status: z.string().optional(),
  isHolidayWork: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

/**
 * Compute work/overtime/late-night from punch times against a base shift.
 * Overtime is the portion worked beyond the selected 勤怠種類's scheduled hours.
 */
async function computeTimes(
  shiftTypeId: string | null | undefined,
  pin: Date | null,
  pout: Date | null,
  bs: Date | null,
  be: Date | null,
): Promise<{ workMinutes: number | null; overtimeMinutes: number; lateNightMinutes: number; baseMinutes: number | null; isNightShift: boolean }> {
  let baseMinutes: number | null = null;
  let isNightShift = false;
  if (shiftTypeId) {
    const st = await prisma.shiftType.findUnique({ where: { id: shiftTypeId } });
    if (st) {
      baseMinutes = shiftBaseMinutes(st);
      isNightShift = st.isNightShift;
    }
  }
  if (!pin || !pout) {
    return { workMinutes: null, overtimeMinutes: 0, lateNightMinutes: 0, baseMinutes, isNightShift };
  }
  const outRolled = rollOvernight(pin, pout);
  const workMinutes = calcWorkMinutes(pin, outRolled, bs, be);
  const base = baseMinutes ?? 480; // default 8h when no 勤怠種類 selected
  const overtimeMinutes = Math.max(0, workMinutes - base);
  const lateNightMinutes = calcLateNightMinutes(pin, outRolled);
  return { workMinutes, overtimeMinutes, lateNightMinutes, baseMinutes, isNightShift };
}

// Get today's work date (midnight UTC+9)
function getTodayWorkDate(): Date {
  const now = new Date();
  // UTC+9 offset
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstNow = new Date(now.getTime() + jstOffset);
  // Midnight in JST
  const midnight = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate()));
  return midnight;
}

const attendanceCorrectionSchema = z.object({
  shiftTypeId: z.string().optional().nullable(),
  punchIn: z.string().datetime().optional(),
  punchOut: z.string().datetime().optional(),
  breakStart: z.string().datetime().optional().nullable(),
  breakEnd: z.string().datetime().optional().nullable(),
  status: z.string().optional(),
  isHolidayWork: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  modifyReason: z.string().min(1, '修正理由は必須です'),
});

// POST /api/v1/attendance/punch-in — must be before /:id
router.post('/punch-in', authenticate, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workDate = getTodayWorkDate();

  // Check for existing open attendance (punched in but not out)
  const existing = await prisma.attendance.findFirst({
    where: {
      userId,
      workDate,
      punchIn: { not: null },
      punchOut: null,
    },
  });

  if (existing) {
    sendError(res, 409, 'ALREADY_PUNCHED_IN', '既に出勤打刻済みです');
    return;
  }

  const now = new Date();
  const attendance = await prisma.attendance.create({
    data: {
      userId,
      workDate,
      punchIn: now,
      status: 'PUNCHED_IN',
    },
  });

  sendSuccess(res, attendance, 201);
});

// POST /api/v1/attendance/punch-out — must be before /:id
router.post('/punch-out', authenticate, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workDate = getTodayWorkDate();

  const record = await prisma.attendance.findFirst({
    where: {
      userId,
      workDate,
      punchIn: { not: null },
      punchOut: null,
    },
  });

  if (!record) {
    sendError(res, 404, 'NOT_FOUND', '出勤打刻が見つかりません');
    return;
  }

  const now = new Date();
  const punchIn = record.punchIn!;
  const workMinutes = calcWorkMinutes(punchIn, now, record.breakStart, record.breakEnd);
  const overtimeMinutes = Math.max(0, workMinutes - 480);
  const lateNightMinutes = calcLateNightMinutes(punchIn, now);

  const updated = await prisma.attendance.update({
    where: { id: record.id },
    data: {
      punchOut: now,
      workMinutes,
      overtimeMinutes,
      lateNightMinutes,
      status: 'PUNCHED_OUT',
    },
  });

  sendSuccess(res, updated);
});

// POST /api/v1/attendance/break-start — must be before /:id
router.post('/break-start', authenticate, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workDate = getTodayWorkDate();

  const record = await prisma.attendance.findFirst({
    where: {
      userId,
      workDate,
      status: 'PUNCHED_IN',
      punchIn: { not: null },
      punchOut: null,
    },
  });

  if (!record) {
    sendError(res, 404, 'NOT_FOUND', '出勤中の打刻が見つかりません');
    return;
  }

  const now = new Date();
  const updated = await prisma.attendance.update({
    where: { id: record.id },
    data: {
      breakStart: now,
      status: 'ON_BREAK',
    },
  });

  sendSuccess(res, updated);
});

// POST /api/v1/attendance/break-end — must be before /:id
router.post('/break-end', authenticate, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;
  const workDate = getTodayWorkDate();

  const record = await prisma.attendance.findFirst({
    where: {
      userId,
      workDate,
      status: 'ON_BREAK',
    },
  });

  if (!record) {
    sendError(res, 404, 'NOT_FOUND', '休憩中の打刻が見つかりません');
    return;
  }

  const now = new Date();
  const updated = await prisma.attendance.update({
    where: { id: record.id },
    data: {
      breakEnd: now,
      status: 'PUNCHED_IN',
    },
  });

  sendSuccess(res, updated);
});

// GET /api/v1/attendance/my — must be before /:id
router.get('/my', authenticate, async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    sendError(res, 400, 'VALIDATION_ERROR', 'year と month は必須です');
    return;
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const records = await prisma.attendance.findMany({
    where: {
      userId: req.user!.id,
      workDate: { gte: start, lt: end },
    },
    orderBy: { workDate: 'asc' },
  });

  sendSuccess(res, records);
});

// GET /api/v1/attendance/summary — must be before /:id
router.get('/summary', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    sendError(res, 400, 'VALIDATION_ERROR', 'year と month は必須です');
    return;
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const records = await prisma.attendance.findMany({
    where: { workDate: { gte: start, lt: end } },
  });

  // Get all user ids
  const userIds = [...new Set(records.map(r => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, lastName: true, firstName: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  // Aggregate per user
  const summaryMap = new Map<string, {
    totalWorkMinutes: number;
    totalOvertimeMinutes: number;
    absentDays: number;
    paidLeaveDays: number;
  }>();

  for (const r of records) {
    if (!summaryMap.has(r.userId)) {
      summaryMap.set(r.userId, {
        totalWorkMinutes: 0,
        totalOvertimeMinutes: 0,
        absentDays: 0,
        paidLeaveDays: 0,
      });
    }
    const s = summaryMap.get(r.userId)!;
    s.totalWorkMinutes += r.workMinutes ?? 0;
    s.totalOvertimeMinutes += r.overtimeMinutes ?? 0;
    if (r.status === 'ABSENT') s.absentDays += 1;
    if (r.status === 'PAID_LEAVE') s.paidLeaveDays += 1;
  }

  const summary = userIds.map(uid => ({
    user: userMap.get(uid) ?? { id: uid, lastName: '', firstName: '' },
    ...(summaryMap.get(uid) ?? { totalWorkMinutes: 0, totalOvertimeMinutes: 0, absentDays: 0, paidLeaveDays: 0 }),
  }));

  sendSuccess(res, summary);
});

// GET /api/v1/attendance/export — must be before /:id
router.get('/export', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    sendError(res, 400, 'VALIDATION_ERROR', 'year と month は必須です');
    return;
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const records = await prisma.attendance.findMany({
    where: { workDate: { gte: start, lt: end } },
    orderBy: [{ workDate: 'asc' }, { userId: 'asc' }],
  });

  const userIds = [...new Set(records.map(r => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, lastName: true, firstName: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  const formatDate = (d: Date): string => {
    const jstOffset = 9 * 60 * 60 * 1000;
    const jst = new Date(d.getTime() + jstOffset);
    return `${jst.getUTCFullYear()}/${String(jst.getUTCMonth() + 1).padStart(2, '0')}/${String(jst.getUTCDate()).padStart(2, '0')}`;
  };

  const formatTime = (d: Date | null): string => {
    if (!d) return '';
    const jstOffset = 9 * 60 * 60 * 1000;
    const jst = new Date(d.getTime() + jstOffset);
    return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
  };

  const header = '氏名,日付,出勤,退勤,休憩(分),実労働(分),残業(分),ステータス';
  const rows = records.map(r => {
    const user = userMap.get(r.userId);
    const name = user ? `${user.lastName} ${user.firstName}` : r.userId;
    const breakMinutes = (r.breakStart && r.breakEnd)
      ? Math.round((r.breakEnd.getTime() - r.breakStart.getTime()) / 60000)
      : '';
    return [
      name,
      formatDate(r.workDate),
      formatTime(r.punchIn),
      formatTime(r.punchOut),
      breakMinutes,
      r.workMinutes ?? '',
      r.overtimeMinutes ?? 0,
      r.status ?? '',
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance_${year}_${month}.csv"`);
  res.status(200).send('﻿' + csv); // BOM for Excel compatibility
});

// GET /api/v1/attendance
router.get('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  const userId = req.query.userId as string | undefined;

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    sendError(res, 400, 'VALIDATION_ERROR', 'year と month は必須です');
    return;
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  const where: Record<string, unknown> = {
    workDate: { gte: start, lt: end },
  };
  if (userId) {
    where.userId = userId;
  }

  const records = await prisma.attendance.findMany({
    where,
    orderBy: [{ workDate: 'asc' }, { userId: 'asc' }],
  });

  // Attach user info via separate query
  const userIds = [...new Set(records.map(r => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, lastName: true, firstName: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  const recordsWithUser = records.map(r => ({
    ...r,
    user: userMap.get(r.userId) ?? null,
  }));

  sendSuccess(res, recordsWithUser);
});

// POST /api/v1/attendance — admin creates an attendance record manually
router.post('/', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = attendanceCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    return;
  }

  const { userId, workDate, shiftTypeId, punchIn, punchOut, breakStart, breakEnd, status, isHolidayWork, notes } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    sendError(res, 404, 'NOT_FOUND', 'スタッフが見つかりません');
    return;
  }

  const wd = new Date(workDate);
  if (isNaN(wd.getTime())) {
    sendError(res, 400, 'VALIDATION_ERROR', '日付が不正です');
    return;
  }

  const pin = punchIn ? new Date(punchIn) : null;
  const pout = punchOut ? new Date(punchOut) : null;
  const bs = breakStart ? new Date(breakStart) : null;
  const be = breakEnd ? new Date(breakEnd) : null;

  const t = await computeTimes(shiftTypeId, pin, pout, bs, be);
  const resolvedStatus = status ?? (pin && pout ? 'PUNCHED_OUT' : pin ? 'PUNCHED_IN' : 'ABSENT');

  const created = await prisma.attendance.create({
    data: {
      userId,
      workDate: wd,
      shiftTypeId: shiftTypeId ?? null,
      baseMinutes: t.baseMinutes,
      isNightShift: t.isNightShift,
      punchIn: pin,
      punchOut: pout,
      breakStart: bs,
      breakEnd: be,
      status: resolvedStatus,
      isHolidayWork: isHolidayWork ?? resolvedStatus === 'HOLIDAY_WORK',
      workMinutes: t.workMinutes,
      overtimeMinutes: t.overtimeMinutes,
      lateNightMinutes: t.lateNightMinutes,
      notes: notes ?? null,
      modifiedBy: req.user!.id,
      modifyReason: '管理者による手動追加',
    },
  });

  sendSuccess(res, created, 201);
}));

// PUT /api/v1/attendance/:id — admin correction
router.put('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = attendanceCorrectionSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', '打刻記録が見つかりません');
    return;
  }

  const { shiftTypeId, punchIn, punchOut, breakStart, breakEnd, status, isHolidayWork, notes, modifyReason } = parsed.data;

  const newPunchIn = punchIn ? new Date(punchIn) : existing.punchIn;
  const newPunchOut = punchOut ? new Date(punchOut) : existing.punchOut;
  const newBreakStart = breakStart !== undefined ? (breakStart ? new Date(breakStart) : null) : existing.breakStart;
  const newBreakEnd = breakEnd !== undefined ? (breakEnd ? new Date(breakEnd) : null) : existing.breakEnd;
  // Keep the previously selected 勤怠種類 unless the request changes it
  const newShiftTypeId = shiftTypeId !== undefined ? shiftTypeId : existing.shiftTypeId;

  // Recompute against the (possibly new) base shift, handling overnight shifts
  const t = await computeTimes(newShiftTypeId, newPunchIn ?? null, newPunchOut ?? null, newBreakStart, newBreakEnd);

  const updated = await prisma.attendance.update({
    where: { id: req.params.id },
    data: {
      shiftTypeId: newShiftTypeId,
      baseMinutes: t.baseMinutes,
      isNightShift: t.isNightShift,
      punchIn: newPunchIn,
      punchOut: newPunchOut,
      breakStart: newBreakStart,
      breakEnd: newBreakEnd,
      status: status !== undefined ? status : existing.status,
      isHolidayWork: isHolidayWork !== undefined ? isHolidayWork : existing.isHolidayWork,
      notes: notes !== undefined ? notes : existing.notes,
      workMinutes: newPunchIn && newPunchOut ? t.workMinutes : existing.workMinutes,
      overtimeMinutes: newPunchIn && newPunchOut ? t.overtimeMinutes : existing.overtimeMinutes,
      lateNightMinutes: newPunchIn && newPunchOut ? t.lateNightMinutes : existing.lateNightMinutes,
      modifiedBy: req.user!.id,
      modifyReason,
    },
  });

  sendSuccess(res, updated);
}));

// DELETE /api/v1/attendance/:id — admin deletes an attendance record
router.delete('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', '打刻記録が見つかりません');
    return;
  }
  await prisma.attendance.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: '削除しました' });
}));

export default router;
