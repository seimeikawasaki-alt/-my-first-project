import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  runAutoGrant, grantManual, getBalance, complianceOf, requestUsage, approveUsage,
  checkFiveDaysCompliance,
} from '../services/paidLeave.service.js';

const router = Router();
const prisma = new PrismaClient();

// GET /api/v1/paid-leave/summary — 全スタッフの取得状況（管理者）
router.get('/summary', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: 'ADMIN' } },
    select: { id: true, lastName: true, firstName: true, lastNameKana: true, firstNameKana: true },
  });
  const ids = users.map(u => u.id);
  const [grants, usages] = await Promise.all([
    prisma.paidLeaveGrant.findMany({ where: { userId: { in: ids } } }),
    prisma.paidLeaveUsage.findMany({ where: { userId: { in: ids }, status: 'APPROVED' } }),
  ]);
  const now = new Date();

  const rows = users.map(u => {
    const userGrants = grants.filter(g => g.userId === u.id).sort((a, b) => b.grantDate.getTime() - a.grantDate.getTime());
    const remaining = userGrants.filter(g => g.expiryDate >= now).reduce((s, g) => s + g.remainingDays, 0);
    const latest = userGrants[0] ?? null;
    let compliance = { required: false, usedDays: 0, remainingRequired: 0, daysUntilDeadline: 0, riskLevel: 'SAFE' as const };
    let expiryDate: string | null = null;
    if (latest) {
      const deadline = new Date(latest.grantDate); deadline.setUTCFullYear(deadline.getUTCFullYear() + 1);
      const used = usages.filter(x => x.userId === u.id && x.usedDate >= latest.grantDate && x.usedDate < deadline).reduce((s, x) => s + x.days, 0);
      compliance = checkFiveDaysCompliance(latest.grantedDays, used, latest.grantDate, now);
      expiryDate = latest.expiryDate.toISOString();
    }
    return {
      userId: u.id,
      name: `${u.lastName} ${u.firstName}`,
      nameKana: `${u.lastNameKana ?? ''} ${u.firstNameKana ?? ''}`.trim(),
      grantedDays: latest?.grantedDays ?? 0,
      usedDays: latest ? latest.usedDays : 0,
      remainingDays: remaining,
      compliance,
      expiryDate,
      latestGrantId: latest?.id ?? null,
    };
  });
  sendSuccess(res, rows);
}));

// GET /api/v1/paid-leave/my — 自分の残日数（スタッフ）
router.get('/my', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const [balance, compliance] = await Promise.all([getBalance(req.user!.id), complianceOf(req.user!.id)]);
  sendSuccess(res, { ...balance, compliance });
}));

// POST /api/v1/paid-leave/grant — 付与（管理者・手動 or 自動一括）
router.post('/grant', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    auto: z.boolean().optional(),
    userId: z.string().optional(),
    days: z.number().positive().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }

  if (parsed.data.auto) {
    const results = await runAutoGrant();
    sendSuccess(res, { grantedCount: results.length, results });
    return;
  }
  if (!parsed.data.userId || !parsed.data.days) {
    sendError(res, 400, 'VALIDATION_ERROR', 'userId と days は必須です');
    return;
  }
  const grant = await grantManual(parsed.data.userId, parsed.data.days);
  sendSuccess(res, grant, 201);
}));

// PUT /api/v1/paid-leave/grant/:id — 付与内容の手動修正（管理者）
router.put('/grant/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    grantedDays: z.number().min(0).optional(),
    usedDays: z.number().min(0).optional(),
    remainingDays: z.number().min(0).optional(),
    expiryDate: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }

  const existing = await prisma.paidLeaveGrant.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendError(res, 404, 'NOT_FOUND', '付与記録が見つかりません'); return; }

  const grantedDays = parsed.data.grantedDays ?? existing.grantedDays;
  const usedDays = parsed.data.usedDays ?? existing.usedDays;
  // remainingDays 未指定なら granted−used を採用
  const remainingDays = parsed.data.remainingDays ?? Math.max(0, grantedDays - usedDays);

  const updated = await prisma.paidLeaveGrant.update({
    where: { id: req.params.id },
    data: {
      grantedDays, usedDays, remainingDays,
      ...(parsed.data.expiryDate ? { expiryDate: new Date(parsed.data.expiryDate) } : {}),
    },
  });
  sendSuccess(res, updated);
}));

// POST /api/v1/paid-leave/use — 有給取得申請
router.post('/use', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    userId: z.string().optional(), // admin may file for others
    usedDate: z.string().min(1),
    days: z.number().refine(v => v === 1 || v === 0.5, '1.0（全休）または 0.5（半休）を指定してください'),
    reason: z.string().optional().nullable(),
  }).safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    return;
  }
  const targetUserId = req.user!.role === 'ADMIN' && parsed.data.userId ? parsed.data.userId : req.user!.id;
  try {
    const usage = await requestUsage(targetUserId, new Date(parsed.data.usedDate), parsed.data.days, parsed.data.reason ?? null);
    sendSuccess(res, usage, 201);
  } catch (e) {
    if (e instanceof Error && e.message === 'INSUFFICIENT_BALANCE') {
      sendError(res, 400, 'INSUFFICIENT_BALANCE', '有給の残日数が不足しています');
      return;
    }
    throw e;
  }
}));

// PUT /api/v1/paid-leave/:id/approve — 有給申請の承認（管理者）
router.put('/:id/approve', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  try {
    const updated = await approveUsage(req.params.id);
    await prisma.paidLeaveUsage.update({ where: { id: req.params.id }, data: { reviewedBy: req.user!.id } });
    sendSuccess(res, updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'ERROR';
    if (msg === 'NOT_FOUND') { sendError(res, 404, 'NOT_FOUND', '申請が見つかりません'); return; }
    if (msg === 'ALREADY_REVIEWED') { sendError(res, 409, 'ALREADY_REVIEWED', '既に処理済みです'); return; }
    if (msg === 'INSUFFICIENT_BALANCE') { sendError(res, 400, 'INSUFFICIENT_BALANCE', '残日数が不足しています'); return; }
    throw e;
  }
}));

// GET /api/v1/paid-leave/:userId — 個別の残日数・履歴（管理者）
router.get('/:userId', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const [balance, compliance] = await Promise.all([getBalance(req.params.userId), complianceOf(req.params.userId)]);
  sendSuccess(res, { ...balance, compliance });
}));

export default router;
