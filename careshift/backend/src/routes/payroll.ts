import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { executePayroll } from '../services/payroll.service.js';
import { renderPayslipHtml } from '../utils/payslipHtml.js';

const router = Router();
const prisma = new PrismaClient();

const yen = (n: unknown) => Math.floor(Number(n)).toLocaleString('ja-JP');

async function loadPayrollDetail(id: string) {
  const payroll = await prisma.payroll.findUnique({ where: { id } });
  if (!payroll) return null;
  const [user, details, items] = await Promise.all([
    prisma.user.findUnique({
      where: { id: payroll.userId },
      select: { id: true, userCode: true, lastName: true, firstName: true, employmentType: true },
    }),
    prisma.payrollDetail.findMany({ where: { payrollId: id }, orderBy: { sortOrder: 'asc' } }),
    prisma.salaryItem.findMany(),
  ]);
  const itemMap = new Map(items.map(i => [i.id, i]));
  const detailRows = details.map(d => {
    const item = itemMap.get(d.salaryItemId);
    return {
      id: d.id,
      salaryItemId: d.salaryItemId,
      name: item?.name ?? '不明',
      code: item?.code ?? null,
      itemType: item?.itemType ?? 'INCOME',
      calcType: item?.calcType ?? 'MANUAL',
      amount: Number(d.amount),
      notes: d.notes,
      sortOrder: d.sortOrder,
    };
  });
  return { payroll, user, details: detailRows };
}

// POST /api/v1/payroll/calculate
router.post('/calculate', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    userIds: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', 'year と month は必須です');
    return;
  }
  const { year, month, userIds } = parsed.data;
  const result = await executePayroll(year, month, userIds);
  sendSuccess(res, {
    calculatedCount: result.processed.length,
    skippedLockedCount: result.skippedLocked.length,
  });
}));

// GET /api/v1/payroll/my — staff: own confirmed payslips (must be before /:id)
router.get('/my', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const payrolls = await prisma.payroll.findMany({
    where: { userId: req.user!.id, status: 'CONFIRMED' },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 12,
  });
  sendSuccess(res, payrolls);
}));

// GET /api/v1/payroll/export — CSV (must be before /:id)
router.get('/export', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    sendError(res, 400, 'VALIDATION_ERROR', 'year と month は必須です');
    return;
  }

  const payrolls = await prisma.payroll.findMany({ where: { year, month }, orderBy: { userId: 'asc' } });
  const userIds = payrolls.map(p => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, userCode: true, lastName: true, firstName: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  const STATUS_JA: Record<string, string> = { DRAFT: '未計算', CALCULATED: '計算済', CONFIRMED: '確定' };
  const header = 'スタッフID,氏名,対象年月,勤務日数,総労働時間(h),残業(h),深夜(h),総支給額,総控除額,差引支給額,ステータス';
  const rows = payrolls.map(p => {
    const u = userMap.get(p.userId);
    return [
      u?.userCode ?? p.userId,
      u ? `${u.lastName} ${u.firstName}` : '',
      `${p.year}/${String(p.month).padStart(2, '0')}`,
      p.workDays,
      (p.workMinutes / 60).toFixed(2),
      (p.overtimeMinutes / 60).toFixed(2),
      (p.lateNightMinutes / 60).toFixed(2),
      Math.floor(Number(p.totalIncome)),
      Math.floor(Number(p.totalDeduction)),
      Math.floor(Number(p.netPay)),
      STATUS_JA[p.status] ?? p.status,
    ].join(',');
  });
  const csv = [header, ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payroll_${year}_${month}.csv"`);
  res.status(200).send('﻿' + csv); // BOM for Excel
}));

// GET /api/v1/payroll?year=&month=
router.get('/', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    sendError(res, 400, 'VALIDATION_ERROR', 'year と month は必須です');
    return;
  }

  const payrolls = await prisma.payroll.findMany({ where: { year, month } });
  const userIds = payrolls.map(p => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, userCode: true, lastName: true, firstName: true, employmentType: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  const withUser = payrolls.map(p => ({
    ...p,
    totalIncome: Number(p.totalIncome),
    totalDeduction: Number(p.totalDeduction),
    netPay: Number(p.netPay),
    user: userMap.get(p.userId) ?? null,
  }));
  sendSuccess(res, withUser);
}));

