// Renders a clean, A4, print-optimised payslip as a self-contained HTML page.
// Opening it in a browser and using "print → Save as PDF" produces the PDF —
// this needs no native/binary dependencies and supports Japanese via system
// fonts. Designed to read well in monochrome.

interface PayslipInput {
  facilityName: string;
  payroll: {
    year: number;
    month: number;
    workDays: number;
    workMinutes: number;
    overtimeMinutes: number;
    lateNightMinutes: number;
    totalIncome: number;
    totalDeduction: number;
    netPay: number;
    status: string;
  };
  user: { userCode: string; name: string };
  details: { name: string; itemType: string; amount: number }[];
  yen: (n: unknown) => string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const hours1 = (min: number) => (min / 60).toFixed(1);

export function renderPayslipHtml(input: PayslipInput): string {
  const { facilityName, payroll: p, user, details, yen } = input;
  const income = details.filter(d => d.itemType === 'INCOME');
  const deduction = details.filter(d => d.itemType === 'DEDUCTION');

  const rows = (list: { name: string; amount: number }[]) =>
    list.map(d => `
      <tr>
        <td class="item">${esc(d.name)}</td>
        <td class="amt">${yen(d.amount)} 円</td>
      </tr>`).join('');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>給与明細 ${p.year}年${p.month}月 ${esc(user.name)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f3f4f6; color: #111; font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif; }
  .sheet { width: 210mm; min-height: 297mm; margin: 12px auto; background: #fff; padding: 20mm 18mm; }
  .toolbar { max-width: 210mm; margin: 12px auto 0; text-align: right; }
  .toolbar button { font-size: 14px; padding: 8px 18px; border: 1px solid #111; background: #111; color: #fff; border-radius: 6px; cursor: pointer; }
  h1 { font-size: 20px; text-align: center; letter-spacing: 0.1em; margin: 0 0 4px; }
  .period { text-align: center; font-size: 14px; margin-bottom: 20px; }
  .facility { text-align: right; font-size: 13px; color: #333; margin-bottom: 4px; }
  .meta { display: flex; justify-content: space-between; border-top: 2px solid #111; border-bottom: 1px solid #111; padding: 8px 0; margin-bottom: 14px; font-size: 13px; }
  .summary { display: flex; gap: 0; border: 1px solid #999; margin-bottom: 18px; }
  .summary div { flex: 1; padding: 8px 6px; text-align: center; border-right: 1px solid #ddd; }
  .summary div:last-child { border-right: 0; }
  .summary .label { font-size: 11px; color: #555; }
  .summary .val { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .cols { display: flex; gap: 16px; }
  .col { flex: 1; }
  .col h2 { font-size: 14px; margin: 0 0 6px; padding-bottom: 4px; border-bottom: 2px solid #111; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td.item { padding: 6px 4px; border-bottom: 1px solid #eee; }
  td.amt { padding: 6px 4px; border-bottom: 1px solid #eee; text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { border-top: 2px solid #111; border-bottom: none; font-weight: 700; padding-top: 8px; }
  .net { margin-top: 22px; border: 2px solid #111; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; }
  .net .label { font-size: 15px; font-weight: 700; }
  .net .val { font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .draft { text-align: center; color: #b45309; font-size: 12px; margin-top: 10px; }
  @media print {
    html, body { background: #fff; }
    .toolbar { display: none; }
    .sheet { margin: 0; width: auto; min-height: auto; padding: 16mm; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">印刷 / PDF保存</button></div>
  <div class="sheet">
    <div class="facility">${esc(facilityName)}</div>
    <h1>給 与 明 細 書</h1>
    <div class="period">${p.year}年 ${p.month}月分</div>

    <div class="meta">
      <span>氏名：<strong>${esc(user.name)}</strong> 様</span>
      <span>スタッフID：${esc(user.userCode)}</span>
    </div>

    <div class="summary">
      <div><div class="label">労働日数</div><div class="val">${p.workDays} 日</div></div>
      <div><div class="label">総労働時間</div><div class="val">${hours1(p.workMinutes)} h</div></div>
      <div><div class="label">残業時間</div><div class="val">${hours1(p.overtimeMinutes)} h</div></div>
      <div><div class="label">深夜時間</div><div class="val">${hours1(p.lateNightMinutes)} h</div></div>
    </div>

    <div class="cols">
      <div class="col">
        <h2>支給</h2>
        <table>
          ${rows(income)}
          <tr class="total"><td class="item">総支給額</td><td class="amt">${yen(p.totalIncome)} 円</td></tr>
        </table>
      </div>
      <div class="col">
        <h2>控除</h2>
        <table>
          ${rows(deduction)}
          <tr class="total"><td class="item">総控除額</td><td class="amt">${yen(p.totalDeduction)} 円</td></tr>
        </table>
      </div>
    </div>

    <div class="net">
      <span class="label">差引支給額</span>
      <span class="val">${yen(p.netPay)} 円</span>
    </div>
    ${p.status !== 'CONFIRMED' ? '<div class="draft">※ これは未確定の給与明細です</div>' : ''}
  </div>
</body>
</html>`;
}
