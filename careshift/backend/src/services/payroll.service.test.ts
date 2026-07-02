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
import { calcLateNightMinutes, calcWorkMinutes } from '../utils/workTime.js';

// Minimal salary-item master mirroring the default AUTO items.
const ITEMS: SalaryItemLike[] = [
  { id: 'i-basic', code: 'BASIC', name: '基本給', itemType: 'INCOME', calcType: 'AUTO', calcFormula: null, sortOrder: 1 },
  { id: 'i-ot', code: 'OVERTIME', name: '残業手当', itemType: 'INCOME', calcType: 'AUTO', calcFormula: null, sortOrder: 2 },
  { id: 'i-ln', code: 'LATE_NIGHT', name: '深夜手当', itemType: 'INCOME', calcType: 'AUTO', calcFormula: null, sortOrder: 3 },
  { id: 'i-hol', code: 'HOLIDAY', name: '休日出勤手当', itemType: 'INCOME', calcType: 'AUTO', calcFormula: null, sortOrder: 4 },
  { id: 'i-ei', code: 'EMPLOYMENT_INSURANCE', name: '雇用保険料', itemType: 'DEDUCTION', calcType: 'AUTO', calcFormula: '0.006', sortOrder: 9 },
];

const amountOf = (details: ReturnType<typeof calcPayrollItems>, code: string) =>
  details.find(d => d.code === code)?.amount ?? null;

// Build attendance rows totalling a number of weekday minutes across N days.
function weekdayRows(totalMinutes: number, days = 1, lateNight = 0): AttendanceLike[] {
  const per = Math.floor(totalMinutes / days);
  const rows: AttendanceLike[] = [];
  let remaining = totalMinutes;
  for (let i = 0; i < days; i++) {
    const wm = i === days - 1 ? remaining : per;
    remaining -= wm;
    rows.push({ workMinutes: wm, lateNightMinutes: i === 0 ? lateNight : 0, isHolidayWork: false });
  }
  return rows;
}

describe('summarizeAttendance', () => {
  it('通常の時給計算: 40h以下は残業なし', () => {
    const s = summarizeAttendance(weekdayRows(32 * 60, 4)); // 32h over 4 days
    expect(s.workDays).toBe(4);
    expect(s.regularMinutes).toBe(32 * 60);
    expect(s.overtimeMinutes).toBe(0);
    expect(s.totalWorkMinutes).toBe(32 * 60);
  });

  it('残業が発生するケース（月40時間超）', () => {
    const s = summarizeAttendance(weekdayRows(45 * 60, 6)); // 45h
    expect(s.regularMinutes).toBe(40 * 60); // capped at 40h
    expect(s.overtimeMinutes).toBe(5 * 60); // 5h overtime
  });

  it('休日出勤は残業40h判定から除外される', () => {
    const rows: AttendanceLike[] = [
      { workMinutes: 40 * 60, lateNightMinutes: 0, isHolidayWork: false },
      { workMinutes: 8 * 60, lateNightMinutes: 0, isHolidayWork: true },
    ];
    const s = summarizeAttendance(rows);
    expect(s.overtimeMinutes).toBe(0); // weekday is exactly 40h
    expect(s.holidayWorkMinutes).toBe(8 * 60);
    expect(s.totalWorkMinutes).toBe(48 * 60);
  });
});

describe('calcLateNightMinutes (workTime util)', () => {
  it('深夜帯をまたぐケース（22:00〜翌05:00）= 7時間', () => {
    const start = new Date(2024, 0, 15, 22, 0, 0); // local 22:00
    const end = new Date(2024, 0, 16, 5, 0, 0);    // local next-day 05:00
    expect(calcLateNightMinutes(start, end)).toBe(7 * 60);
  });

  it('月またぎのシフト（夜勤 1/31 22:00 → 2/1 07:00）', () => {
    const start = new Date(2024, 0, 31, 22, 0, 0);
    const end = new Date(2024, 1, 1, 7, 0, 0);
    // Late night window 22:00-05:00 → 7h; total worked 9h
    expect(calcLateNightMinutes(start, end)).toBe(7 * 60);
    expect(calcWorkMinutes(start, end)).toBe(9 * 60);
  });

  it('深夜帯を含まない日中シフトは0', () => {
    const start = new Date(2024, 0, 15, 9, 0, 0);
    const end = new Date(2024, 0, 15, 18, 0, 0);
    expect(calcLateNightMinutes(start, end)).toBe(0);
  });
});

