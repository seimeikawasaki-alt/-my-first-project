import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();
const prisma = new PrismaClient();

const constraintSchema = z.object({
  maxWorkDaysPerMonth: z.number().int().min(0).max(31).optional().nullable(),
  maxNightShifts: z.number().int().min(0).max(31).optional().nullable(),
  availableDays: z.array(z.number().int().min(0).max(6)).optional().nullable(),
  unavailableDates: z.array(z.string()).optional().nullable(),
  preferredShiftTypes: z.array(z.string()).optional().nullable(),
  skillLevel: z.enum(['TRAINEE', 'NORMAL', 'SENIOR', 'LEADER']).optional(),
  canWorkNight: z.boolean().optional(),
  requiresPairing: z.boolean().optional(),
  pairingWithUserId: z.string().optional().nullable(),
  notPairWithUserId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/v1/staff-constraints/:userId
router.get('/:userId', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const constraint = await prisma.staffConstraint.findUnique({ where: { userId: req.params.userId } });
  sendSuccess(res, constraint ?? { userId: req.params.userId });
});

// PUT /api/v1/staff-constraints/:userId — upsert
router.put('/:userId', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = constraintSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user) {
    sendError(res, 404, 'NOT_FOUND', 'スタッフが見つかりません');
    return;
  }

  const data = {
    ...parsed.data,
    availableDays: parsed.data.availableDays !== undefined
      ? (parsed.data.availableDays === null ? null : JSON.stringify(parsed.data.availableDays))
      : undefined,
    unavailableDates: parsed.data.unavailableDates !== undefined
      ? (parsed.data.unavailableDates === null ? null : JSON.stringify(parsed.data.unavailableDates))
      : undefined,
    preferredShiftTypes: parsed.data.preferredShiftTypes !== undefined
      ? (parsed.data.preferredShiftTypes === null ? null : JSON.stringify(parsed.data.preferredShiftTypes))
      : undefined,
  };

  const constraint = await prisma.staffConstraint.upsert({
    where: { userId: req.params.userId },
    update: data,
    create: { userId: req.params.userId, ...data },
  });

  sendSuccess(res, constraint);
});

export default router;
