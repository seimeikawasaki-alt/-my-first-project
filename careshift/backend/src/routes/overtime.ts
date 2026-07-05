import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getOvertimeConfig, upsertOvertimeConfig, computeOvertimeStatus } from '../services/overtime.service.js';

const router = Router();
const prisma = new PrismaClient();

function ym(req: Request): { year: number; month: number } | null {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = parseInt(req.query.year as string) || jst.getUTCFullYear();
  const month = parseInt(req.query.month as string) || jst.getUTCMonth() + 1;
  if (month < 1 || month > 12) return null;
  return { year, month };
}

async function withNames(rows: { userId: string }[]) {
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map(r => r.userId) } },
    select: { id: true, lastName: true, firstName: true },
  });
  const map = new Map(users.map(u => [u.id, `${u.lastName} ${u.firstName}`]));
  return map;
}

// GET /api/v1/overtime/config
router.get('/config', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, await getOvertimeConfig());
}));

// PUT /api/v1/overtime/config
router.put('/config', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    monthlyLimitHours: z.number().int().min(0).optional(),
    yearlyLimitHours: z.number().int().min(0).optional(),
    specialMonthlyLimit: z.number().int().min(0).optional(),
    specialYearlyLimit: z.number().int().min(0).optional(),
    warningThresholdRate: z.number().min(0).max(1).optional(),
  }).safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }
  sendSuccess(res, await upsertOvertimeConfig(parsed.data));
}));

// GET /api/v1/overtime/alerts — 警告対象スタッフ（管理者）
router.get('/alerts', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const period = ym(req);
  if (!period) { sendError(res, 400, 'VALIDATION_ERROR', 'month が不正です'); return; }
  const rows = (await computeOvertimeStatus(period.year, period.month)).filter(r => r.alertLevel !== 'NORMAL');
  const names = await withNames(rows);
  sendSuccess(res, rows.map(r => ({ ...r, name: names.get(r.userId) ?? '' })));
}));

// GET /api/v1/overtime/status/:userId — 個別
router.get('/status/:userId', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const period = ym(req);
  if (!period) { sendError(res, 400, 'VALIDATION_ERROR', 'month が不正です'); return; }
  const rows = await computeOvertimeStatus(period.year, period.month);
  const row = rows.find(r => r.userId === req.params.userId) ?? null;
  sendSuccess(res, row);
}));

// GET /api/v1/overtime/status — 全スタッフ
router.get('/status', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const period = ym(req);
  if (!period) { sendError(res, 400, 'VALIDATION_ERROR', 'month が不正です'); return; }
  const rows = await computeOvertimeStatus(period.year, period.month);
  const names = await withNames(rows);
  const config = await getOvertimeConfig();
  sendSuccess(res, { config, rows: rows.map(r => ({ ...r, name: names.get(r.userId) ?? '' })) });
}));

export default router;
