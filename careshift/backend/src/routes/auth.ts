import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { JwtPayload, UserRole } from '../types/index.js';
import { writeAudit, reqMeta } from '../utils/audit.js';

const router = Router();
const prisma = new PrismaClient();

const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes

const loginSchema = z.object({
  userCode: z.string().min(1, 'ユーザーIDは必須です'),
  password: z.string().min(1, 'パスワードは必須です'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '現在のパスワードは必須です'),
  newPassword: z
    .string()
    .min(8, 'パスワードは8文字以上にしてください')
    .regex(/[A-Z]/, '大文字を含める必要があります')
    .regex(/[a-z]/, '小文字を含める必要があります')
    .regex(/[0-9]/, '数字を含める必要があります'),
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const { userCode, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { userCode } });
  if (!user) {
    sendError(res, 401, 'INVALID_CREDENTIALS', 'ユーザーIDまたはパスワードが正しくありません');
    return;
  }

  if (!user.isActive) {
    sendError(res, 403, 'ACCOUNT_DISABLED', 'このアカウントは無効化されています');
    return;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remaining = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    sendError(res, 403, 'ACCOUNT_LOCKED', `アカウントがロックされています。${remaining}分後に再試行してください`);
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    void writeAudit({ userId: user.id, action: 'LOGIN_FAILED', targetType: 'User', targetId: user.id, ...reqMeta(req) });
    const newFailCount = user.failedLoginCount + 1;
    const shouldLock = newFailCount >= LOCK_THRESHOLD;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: newFailCount,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCK_DURATION_MS) : null,
      },
    });

    if (shouldLock) {
      sendError(res, 403, 'ACCOUNT_LOCKED', 'ログイン失敗が5回に達しました。アカウントを30分間ロックします');
    } else {
      const remaining = LOCK_THRESHOLD - newFailCount;
      sendError(res, 401, 'INVALID_CREDENTIALS', `ユーザーIDまたはパスワードが正しくありません（あと${remaining}回失敗するとロックされます）`);
    }
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  const payload: JwtPayload = {
    userId: user.id,
    userCode: user.userCode,
    role: user.role as UserRole,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  });

  void writeAudit({ userId: user.id, action: 'LOGIN_SUCCESS', targetType: 'User', targetId: user.id, ...reqMeta(req) });

  sendSuccess(res, {
    id: user.id,
    userCode: user.userCode,
    role: user.role,
    lastName: user.lastName,
    firstName: user.firstName,
    email: user.email,
  });
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, (req: Request, res: Response): void => {
  void writeAudit({ userId: req.user!.id, action: 'LOGOUT', ...reqMeta(req) });
  res.clearCookie('token');
  sendSuccess(res, { message: 'ログアウトしました' });
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      userCode: true,
      role: true,
      lastName: true,
      firstName: true,
      lastNameKana: true,
      firstNameKana: true,
      email: true,
      phone: true,
      employmentType: true,
      hireDate: true,
      isActive: true,
    },
  });

  if (!user) {
    sendError(res, 404, 'NOT_FOUND', 'ユーザーが見つかりません');
    return;
  }

  sendSuccess(res, user);
});

// POST /api/v1/auth/change-password
router.post('/change-password', authenticate, async (req: Request, res: Response): Promise<void> => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります',
      parsed.error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    );
    return;
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    sendError(res, 404, 'NOT_FOUND', 'ユーザーが見つかりません');
    return;
  }

  const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!passwordMatch) {
    sendError(res, 401, 'INVALID_PASSWORD', '現在のパスワードが正しくありません');
    return;
  }

  // New password must differ from the current one
  const sameAsCurrent = await bcrypt.compare(newPassword, user.passwordHash);
  if (sameAsCurrent) {
    sendError(res, 400, 'VALIDATION_ERROR', '入力内容に誤りがあります', [
      { field: 'newPassword', message: '現在のパスワードと異なるものを設定してください' },
    ]);
    return;
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  res.clearCookie('token');
  sendSuccess(res, { message: 'パスワードを変更しました。再度ログインしてください' });
});

export default router;
