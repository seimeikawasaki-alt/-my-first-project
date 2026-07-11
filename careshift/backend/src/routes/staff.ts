import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { writeAudit, reqMeta } from '../utils/audit.js';

const router = Router();
const prisma = new PrismaClient();

const staffCreateSchema = z.object({
  userCode: z.string().min(1, 'ユーザーIDは必須です').max(50),
  password: z
    .string()
    .min(8, 'パスワードは8文字以上にしてください')
    .regex(/[A-Z]/, '大文字を含める必要があります')
    .regex(/[a-z]/, '小文字を含める必要があります')
    .regex(/[0-9]/, '数字を含める必要があります'),
  role: z.enum(['ADMIN', 'GROUP_LEADER', 'STAFF']).default('STAFF'),
  lastName: z.string().min(1, '姓は必須です'),
  firstName: z.string().min(1, '名は必須です'),
  lastNameKana: z.string().optional(),
  firstNameKana: z.string().optional(),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT']),
  hourlyWage: z.number().positive().optional().nullable(),
  monthlySalary: z.number().positive().optional().nullable(),
  email: z.string().email('メールアドレスの形式が正しくありません').optional().nullable(),
  phone: z.string().optional().nullable(),
  hireDate: z.string().optional().nullable(),
  groupIds: z.array(z.string()).optional(),
});

const staffUpdateSchema = staffCreateSchema.omit({ password: true }).extend({
  password: z.string().min(8).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/v1/staff
router.get('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const page = parseInt(req.query.page as string) || 1;
  const perPage = parseInt(req.query.per_page as string) || 20;
  const search = req.query.search as string | undefined;
  const employmentType = req.query.employment_type as string | undefined;
  const groupId = req.query.group_id as string | undefined;
  const isActiveParam = req.query.is_active as string | undefined;

  const where: Record<string, unknown> = {};
  if (isActiveParam !== 'all') {
    where.isActive = isActiveParam !== 'false';
  }

  if (search) {
    where.OR = [
      { lastName: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastNameKana: { contains: search, mode: 'insensitive' } },
      { firstNameKana: { contains: search, mode: 'insensitive' } },
      { userCode: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (employmentType) {
    where.employmentType = employmentType;
  }

  let userIds: string[] | undefined;
  if (groupId) {
    const members = await prisma.userGroup.findMany({
      where: { groupId },
      select: { userId: true },
    });
    userIds = members.map(m => m.userId);
    where.id = { in: userIds };
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * perPage,
      take: perPage,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        userCode: true,
        role: true,
        lastName: true,
        firstName: true,
        lastNameKana: true,
        firstNameKana: true,
        employmentType: true,
        hourlyWage: true,
        monthlySalary: true,
        email: true,
        phone: true,
        hireDate: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Attach group info via manual join
  const fetchedUserIds = users.map(u => u.id);
  const userGroupLinks = await prisma.userGroup.findMany({
    where: { userId: { in: fetchedUserIds } },
  });
  const groupData = await prisma.unit.findMany({
    where: { id: { in: userGroupLinks.map(ug => ug.groupId) } },
  });

  const usersWithGroups = users.map(user => ({
    ...user,
    groups: userGroupLinks
      .filter(ug => ug.userId === user.id)
      .map(ug => {
        const group = groupData.find(g => g.id === ug.groupId);
        return group ? { id: group.id, name: group.name, color: group.color, isLeader: ug.isLeader } : null;
      })
      .filter(Boolean),
  }));

  sendSuccess(res, usersWithGroups, 200, { total, page, per_page: perPage });
});

// GET /api/v1/staff/:id
router.get('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      userCode: true,
      role: true,
      lastName: true,
      firstName: true,
      lastNameKana: true,
      firstNameKana: true,
      employmentType: true,
      hourlyWage: true,
      monthlySalary: true,
      email: true,
      phone: true,
      hireDate: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    sendError(res, 404, 'NOT_FOUND', 'スタッフが見つかりません');
    return;
  }

  const userGroups = await prisma.userGroup.findMany({
    where: { userId: user.id },
  });

  const groupIds = await prisma.unit.findMany({
    where: { id: { in: userGroups.map(ug => ug.groupId) } },
  });

  const groups = userGroups.map(ug => {
    const group = groupIds.find(g => g.id === ug.groupId);
    return group ? { id: group.id, name: group.name, color: group.color, isLeader: ug.isLeader } : null;
  }).filter(Boolean);

  sendSuccess(res, { ...user, groups });
});

// POST /api/v1/staff
router.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = staffCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const { userCode, password, groupIds, hireDate, ...rest } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { userCode } });
  if (existing) {
    sendError(res, 409, 'CONFLICT', '入力内容に誤りがあります', [
      { field: 'userCode', message: '既に使用されています' },
    ]);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      userCode,
      passwordHash,
      hireDate: hireDate ? new Date(hireDate) : null,
      hourlyWage: rest.hourlyWage ?? null,
      monthlySalary: rest.monthlySalary ?? null,
      ...rest,
    },
    select: {
      id: true,
      userCode: true,
      role: true,
      lastName: true,
      firstName: true,
      employmentType: true,
      email: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (groupIds && groupIds.length > 0) {
    await prisma.userGroup.createMany({
      data: groupIds.map(gId => ({ userId: user.id, groupId: gId })),
      skipDuplicates: true,
    });
  }

  void writeAudit({ userId: req.user!.id, action: 'STAFF_CREATE', targetType: 'User', targetId: user.id, after: { userCode: user.userCode, role: user.role }, ...reqMeta(req) });
  sendSuccess(res, user, 201);
});

