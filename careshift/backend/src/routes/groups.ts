import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();
const prisma = new PrismaClient();

const groupSchema = z.object({
  name: z.string().min(1, 'グループ名は必須です').max(100),
  color: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

// GET /api/v1/groups
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const groups = await prisma.group.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });

  const groupsWithMembers = await Promise.all(
    groups.map(async group => {
      const members = await prisma.userGroup.findMany({
        where: { groupId: group.id },
      });
      const userIds = members.map(m => m.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds }, isActive: true },
        select: {
          id: true,
          userCode: true,
          lastName: true,
          firstName: true,
          employmentType: true,
        },
      });
      return {
        ...group,
        members: members.map(m => {
          const user = users.find(u => u.id === m.userId);
          return user ? { ...user, isLeader: m.isLeader } : null;
        }).filter(Boolean),
        memberCount: users.length,
      };
    })
  );

  sendSuccess(res, groupsWithMembers);
});

// POST /api/v1/groups
router.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const group = await prisma.group.create({
    data: parsed.data,
  });

  sendSuccess(res, group, 201);
});

// PUT /api/v1/groups/:id
router.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = groupSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const existing = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', 'グループが見つかりません');
    return;
  }

  const group = await prisma.group.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  sendSuccess(res, group);
});

// DELETE /api/v1/groups/:id
router.delete('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', 'グループが見つかりません');
    return;
  }

  await prisma.group.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  sendSuccess(res, { message: 'グループを削除しました' });
});

// POST /api/v1/groups/:id/members
router.post('/:id/members', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    userId: z.string().min(1),
    isLeader: z.boolean().default(false),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) {
    sendError(res, 404, 'NOT_FOUND', 'グループが見つかりません');
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user) {
    sendError(res, 404, 'NOT_FOUND', 'スタッフが見つかりません');
    return;
  }

  const member = await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: parsed.data.userId, groupId: req.params.id } },
    update: { isLeader: parsed.data.isLeader },
    create: {
      userId: parsed.data.userId,
      groupId: req.params.id,
      isLeader: parsed.data.isLeader,
    },
  });

  sendSuccess(res, member, 201);
});

// DELETE /api/v1/groups/:id/members/:userId
router.delete('/:id/members/:userId', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const existing = await prisma.userGroup.findUnique({
    where: { userId_groupId: { userId: req.params.userId, groupId: req.params.id } },
  });

  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', 'メンバーが見つかりません');
    return;
  }

  await prisma.userGroup.delete({
    where: { userId_groupId: { userId: req.params.userId, groupId: req.params.id } },
  });

  sendSuccess(res, { message: 'メンバーを削除しました' });
});

// GET /api/v1/groups/:id/shift-config
router.get('/:id/shift-config', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const config = await (prisma as unknown as { groupShiftConfig: { findUnique: (args: object) => Promise<unknown> } }).groupShiftConfig.findUnique({
    where: { groupId: req.params.id },
  });
  sendSuccess(res, config ?? null);
});

// PUT /api/v1/groups/:id/shift-config
router.put('/:id/shift-config', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    maxConsecutive: z.number().int().positive().nullable().optional(),
    maxNightPerMonth: z.number().int().positive().nullable().optional(),
    enableFairDistribution: z.boolean().optional(),
    fairDistributionTarget: z.enum(['ALL', 'NIGHT', 'EARLY']).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const group = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!group) {
    sendError(res, 404, 'NOT_FOUND', 'グループが見つかりません');
    return;
  }

  const config = await (prisma as unknown as { groupShiftConfig: { upsert: (args: object) => Promise<unknown> } }).groupShiftConfig.upsert({
    where: { groupId: req.params.id },
    update: parsed.data,
    create: { groupId: req.params.id, ...parsed.data },
  });

  sendSuccess(res, config);
});

export default router;
