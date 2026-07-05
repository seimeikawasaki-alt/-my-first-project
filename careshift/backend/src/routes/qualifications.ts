import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit, reqMeta } from '../utils/audit.js';
import { listStaffQualifications, listExpiringQualifications, computeExpiryDate } from '../services/qualification.service.js';

const router = Router();
const prisma = new PrismaClient();

// ---- 資格・研修マスタ -----------------------------------------------------

// GET /api/v1/qualifications — マスタ一覧
router.get('/', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const items = await prisma.qualification.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  sendSuccess(res, items);
}));

const masterSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['QUALIFICATION', 'TRAINING']).optional(),
  hasExpiry: z.boolean().optional(),
  validMonths: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

// POST /api/v1/qualifications — マスタ追加
router.post('/', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = masterSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }
  const created = await prisma.qualification.create({
    data: {
      name: parsed.data.name,
      category: parsed.data.category ?? 'QUALIFICATION',
      hasExpiry: parsed.data.hasExpiry ?? true,
      validMonths: parsed.data.validMonths ?? null,
      description: parsed.data.description ?? null,
      isActive: parsed.data.isActive ?? true,
    },
  });
  void writeAudit({ userId: req.user!.id, action: 'QUALIFICATION_CREATE', targetType: 'Qualification', targetId: created.id, after: created, ...reqMeta(req) });
  sendSuccess(res, created, 201);
}));

// PUT /api/v1/qualifications/:id — マスタ更新
router.put('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = masterSchema.partial().safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }
  const existing = await prisma.qualification.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendError(res, 404, 'NOT_FOUND', 'マスタが見つかりません'); return; }
  const updated = await prisma.qualification.update({ where: { id: req.params.id }, data: parsed.data });
  void writeAudit({ userId: req.user!.id, action: 'QUALIFICATION_UPDATE', targetType: 'Qualification', targetId: updated.id, before: existing, after: updated, ...reqMeta(req) });
  sendSuccess(res, updated);
}));

// ---- スタッフ資格・研修記録 ----------------------------------------------

// GET /api/v1/qualifications/expiring — 期限切れ・間近（ダッシュボード用）
router.get('/expiring', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  sendSuccess(res, await listExpiringQualifications());
}));

// GET /api/v1/qualifications/staff — 全スタッフの取得記録（管理者）
router.get('/staff', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  sendSuccess(res, await listStaffQualifications(userId ? { userId } : undefined));
}));

// GET /api/v1/qualifications/my — 自分の取得記録（スタッフ）
router.get('/my', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  sendSuccess(res, await listStaffQualifications({ userId: req.user!.id }));
}));

const assignSchema = z.object({
  userId: z.string().min(1),
  qualificationId: z.string().min(1),
  acquiredDate: z.string().min(1),
  expiryDate: z.string().nullable().optional(),
  certificateNo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// POST /api/v1/qualifications/staff — スタッフに資格・研修を登録（管理者）
router.post('/staff', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }

  const master = await prisma.qualification.findUnique({ where: { id: parsed.data.qualificationId } });
  if (!master) { sendError(res, 404, 'NOT_FOUND', '資格マスタが見つかりません'); return; }

  const acquiredDate = new Date(parsed.data.acquiredDate);
  // 有効期限: 明示指定 > マスタの validMonths から自動計算 > 期限なし
  let expiryDate: Date | null = null;
  if (parsed.data.expiryDate) expiryDate = new Date(parsed.data.expiryDate);
  else if (master.hasExpiry) expiryDate = computeExpiryDate(acquiredDate, master.validMonths);

  const created = await prisma.staffQualification.create({
    data: {
      userId: parsed.data.userId,
      qualificationId: parsed.data.qualificationId,
      acquiredDate,
      expiryDate,
      certificateNo: parsed.data.certificateNo ?? null,
      notes: parsed.data.notes ?? null,
    },
  });
  void writeAudit({ userId: req.user!.id, action: 'QUALIFICATION_ASSIGN', targetType: 'StaffQualification', targetId: created.id, after: created, ...reqMeta(req) });
  sendSuccess(res, created, 201);
}));

// PUT /api/v1/qualifications/staff/:id — 取得記録の修正（管理者）
router.put('/staff/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    acquiredDate: z.string().optional(),
    expiryDate: z.string().nullable().optional(),
    certificateNo: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }
  const existing = await prisma.staffQualification.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendError(res, 404, 'NOT_FOUND', '記録が見つかりません'); return; }
  const updated = await prisma.staffQualification.update({
    where: { id: req.params.id },
    data: {
      ...(parsed.data.acquiredDate ? { acquiredDate: new Date(parsed.data.acquiredDate) } : {}),
      ...(parsed.data.expiryDate !== undefined ? { expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null } : {}),
      ...(parsed.data.certificateNo !== undefined ? { certificateNo: parsed.data.certificateNo } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    },
  });
  void writeAudit({ userId: req.user!.id, action: 'QUALIFICATION_UPDATE', targetType: 'StaffQualification', targetId: updated.id, before: existing, after: updated, ...reqMeta(req) });
  sendSuccess(res, updated);
}));

// DELETE /api/v1/qualifications/staff/:id — 取得記録の削除（管理者）
router.delete('/staff/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.staffQualification.findUnique({ where: { id: req.params.id } });
  if (!existing) { sendError(res, 404, 'NOT_FOUND', '記録が見つかりません'); return; }
  await prisma.staffQualification.delete({ where: { id: req.params.id } });
  void writeAudit({ userId: req.user!.id, action: 'QUALIFICATION_DELETE', targetType: 'StaffQualification', targetId: req.params.id, before: existing, ...reqMeta(req) });
  sendSuccess(res, { deleted: true });
}));

export default router;
