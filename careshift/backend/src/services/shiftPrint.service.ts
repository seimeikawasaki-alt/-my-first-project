import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export interface PrintOptions {
  year: number;
  month: number;
  groupId?: string; // 指定なしは全スタッフ
}

/**
 * 月間シフト表を A3 横向きで印刷するための HTML を生成する。
 * ブラウザで開くと自動的に印刷ダイアログが開き、PDF として保存できる。
 * 縦=スタッフ、横=日付 のマトリクス形式。
 */
export async function buildShiftPrintHtml(opts: PrintOptions): Promise<string> {
  const { year, month, groupId } = opts;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // 対象スタッフを決定（グループ指定時はメンバーのみ）
  let userIds: string[] | undefined;
  let groupName = '全スタッフ';
  if (groupId) {
    const [group, members] = await Promise.all([
      prisma.unit.findUnique({ where: { id: groupId } }),
      prisma.userGroup.findMany({ where: { groupId }, select: { userId: true } }),
    ]);
    groupName = group?.name ?? 'グループ';
    userIds = members.map(m => m.userId);
  }

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { not: 'ADMIN' },
      ...(userIds ? { id: { in: userIds } } : {}),
    },
    select: { id: true, lastName: true, firstName: true, lastNameKana: true, firstNameKana: true },
  });
  users.sort((a, b) =>
    `${a.lastNameKana ?? ''}${a.firstNameKana ?? ''}`.localeCompare(`${b.lastNameKana ?? ''}${b.firstNameKana ?? ''}`, 'ja'),
  );

  const [shifts, shiftTypes] = await Promise.all([
    prisma.shift.findMany({
      where: { status: 'PUBLISHED', shiftDate: { gte: start, lt: end }, userId: { in: users.map(u => u.id) } },
    }),
    prisma.shiftType.findMany(),
  ]);
  const typeMap = new Map(shiftTypes.map(t => [t.id, t]));

  // userId -> day(1..n) -> label
  const cell = new Map<string, Map<number, { label: string; color: string }>>();
  for (const s of shifts) {
    const day = new Date(s.shiftDate).getUTCDate();
    const t = s.shiftTypeId ? typeMap.get(s.shiftTypeId) : null;
    const label = t ? t.name : (s.startTime ?? '');
    const color = t?.color ?? '#e5e7eb';
    if (!cell.has(s.userId)) cell.set(s.userId, new Map());
    cell.get(s.userId)!.set(day, { label, color });
  }

  const dayHeaders = Array.from({ length: daysInMonth }, (_, i) => {
    const d = i + 1;
    const wd = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    const cls = wd === 0 ? 'sun' : wd === 6 ? 'sat' : '';
    return `<th class="day ${cls}"><div>${d}</div><div class="wd">${WEEKDAYS[wd]}</div></th>`;
  }).join('');

  const bodyRows = users.map(u => {
    const name = `${u.lastName} ${u.firstName}`;
    const dayCells = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const c = cell.get(u.id)?.get(d);
      const wd = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      const wcls = wd === 0 ? 'sun' : wd === 6 ? 'sat' : '';
      if (!c) return `<td class="${wcls}"></td>`;
      return `<td class="${wcls}" style="background:${esc(c.color)}33">${esc(c.label)}</td>`;
    }).join('');
    return `<tr><th class="name">${esc(name)}</th>${dayCells}</tr>`;
  }).join('');

  const title = `${year}年${month}月 シフト表（${esc(groupName)}）`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page { size: A3 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif; margin: 0; color: #111827; }
  h1 { font-size: 16px; margin: 0 0 6px; }
  .meta { font-size: 11px; color: #6b7280; margin-bottom: 8px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th, td { border: 1px solid #9ca3af; font-size: 9px; text-align: center; padding: 1px; overflow: hidden; }
  th.name { width: 70px; text-align: left; padding-left: 4px; background: #f3f4f6; position: sticky; left: 0; font-size: 10px; }
  th.day { width: 22px; }
  th.day .wd { font-size: 8px; color: #6b7280; }
  td { height: 22px; }
  .sun { color: #dc2626; }
  .sat { color: #2563eb; }
  th.day.sun { background: #fef2f2; }
  th.day.sat { background: #eff6ff; }
  .print-btn { margin: 10px 0; padding: 8px 16px; font-size: 13px; cursor: pointer; }
  @media print { .print-btn, .note { display: none; } }
  .note { font-size: 11px; color: #6b7280; margin: 6px 0; }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 印刷 / PDF保存</button>
  <p class="note">A3横向きで印刷されます。表示されない場合はブラウザの印刷設定で用紙サイズ「A3」・向き「横」を選択してください。</p>
  <h1>${title}</h1>
  <div class="meta">公開済みシフトのみ表示 / スタッフ ${users.length}名</div>
  <table>
    <thead>
      <tr><th class="name">氏名</th>${dayHeaders}</tr>
    </thead>
    <tbody>${bodyRows || `<tr><td colspan="${daysInMonth + 1}">対象データがありません</td></tr>`}</tbody>
  </table>
  <script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 300); });</script>
</body>
</html>`;
}
