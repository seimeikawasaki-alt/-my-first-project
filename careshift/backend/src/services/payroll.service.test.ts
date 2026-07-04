import { describe, it, expect } from 'vitest';
import {
  summarizeAttendance,
  calcPayrollItems,
  minutesToHours2,
  floorYen,
  type SalaryItemLike,
  type AttendanceLike,
  type UserWage,
} from './payroll.calc.js';
import { calcLateNightMinutes, calcWorkMinutes, shiftBaseMinutes } from '../utils/workTime.js';

// Default AUTO salary items (mirrors the seed: overtime beyond base, night allowance).
const ITEMS: SalaryItemLike[] = [
  { id: 'i-basic', code: 'BASIC', name: '基本給', itemType: 'INCOME', calcType: 'AUTO', calcFormula: null, sortOrder: 1 },
  { id: 'i-ot', code: 'OVERTIME', name: '残業手当', itemType: 'INCOME', calcType: 'AUTO', calcFormula: null, sortOrder: 2 },
  { id: 'i-ln', code: 'LATE_NIGHT', name: '深夜手当', itemType: 'INCOME', calcType: 'AUTO', calcFormula: null, sortOrder: 3 },
  { id: 'i-hol', code: 'HOLIDAY', name: '休日出勤手当', itemType: 'INCOME', calcType: 'AUTO', calcFormula: null, sortOrder: 4 },
  { id: 'i-night', code: 'NIGHT_ALLOWANCE', name: '夜勤手当', itemType: 'INCOME', calcType: 'AUTO', calcFormula: '8000', sortOrder: 5 },
  { id: 'i-ei', code: 'EMPLOYMENT_INSURANCE', name: '雇用保険料', itemType: 'DEDUCTION', calcType: 'AUTO', calcFormula: '0.006', sortOrder: 10 },
];

const amountOf = (details: ReturnType<typeof calcPayrollItems>, code: string) =>
  details.find(d => d.code === code)?.amount ?? null;

function row(workMinutes: number, opts: Partial<AttendanceLike> = {}): AttendanceLike {
  return {
    workMinutes,
    overtimeMinutes: opts.overtimeMinutes ?? 0,
    lateNightMinutes: opts.lateNightMinutes ?? 0,
    isHolidayWork: opts.isHolidayWork ?? false,
    isNightShift: opts.isNightShift ?? false,
  };
}

describe('summarizeAttendance (per-shift overtime beyond base)', () => {
  it('通常勤務: 残業0なら全て通常時間', () => {
    const s = summarizeAttendance([row(480), row(480), row(480), row(480)]); // 4日 × 8h
    expect(s.workDays).toBe(4);
    expect(s.regularMinutes).toBe(1920);
    expect(s.overtimeMinutes).toBe(0);
  });

  it('ベース超過分が残業になる', () => {
    // 10h勤務(600) のうち 2h(120) がベース超過 → 残業
    const s = summarizeAttendance([row(600, { overtimeMinutes: 120 }), row(480)]);
    expect(s.overtimeMinutes).toBe(120);
    expect(s.regularMinutes).toBe(480 + 480); // (600-120) + 480
    expect(s.totalWorkMinutes).toBe(1080);
  });

  it('夜勤回数をカウントする', () => {
    const s = summarizeAttendance([
      row(480, { isNightShift: true, lateNightMinutes: 420 }),
      row(480, { isNightShift: true, lateNightMinutes: 420 }),
      row(480),
    ]);
    expect(s.nightShiftCount).toBe(2);
    expect(s.lateNightMinutes).toBe(840);
  });

  it('休日出勤は残業判定から除外', () => {
    const s = summarizeAttendance([row(600, { overtimeMinutes: 120, isHolidayWork: true })]);
    expect(s.holidayWorkMinutes).toBe(600);
    expect(s.overtimeMinutes).toBe(0);
    expect(s.regularMinutes).toBe(0);
  });
});

describe('shiftBaseMinutes / 日跨ぎ', () => {
  it('日勤 08:00–17:00 休憩60 → 480分', () => {
    expect(shiftBaseMinutes({ startTime: '08:00', endTime: '17:00', breakMinutes: 60 })).toBe(480);
  });
  it('夜勤 22:00–07:00 休憩60 → 480分（日跨ぎ）', () => {
    expect(shiftBaseMinutes({ startTime: '22:00', endTime: '07:00', breakMinutes: 60, isOvernight: true })).toBe(480);
  });
});