describe('calcPayrollItems — 時給制', () => {
  const user: UserWage = { hourlyWage: 1200, monthlySalary: null };

  it('通常の時給計算', () => {
    const summary = summarizeAttendance(weekdayRows(32 * 60, 4));
    const d = calcPayrollItems(user, summary, ITEMS);
    expect(amountOf(d, 'BASIC')).toBe(1200 * 32);   // 38,400
    expect(amountOf(d, 'OVERTIME')).toBe(0);
    // 雇用保険料 = 総支給 38400 × 0.006 = 230.4 → 230
    expect(amountOf(d, 'EMPLOYMENT_INSURANCE')).toBe(floorYen(38400 * 0.006));
    expect(amountOf(d, 'EMPLOYMENT_INSURANCE')).toBe(230);
  });

  it('残業手当（月40時間超）', () => {
    const summary = summarizeAttendance(weekdayRows(45 * 60, 6));
    const d = calcPayrollItems(user, summary, ITEMS);
    expect(amountOf(d, 'BASIC')).toBe(1200 * 40);           // 48,000
    expect(amountOf(d, 'OVERTIME')).toBe(Math.floor(1200 * 1.25 * 5)); // 7,500
  });

  it('深夜手当（7時間の深夜労働）', () => {
    const rows: AttendanceLike[] = [{ workMinutes: 9 * 60, lateNightMinutes: 7 * 60, isHolidayWork: false }];
    const summary = summarizeAttendance(rows);
    const d = calcPayrollItems(user, summary, ITEMS);
    expect(amountOf(d, 'LATE_NIGHT')).toBe(Math.floor(1200 * 0.25 * 7)); // 2,100
  });

  it('休日出勤手当（1.35倍）', () => {
    const rows: AttendanceLike[] = [{ workMinutes: 8 * 60, lateNightMinutes: 0, isHolidayWork: true }];
    const summary = summarizeAttendance(rows);
    const d = calcPayrollItems(user, summary, ITEMS);
    expect(amountOf(d, 'HOLIDAY')).toBe(Math.floor(1200 * 1.35 * 8)); // 12,960
  });

  it('1円未満切り捨て（端数処理）', () => {
    // 1017円/h × 3.5h = 3559.5 → 切り捨て 3559
    const u: UserWage = { hourlyWage: 1017, monthlySalary: null };
    const summary = summarizeAttendance(weekdayRows(Math.round(3.5 * 60), 1));
    const d = calcPayrollItems(u, summary, ITEMS);
    expect(minutesToHours2(Math.round(3.5 * 60))).toBe(3.5);
    expect(amountOf(d, 'BASIC')).toBe(3559);
  });
});

describe('calcPayrollItems — 月給制', () => {
  const user: UserWage = { hourlyWage: null, monthlySalary: 240000 };

  it('基本給は月給固定・残業は (月給÷所定160h) 基準', () => {
    const summary = summarizeAttendance(weekdayRows(44 * 60, 6)); // 44h → 4h overtime
    const d = calcPayrollItems(user, summary, ITEMS);
    expect(amountOf(d, 'BASIC')).toBe(240000); // 固定
    // hourly-equivalent = 240000 / 160 = 1500 ; OT = 1500 × 1.25 × 4 = 7500
    expect(amountOf(d, 'OVERTIME')).toBe(Math.floor(1500 * 1.25 * 4));
  });
});

describe('calcPayrollItems — MANUAL preservation', () => {
  it('再計算時に手動入力額を保持する', () => {
    const items: SalaryItemLike[] = [
      ...ITEMS,
      { id: 'i-tax', code: 'INCOME_TAX', name: '所得税', itemType: 'DEDUCTION', calcType: 'MANUAL', calcFormula: null, sortOrder: 10 },
    ];
    const user: UserWage = { hourlyWage: 1200, monthlySalary: null };
    const summary = summarizeAttendance(weekdayRows(32 * 60, 4));
    const manual = new Map<string, number>([['i-tax', 3200]]);
    const d = calcPayrollItems(user, summary, items, manual);
    expect(amountOf(d, 'INCOME_TAX')).toBe(3200);
  });
});
