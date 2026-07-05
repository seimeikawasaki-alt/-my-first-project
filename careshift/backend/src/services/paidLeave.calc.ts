// 有給休暇の法定計算（労働基準法第39条）— DB非依存の純粋関数。単体テスト対象。

// 通常（週5日以上 or 週30時間以上）の付与日数テーブル
export const FULL_TIME_GRANT_DAYS = [10, 11, 12, 14, 16, 18, 20];

// 勤続年数のマイルストーン（月）: 6ヶ月, 1年6ヶ月, ... 6年6ヶ月以上
export const MILESTONE_MONTHS = [6, 18, 30, 42, 54, 66, 78];

// 比例付与テーブル（週所定労働日数 → 各マイルストーンの付与日数）
// 労基法施行規則第24条の3に基づく
export const PROPORTIONAL_GRANT_DAYS: Record<number, number[]> = {
  4: [7, 8, 9, 10, 12, 13, 15], // 週4日（年169〜216日）
  3: [5, 6, 6, 8, 9, 10, 11],   // 週3日（年121〜168日）
  2: [3, 4, 4, 5, 6, 6, 7],     // 週2日（年73〜120日）
  1: [1, 2, 2, 2, 3, 3, 3],     // 週1日（年48〜72日）
};

/** 満月数（hireDate から asOf までの丸めた月数）。 */
export function tenureMonths(hireDate: Date, asOf: Date): number {
  let months = (asOf.getUTCFullYear() - hireDate.getUTCFullYear()) * 12
    + (asOf.getUTCMonth() - hireDate.getUTCMonth());
  if (asOf.getUTCDate() < hireDate.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** マイルストーンの段階インデックス（0〜6）。6ヶ月未満なら -1。 */
export function tierIndex(months: number): number {
  let idx = -1;
  for (let i = 0; i < MILESTONE_MONTHS.length; i++) {
    if (months >= MILESTONE_MONTHS[i]) idx = i;
  }
  return idx;
}

/**
 * 勤続年数と週所定労働日数から、その時点で付与すべき有給日数を返す。
 * 週5日以上（またはフルタイム相当）は通常テーブル、週4日以下は比例付与。
 * 6ヶ月未満は 0。
 */
export function calculateGrantDays(hireDate: Date, weeklyWorkDays: number, asOf: Date = new Date()): number {
  const idx = tierIndex(tenureMonths(hireDate, asOf));
  if (idx < 0) return 0;
  if (weeklyWorkDays >= 5) return FULL_TIME_GRANT_DAYS[idx];
  const table = PROPORTIONAL_GRANT_DAYS[weeklyWorkDays];
  if (!table) return FULL_TIME_GRANT_DAYS[idx]; // 不明時はフルタイム扱い（安全側）
  return table[idx];
}

export type ComplianceRisk = 'SAFE' | 'WARNING' | 'CRITICAL';

export interface ComplianceStatus {
  required: boolean;
  usedDays: number;
  remainingRequired: number;
  daysUntilDeadline: number;
  riskLevel: ComplianceRisk;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 年5日取得義務の判定（年10日以上付与された者が対象）。
 * 基準日（grantDate）から1年以内に5日取得が必要。
 */
export function checkFiveDaysCompliance(
  grantedDays: number,
  usedDays: number,
  grantDate: Date,
  asOf: Date = new Date(),
): ComplianceStatus {
  const required = grantedDays >= 10;
  const deadline = new Date(grantDate.getTime());
  deadline.setUTCFullYear(deadline.getUTCFullYear() + 1);
  const daysUntilDeadline = Math.ceil((deadline.getTime() - asOf.getTime()) / MS_PER_DAY);
  const remainingRequired = Math.max(0, 5 - usedDays);

  let riskLevel: ComplianceRisk = 'SAFE';
  if (required && remainingRequired > 0) {
    if (daysUntilDeadline <= 90) riskLevel = 'CRITICAL';       // 期限3ヶ月未満で未達成
    else if (daysUntilDeadline <= 180) riskLevel = 'WARNING';  // 期限6ヶ月未満で未達成
  }

  return { required, usedDays, remainingRequired, daysUntilDeadline, riskLevel };
}
