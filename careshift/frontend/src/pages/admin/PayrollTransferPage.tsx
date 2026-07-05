import { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import {
  getBankAccounts, saveBankAccount, getTransferPreview, getTransferBatches,
  generateTransfer, transferDownloadUrl, type GenerateTransferInput,
} from '../../api/payrollTransfer';
import { toast } from '../../stores/toastStore';
import type { BankAccountRow, StaffBankAccount, TransferPreview, TransferBatch } from '../../types';

const now = new Date();
const yen = (n: number | string) => '¥' + Math.floor(Number(n)).toLocaleString('ja-JP');
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP');

const CONSIGNOR_KEY = 'careshift.consignor';
type Consignor = Omit<GenerateTransferInput, 'year' | 'month' | 'transferDate'>;
const emptyConsignor: Consignor = {
  consignorCode: '', consignorName: '', bankCode: '', bankName: '',
  branchCode: '', branchName: '', accountType: 'ORDINARY', accountNumber: '',
};

const emptyAccount: Omit<StaffBankAccount, 'id' | 'userId'> = {
  bankCode: '', bankName: '', branchCode: '', branchName: '',
  accountType: 'ORDINARY', accountNumber: '', accountHolder: '',
};

export default function PayrollTransferPage() {
  const [tab, setTab] = useState<'generate' | 'accounts'>('generate');
  const [accounts, setAccounts] = useState<BankAccountRow[]>([]);
  const [batches, setBatches] = useState<TransferBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [transferDate, setTransferDate] = useState(now.toISOString().slice(0, 10));
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [consignor, setConsignor] = useState<Consignor>(() => {
    try { const s = localStorage.getItem(CONSIGNOR_KEY); return s ? { ...emptyConsignor, ...JSON.parse(s) } : emptyConsignor; }
    catch { return emptyConsignor; }
  });

  const [acctModal, setAcctModal] = useState<BankAccountRow | null>(null);
  const [acctForm, setAcctForm] = useState(emptyAccount);

  const loadAccounts = useCallback(async () => {
    const r = await getBankAccounts();
    setAccounts(r.data);
  }, []);
  const loadBatches = useCallback(async () => {
    const r = await getTransferBatches();
    setBatches(r.data);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadAccounts(), loadBatches()]).finally(() => setLoading(false));
  }, [loadAccounts, loadBatches]);

  const loadPreview = useCallback(async () => {
    try {
      const r = await getTransferPreview({ year, month });
      setPreview(r.data);
    } catch { setPreview(null); }
  }, [year, month]);
  useEffect(() => { loadPreview(); }, [loadPreview]);

  const missingAccounts = accounts.filter(a => !a.account).length;

  const openAcct = (row: BankAccountRow) => {
    setAcctModal(row);
    setAcctForm(row.account
      ? { bankCode: row.account.bankCode, bankName: row.account.bankName, branchCode: row.account.branchCode, branchName: row.account.branchName, accountType: row.account.accountType, accountNumber: row.account.accountNumber, accountHolder: row.account.accountHolder }
      : emptyAccount);
  };

  const saveAcct = async () => {
    if (!acctModal) return;
    if (!acctForm.bankCode || !acctForm.branchCode || !acctForm.accountNumber || !acctForm.accountHolder) { toast.error('必須項目を入力してください'); return; }
    setBusy(true);
    try {
      await saveBankAccount(acctModal.userId, acctForm);
      toast.success('口座を保存しました');
      setAcctModal(null);
      loadAccounts();
    } catch { toast.error('保存に失敗しました'); }
    finally { setBusy(false); }
  };

  const saveConsignor = (c: Consignor) => { setConsignor(c); try { localStorage.setItem(CONSIGNOR_KEY, JSON.stringify(c)); } catch { /* ignore */ } };

  const handleGenerate = async () => {
    if (Object.values(consignor).some(v => !v)) { toast.error('委託者・仕向金融機関の情報をすべて入力してください'); return; }
    if (!preview || preview.totalCount === 0) { toast.error('振込対象データがありません（確定済み給与が必要です）'); return; }
    if (!confirm(`${year}年${month}月の振込データ（${preview.totalCount}件 / ${yen(preview.totalAmount)}）を生成しますか？`)) return;
    setBusy(true);
    try {
      const res = await generateTransfer({ year, month, transferDate, ...consignor });
      const d = res.data;
      toast.success(`生成しました（${d.count}件）${d.missingCount > 0 ? ` / 口座未登録により${d.missingCount}名を除外` : ''}`);
      loadBatches();
    } catch { toast.error('生成に失敗しました'); }
    finally { setBusy(false); }
  };

  const visibleAccounts = accounts.filter(a => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${a.name}${a.nameKana}`.toLowerCase().includes(q);
  });

  const cField = (label: string, key: keyof Consignor, placeholder = '') => (
    <div>
      <label className="form-label">{label}</label>
      {key === 'accountType'
        ? <select value={consignor.accountType} onChange={e => saveConsignor({ ...consignor, accountType: e.target.value as 'ORDINARY' | 'CHECKING' })} className="form-input"><option value="ORDINARY">普通</option><option value="CHECKING">当座</option></select>
        : <input type="text" value={consignor[key]} onChange={e => saveConsignor({ ...consignor, [key]: e.target.value })} className="form-input" placeholder={placeholder} />}
    </div>
  );

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-heading font-bold text-text">給与振込（全銀協フォーマット）</h1>
        <p className="text-sub text-subtext mt-1">確定済み給与から総合振込データを生成します</p>
      </div>

      <div className="card bg-yellow-50 border-warning/40 mb-6 p-4">
        <p className="text-sub text-text">
          ⚠️ <span className="font-semibold">この全銀協フォーマットは「目安」の実装です。</span>
          桁数・項目・文字コード・改行コードは金融機関によって異なる場合があります。
          実際の振込に使用する前に、<span className="font-semibold">必ず取引金融機関の最新の仕様書と照合してください。</span>
          文字コードは Shift-JIS 互換の単バイト（JIS X 0201）で出力します。
        </p>
      </div>

      <div className="flex gap-2 mb-4 border-b border-border">
        <button onClick={() => setTab('generate')} className={`px-4 py-2 text-sub font-medium border-b-2 ${tab === 'generate' ? 'border-primary text-primary' : 'border-transparent text-subtext'}`}>振込データ生成</button>
        <button onClick={() => setTab('accounts')} className={`px-4 py-2 text-sub font-medium border-b-2 ${tab === 'accounts' ? 'border-primary text-primary' : 'border-transparent text-subtext'}`}>
          振込口座管理{missingAccounts > 0 && <span className="ml-1 text-danger">（未登録{missingAccounts}）</span>}
        </button>
      </div>

      {loading ? <div className="py-16"><LoadingSpinner /></div> : tab === 'generate' ? (
        <div className="space-y-6">
          <div className="card">
            <h2 className="font-semibold text-text mb-3">委託者・仕向金融機関情報</h2>
            <p className="text-xs text-subtext mb-3">全銀協ヘッダーに使用します。半角カナで入力してください（この端末に保存されます）。</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {cField('委託者コード', 'consignorCode', '10桁')}
              {cField('委託者名(カナ)', 'consignorName', 'ｶ)ｶｲｼﾞﾖｳ')}
              {cField('仕向銀行コード', 'bankCode', '4桁')}
              {cField('仕向銀行名(カナ)', 'bankName')}
              {cField('仕向支店コード', 'branchCode', '3桁')}
              {cField('仕向支店名(カナ)', 'branchName')}
              {cField('預金種目', 'accountType')}
              {cField('口座番号', 'accountNumber', '7桁')}
            </div>
          </div>

          <div className="card">
            <div className="flex flex-wrap items-end gap-4 mb-4">
              <div>
                <label className="form-label">対象年月</label>
                <div className="flex gap-2">
                  <input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || year)} className="form-input w-24" />
                  <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="form-input w-20">
                    {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}月</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="form-label">振込指定日</label>
                <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="form-input" />
              </div>
              <button onClick={handleGenerate} disabled={busy} className="btn-primary ml-auto">全銀協データを生成</button>
            </div>

            {preview && (
              <div className="text-sub">
                <div className="flex gap-6 mb-3">
                  <span>振込対象: <span className="font-semibold text-text">{preview.totalCount}件</span></span>
                  <span>合計金額: <span className="font-semibold text-text">{yen(preview.totalAmount)}</span></span>
                </div>
                {preview.missing.length > 0 && (
                  <div className="card bg-red-50 border-danger/30 p-3">
                    <p className="text-danger font-medium mb-1">⚠️ 口座未登録のため振込対象から除外されます（{preview.missing.length}名）</p>
                    <p className="text-xs text-text">{preview.missing.map(m => `${m.name}（${yen(m.amount)}）`).join(' / ')}</p>
                    <p className="text-xs text-subtext mt-1">「振込口座管理」タブで口座を登録してください。</p>
                  </div>
                )}
                {preview.totalCount === 0 && preview.missing.length === 0 && (
                  <p className="text-subtext">この月の確定済み給与がありません。給与管理で確定してください。</p>
                )}
              </div>
            )}
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-border"><h2 className="font-semibold text-text">生成履歴</h2></div>
            {batches.length === 0 ? <EmptyState icon="🏦" title="生成履歴がありません" />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sub">
                    <thead className="bg-gray-50 border-b border-border text-left text-subtext">
                      <tr>
                        <th className="px-6 py-3">対象年月</th>
                        <th className="px-6 py-3">振込指定日</th>
                        <th className="px-6 py-3 text-right">件数</th>
                        <th className="px-6 py-3 text-right">合計金額</th>
                        <th className="px-6 py-3">除外</th>
                        <th className="px-6 py-3">生成日時</th>
                        <th className="px-6 py-3 text-right">DL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {batches.map(b => (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium text-text">{b.year}年{b.month}月</td>
                          <td className="px-6 py-3 text-subtext">{fmtDate(b.transferDate)}</td>
                          <td className="px-6 py-3 text-right">{b.totalCount}件</td>
                          <td className="px-6 py-3 text-right font-semibold text-text">{yen(b.totalAmount)}</td>
                          <td className="px-6 py-3">{b.missingCount > 0 ? <span className="text-danger">{b.missingCount}名</span> : '—'}</td>
                          <td className="px-6 py-3 text-subtext">{new Date(b.createdAt).toLocaleString('ja-JP')}</td>
                          <td className="px-6 py-3 text-right"><a href={transferDownloadUrl(b.id)} className="text-primary hover:underline" download>ダウンロード</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4"><input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="スタッフ名で検索" className="form-input w-full sm:w-80" /></div>
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sub">
                <thead className="bg-gray-50 border-b border-border text-left text-subtext">
                  <tr>
                    <th className="px-6 py-3">氏名</th>
                    <th className="px-6 py-3">銀行 / 支店</th>
                    <th className="px-6 py-3">種目 / 口座番号</th>
                    <th className="px-6 py-3">名義</th>
                    <th className="px-6 py-3">状態</th>
                    <th className="px-6 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleAccounts.map(a => (
                    <tr key={a.userId} className={`hover:bg-gray-50 ${!a.account ? 'bg-red-50' : ''}`}>
                      <td className="px-6 py-3 font-medium text-text">{a.name}</td>
                      <td className="px-6 py-3">{a.account ? `${a.account.bankName} / ${a.account.branchName}` : '—'}</td>
                      <td className="px-6 py-3">{a.account ? `${a.account.accountType === 'CHECKING' ? '当座' : '普通'} ${a.account.accountNumber}` : '—'}</td>
                      <td className="px-6 py-3">{a.account?.accountHolder ?? '—'}</td>
                      <td className="px-6 py-3">{a.account ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-success">登録済</span> : <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-danger">未登録</span>}</td>
                      <td className="px-6 py-3 text-right"><button onClick={() => openAcct(a)} className="text-primary hover:underline">{a.account ? '編集' : '登録'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal isOpen={acctModal !== null} onClose={() => setAcctModal(null)} title={`振込口座${acctModal ? '：' + acctModal.name : ''}`} size="lg">
        <div className="space-y-4">
          <p className="text-xs text-subtext">銀行名・支店名・名義は半角カナで入力してください（全銀協フォーマット用）。</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="form-label">銀行コード(4桁)</label><input type="text" value={acctForm.bankCode} onChange={e => setAcctForm(f => ({ ...f, bankCode: e.target.value }))} className="form-input" /></div>
            <div><label className="form-label">銀行名(カナ)</label><input type="text" value={acctForm.bankName} onChange={e => setAcctForm(f => ({ ...f, bankName: e.target.value }))} className="form-input" /></div>
            <div><label className="form-label">支店コード(3桁)</label><input type="text" value={acctForm.branchCode} onChange={e => setAcctForm(f => ({ ...f, branchCode: e.target.value }))} className="form-input" /></div>
            <div><label className="form-label">支店名(カナ)</label><input type="text" value={acctForm.branchName} onChange={e => setAcctForm(f => ({ ...f, branchName: e.target.value }))} className="form-input" /></div>
            <div><label className="form-label">預金種目</label><select value={acctForm.accountType} onChange={e => setAcctForm(f => ({ ...f, accountType: e.target.value as 'ORDINARY' | 'CHECKING' }))} className="form-input"><option value="ORDINARY">普通</option><option value="CHECKING">当座</option></select></div>
            <div><label className="form-label">口座番号(7桁)</label><input type="text" value={acctForm.accountNumber} onChange={e => setAcctForm(f => ({ ...f, accountNumber: e.target.value }))} className="form-input" /></div>
            <div className="col-span-2"><label className="form-label">口座名義(半角カナ)</label><input type="text" value={acctForm.accountHolder} onChange={e => setAcctForm(f => ({ ...f, accountHolder: e.target.value }))} className="form-input" placeholder="ﾔﾏﾀﾞ ﾀﾛｳ" /></div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setAcctModal(null)} className="btn-secondary" disabled={busy}>キャンセル</button>
            <button onClick={saveAcct} className="btn-primary" disabled={busy}>{busy ? '保存中...' : '保存する'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
