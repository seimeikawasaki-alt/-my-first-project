import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const prisma = new PrismaClient();

async function sameGroupStaffIds(userId: string): Promise<string[]> {
  const myGroups = await prisma.userGroup.findMany({ where: { userId }, select: { groupId: true } });
  const groupIds = myGroups.map(g => g.groupId);
  if (groupIds.length === 0) return [];
  const members = await prisma.userGroup.findMany({ where: { groupId: { in: groupIds } }, select: { userId: true } });
  const ids = [...new Set(members.map(m => m.userId))].filter(id => id !== userId);
  const active = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true, role: { not: 'ADMIN' } }, select: { id: true } });
  return active.map(a => a.id);
}

// POST /api/v1/shift-swap — 交代リクエスト作成（欠勤連絡）
router.post('/', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    shiftId: z.string().min(1),
    reason: z.string().min(1, '理由は必須です'),
    urgency: z.enum(['URGENT', 'PLANNED']).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    return;
  }

  const shift = await prisma.shift.findUnique({ where: { id: parsed.data.shiftId } });
  if (!shift) { sendError(res, 404, 'NOT_FOUND', 'シフトが見つかりません'); return; }
  if (req.user!.role !== 'ADMIN' && shift.userId !== req.user!.id) {
    sendError(res, 403, 'FORBIDDEN', '自分のシフトのみ交代申請できます'); return;
  }

  const notified = await sameGroupStaffIds(shift.userId);
  const swap = await prisma.shiftSwapRequest.create({
    data: {
      originalUserId: shift.userId,
      shiftId: shift.id,
      reason: parsed.data.reason,
      urgency: parsed.data.urgency ?? 'URGENT',
      status: 'OPEN',
      notifiedUserIds: JSON.stringify(notified),
    },
  });
  sendSuccess(res, swap, 201);
}));

// GET /api/v1/shift-swap/available — 自分が応募できる交代一覧（スタッフ・must be before /:id-ish）
router.get('/available', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const uid = req.user!.id;
  const open = await prisma.shiftSwapRequest.findMany({ where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' } });
  const eligible = open.filter(s => {
    if (s.originalUserId === uid) return false;
    try {
      const ids = s.notifiedUserIds ? (JSON.parse(s.notifiedUserIds) as string[]) : [];
      return ids.includes(uid);
    } catch { return false; }
  });
  // Exclude ones already responded to
  const myResponses = await prisma.shiftSwapResponse.findMany({ where: { userId: uid, swapRequestId: { in: eligible.map(e => e.id) } } });
  const respondedSet = new Set(myResponses.map(r => r.swapRequestId));

  const shiftIds = eligible.map(e => e.shiftId);
  const shifts = await prisma.shift.findMany({ where: { id: { in: shiftIds } } });
  const shiftMap = new Map(shifts.map(s => [s.id, s]));
  const origIds = [...new Set(eligible.map(e => e.originalUserId))];
  const users = await prisma.user.findMany({ where: { id: { in: origIds } }, select: { id: true, lastName: true, firstName: true } });
  const nameMap = new Map(users.map(u => [u.id, `${u.lastName} ${u.firstName}`]));

  sendSuccess(res, eligible.map(e => ({
    ...e,
    alreadyResponded: respondedSet.has(e.id),
    shift: shiftMap.get(e.shiftId) ?? null,
    originalName: nameMap.get(e.originalUserId) ?? '',
  })));
}));

// POST /api/v1/shift-swap/:id/respond — 交代に応募（スタッフ）
router.post('/:id/respond', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id: req.params.id } });
  if (!swap || swap.status !== 'OPEN') { sendError(res, 404, 'NOT_FOUND', '募集中の交代リクエストが見つかりません'); return; }
  if (swap.originalUserId === req.user!.id) { sendError(res, 400, 'BAD_REQUEST', '自分のシフトには応募できません'); return; }

  const existing = await prisma.shiftSwapResponse.findFirst({ where: { swapRequestId: swap.id, userId: req.user!.id } });
  if (existing) { sendError(res, 409, 'ALREADY_RESPONDED', '既に応募済みです'); return; }

  const resp = await prisma.shiftSwapResponse.create({
    data: { swapRequestId: swap.id, userId: req.user!.id, status: 'PENDING' },
  });
  await prisma.shiftSwapRequest.update({ where: { id: swap.id }, data: { status: 'MATCHED' } });
  sendSuccess(res, resp, 201);
}));

