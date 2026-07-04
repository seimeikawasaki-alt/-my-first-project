import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 仮想の勤怠実績を作る対象月（給与計算の検証用）
const YEAR = 2026;
const MONTH = 6; // 6月

// JST(UTC+9) の時刻を、その日の UTC Date に変換するヘルパー
// 例: jstTime(d, 9, 0) → 09:00 JST（= 00:00 UTC 当日）
function jstTime(day: number, hour: number, minute = 0): Date {
  // 09:00 JST = 00:00 UTC。UTC時 = JST時 - 9（マイナスは前日になる）
  return new Date(Date.UTC(YEAR, MONTH - 1, day, hour - 9, minute));
}

function workDateOf(day: number): Date {
  return new Date(Date.UTC(YEAR, MONTH - 1, day));
}

interface Row {
  userId: string;
  workDate: Date;
  shiftTypeId: string;
  baseMinutes: number;
  isNightShift: boolean;
  punchIn: Date;
  punchOut: Date;
  workMinutes: number;
  overtimeMinutes: number;
  lateNightMinutes: number;
  isHolidayWork: boolean;
  status: string;
}

// 既定のシフト種別（seed.ts で作成済み）: base=所定労働時間（実働8h）
const DAY_SHIFT = { id: 'shift-type-1', base: 480 };   // 日勤 08:00–17:00
const NIGHT_SHIFT = { id: 'shift-type-2', base: 480 }; // 夜勤 22:00–翌07:00

async function main() {
  const daysInMonth = new Date(Date.UTC(YEAR, MONTH, 0)).getUTCDate();

  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: 'ADMIN' } },
    select: { id: true, userCode: true },
    orderBy: { userCode: 'asc' },
  });

  if (users.length === 0) {
    console.log('対象スタッフがいません。先に `npm run db:seed` を実行してください。');
    return;
  }

  // 既存の当月分を消してから作り直す（冪等）
  const start = new Date(Date.UTC(YEAR, MONTH - 1, 1));
  const end = new Date(Date.UTC(YEAR, MONTH, 1));
  await prisma.attendance.deleteMany({
    where: { userId: { in: users.map(u => u.id) }, workDate: { gte: start, lt: end } },
  });

  const allRows: Row[] = [];

  for (const u of users) {
    const idx = parseInt(u.userCode.replace(/\D/g, ''), 10) || 0; // staff001 → 1
    const isNight = idx >= 41; // 夜勤専従グループ（041–050）

    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(Date.UTC(YEAR, MONTH - 1, d)).getUTCDay(); // 0=日, 6=土

      if (isNight) {
        // 夜勤専従: 日曜を除き、1日おきに夜勤（22:00→翌07:00, 実働8h, 深夜7h）
        const works = dow !== 0 && (d % 2 === idx % 2);
        if (!works) continue;
        allRows.push({
          userId: u.id,
          workDate: workDateOf(d),
          shiftTypeId: NIGHT_SHIFT.id,
          baseMinutes: NIGHT_SHIFT.base,
          isNightShift: true,
          punchIn: jstTime(d, 22, 0),        // 22:00 JST
          punchOut: jstTime(d + 1, 7, 0),    // 翌 07:00 JST
          workMinutes: 480,                  // 9h拘束 − 1h休憩
          overtimeMinutes: 0,
          lateNightMinutes: 420,             // 22:00–05:00 = 7h
          isHolidayWork: false,
          status: 'PUNCHED_OUT',
        });
      } else {
        // 日勤スタッフ: 平日(月〜金)に 09:00–18:00（実働8h）
        if (dow === 0) continue; // 日曜は休み
        if (dow === 6) {
          // 一部スタッフは土曜を休日出勤（1.35倍の検証用）。月の前半2回だけ。
          if (idx % 5 === 0 && d <= 14) {
            allRows.push({
              userId: u.id,
              workDate: workDateOf(d),
              shiftTypeId: DAY_SHIFT.id,
              baseMinutes: DAY_SHIFT.base,
              isNightShift: false,
              punchIn: jstTime(d, 9, 0),
              punchOut: jstTime(d, 18, 0),
              workMinutes: 480,
              overtimeMinutes: 0,
              lateNightMinutes: 0,
              isHolidayWork: true,
              status: 'HOLIDAY_WORK',
            });
          }
          continue;
        }
        // 平日: 一部スタッフは水曜に2時間残業（実働10h）。d%7===3 は6月の水曜。
        const extra = (idx % 3 === 0 && d % 7 === 3) ? 120 : 0;
        allRows.push({
          userId: u.id,
          workDate: workDateOf(d),
          shiftTypeId: DAY_SHIFT.id,
          baseMinutes: DAY_SHIFT.base,
          isNightShift: false,
          punchIn: jstTime(d, 9, 0),
          punchOut: jstTime(d, 18 + Math.floor(extra / 60), extra % 60),
          workMinutes: 480 + extra,
          overtimeMinutes: extra, // ベース(8h)超過分＝残業
          lateNightMinutes: 0,
          isHolidayWork: false,
          status: 'PUNCHED_OUT',
        });
      }
    }
  }

  // まとめて投入
  await prisma.attendance.createMany({ data: allRows });

  console.log(`✅ ${YEAR}年${MONTH}月の仮想勤怠を作成: ${users.length}人 / 合計 ${allRows.length} 件`);
  console.log('   給与管理画面で「一括計算」を実行して検証してください。');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
