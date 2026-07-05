import { describe, it, expect } from 'vitest';
import { judgeAlertLevel, fiscalYearOf, fiscalMonthsUpTo } from './overtime.calc.js';

describe('judgeAlertLevel', () => {
  it('NORMAL: 閾値未満', () => {
    expect(judgeAlertLevel(30, 45, 0.8)).toBe('NORMAL'); // 45*0.8=36
  });
  it('WARNING: 閾値以上・上限未満', () => {
    expect(judgeAlertLevel(38, 45, 0.8)).toBe('WARNING');
    expect(judgeAlertLevel(36, 45, 0.8)).toBe('WARNING'); // ちょうど閾値
  });
  it('EXCEEDED: 上限到達・超過', () => {
    expect(judgeAlertLevel(45, 45, 0.8)).toBe('EXCEEDED');
    expect(judgeAlertLevel(47, 45, 0.8)).toBe('EXCEEDED');
  });
});

describe('fiscalYearOf', () => {
  it('4月以降は当年、3月以前は前年', () => {
    expect(fiscalYearOf(2026, 6)).toBe(2026);
    expect(fiscalYearOf(2026, 3)).toBe(2025);
    expect(fiscalYearOf(2026, 4)).toBe(2026);
  });
});

describe('fiscalMonthsUpTo', () => {
  it('年度4月から対象月まで', () => {
    expect(fiscalMonthsUpTo(2026, 6)).toEqual([
      { year: 2026, month: 4 }, { year: 2026, month: 5 }, { year: 2026, month: 6 },
    ]);
  });
  it('年をまたぐ（1月）', () => {
    const r = fiscalMonthsUpTo(2027, 1);
    expect(r[0]).toEqual({ year: 2026, month: 4 });
    expect(r[r.length - 1]).toEqual({ year: 2027, month: 1 });
    expect(r.length).toBe(10);
  });
});
