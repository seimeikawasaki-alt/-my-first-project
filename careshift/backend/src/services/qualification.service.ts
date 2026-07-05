import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 有効期限の判定基準（この日数以内に切れる資格は「まもなく期限切れ」とする） */
export const EXPIRY_WARNING_DAYS = 60;

export type ExpiryStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'NO_EXPIRY';

export interface StaffQualificationRow {
  id: string;
  userId: string;
  userName: string;
  userNameKana: string;
  qualificationId: string;
  qualificationName: string;
  category: string;
  acquiredDate: string;
  expiryDate: string | null;
  certificateNo: string | null;
  notes: string | null;
  expiryStatus: ExpiryStatus;
  daysUntilExpiry: number | null;
}

/** 有効期限から現在のステータスを判定する。 */
export function judgeExpiryStatus(expiryDate: Date | null, now = new Date()): { status: ExpiryStatus; daysUntilExpiry: number | null } {
  if (!expiryDate) return { status: 'NO_EXPIRY', daysUntilExpiry: null };
  const msPerDay = 24 * 60 * 60 * 1000;
  const days = Math.floor((expiryDate.getTime() - now.getTime()) / msPerDay);
  if (days < 0) return { status: 'EXPIRED', daysUntilExpiry: days };
  if (days <= EXPIRY_WARNING_DAYS) return { status: 'EXPIRING_SOON', daysUntilExpiry: days };
  return { status: 'VALID', daysUntilExpiry: days };
}

/**
 * 取得日と有効期間（月）から有効期限を計算する。
 * validMonths が null（無期限）の場合は null を返す。
 */
export function computeExpiryDate(acquiredDate: Date, validMonths: number | null): Date | null {
  if (validMonths == null) return null;
  const d = new Date(acquiredDate);
  d.setUTCMonth(d.getUTCMonth() + validMonths);
  return d;
}

/** スタッフの資格・研修取得記録を、氏名・資格名・期限ステータス付きで返す。 */
export async function listStaffQualifications(filter?: { userId?: string }): Promise<StaffQualificationRow[]> {
  const records = await prisma.staffQualification.findMany({
    where: filter?.userId ? { userId: filter.userId } : undefined,
    orderBy: { acquiredDate: 'desc' },
  });
  const userIds = [...new Set(records.map(r => r.userId))];
  const qualIds = [...new Set(records.map(r => r.qualificationId))];
  const [users, quals] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, lastName: true, firstName: true, lastNameKana: true, firstNameKana: true },
    }),
    prisma.qualification.findMany({ where: { id: { in: qualIds } } }),
  ]);
  const userMap = new Map(users.map(u => [u.id, u]));
  const qualMap = new Map(quals.map(q => [q.id, q]));
  const now = new Date();

  return records.map(r => {
    const u = userMap.get(r.userId);
    const q = qualMap.get(r.qualificationId);
    const { status, daysUntilExpiry } = judgeExpiryStatus(r.expiryDate, now);
    return {
      id: r.id,
      userId: r.userId,
      userName: u ? `${u.lastName} ${u.firstName}` : '',
      userNameKana: u ? `${u.lastNameKana ?? ''} ${u.firstNameKana ?? ''}`.trim() : '',
      qualificationId: r.qualificationId,
      qualificationName: q?.name ?? '(削除済み)',
      category: q?.category ?? 'QUALIFICATION',
      acquiredDate: r.acquiredDate.toISOString(),
      expiryDate: r.expiryDate ? r.expiryDate.toISOString() : null,
      certificateNo: r.certificateNo,
      notes: r.notes,
      expiryStatus: status,
      daysUntilExpiry,
    };
  });
}

/** 期限切れ・まもなく期限切れの資格一覧（ダッシュボード警告用）。在籍者のみ対象。 */
export async function listExpiringQualifications(): Promise<StaffQualificationRow[]> {
  const rows = await listStaffQualifications();
  const activeUsers = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  const activeSet = new Set(activeUsers.map(u => u.id));
  return rows
    .filter(r => activeSet.has(r.userId) && (r.expiryStatus === 'EXPIRED' || r.expiryStatus === 'EXPIRING_SOON'))
    .sort((a, b) => (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0));
}
