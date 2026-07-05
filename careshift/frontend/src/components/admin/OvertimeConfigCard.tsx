import { useState, useEffect } from 'react';
import { getOvertimeConfig, updateOvertimeConfig } from '../../api/overtime';
import { toast } from '../../stores/toastStore';
import type { OvertimeConfig } from '../../types';

export default function OvertimeConfigCard() {
  const [form, setForm] = useState<OvertimeConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getOvertimeConfig().then(r => setForm(r.data)); }, []);

  const set = (k: keyof OvertimeConfig, v: number) => setForm(f => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await updateOvertimeConfig(form);
      toast.success('36協定の設定を保存しました');
    } catch {
      toast.error('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return null;

  const num = (k: keyof OvertimeConfig, label: string, suffix: string) => (
    <div>
      <label className="form-label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" min={0} value={form[k]} onChange={e => set(k, parseFloat(e.target.value) || 0)} className="form-input w-28" />
        <span className="text-sub text-subtext">{suffix}</span>
      </div>
    </div>
  );

  return (
    <div className="card mt-6">
      <h2 className="text-card-title font-bold text-text mb-1">36協定 残業時間上限設定</h2>
      <p className="text-xs text-subtext mb-4">労働基準法の時間外労働の上限。到達で残業管理画面・ダッシュボードに警告が出ます。</p>
      <div className="grid grid-cols-2 gap-4 max-w-lg">
        {num('monthlyLimitHours', '月の残業上限', '時間')}
        {num('yearlyLimitHours', '年の残業上限', '時間')}
        {num('specialMonthlyLimit', '特別条項 月上限', '時間')}
        {num('specialYearlyLimit', '特別条項 年上限', '時間')}
        <div>
          <label className="form-label">警告閾値</label>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={100} value={Math.round(form.warningThresholdRate * 100)}
              onChange={e => set('warningThresholdRate', (parseFloat(e.target.value) || 0) / 100)} className="form-input w-28" />
            <span className="text-sub text-subtext">% で警告</span>
          </div>
        </div>
      </div>
      <button onClick={save} disabled={saving} className="btn-primary mt-5">{saving ? '保存中...' : '保存する'}</button>
    </div>
  );
}