// PUT /api/v1/shift-swap/:id/approve — 交代を承認（管理者）
router.put('/:id/approve', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ replacementUserId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', 'replacementUserId は必須です'); return; }

  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id: req.params.id } });
  if (!swap) { sendError(res, 404, 'NOT_FOUND', '交代リクエストが見つかりません'); return; }
  if (swap.status === 'APPROVED' || swap.status === 'CANCELLED') { sendError(res, 409, 'INVALID_STATE', '処理済みです'); return; }

  const shift = await prisma.shift.findUnique({ where: { id: swap.shiftId } });
  if (!shift) { sendError(res, 404, 'NOT_FOUND', '対象シフトが見つかりません'); return; }

  const replacementId = parsed.data.replacementUserId;

  // 1) シフトを応募者へ差し替え
  await prisma.shift.update({ where: { id: shift.id }, data: { userId: replacementId } });

  // 2) 元スタッフを当日「欠勤」に（勤怠が無ければ作成）
  const workDate = new Date(Date.UTC(shift.shiftDate.getUTCFullYear(), shift.shiftDate.getUTCMonth(), shift.shiftDate.getUTCDate()));
  const existingAtt = await prisma.attendance.findFirst({ where: { userId: swap.originalUserId, workDate } });
  if (existingAtt) {
    await prisma.attendance.update({ where: { id: existingAtt.id }, data: { status: 'ABSENT', notes: `交代のため欠勤（${swap.reason}）` } });
  } else {
    await prisma.attendance.create({ data: { userId: swap.originalUserId, workDate, status: 'ABSENT', notes: `交代のため欠勤（${swap.reason}）`, workMinutes: null } });
  }

  // 3) 応募状態を更新
  await prisma.shiftSwapResponse.updateMany({ where: { swapRequestId: swap.id, userId: replacementId }, data: { status: 'ACCEPTED' } });
  await prisma.shiftSwapResponse.updateMany({ where: { swapRequestId: swap.id, userId: { not: replacementId } }, data: { status: 'DECLINED' } });

  const updated = await prisma.shiftSwapRequest.update({
    where: { id: swap.id },
    data: { status: 'APPROVED', replacementUserId: replacementId, approvedBy: req.user!.id, approvedAt: new Date() },
  });
  sendSuccess(res, updated);
}));

// PUT /api/v1/shift-swap/:id/cancel — 取消（申請者 or 管理者）
router.put('/:id/cancel', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const swap = await prisma.shiftSwapRequest.findUnique({ where: { id: req.params.id } });
  if (!swap) { sendError(res, 404, 'NOT_FOUND', '交代リクエストが見つかりません'); return; }
  if (req.user!.role !== 'ADMIN' && swap.originalUserId !== req.user!.id) { sendError(res, 403, 'FORBIDDEN', '権限がありません'); return; }
  if (swap.status === 'APPROVED') { sendError(res, 409, 'INVALID_STATE', '承認済みは取消できません'); return; }
  const updated = await prisma.shiftSwapRequest.update({ where: { id: swap.id }, data: { status: 'CANCELLED' } });
  sendSuccess(res, updated);
}));

// GET /api/v1/shift-swap — 交代リクエスト一覧（管理者）
router.get('/', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const swaps = await prisma.shiftSwapRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  const shiftIds = swaps.map(s => s.shiftId);
  const shifts = await prisma.shift.findMany({ where: { id: { in: shiftIds } } });
  const shiftMap = new Map(shifts.map(s => [s.id, s]));
  const responses = await prisma.shiftSwapResponse.findMany({ where: { swapRequestId: { in: swaps.map(s => s.id) } } });

  const userIds = [...new Set([
    ...swaps.map(s => s.originalUserId),
    ...responses.map(r => r.userId),
  ])];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, lastName: true, firstName: true } });
  const nameMap = new Map(users.map(u => [u.id, `${u.lastName} ${u.firstName}`]));

  sendSuccess(res, swaps.map(s => ({
    ...s,
    originalName: nameMap.get(s.originalUserId) ?? '',
    shift: shiftMap.get(s.shiftId) ?? null,
    responses: responses.filter(r => r.swapRequestId === s.id).map(r => ({ ...r, name: nameMap.get(r.userId) ?? '' })),
  })));
}));

export default router;