// GET /api/v1/payroll/:id
router.get('/:id', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const data = await loadPayrollDetail(req.params.id);
  if (!data) {
    sendError(res, 404, 'NOT_FOUND', '給与明細が見つかりません');
    return;
  }
  // Access: admin always; staff only their own CONFIRMED payslip
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isAdmin && (data.payroll.userId !== req.user!.id || data.payroll.status !== 'CONFIRMED')) {
    sendError(res, 403, 'FORBIDDEN', '権限がありません');
    return;
  }
  sendSuccess(res, {
    ...data.payroll,
    totalIncome: Number(data.payroll.totalIncome),
    totalDeduction: Number(data.payroll.totalDeduction),
    netPay: Number(data.payroll.netPay),
    user: data.user,
    details: data.details,
  });
}));

// PUT /api/v1/payroll/:id — manual correction of item amounts
router.put('/:id', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({
    details: z.array(z.object({ id: z.string(), amount: z.number() })).min(1),
    modifyReason: z.string().min(1, '修正理由は必須です'),
  }).safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message })));
    return;
  }

  const payroll = await prisma.payroll.findUnique({ where: { id: req.params.id } });
  if (!payroll) {
    sendError(res, 404, 'NOT_FOUND', '給与明細が見つかりません');
    return;
  }
  if (payroll.status === 'CONFIRMED') {
    sendError(res, 409, 'LOCKED', '確定済みの給与は編集できません');
    return;
  }

  // Update each detail amount (floored to whole yen)
  await prisma.$transaction(
    parsed.data.details.map(d =>
      prisma.payrollDetail.update({ where: { id: d.id }, data: { amount: Math.floor(d.amount) } })
    )
  );

  // Recompute totals from all details + item types
  const details = await prisma.payrollDetail.findMany({ where: { payrollId: payroll.id } });
  const items = await prisma.salaryItem.findMany({ where: { id: { in: details.map(d => d.salaryItemId) } } });
  const typeMap = new Map(items.map(i => [i.id, i.itemType]));
  let totalIncome = 0, totalDeduction = 0;
  for (const d of details) {
    const amt = Number(d.amount);
    if (typeMap.get(d.salaryItemId) === 'DEDUCTION') totalDeduction += amt;
    else totalIncome += amt;
  }

  const updated = await prisma.payroll.update({
    where: { id: payroll.id },
    data: {
      totalIncome, totalDeduction, netPay: totalIncome - totalDeduction,
      modifiedBy: req.user!.id,
      modifyReason: parsed.data.modifyReason,
    },
  });
  sendSuccess(res, {
    ...updated,
    totalIncome: Number(updated.totalIncome),
    totalDeduction: Number(updated.totalDeduction),
    netPay: Number(updated.netPay),
  });
}));

// POST /api/v1/payroll/:id/confirm — lock the payslip
router.post('/:id/confirm', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const payroll = await prisma.payroll.findUnique({ where: { id: req.params.id } });
  if (!payroll) {
    sendError(res, 404, 'NOT_FOUND', '給与明細が見つかりません');
    return;
  }
  if (payroll.status === 'CONFIRMED') {
    sendError(res, 409, 'ALREADY_CONFIRMED', '既に確定済みです');
    return;
  }
  const updated = await prisma.payroll.update({
    where: { id: payroll.id },
    data: { status: 'CONFIRMED', confirmedAt: new Date(), confirmedBy: req.user!.id },
  });
  sendSuccess(res, { ...updated, netPay: Number(updated.netPay) });
}));

// GET /api/v1/payroll/:id/pdf — printable payslip (HTML → browser print to PDF)
router.get('/:id/pdf', authenticate, asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const data = await loadPayrollDetail(req.params.id);
  if (!data) {
    sendError(res, 404, 'NOT_FOUND', '給与明細が見つかりません');
    return;
  }
  const isAdmin = req.user!.role === 'ADMIN';
  if (!isAdmin && (data.payroll.userId !== req.user!.id || data.payroll.status !== 'CONFIRMED')) {
    sendError(res, 403, 'FORBIDDEN', '権限がありません');
    return;
  }

  const html = renderPayslipHtml({
    facilityName: process.env.FACILITY_NAME || 'CareShift 介護施設',
    payroll: {
      year: data.payroll.year,
      month: data.payroll.month,
      workDays: data.payroll.workDays,
      workMinutes: data.payroll.workMinutes,
      overtimeMinutes: data.payroll.overtimeMinutes,
      lateNightMinutes: data.payroll.lateNightMinutes,
      totalIncome: Number(data.payroll.totalIncome),
      totalDeduction: Number(data.payroll.totalDeduction),
      netPay: Number(data.payroll.netPay),
      status: data.payroll.status,
    },
    user: data.user
      ? { userCode: data.user.userCode, name: `${data.user.lastName} ${data.user.firstName}` }
      : { userCode: '', name: '' },
    details: data.details.map(d => ({ name: d.name, itemType: d.itemType, amount: d.amount })),
    yen,
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
}));

export default router;
