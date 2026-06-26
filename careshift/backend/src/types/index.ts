export type UserRole = 'ADMIN' | 'GROUP_LEADER' | 'STAFF';

export interface JwtPayload {
  userId: string;
  userCode: string;
  role: UserRole;
}

export interface AuthUser {
  id: string;
  userCode: string;
  role: UserRole;
  lastName: string;
  firstName: string;
  email: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
