import { describe, it, expect } from 'vitest';
import {
  calculateGrantDays,
  tenureMonths,
  tierIndex,
  checkFiveDaysCompliance,
} from './paidLeave.calc.js';

describe('tenureMonths / tierIndex', () => {
  it('丸めた月数を返す', () => {
    expect(tenureMonths(new Date('2024-01-15'), new Date('2024-07-15'))).toBe(6);
    expect(tenureMonths(new Date('2024-01-15'), new Date('2024-07-14'))).toBe(5); // 日未達
    expect(tenureMonths(new Date('2020-04-01'), new Date('2026-10-01'))).toBe(78);
  });
  it('段階インデックス', () => {
    expect(tierIndex(5)).toBe(-1);
    expect(tierIndex(6)).toBe(0);
    expect(tierIndex(18)).toBe(1);
    expect(tierIndex(78)).toBe(6);
    expect(tierIndex(200)).toBe(6);
  });
});

describe('calculateGrantDays — 通常（週5日）', () => {
  const hire = new Date('2020-01-01');
  it('6ヶ月で10日', () => {
    expect(calculateGrantDays(hire, 5, new Date('2020-07-01'))).toBe(10);
  });
  it('1年6ヶ月で11日', () => {
    expect(calculateGrantDays(hire, 5, new Date('2021-07-01'))).toBe(11);
  });
  it('6年6ヶ月以上で20日（上限）', () => {
    expect(calculateGrantDays(hire, 5, new Date('2026-07-01'))).toBe(20);
    expect(calculateGrantDays(hire, 5, new Date('2030-07-01'))).toBe(20);
  });
  it('6ヶ月未満は0', () => {
    expect(calculateGrantDays(hire, 5, new Date('2020-05-01'))).toBe(0);
  });
});

describe('calculateGrantDays — 比例付与（パート）', () => {
  const hire = new Date('2020-01-01');
  it('週4日: 6ヶ月で7日 / 6.5年で15日', () => {
    expect(calculateGrantDays(hire, 4, new Date('2020-07-01'))).toBe(7);
    expect(calculateGrantDays(hire, 4, new Date('2026-07-01'))).toBe(15);
  });
  it('週3日: 6ヶ月で5日', () => {
    expect(calculateGrantDays(hire, 3, new Date('2020-07-01'))).toBe(5);
  });
  it('週2日: 3.5年で5日', () => {
    expect(calculateGrantDays(hire, 2, new Date('2023-07-01'))).toBe(5);
  });
  it('週1日: 6ヶ月で1日', () => {
    expect(calculateGrantDays(hire, 1, new Date('2020-07-01'))).toBe(1);
  });
});

describe('checkFiveDaysCompliance — 年5日取得義務', () => {
  const grant = new Date('2026-04-01');
  it('10日以上付与で義務対象', () => {
    const s = checkFiveDaysCompliance(12, 3, grant, new Date('2026-06-01'));
    expect(s.required).toBe(true);
    expect(s.remainingRequired).toBe(2);
  });
  it('10日未満は義務対象外', () => {
    const s = checkFiveDaysCompliance(8, 0, grant, new Date('2026-06-01'));
    expect(s.required).toBe(false);
    expect(s.riskLevel).toBe('SAFE');
  });
  it('5日取得済みは SAFE', () => {
    const s = checkFiveDaysCompliance(12, 5, grant, new Date('2027-01-01'));
    expect(s.remainingRequired).toBe(0);
    expect(s.riskLevel).toBe('SAFE');
  });
  it('期限3ヶ月未満で未達成は CRITICAL', () => {
    // deadline = 2027-04-01, asOf = 2027-02-01 → 約59日
    const s = checkFiveDaysCompliance(12, 2, grant, new Date('2027-02-01'));
    expect(s.riskLevel).toBe('CRITICAL');
  });
  it('期限6ヶ月未満で未達成は WARNING', () => {
    // asOf = 2026-11-15 → deadline まで約137日
    const s = checkFiveDaysCompliance(12, 2, grant, new Date('2026-11-15'));
    expect(s.riskLevel).toBe('WARNING');
  });
});
