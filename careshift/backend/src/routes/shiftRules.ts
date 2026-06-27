import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';

const router = Router();
const prisma = new PrismaClient();

const VALID_RULE_TYPES = [
  'MAX_CONSECUTIVE_WORK_DAYS',
  'MAX_NIGHT_SHIFTS_PER_MONTH',
  'MIN_REST_AFTER_NIGHT',
  'MIN_DAYS_OFF_PER_MONTH',
  'MAX_CONSECUTIVE_NIGHT',
  'MIN_SKILLED_PER_SHIFT',
  'MAX_WORK_HOURS_PER_WEEK',
] as const;

const DEFAULT_RULES: Record<string, { value: number; description: string }> = {
  MAX_CONSECUTIVE_WORK_DAYS:  { value: 5,  description: '連続勤務上限日数' },
  MAX_NIGHT_SHIFTS_PER_MONTH: { value: 8,  description: '月の夜勤上限回数' },
  MIN_REST_AFTER_NIGHT:       { value: 16, description: '夜勤後の最低休息時間（時間）' },
  MIN_DAYS_OFF_PER_MONTH:     { value: 8,  description: '月の最低公休日数' },
  MAX_CONSECUTIVE_NIGHT:      { value: 2,  description: '連続夜勤の上限回数' },
  MIN_SKILLED_PER_SHIFT:      { value: 1,  description: '各シフト最低有資格者数' },
  MAX_WORK_HOURS_PER_WEEK:    { value: 40, description: '週の最大労働時間' },
};

const shiftRuleSchema = z.object({
  ruleType: z.enum(VALID_RULE_TYPES),
  value: z.number().int().min(0).max(999),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

// GET /api/v1/shift-rules
router.get('/', authenticate, authorize('ADMIN'), async (_req: Request, res: Response): Promise<void> => {
  const existing = await prisma.shiftRule.findMany({ orderBy: { ruleType: 'asc' } });
  const existingMap = new Map(existing.map(r => [r.ruleType, r]));

  // Merge with defaults so all rule types are always visible
  const rules = VALID_RULE_TYPES.map(ruleType => {
    if (existingMap.has(ruleType)) return existingMap.get(ruleType)!;
    const def = DEFAULT_RULES[ruleType];
    return { id: null, ruleType, value: def.value, description: def.description, isActive: true, createdAt: null };
  });

  sendSuccess(res, rules);
});

// PUT /api/v1/shift-rules/:ruleType — upsert by ruleType
router.put('/:ruleType', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = z.object({ value: z.number().int().min(0), isActive: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります');
    return;
  }

  if (!VALID_RULE_TYPES.includes(req.params.ruleType as typeof VALID_RULE_TYPES[number])) {
    sendError(res, 400, 'VALIDATION_ERROR', '不正なルール種別です');
    return;
  }

  const ruleType = req.params.ruleType;
  const def = DEFAULT_RULES[ruleType];

  const rule = await prisma.shiftRule.upsert({
    where: { ruleType },
    update: { value: parsed.data.value, isActive: parsed.data.isActive ?? true },
    create: {
      ruleType,
      value: parsed.data.value,
      description: def?.description ?? null,
      isActive: parsed.data.isActive ?? true,
    },
  });

  sendSuccess(res, rule);
});

// POST /api/v1/shift-rules/bulk — bulk upsert
router.post('/bulk', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = z.array(z.object({
    ruleType: z.string(),
    value: z.number().int().min(0),
    isActive: z.boolean().optional(),
  })).safeParse(req.body);

  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります');
    return;
  }

  const results = await Promise.all(parsed.data.map(rule => {
    const def = DEFAULT_RULES[rule.ruleType];
    return prisma.shiftRule.upsert({
      where: { ruleType: rule.ruleType },
      update: { value: rule.value, isActive: rule.isActive ?? true },
      create: {
        ruleType: rule.ruleType,
        value: rule.value,
        description: def?.description ?? null,
        isActive: rule.isActive ?? true,
      },
    });
  }));

  sendSuccess(res, results);
});

export default router;
