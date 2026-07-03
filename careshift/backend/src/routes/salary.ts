import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const prisma = new PrismaClient();

const itemSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(1, '項目名は必須です'),
  itemType: z.enum(['INCOME', 'DEDUCTION']),
  calcType: z.enum(['AUTO', 'MANUAL', 'FIXED', 'HOURLY']),
  calcFormula: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/v1/salary/items
router.get('/items', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const items = await prisma.salaryItem.findMany({ orderBy: { sortOrder: 'asc' } });
  sendSuccess(res, items);
}));

// POST /api/v1/salary/items
router.post('/items', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    return;
  }

  let sortOrder = parsed.data.sortOrder;
  if (sortOrder == null) {
    const max = await prisma.salaryItem.aggregate({ _max: { sortOrder: true } });
    sortOrder = (max._max.sortOrder ?? 0) + 1;
  }

  const item = await prisma.salaryItem.create({
    data: {
      code: parsed.data.code ?? null,
      name: parsed.data.name,
      itemType: parsed.data.itemType,
      calcType: parsed.data.calcType,
      calcFormula: parsed.data.calcFormula ?? null,
      sortOrder,
      isDefault: false,
      isActive: parsed.data.isActive ?? true,
    },
  });
  sendSuccess(res, item, 201);
}));

// PUT /api/v1/salary/items/reorder — must be before /items/:id
router.put('/items/reorder', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ orderedIds: z.array(z.string()).min(1) }).safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'orderedIds は必須です');
    return;
  }
  await prisma.$transaction(
    parsed.data.orderedIds.map((id, index) =>
      prisma.salaryItem.update({ where: { id }, data: { sortOrder: index + 1 } })
    )
  );
  const items = await prisma.salaryItem.findMany({ orderBy: { sortOrder: 'asc' } });
  sendSuccess(res, items);
}));

// PUT /api/v1/salary/items/:id
router.put('/items/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります');
    return;
  }
  const existing = await prisma.salaryItem.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', '給与項目が見つかりません');
    return;
  }
  const updated = await prisma.salaryItem.update({
    where: { id: req.params.id },
    data: {
      ...(parsed.data.code !== undefined ? { code: parsed.data.code } : {}),
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.itemType !== undefined ? { itemType: parsed.data.itemType } : {}),
      ...(parsed.data.calcType !== undefined ? { calcType: parsed.data.calcType } : {}),
      ...(parsed.data.calcFormula !== undefined ? { calcFormula: parsed.data.calcFormula } : {}),
      ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
    },
  });
  sendSuccess(res, updated);
}));

// DELETE /api/v1/salary/items/:id
router.delete('/items/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.salaryItem.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', '給与項目が見つかりません');
    return;
  }
  await prisma.salaryItem.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: '削除しました' });
}));

export default router;
