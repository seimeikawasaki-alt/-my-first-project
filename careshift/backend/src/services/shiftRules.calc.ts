/**
 * シフト自動生成のルール判定のうち、DBに依存しない純粋ロジックを切り出したもの。
 * （月またぎの連続日数の引き継ぎ・夜勤後休息の投影など）ユニットテスト可能にするため。
 */

/** UTC日付を `YYYY-MM-DD` キーに変換。 */
export function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** UTCで n 日進めた新しい Date を返す。 */
export function addUTCDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}

/**
 * 指定日 endDate で終わる「連続日数」を数える。
 * dateSet に endDate が含まれていなければ 0（連続は途切れている）。
 * 例: 6/28,6/29,6/30 が含まれ endDate=6/30 → 3
 */
export function consecutiveEndingAt(dateSet: Set<string>, endDate: Date): number {
  let count = 0;
  let cur = endDate;
  while (dateSet.has(dateKey(cur))) {
    count++;
    cur = addUTCDays(cur, -1);
  }
  return count;
}

export interface NightRestProjection {
  /** 夜勤のみ許可される日（夜勤日の翌日） */
  nightOnly: Set<string>;
  /** 完全に勤務不可の日（休息ブロックの2日目以降） */
  blocked: Set<string>;
}

/**
 * 夜勤日の休息ブロックを、対象月 [monthStart, monthEnd) の範囲内に投影する。
 * 前月末の夜勤が当月初日に及ぶケース（月またぎ）を扱うために使う。
 * blockDays=1 の場合は翌日を nightOnly にするのみ。2日目以降は blocked。
 */
export function projectNightRest(
  nightDateKeys: Iterable<string>,
  monthStart: Date,
  monthEnd: Date,
  blockDays: number,
): NightRestProjection {
  const nightOnly = new Set<string>();
  const blocked = new Set<string>();
  for (const nk of nightDateKeys) {
    const nd = new Date(nk + 'T00:00:00Z');
    for (let r = 1; r <= blockDays; r++) {
      const restDate = addUTCDays(nd, r);
      if (restDate >= monthStart && restDate < monthEnd) {
        const key = dateKey(restDate);
        if (r === 1) nightOnly.add(key);
        else blocked.add(key);
      }
    }
  }
  return { nightOnly, blocked };
}
