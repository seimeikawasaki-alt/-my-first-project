import { describe, it, expect } from 'vitest';
import { dateKey, addUTCDays, consecutiveEndingAt, projectNightRest } from './shiftRules.calc.js';

const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe('dateKey / addUTCDays', () => {
  it('UTC日付を YYYY-MM-DD にする', () => {
    expect(dateKey(D(2026, 7, 1))).toBe('2026-07-01');
    expect(dateKey(D(2026, 12, 31))).toBe('2026-12-31');
  });
  it('日付をまたいで加減算できる（月境界）', () => {
    expect(dateKey(addUTCDays(D(2026, 7, 1), -1))).toBe('2026-06-30');
    expect(dateKey(addUTCDays(D(2025, 12, 31), 1))).toBe('2026-01-01');
  });
});

describe('consecutiveEndingAt（連続日数の引き継ぎ）', () => {
  it('前月末まで連続勤務していれば日数を数える', () => {
    const worked = new Set(['2026-06-28', '2026-06-29', '2026-06-30']);
    expect(consecutiveEndingAt(worked, D(2026, 6, 30))).toBe(3);
  });
  it('前月末に休んでいれば0（連続は途切れる）', () => {
    const worked = new Set(['2026-06-27', '2026-06-28', '2026-06-29']);
    expect(consecutiveEndingAt(worked, D(2026, 6, 30))).toBe(0);
  });
  it('連続夜勤も同様に数えられる', () => {
    const nights = new Set(['2026-06-29', '2026-06-30']);
    expect(consecutiveEndingAt(nights, D(2026, 6, 30))).toBe(2);
  });
});

describe('projectNightRest（夜勤後休息の当月投影）', () => {
  const monthStart = D(2026, 7, 1);
  const monthEnd = D(2026, 8, 1);

  it('前月末が夜勤なら当月1日を夜勤のみ許可にする（blockDays=1）', () => {
    const { nightOnly, blocked } = projectNightRest(new Set(['2026-06-30']), monthStart, monthEnd, 1);
    expect([...nightOnly]).toEqual(['2026-07-01']);
    expect([...blocked]).toEqual([]);
  });

  it('blockDays=2 では翌日は夜勤のみ・翌々日は完全ブロック', () => {
    const { nightOnly, blocked } = projectNightRest(new Set(['2026-06-30']), monthStart, monthEnd, 2);
    expect(nightOnly.has('2026-07-01')).toBe(true);
    expect(blocked.has('2026-07-02')).toBe(true);
  });

  it('前月内に収まる休息日は投影しない（当月範囲外は無視）', () => {
    // 6/28 の夜勤は 6/29 が休息 → 当月外なので投影されない
    const { nightOnly, blocked } = projectNightRest(new Set(['2026-06-28']), monthStart, monthEnd, 1);
    expect(nightOnly.size).toBe(0);
    expect(blocked.size).toBe(0);
  });
});
