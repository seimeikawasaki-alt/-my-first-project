import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();
const prisma = new PrismaClient();

const shiftRequestCreateSchema = z.object({
  requestType: z.enum(['VACATION', 'PREFERRED', 'CHANGE']),
  targetDate: z.string().optional().nullable(),
  shiftTypeId: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  priority: z.number().int().min(1).max(3).optional(),
});

const shiftRequestReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
});

// GET /api/v1/shift-requests/my — must be before /:id
router.get('/my', authenticate, async (req: Request, res: Response): Promise<void> => {
  const requests = await prisma.shiftRequest.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  });

  sendSuccess(res, requests);
});

// GET /api/v1/shift-requests
router.get('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const status = req.query.status as string | undefined;
  const where = status ? { status } : {};

  const requests = await prisma.shiftRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const userIds = [...new Set(requests.map(r => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, lastName: true, firstName: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  const requestsWithUser = requests.map(r => ({
    ...r,
    user: userMap.get(r.userId) ?? null,
  }));

  sendSuccess(res, requestsWithUser);
});

// POST /api/v1/shift-requests
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const parsed = shiftRequestCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const { targetDate, ...rest } = parsed.data;

  const shiftRequest = await prisma.shiftRequest.create({
    data: {
      ...rest,
      targetDate: targetDate ? new Date(targetDate) : null,
      userId: req.user!.id,
      status: 'PENDING',
      priority: rest.priority ?? 1,
    },
  });

  sendSuccess(res, shiftRequest, 201);
});

// DELETE /api/v1/shift-requests/:id — staff can delete their own pending requests
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.shiftRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', 'シフト申請が見つかりません');
    return;
  }

  const isAdmin = req.user!.role === 'ADMIN';
  if (!isAdmin && existing.userId !== req.user!.id) {
    sendError(res, 403, 'FORBIDDEN', '権限がありません');
    return;
  }
  if (!isAdmin && existing.status !== 'PENDING') {
    sendError(res, 400, 'BAD_REQUEST', '承認済みまたは却下済みの申請は削除できません');
    return;
  }

  await prisma.shiftRequest.delete({ where: { id: req.params.id } });
  sendSuccess(res, { message: '削除しました' });
});

// PUT /api/v1/shift-requests/:id — approve/reject (ADMIN only)
router.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = shiftRequestReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const existing = await prisma.shiftRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', 'シフト申請が見つかりません');
    return;
  }

  const updated = await prisma.shiftRequest.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      reviewedBy: req.user!.id,
      reviewedAt: new Date(),
    },
  });

  sendSuccess(res, updated);
});

export default router;
