import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();
const prisma = new PrismaClient();

const shiftTypeSchema = z.object({
  name: z.string().min(1, 'シフト種別名は必須です'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM形式で入力してください'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'HH:MM形式で入力してください'),
  breakMinutes: z.number().int().min(0).default(60),
  color: z.string().optional(),
  isOvernight: z.boolean().default(false),
  // 夜勤として扱うか（自動生成の公平分配・夜勤翌日ルールの対象判定に使う）
  isNightShift: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const shiftTypeUpdateSchema = shiftTypeSchema.partial().extend({
  name: z.string().min(1, 'シフト種別名は必須です').optional(),
});

// GET /api/v1/shift-types
router.get('/', authenticate, async (_req: Request, res: Response): Promise<void> => {
  const shiftTypes = await prisma.shiftType.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  sendSuccess(res, shiftTypes);
});

// POST /api/v1/shift-types
router.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = shiftTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const shiftType = await prisma.shiftType.create({
    data: parsed.data,
  });

  sendSuccess(res, shiftType, 201);
});

// PUT /api/v1/shift-types/:id
router.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = shiftTypeUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const existing = await prisma.shiftType.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', 'シフト種別が見つかりません');
    return;
  }

  const shiftType = await prisma.shiftType.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  sendSuccess(res, shiftType);
});

// DELETE /api/v1/shift-types/:id (soft delete)
router.delete('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.shiftType.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', 'シフト種別が見つかりません');
    return;
  }

  await prisma.shiftType.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  sendSuccess(res, { message: 'シフト種別を無効化しました' });
});

export default router;
