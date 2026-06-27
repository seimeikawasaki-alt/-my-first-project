import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/v1/staff-shift-stats?year=&month=&groupId=&userId=
router.get('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  const groupId = req.query.groupId as string | undefined;
  const userId = req.query.userId as string | undefined;

  const where: Record<string, unknown> = {};
  if (!isNaN(year)) where.year = year;
  if (!isNaN(month)) where.month = month;
  if (userId) where.userId = userId;

  if (groupId) {
    const members = await prisma.userGroup.findMany({ where: { groupId }, select: { userId: true } });
    where.userId = { in: members.map((m: { userId: string }) => m.userId) };
  }

  const stats = await (prisma as unknown as { staffShiftStats: { findMany: (args: object) => Promise<unknown[]> } }).staffShiftStats.findMany({
    where,
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });

  sendSuccess(res, stats);
});

export default router;