// PUT /api/v1/staff/:id
router.put('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const parsed = staffUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    sendError(res, 404, 'NOT_FOUND', 'スタッフが見つかりません');
    return;
  }

  const { userCode, password, groupIds, hireDate, ...rest } = parsed.data;

  if (userCode !== existing.userCode) {
    const conflict = await prisma.user.findUnique({ where: { userCode } });
    if (conflict) {
      sendError(res, 409, 'CONFLICT', '入力内容に誤りがあります', [
        { field: 'userCode', message: '既に使用されています' },
      ]);
      return;
    }
  }

  const updateData: Record<string, unknown> = {
    userCode,
    hireDate: hireDate ? new Date(hireDate) : null,
    hourlyWage: rest.hourlyWage ?? null,
    monthlySalary: rest.monthlySalary ?? null,
    ...rest,
  };

  if (password) {
    updateData.passwordHash = await bcrypt.hash(password, 12);
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: updateData,
    select: {
      id: true,
      userCode: true,
      role: true,
      lastName: true,
      firstName: true,
      employmentType: true,
      email: true,
      isActive: true,
      updatedAt: true,
    },
  });

  if (groupIds !== undefined) {
    await prisma.userGroup.deleteMany({ where: { userId: req.params.id } });
    if (groupIds.length > 0) {
      await prisma.userGroup.createMany({
        data: groupIds.map(gId => ({ userId: req.params.id, groupId: gId })),
        skipDuplicates: true,
      });
    }
  }

  const deactivated = existing.isActive && rest.isActive === false;
  void writeAudit({
    userId: req.user!.id,
    action: deactivated ? 'STAFF_DEACTIVATE' : 'STAFF_UPDATE',
    targetType: 'User',
    targetId: user.id,
    before: { isActive: existing.isActive, role: existing.role, employmentType: existing.employmentType },
    after: { isActive: user.isActive, role: user.role },
    ...reqMeta(req),
  });
  sendSuccess(res, user);
});

// DELETE /api/v1/staff/:id (soft delete)
router.delete('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    sendError(res, 404, 'NOT_FOUND', 'スタッフが見つかりません');
    return;
  }

  await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  void writeAudit({ userId: req.user!.id, action: 'STAFF_DEACTIVATE', targetType: 'User', targetId: req.params.id, before: { isActive: true }, after: { isActive: false }, ...reqMeta(req) });
  sendSuccess(res, { message: 'スタッフを無効化しました' });
});

export default router;
