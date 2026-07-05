import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { writeAudit, reqMeta } from '../utils/audit.js';
import { buildTransferPreview, generateTransferBatch } from '../services/payrollTransfer.service.js';
import { encodeJisX0201 } from '../services/zengin.js';

const router = Router();
const prisma = new PrismaClient();

// ---- スタッフ振込口座 -----------------------------------------------------

// GET /api/v1/payroll-transfer/accounts — 全スタッフの口座登録状況（管理者）
router.get('/accounts', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const [users, accounts] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: { not: 'ADMIN' } },
      select: { id: true, lastName: true, firstName: true, lastNameKana: true, firstNameKana: true },
    }),
    prisma.staffBankAccount.findMany(),
  ]);
  const acctMap = new Map(accounts.map(a => [a.userId, a]));
  const rows = users.map(u => ({
    userId: u.id,
    name: `${u.lastName} ${u.firstName}`,
    nameKana: `${u.lastNameKana ?? ''} ${u.firstNameKana ?? ''}`.trim(),
    account: acctMap.get(u.id) ?? null,
  })).sort((a, b) => (a.nameKana || a.name).localeCompare(b.nameKana || b.name, 'ja'));
  sendSuccess(res, rows);
}));

const accountSchema = z.object({
  bankCode: z.string().min(1).max(4),
  bankName: z.string().min(1),
  branchCode: z.string().min(1).max(3),
  branchName: z.string().min(1),
  accountType: z.enum(['ORDINARY', 'CHECKING']),
  accountNumber: z.string().min(1).max(7),
  accountHolder: z.string().min(1),
});

// PUT /api/v1/payroll-transfer/accounts/:userId — 口座の登録・更新（管理者）
router.put('/accounts/:userId', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = accountSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }
  const before = await prisma.staffBankAccount.findUnique({ where: { userId: req.params.userId } });
  const saved = await prisma.staffBankAccount.upsert({
    where: { userId: req.params.userId },
    create: { userId: req.params.userId, ...parsed.data },
    update: { ...parsed.data },
  });
  void writeAudit({ userId: req.user!.id, action: 'BANK_ACCOUNT_UPDATE', targetType: 'StaffBankAccount', targetId: req.params.userId, before, after: saved, ...reqMeta(req) });
  sendSuccess(res, saved);
}));

// ---- 振込データ生成 -------------------------------------------------------

function ym(req: Request): { year: number; month: number } | null {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (!year || !month || month < 1 || month > 12) return null;
  return { year, month };
}

// GET /api/v1/payroll-transfer/preview?year=&month= — 振込対象プレビュー（口座未登録の警告含む）
router.get('/preview', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const period = ym(req);
  if (!period) { sendError(res, 400, 'VALIDATION_ERROR', 'year と month を指定してください'); return; }
  sendSuccess(res, await buildTransferPreview(period.year, period.month));
}));

// GET /api/v1/payroll-transfer/batches — 生成履歴（管理者）
router.get('/batches', authenticate, authorize('ADMIN'), asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  const batches = await prisma.payrollTransferBatch.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, year: true, month: true, transferDate: true, totalCount: true,
      totalAmount: true, status: true, fileName: true, missingCount: true, createdAt: true,
    },
  });
  sendSuccess(res, batches);
}));

const generateSchema = z.object({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  transferDate: z.string().min(1),
  consignorCode: z.string().min(1),
  consignorName: z.string().min(1),
  bankCode: z.string().min(1),
  bankName: z.string().min(1),
  branchCode: z.string().min(1),
  branchName: z.string().min(1),
  accountType: z.enum(['ORDINARY', 'CHECKING']),
  accountNumber: z.string().min(1),
});

// POST /api/v1/payroll-transfer/generate — 全銀協データ生成（管理者）
router.post('/generate', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) { sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります'); return; }
  const d = parsed.data;
  const result = await generateTransferBatch(
    d.year, d.month, new Date(d.transferDate),
    {
      consignorCode: d.consignorCode, consignorName: d.consignorName,
      bankCode: d.bankCode, bankName: d.bankName, branchCode: d.branchCode,
      branchName: d.branchName, accountType: d.accountType, accountNumber: d.accountNumber,
    },
    req.user!.id,
  );
  void writeAudit({ userId: req.user!.id, action: 'TRANSFER_BATCH_GENERATE', targetType: 'PayrollTransferBatch', targetId: result.batchId, after: { count: result.count, totalAmount: result.totalAmount, missingCount: result.missingCount }, ...reqMeta(req) });
  sendSuccess(res, result, 201);
}));

// GET /api/v1/payroll-transfer/batches/:id/download — 全銀協テキスト（Shift-JIS互換の単バイト列）
router.get('/batches/:id/download', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const batch = await prisma.payrollTransferBatch.findUnique({ where: { id: req.params.id } });
  if (!batch || !batch.content) { sendError(res, 404, 'NOT_FOUND', 'バッチが見つかりません'); return; }
  const buf = encodeJisX0201(batch.content);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${batch.fileName ?? 'zengin.txt'}"`);
  res.send(buf);
}));

export default router;
