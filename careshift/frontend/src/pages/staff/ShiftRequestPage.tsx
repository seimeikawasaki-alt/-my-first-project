import { useState, useEffect, useCallback } from 'react';
import { createShiftRequest, getMyShiftRequests, deleteShiftRequest } from '../../api/shiftRequests';
import { getShiftTypes } from '../../api/shiftTypes';
import type { ShiftRequest, ShiftType } from '../../types';

const REQUEST_TYPE_LABELS: Record<string, string> = {
  VACATION: '休暇希望',
  PREFERRED: '希望シフト',
  CHANGE: 'シフト変更申請',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: '審査中',
  APPROVED: '承認済',
  REJECTED: '却下',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-warning',
  APPROVED: 'bg-green-100 text-success',
  REJECTED: 'bg-red-100 text-danger',
};

type RequestType = 'VACATION' | 'PREFERRED' | 'CHANGE';

export default function ShiftRequestPage() {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    requestType: RequestType;
    targetDate: string;
    shiftTypeId: string;
    reason: string;
  }>({
    requestType: 'VACATION',
    targetDate: '',
    shiftTypeId: '',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, typesRes] = await Promise.all([
        getMyShiftRequests(),
        getShiftTypes(),
      ]);
      setRequests(reqRes.data);
      setShiftTypes(typesRes.data.filter(t => t.isActive));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.targetDate) {
      setError('日付を入力してください');
      return;
    }
    if (form.requestType === 'PREFERRED' && !form.shiftTypeId) {
      setError('希望シフト種別を選択してください');
      return;
    }
    if (form.requestType === 'CHANGE' && !form.reason) {
      setError('変更内容・理由を入力してください');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createShiftRequest({
        requestType: form.requestType,
        targetDate: form.targetDate,
        shiftTypeId: form.requestType === 'PREFERRED' ? form.shiftTypeId : null,
        reason: form.reason || null,
        priority: form.requestType === 'VACATION' ? 3 : form.requestType === 'PREFERRED' ? 2 : 1,
      });
      setShowForm(false);
      setForm({ requestType: 'VACATION', targetDate: '', shiftTypeId: '', reason: '' });
      load();
    } catch {
      setError('送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この申請を取り消しますか？')) return;
    try {
      await deleteShiftRequest(id);
      load();
    } catch {
      alert('取り消しに失敗しました');
    }
  };

  const formatDate = (dt: string) => {
    const d = new Date(dt);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-card-title font-bold text-text">シフト申請</h1>
          <button
            onClick={() => { setShowForm(s => !s); setError(''); }}
            className="btn-primary text-sub py-2"
          >
            {showForm ? '閉じる' : '+ 新規申請'}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-border p-5 mb-6">
            <h2 className="text-card-title font-bold text-text mb-4">申請内容</h2>
            {error && <p className="text-danger text-sub mb-3">{error}</p>}

            <div className="space-y-4">
              {/* Request type */}
              <div>
                <label className="block text-sub font-medium text-text mb-2">申請種別</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['VACATION', 'PREFERRED', 'CHANGE'] as RequestType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setForm(f => ({ ...f, requestType: type }))}
                      className={`py-2 px-1 rounded-lg border text-xs transition-all ${
                        form.requestType === type
                          ? 'border-primary bg-blue-50 text-primary font-medium'
                          : 'border-border text-subtext hover:bg-gray-50'
                      }`}
                    >
                      {REQUEST_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type descriptions */}
              <div className="text-xs text-subtext bg-gray-50 rounded-lg p-3">
                {form.requestType === 'VACATION' && '指定日に休暇を希望します。承認されると自動生成時に優先されます。'}
                {form.requestType === 'PREFERRED' && '指定日に希望するシフト種別を申請します。'}
                {form.requestType === 'CHANGE' && '割り当てられたシフトの変更を申請します。'}
              </div>

              {/* Date */}
              <div>
                <label className="block text-sub font-medium text-text mb-1">
                  希望日 <span className="text-danger">*</span>
                </label>
                <input
                  type="date"
                  value={form.targetDate}
                  onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))}
                  className="input w-full"
                />
              </div>

              {/* Shift type (PREFERRED only) */}
              {form.requestType === 'PREFERRED' && (
                <div>
                  <label className="block text-sub font-medium text-text mb-1">
                    希望シフト種別 <span className="text-danger">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {shiftTypes.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setForm(f => ({ ...f, shiftTypeId: t.id }))}
                        className="p-2.5 rounded-lg border text-xs text-center transition-all"
                        style={{
                          backgroundColor: form.shiftTypeId === t.id ? (t.color ?? '#94A3B8') : 'transparent',
                          borderColor: t.color ?? '#94A3B8',
                          color: form.shiftTypeId === t.id ? '#fff' : (t.color ?? '#94A3B8'),
                        }}
                      >
                        <div className="font-medium">{t.name}</div>
                        <div className="opacity-80">{t.startTime}〜{t.endTime}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-sub font-medium text-text mb-1">
                  理由・詳細 {form.requestType === 'CHANGE' && <span className="text-danger">*</span>}
                  {form.requestType !== 'CHANGE' && <span className="text-subtext text-xs ml-1">（任意）</span>}
                </label>
                <textarea
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  rows={3}
                  className="input w-full resize-none"
                  placeholder={form.requestType === 'VACATION' ? '理由があれば記入してください' : '詳細を記入してください'}
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full btn-primary py-3 text-btn"
              >
                {submitting ? '送信中...' : '申請する'}
              </button>
            </div>
          </div>
        )}

        {/* History */}
        <h2 className="text-sub font-bold text-subtext mb-3">申請履歴</h2>
        {loading ? (
          <p className="text-center text-subtext py-8">読み込み中...</p>
        ) : requests.length === 0 ? (
          <p className="text-center text-subtext py-8">申請履歴がありません</p>
        ) : (
          <div className="space-y-2">
            {requests.map(req => {
              const shiftType = req.shiftTypeId ? shiftTypes.find(t => t.id === req.shiftTypeId) : null;
              return (
                <div key={req.id} className="bg-white rounded-xl border border-border px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sub font-medium text-text">
                      {REQUEST_TYPE_LABELS[req.requestType] ?? req.requestType}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status] ?? 'bg-gray-100 text-subtext'}`}>
                        {STATUS_LABELS[req.status] ?? req.status}
                      </span>
                      {req.status === 'PENDING' && (
                        <button
                          onClick={() => handleDelete(req.id)}
                          className="text-xs text-danger hover:underline"
                        >
                          取消
                        </button>
                      )}
                    </div>
                  </div>
                  {req.targetDate && (
                    <p className="text-xs text-subtext">希望日: {formatDate(req.targetDate)}</p>
                  )}
                  {shiftType && (
                    <p className="text-xs text-text mt-0.5">
                      希望シフト: <span className="font-medium" style={{ color: shiftType.color ?? undefined }}>{shiftType.name}</span>
                    </p>
                  )}
                  {req.reason && (
                    <p className="text-xs text-text mt-1">{req.reason}</p>
                  )}
                  <p className="text-xs text-subtext mt-1">申請日: {formatDate(req.createdAt)}</p>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
