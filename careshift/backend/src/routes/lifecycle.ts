import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit, reqMeta } from '../utils/audit.js';
import { processOnboarding, processOffboarding, listRetiredStaff } from '../services/lifecycle.service.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/v1/lifecycle/retired — 退職者一覧（管理者）
router.get('/retired', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, await listRetiredStaff());
}));

// GET /api/v1/lifecycle/events/:userId — スタッフの入退社履歴（管理者）
router.get('/events/:userId', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const events = await prisma.staffLifecycleEvent.findMany({
    where: { userId: req.params.userId },
    orderBy: { eventDate: 'desc' },
  });
  sendSuccess(res, events);
}));

// GET /api/v1/lifecycle/checklist/:userId — 退職チェックリスト（管理者）
router.get('/checklist/:userId', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const items = await prisma.offboardingChecklist.findMany({
    where: { userId: req.params.userId },
    orderBy: { createdAt: 'asc' },
  });
  sendSuccess(res, items);
}));

// PUT /api/v1/lifecycle/checklist/item/:id — チェック状態の更新（管理者）
router.put('/checklist/item/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ isDone: z.boolean() }).safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }
  const existing = await prisma.offboardingChecklist.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendError(res, 404, 'NOT_FOUND', '項目が見つかりません'); return; }
  const updated = await prisma.offboardingChecklist.update({
    where: { id: req.params.id },
    data: { isDone: parsed.data.isDone, doneAt: parsed.data.isDone ? new Date() : null },
  });
  sendSuccess(res, updated);
}));

// POST /api/v1/lifecycle/onboarding — 入社処理（管理者）
router.post('/onboarding', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    userId: z.string().min(1),
    eventDate: z.string().min(1),
    notes: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }
  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) { sendError(res, 404, 'NOT_FOUND', 'スタッフが見つかりません'); return; }
  const result = await processOnboarding(parsed.data.userId, new Date(parsed.data.eventDate), req.user!.id, parsed.data.notes ?? null);
  void writeAudit({ userId: req.user!.id, action: 'STAFF_ONBOARDING', targetType: 'User', targetId: parsed.data.userId, after: result, ...reqMeta(req) });
  sendSuccess(res, result, 201);
}));

// POST /api/v1/lifecycle/offboarding — 退職処理（管理者）
router.post('/offboarding', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    userId: z.string().min(1),
    retirementDate: z.string().min(1),
    notes: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }
  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) { sendError(res, 404, 'NOT_FOUND', 'スタッフが見つかりません'); return; }
  if (user.role === 'ADMIN') { sendError(res, 400, 'CANNOT_OFFBOARD_ADMIN', '管理者は退職処理できません'); return; }
  const result = await processOffboarding(parsed.data.userId, new Date(parsed.data.retirementDate), req.user!.id, parsed.data.notes ?? null);
  void writeAudit({ userId: req.user!.id, action: 'STAFF_OFFBOARDING', targetType: 'User', targetId: parsed.data.userId, after: result, ...reqMeta(req) });
  sendSuccess(res, result, 201);
}));

export default router;
