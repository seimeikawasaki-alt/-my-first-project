import { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/common/Modal';
import { getMyPayrolls, getPayroll, payslipPdfUrl } from '../../api/payroll';
import type { Payroll } from '../../types';

const yen = (n: number) => `¥${Math.floor(n).toLocaleString('ja-JP')}`;
const hours = (min: number) => `${(min / 60).toFixed(1)}h`;

export default function PayslipsPage() {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Payroll | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyPayrolls();
      setPayrolls(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await getPayroll(id);
      setDetail(res.data);
    } catch {
      alert('明細の取得に失敗しました');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border px-4 py-4">
        <h1 className="text-card-title font-bold text-text max-w-lg mx-auto">給与明細</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {loading ? (
          <p className="text-center text-subtext py-12">読み込み中...</p>
        ) : payrolls.length === 0 ? (
          <p className="text-center text-subtext py-12">確定済みの給与明細がありません</p>
        ) : (
          <div className="space-y-2">
            {payrolls.map(p => (
              <button
                key={p.id}
                onClick={() => openDetail(p.id)}
                className="w-full bg-white rounded-xl border border-border px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="text-left">
                  <p className="font-bold text-text">{p.year}年{p.month}月</p>
                  <p className="text-xs text-subtext">勤務 {p.workDays}日 / 総労働 {hours(p.workMinutes)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">{yen(p.netPay)}</p>
                  <p className="text-xs text-subtext">差引支給額</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      <Modal isOpen={!!detail || detailLoading} onClose={() => setDetail(null)} title="給与明細">
        {detailLoading || !detail ? (
          <p className="py-10 text-center text-subtext">読み込み中...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-text">{detail.year}年{detail.month}月</p>
              <button onClick={() => window.open(payslipPdfUrl(detail.id), '_blank')} className="btn-secondary py-1.5 text-sub">
                PDFダウンロード
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 bg-gray-50 rounded-lg p-3 text-center">
              <div><p className="text-xs text-subtext">労働日数</p><p className="font-bold text-text">{detail.workDays}日</p></div>
              <div><p className="text-xs text-subtext">総労働</p><p className="font-bold text-text">{hours(detail.workMinutes)}</p></div>
              <div><p className="text-xs text-subtext">残業</p><p className="font-bold text-text">{hours(detail.overtimeMinutes)}</p></div>
              <div><p className="text-xs text-subtext">深夜</p><p className="font-bold text-text">{hours(detail.lateNightMinutes)}</p></div>
            </div>

            <div>
              <p className="text-sub font-bold text-success border-b border-border pb-1 mb-1">支給</p>
              {(detail.details ?? []).filter(d => d.itemType === 'INCOME').map(d => (
                <div key={d.id} className="flex justify-between py-1 text-sub">
                  <span className="text-text">{d.name}</span><span className="text-text">{yen(d.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1.5 mt-1 font-bold text-text text-sub">
                <span>総支給額</span><span>{yen(detail.totalIncome)}</span>
              </div>
            </div>

            <div>
              <p className="text-sub font-bold text-danger border-b border-border pb-1 mb-1">控除</p>
              {(detail.details ?? []).filter(d => d.itemType === 'DEDUCTION').map(d => (
                <div key={d.id} className="flex justify-between py-1 text-sub">
                  <span className="text-text">{d.name}</span><span className="text-text">{yen(d.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-border pt-1.5 mt-1 font-bold text-text text-sub">
                <span>総控除額</span><span>{yen(detail.totalDeduction)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center bg-blue-50 rounded-lg px-4 py-3">
              <span className="font-bold text-text">差引支給額</span>
              <span className="text-xl font-bold text-primary">{yen(detail.netPay)}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
