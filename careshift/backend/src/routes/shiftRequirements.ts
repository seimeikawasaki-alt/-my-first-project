import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();
const prisma = new PrismaClient();

const requirementSchema = z.object({
  shiftTypeId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6).optional().nullable(),
  dateType: z.enum(['ALL', 'WEEKDAY', 'WEEKEND', 'HOLIDAY']).optional(),
  minStaff: z.number().int().min(0),
  maxStaff: z.number().int().min(0).optional().nullable(),
  groupId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

// GET /api/v1/shift-requirements
router.get('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const groupId = req.query.groupId as string | undefined;
  const where: Record<string, unknown> = {};
  if (groupId) where.groupId = groupId;

  const requirements = await prisma.shiftRequirement.findMany({ where, orderBy: [{ shiftTypeId: 'asc' }, { dayOfWeek: 'asc' }] });
  sendSuccess(res, requirements);
});

// POST /api/v1/shift-requirements
router.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = requirementSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const req2 = await prisma.shiftRequirement.create({ data: { ...parsed.data, isActive: parsed.data.isActive ?? true } });
  sendSuccess(res, req2, 201);
});

// PUT /api/v1/shift-requirements/:id
router.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = requirementSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります');
    return;
  }

  const existing = await prisma.shiftRequirement.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', '設定が見つかりません');
    return;
  }

  const updated = await prisma.shiftRequirement.update({ where: { id: req.params.id }, data: parsed.data });
  sendSuccess(res, updated);
});

// DELETE /api/v1/shift-requirements/:id
router.delete('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.shiftRequirement.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', '設定が見つかりません');
    return;
  }
  await prisma.shiftRequirement.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: '削除しました' });
});

// POST /api/v1/shift-requirements/bulk — bulk upsert by shiftTypeId+dayOfWeek
router.post('/bulk', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = z.array(requirementSchema).safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります');
    return;
  }

  // Delete existing for the same shiftTypes and groupId
  const shiftTypeIds = [...new Set(parsed.data.map(r => r.shiftTypeId))];
  const groupId = parsed.data[0]?.groupId ?? null;
  await prisma.shiftRequirement.deleteMany({
    where: { shiftTypeId: { in: shiftTypeIds }, groupId: groupId ?? undefined },
  });

  const created = await prisma.shiftRequirement.createMany({
    data: parsed.data.map(r => ({ ...r, isActive: r.isActive ?? true })),
  });

  sendSuccess(res, { count: created.count });
});

export default router;
