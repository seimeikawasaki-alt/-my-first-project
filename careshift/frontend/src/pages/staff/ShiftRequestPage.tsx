import { useState, useEffect, useCallback } from 'react';
import { createShiftRequest, getMyShiftRequests } from '../../api/shiftRequests';
import type { ShiftRequest, ShiftRequestType } from '../../types';

const REQUEST_TYPE_LABELS: Record<ShiftRequestType, string> = {
  CHANGE: 'シフト変更',
  CANCEL: 'シフトキャンセル',
  ADD: 'シフト追加希望',
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

export default function ShiftRequestPage() {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{
    requestType: ShiftRequestType;
    requestedDate: string;
    reason: string;
  }>({
    requestType: 'CHANGE',
    requestedDate: '',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyShiftRequests();
      setRequests(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!form.reason) {
      setError('理由を入力してください');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createShiftRequest({
        requestType: form.requestType,
        requestedDate: form.requestedDate || undefined,
        reason: form.reason,
      });
      setShowForm(false);
      setForm({ requestType: 'CHANGE', requestedDate: '', reason: '' });
      load();
    } catch {
      setError('送信に失敗しました');
    } finally {
      setSubmitting(false);
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
          <h1 className="text-card-title font-bold text-text">シフト変更申請</h1>
          <button onClick={() => { setShowForm(s => !s); setError(''); }} className="btn-primary text-sub py-2">
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
              <div>
                <label className="block text-sub font-medium text-text mb-2">申請種別</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(REQUEST_TYPE_LABELS) as ShiftRequestType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setForm(f => ({ ...f, requestType: type }))}
                      className={`py-2 rounded-lg border text-sub transition-all ${form.requestType === type ? 'border-primary bg-blue-50 text-primary font-medium' : 'border-border text-subtext hover:bg-gray-50'}`}
                    >
                      {REQUEST_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sub font-medium text-text mb-1">希望日（任意）</label>
                <input
                  type="date"
                  value={form.requestedDate}
                  onChange={e => setForm(f => ({ ...f, requestedDate: e.target.value }))}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sub font-medium text-text mb-1">
                  理由・詳細 <span className="text-danger">*</span>
                </label>
                <textarea
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  rows={4}
                  className="input w-full resize-none"
                  placeholder="変更・キャンセルの理由を記入してください"
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
            {requests.map(req => (
              <div key={req.id} className="bg-white rounded-xl border border-border px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sub font-medium text-text">
                    {REQUEST_TYPE_LABELS[req.requestType]}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status] ?? 'bg-gray-100 text-subtext'}`}>
                    {STATUS_LABELS[req.status] ?? req.status}
                  </span>
                </div>
                {req.requestedDate && (
                  <p className="text-xs text-subtext">希望日: {formatDate(req.requestedDate)}</p>
                )}
                {req.reason && (
                  <p className="text-xs text-text mt-1">{req.reason}</p>
                )}
                <p className="text-xs text-subtext mt-1">申請日: {formatDate(req.createdAt)}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
