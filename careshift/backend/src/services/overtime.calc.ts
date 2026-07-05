// 36協定・残業アラートの純粋ロジック（DB非依存）。

export type AlertLevel = 'NORMAL' | 'WARNING' | 'EXCEEDED';

/**
 * 残業時間に対するアラートレベルを判定する。
 * EXCEEDED: 上限到達・超過 / WARNING: 閾値以上・上限未満 / NORMAL: それ未満
 */
export function judgeAlertLevel(hours: number, limit: number, threshold: number): AlertLevel {
  if (limit <= 0) return 'NORMAL';
  if (hours >= limit) return 'EXCEEDED';
  if (hours >= limit * threshold) return 'WARNING';
  return 'NORMAL';
}

/** 会計年度（4月起算）。 */
export function fiscalYearOf(year: number, month: number): number {
  return month >= 4 ? year : year - 1;
}

/** 会計年度に含まれる (year, month) の一覧（4月〜対象月まで）。 */
export function fiscalMonthsUpTo(year: number, month: number): { year: number; month: number }[] {
  const fy = fiscalYearOf(year, month);
  const out: { year: number; month: number }[] = [];
  let y = fy;
  let m = 4;
  for (;;) {
    out.push({ year: y, month: m });
    if (y === year && m === month) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    if (y > year || (y === year && m > month)) break;
  }
  return out;
}
