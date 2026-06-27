import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();
const prisma = new PrismaClient();

const shiftCreateSchema = z.object({
  userId: z.string().min(1, 'ユーザーIDは必須です'),
  shiftTypeId: z.string().optional().nullable(),
  shiftDate: z.string().min(1, '日付は必須です'),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const shiftUpdateSchema = shiftCreateSchema.partial();

const publishSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  groupId: z.string().optional(),
});

const bulkCopySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  groupId: z.string().optional(),
});

function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

// GET /api/v1/shifts/my — must be before /:id
router.get('/my', authenticate, async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    sendError(res, 400, 'VALIDATION_ERROR', 'year と month は必須です');
    return;
  }

  const { start, end } = getMonthRange(year, month);

  const shifts = await prisma.shift.findMany({
    where: {
      userId: req.user!.id,
      status: 'PUBLISHED',
      shiftDate: { gte: start, lt: end },
    },
    orderBy: { shiftDate: 'asc' },
  });

  sendSuccess(res, shifts);
});

// POST /api/v1/shifts/publish — must be before /:id
router.post('/publish', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = publishSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const { year, month, groupId } = parsed.data;
  const { start, end } = getMonthRange(year, month);

  let userIds: string[] | undefined;
  if (groupId) {
    const members = await prisma.userGroup.findMany({
      where: { groupId },
      select: { userId: true },
    });
    userIds = members.map(m => m.userId);
  }

  const where: Record<string, unknown> = {
    status: 'DRAFT',
    shiftDate: { gte: start, lt: end },
  };
  if (userIds !== undefined) {
    where.userId = { in: userIds };
  }

  const result = await prisma.shift.updateMany({
    where,
    data: { status: 'PUBLISHED' },
  });

  sendSuccess(res, { publishedCount: result.count });
});

// POST /api/v1/shifts/bulk — must be before /:id
router.post('/bulk', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = bulkCopySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const { year, month, groupId } = parsed.data;

  // Calculate previous month
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const { start: prevStart, end: prevEnd } = getMonthRange(prevYear, prevMonth);
  const { start: currStart } = getMonthRange(year, month);

  // Day offset from previous month start to current month start
  const dayOffset = Math.round((currStart.getTime() - prevStart.getTime()) / (1000 * 60 * 60 * 24));

  let userIds: string[] | undefined;
  if (groupId) {
    const members = await prisma.userGroup.findMany({
      where: { groupId },
      select: { userId: true },
    });
    userIds = members.map(m => m.userId);
  }

  const where: Record<string, unknown> = {
    shiftDate: { gte: prevStart, lt: prevEnd },
  };
  if (userIds !== undefined) {
    where.userId = { in: userIds };
  }

  const previousShifts = await prisma.shift.findMany({ where });

  if (previousShifts.length === 0) {
    sendSuccess(res, { copiedCount: 0 });
    return;
  }

  const newShifts = previousShifts.map(s => ({
    userId: s.userId,
    shiftTypeId: s.shiftTypeId,
    shiftDate: new Date(s.shiftDate.getTime() + dayOffset * 24 * 60 * 60 * 1000),
    startTime: s.startTime,
    endTime: s.endTime,
    status: 'DRAFT',
    notes: s.notes,
    createdBy: req.user!.id,
  }));

  const result = await prisma.shift.createMany({
    data: newShifts,
    skipDuplicates: false,
  });

  sendSuccess(res, { copiedCount: result.count });
});

// GET /api/v1/shifts
router.get('/', authenticate, authorize('ADMIN', 'GROUP_LEADER'), async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  const groupId = req.query.groupId as string | undefined;

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    sendError(res, 400, 'VALIDATION_ERROR', 'year と month は必須です');
    return;
  }

  const { start, end } = getMonthRange(year, month);

  let userIds: string[] | undefined;
  if (groupId) {
    const members = await prisma.userGroup.findMany({
      where: { groupId },
      select: { userId: true },
    });
    userIds = members.map(m => m.userId);
  }

  const where: Record<string, unknown> = {
    shiftDate: { gte: start, lt: end },
  };
  if (userIds !== undefined) {
    where.userId = { in: userIds };
  }

  const shifts = await prisma.shift.findMany({
    where,
    orderBy: [{ shiftDate: 'asc' }, { userId: 'asc' }],
  });

  // Attach user info via separate query
  const fetchedUserIds = [...new Set(shifts.map(s => s.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: fetchedUserIds } },
    select: { id: true, lastName: true, firstName: true },
  });

  const userMap = new Map(users.map(u => [u.id, u]));
  const shiftsWithUser = shifts.map(s => ({
    ...s,
    user: userMap.get(s.userId) ?? null,
  }));

  sendSuccess(res, shiftsWithUser);
});

// POST /api/v1/shifts
router.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = shiftCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const { shiftDate, ...rest } = parsed.data;

  const shift = await prisma.shift.create({
    data: {
      ...rest,
      shiftDate: new Date(shiftDate),
      status: 'DRAFT',
      createdBy: req.user!.id,
    },
  });

  sendSuccess(res, shift, 201);
});

// PUT /api/v1/shifts/:id
router.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = shiftUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const existing = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', 'シフトが見つかりません');
    return;
  }

  const { shiftDate, ...rest } = parsed.data;

  const shift = await prisma.shift.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(shiftDate !== undefined ? { shiftDate: new Date(shiftDate) } : {}),
    },
  });

  sendSuccess(res, shift);
});

// DELETE /api/v1/shifts/:id
router.delete('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', 'シフトが見つかりません');
    return;
  }

  await prisma.shift.delete({ where: { id: req.params.id } });

  sendSuccess(res, { message: 'シフトを削除しました' });
});

export default router;
