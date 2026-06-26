import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload, UserRole, AuthUser } from '../types/index.js';
import { sendError } from '../utils/response.js';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token as string | undefined;

  if (!token) {
    sendError(res, 401, 'UNAUTHORIZED', '認証が必要です');
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    req.user = {
      id: payload.userId,
      userCode: payload.userCode,
      role: payload.role,
      lastName: '',
      firstName: '',
      email: null,
    } as AuthUser;
    next();
  } catch {
    sendError(res, 401, 'TOKEN_INVALID', 'トークンが無効または期限切れです');
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHORIZED', '認証が必要です');
      return;
    }
    if (!roles.includes(req.user.role)) {
      sendError(res, 403, 'FORBIDDEN', 'このリソースへのアクセス権限がありません');
      return;
    }
    next();
  };
}
