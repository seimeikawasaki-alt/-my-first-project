import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
const prisma = new PrismaClient();

// NOTE: audit logs are append-only. There is intentionally no POST/PUT/DELETE.

function buildWhere(req: Request): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const action = req.query.action as string | undefined;
  const userId = req.query.userId as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) { const t = new Date(to); t.setUTCHours(23, 59, 59, 999); range.lte = t; }
    where.createdAt = range;
  }
  return where;
}

async function attachUsers<T extends { userId: string }>(rows: T[]): Promise<(T & { user: { lastName: string; firstName: string; userCode: string } | null })[]> {
  const ids = [...new Set(rows.map(r => r.userId))];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, lastName: true, firstName: true, userCode: true },
  });
  const map = new Map(users.map(u => [u.id, { lastName: u.lastName, firstName: u.firstName, userCode: u.userCode }]));
  return rows.map(r => ({ ...r, user: map.get(r.userId) ?? null }));
}

// GET /api/v1/audit-logs — 一覧（管理者・フィルター対応）
router.get('/', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const page = parseInt(req.query.page as string) || 1;
  const perPage = Math.min(200, parseInt(req.query.per_page as string) || 50);
  const where = buildWhere(req);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * perPage, take: perPage }),
    prisma.auditLog.count({ where }),
  ]);
  sendSuccess(res, await attachUsers(logs), 200, { total, page, per_page: perPage });
}));

// GET /api/v1/audit-logs/:userId — 特定ユーザーの操作履歴
router.get('/:userId', authenticate, authorize('ADMIN'), asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const logs = await prisma.auditLog.findMany({
    where: { userId: req.params.userId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  sendSuccess(res, await attachUsers(logs));
}));

export default router;