describe('calcLateNightMinutes (workTime)', () => {
  it('深夜帯 22:00〜翌05:00 = 7時間', () => {
    expect(calcLateNightMinutes(new Date(2024, 0, 15, 22, 0, 0), new Date(2024, 0, 16, 5, 0, 0))).toBe(7 * 60);
  });
  it('月またぎ夜勤 1/31 22:00 → 2/1 07:00', () => {
    const start = new Date(2024, 0, 31, 22, 0, 0);
    const end = new Date(2024, 1, 1, 7, 0, 0);
    expect(calcLateNightMinutes(start, end)).toBe(7 * 60);
    expect(calcWorkMinutes(start, end)).toBe(9 * 60);
  });
});

describe('calcPayrollItems — 時給制', () => {
  const user: UserWage = { hourlyWage: 1200, monthlySalary: null };

  it('通常の時給計算 + 雇用保険', () => {
    const s = summarizeAttendance([row(480), row(480), row(480), row(480)]); // 32h
    const d = calcPayrollItems(user, s, ITEMS);
    expect(amountOf(d, 'BASIC')).toBe(1200 * 32);   // 38,400
    expect(amountOf(d, 'OVERTIME')).toBe(0);
    expect(amountOf(d, 'EMPLOYMENT_INSURANCE')).toBe(floorYen(38400 * 0.006)); // 230
  });

  it('残業手当（ベース超過2h）', () => {
    const s = summarizeAttendance([row(600, { overtimeMinutes: 120 })]);
    const d = calcPayrollItems(user, s, ITEMS);
    expect(amountOf(d, 'BASIC')).toBe(1200 * 8);              // 通常8h = 9,600
    expect(amountOf(d, 'OVERTIME')).toBe(Math.floor(1200 * 1.25 * 2)); // 3,000
  });

  it('深夜手当 + 夜勤手当（1回¥8,000）', () => {
    const s = summarizeAttendance([row(480, { isNightShift: true, lateNightMinutes: 420 })]);
    const d = calcPayrollItems(user, s, ITEMS);
    expect(amountOf(d, 'LATE_NIGHT')).toBe(Math.floor(1200 * 0.25 * 7)); // 2,100
    expect(amountOf(d, 'NIGHT_ALLOWANCE')).toBe(8000);
  });

  it('夜勤手当は回数×単価（13回）', () => {
    const rows = Array.from({ length: 13 }, () => row(480, { isNightShift: true, lateNightMinutes: 420 }));
    const s = summarizeAttendance(rows);
    const d = calcPayrollItems(user, s, ITEMS);
    expect(amountOf(d, 'NIGHT_ALLOWANCE')).toBe(13 * 8000); // 104,000
  });

  it('休日出勤手当（1.35倍）', () => {
    const s = summarizeAttendance([row(480, { isHolidayWork: true })]);
    const d = calcPayrollItems(user, s, ITEMS);
    expect(amountOf(d, 'HOLIDAY')).toBe(Math.floor(1200 * 1.35 * 8)); // 12,960
  });

  it('1円未満切り捨て', () => {
    const u: UserWage = { hourlyWage: 1017, monthlySalary: null };
    const s = summarizeAttendance([row(210)]); // 3.5h
    const d = calcPayrollItems(u, s, ITEMS);
    expect(minutesToHours2(210)).toBe(3.5);
    expect(amountOf(d, 'BASIC')).toBe(3559); // 1017 × 3.5 = 3559.5 → 3559
  });
});

describe('calcPayrollItems — 月給制', () => {
  const user: UserWage = { hourlyWage: null, monthlySalary: 240000 };

  it('基本給は固定・残業は (月給÷160h) 基準', () => {
    const s = summarizeAttendance([row(600, { overtimeMinutes: 120 })]); // 2h超過
    const d = calcPayrollItems(user, s, ITEMS);
    expect(amountOf(d, 'BASIC')).toBe(240000);
    // hourly = 240000/160 = 1500 ; OT = 1500 × 1.25 × 2 = 3750
    expect(amountOf(d, 'OVERTIME')).toBe(Math.floor(1500 * 1.25 * 2));
  });
});

describe('calcPayrollItems — MANUAL preservation', () => {
  it('再計算時に手動入力額を保持', () => {
    const items: SalaryItemLike[] = [
      ...ITEMS,
      { id: 'i-tax', code: 'INCOME_TAX', name: '所得税', itemType: 'DEDUCTION', calcType: 'MANUAL', calcFormula: null, sortOrder: 11 },
    ];
    const user: UserWage = { hourlyWage: 1200, monthlySalary: null };
    const s = summarizeAttendance([row(480), row(480), row(480), row(480)]);
    const d = calcPayrollItems(user, s, items, new Map([['i-tax', 3200]]));
    expect(amountOf(d, 'INCOME_TAX')).toBe(3200);
  });
});
