import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** 法定の記録保存期間（労働基準法 第109条: 賃金台帳等は5年間保存）。 */
export const DATA_RETENTION_YEARS = 5;

/** 退職手続きチェックリストの既定項目。 */
export const DEFAULT_OFFBOARDING_ITEMS: { itemKey: string; label: string }[] = [
  { itemKey: 'RETURN_ID_CARD', label: '社員証・IDカードの返却' },
  { itemKey: 'RETURN_UNIFORM', label: '制服・貸与品の返却' },
  { itemKey: 'RETURN_KEY', label: '鍵・セキュリティカードの返却' },
  { itemKey: 'INSURANCE', label: '社会保険・雇用保険の資格喪失手続き' },
  { itemKey: 'SETTLE_PAYROLL', label: '最終給与の精算' },
  { itemKey: 'PAID_LEAVE', label: '有給休暇の消化・清算' },
  { itemKey: 'TAX', label: '源泉徴収票の発行・住民税手続き' },
];

export interface OnboardingResult {
  userId: string;
  eventId: string;
}

/** 入社処理: 在籍化し、入社イベントを記録する。 */
export async function processOnboarding(userId: string, eventDate: Date, createdBy: string, notes?: string | null): Promise<OnboardingResult> {
  await prisma.user.update({
    where: { id: userId },
    data: { isActive: true, hireDate: eventDate, retiredAt: null, dataRetentionUntil: null },
  });
  const event = await prisma.staffLifecycleEvent.create({
    data: { userId, eventType: 'ONBOARDING', eventDate, createdBy, notes: notes ?? null },
  });
  return { userId, eventId: event.id };
}

export interface OffboardingResult {
  userId: string;
  eventId: string;
  deletedFutureShifts: number;
  dataRetentionUntil: string;
  checklistCreated: number;
}

/**
 * 退職処理:
 * - 論理削除（isActive=false・retiredAt を設定。物理削除はしない ＝ 労基法の保存義務）
 * - dataRetentionUntil = 退職日 + 5年
 * - 退職日以降の未来シフトを削除
 * - 退職手続きチェックリストを生成
 * 過去の勤怠・給与データは保存義務のため一切削除しない。
 */
export async function processOffboarding(userId: string, retirementDate: Date, createdBy: string, notes?: string | null): Promise<OffboardingResult> {
  const retentionUntil = new Date(retirementDate);
  retentionUntil.setUTCFullYear(retentionUntil.getUTCFullYear() + DATA_RETENTION_YEARS);

  // 退職日以降の未来シフトを削除（過去の勤怠・給与は保持）
  const del = await prisma.shift.deleteMany({
    where: { userId, shiftDate: { gte: retirementDate } },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: false, retiredAt: retirementDate, dataRetentionUntil: retentionUntil },
  });

  const event = await prisma.staffLifecycleEvent.create({
    data: { userId, eventType: 'OFFBOARDING', eventDate: retirementDate, createdBy, notes: notes ?? null },
  });

  // 既存のチェックリストが無ければ既定項目を生成
  const existing = await prisma.offboardingChecklist.count({ where: { userId } });
  let checklistCreated = 0;
  if (existing === 0) {
    await prisma.offboardingChecklist.createMany({
      data: DEFAULT_OFFBOARDING_ITEMS.map(i => ({ userId, itemKey: i.itemKey, label: i.label })),
    });
    checklistCreated = DEFAULT_OFFBOARDING_ITEMS.length;
  }

  return {
    userId,
    eventId: event.id,
    deletedFutureShifts: del.count,
    dataRetentionUntil: retentionUntil.toISOString(),
    checklistCreated,
  };
}

export interface RetiredStaffRow {
  userId: string;
  userCode: string;
  name: string;
  nameKana: string;
  employmentType: string;
  hireDate: string | null;
  retiredAt: string | null;
  dataRetentionUntil: string | null;
  checklistTotal: number;
  checklistDone: number;
}

/** 退職者一覧（過去データは閲覧のみ）。 */
export async function listRetiredStaff(): Promise<RetiredStaffRow[]> {
  const users = await prisma.user.findMany({
    where: { isActive: false, retiredAt: { not: null } },
    orderBy: { retiredAt: 'desc' },
    select: {
      id: true, userCode: true, lastName: true, firstName: true, lastNameKana: true,
      firstNameKana: true, employmentType: true, hireDate: true, retiredAt: true, dataRetentionUntil: true,
    },
  });
  const checklists = await prisma.offboardingChecklist.findMany({
    where: { userId: { in: users.map(u => u.id) } },
  });
  return users.map(u => {
    const items = checklists.filter(c => c.userId === u.id);
    return {
      userId: u.id,
      userCode: u.userCode,
      name: `${u.lastName} ${u.firstName}`,
      nameKana: `${u.lastNameKana ?? ''} ${u.firstNameKana ?? ''}`.trim(),
      employmentType: u.employmentType,
      hireDate: u.hireDate ? u.hireDate.toISOString() : null,
      retiredAt: u.retiredAt ? u.retiredAt.toISOString() : null,
      dataRetentionUntil: u.dataRetentionUntil ? u.dataRetentionUntil.toISOString() : null,
      checklistTotal: items.length,
      checklistDone: items.filter(i => i.isDone).length,
    };
  });
}
