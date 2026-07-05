import { Request } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type AuditAction =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT'
  | 'STAFF_CREATE' | 'STAFF_UPDATE' | 'STAFF_DEACTIVATE'
  | 'ATTENDANCE_MODIFY'
  | 'PAYROLL_CALCULATE' | 'PAYROLL_CONFIRM'
  | 'SHIFT_PUBLISH' | 'SHIFT_AUTO_GENERATE'
  | 'PERMISSION_DENIED';

export interface AuditInput {
  userId: string;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/** Extract client metadata from the request. */
export function reqMeta(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: req.ip ?? req.socket?.remoteAddress ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
  };
}

/**
 * Append an audit record. Audit logs are write-once (no update/delete API) so
 * they form a tamper-evident trail. Never throws — logging failures must not
 * break the underlying operation.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        beforeValue: input.before !== undefined ? JSON.stringify(input.before) : null,
        afterValue: input.after !== undefined ? JSON.stringify(input.after) : null,
        ipAddress: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (e) {
    console.error('[audit] failed to record', input.action, e);
  }
}

/** Convenience: build an AuditInput merged with request metadata. */
export function auditFromReq(req: Request, input: Omit<AuditInput, 'ip' | 'userAgent'>): AuditInput {
  return { ...input, ...reqMeta(req) };
}
