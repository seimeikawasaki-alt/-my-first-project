import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { groupsApi, GroupCreateRequest } from '../../api/groups';
import { staffApi } from '../../api/staff';
import { Group, User } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Modal from '../../components/common/Modal';
import { matchStaff, compareKana } from '../../utils/staffSort';
import { AxiosError } from 'axios';

const PRESET_COLORS = [
  '#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280',
];

interface GroupFormState {
  name: string;
  color: string;
  description: string;
}

interface ApiErrorResponse {
  error: { message: string };
}

export default function GroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [allStaff, setAllStaff] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMemberOpen, setIsMemberOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [formState, setFormState] = useState<GroupFormState>({ name: '', color: '#2563EB', description: '' });
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addIsLeader, setAddIsLeader] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');

  const fetchGroups = async () => {
    setIsLoading(true);
    try {
      const res = await groupsApi.list();
      setGroups(res.data.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
    staffApi.list({ per_page: 200 }).then(res => setAllStaff(res.data.data));
  }, []);

  const openCreate = () => {
    setEditingGroup(null);
    setFormState({ name: '', color: '#2563EB', description: '' });
    setFormError('');
    setIsFormOpen(true);
  };

  const openEdit = (group: Group) => {
    setEditingGroup(group);
    setFormState({ name: group.name, color: group.color || '#2563EB', description: group.description || '' });
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSubmitForm = async () => {
    if (!formState.name.trim()) {
      setFormError('グループ名は必須です');
      return;
    }
    setIsSubmitting(true);
    setFormError('');
    try {
      const data: GroupCreateRequest = {
        name: formState.name,
        color: formState.color,
        description: formState.description || null,
      };
      if (editingGroup) {
        await groupsApi.update(editingGroup.id, data);
      } else {
        await groupsApi.create(data);
      }
      setIsFormOpen(false);
      fetchGroups();
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      setFormError(axiosError.response?.data?.error?.message || '保存に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (group: Group) => {
    if (!window.confirm(`「${group.name}」を削除しますか？`)) return;
    await groupsApi.delete(group.id);
    fetchGroups();
  };

  const openMembers = (group: Group) => {
    setSelectedGroup(group);
    setAddUserId('');
    setAddIsLeader(false);
    setMemberSearch('');
    setIsMemberOpen(true);
  };

  const handleAddMember = async () => {
    if (!selectedGroup || !addUserId) return;
    await groupsApi.addMember(selectedGroup.id, { userId: addUserId, isLeader: addIsLeader });
    const res = await groupsApi.list();
    const updated = res.data.data.find(g => g.id === selectedGroup.id);
    if (updated) setSelectedGroup(updated);
    setGroups(res.data.data);
    setAddUserId('');
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroup) return;
    await groupsApi.removeMember(selectedGroup.id, userId);
    const res = await groupsApi.list();
    const updated = res.data.data.find(g => g.id === selectedGroup.id);
    if (updated) setSelectedGroup(updated);
    setGroups(res.data.data);
  };

  const getMemberIds = (group: Group | null) => group?.members?.map(m => m.id) ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading font-bold text-text">グループ管理</h1>
          <p className="text-sub text-subtext mt-1">{groups.length} グループ</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <span className="text-lg">+</span>
          グループ作成
        </button>
      </div>

      {isLoading ? (
        <div className="py-16"><LoadingSpinner /></div>
      ) : groups.length === 0 ? (
        <div className="card text-center py-12 text-subtext">
          グループがまだありません
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(group => (
            <div key={group.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: group.color || '#6B7280' }}
                  >
                    {group.name.slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-bold text-text">{group.name}</h3>
                    <p className="text-xs text-subtext">{group.memberCount ?? 0} 名</p>
                  </div>
                </div>
              </div>

              {group.description && (
                <p className="text-sub text-subtext mb-3 text-sm">{group.description}</p>
              )}

              <div className="flex flex-wrap gap-1 mb-4 min-h-[2rem]">
                {group.members?.slice(0, 5).map(m => (
                  <span key={m.id} className="text-xs bg-gray-100 text-text px-2 py-0.5 rounded-full">
                    {m.isLeader ? '★ ' : ''}{m.lastName} {m.firstName}
                  </span>
                ))}
                {(group.memberCount ?? 0) > 5 && (
                  <span className="text-xs text-subtext px-2 py-0.5">+{(group.memberCount ?? 0) - 5}名</span>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-border">
                <button
                  onClick={() => navigate(`/admin/groups/${group.id}`)}
                  className="btn-primary text-xs py-1.5 px-3 flex-1"
                >
                  詳細設定
                </button>
                <button
                  onClick={() => openMembers(group)}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  メンバー
                </button>
                <button
                  onClick={() => openEdit(group)}
                  className="text-primary text-sub hover:underline px-2"
                >
                  編集
                </button>
                <button
                  onClick={() => handleDelete(group)}
                  className="text-danger text-sub hover:underline px-2"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingGroup ? 'グループを編集' : 'グループを作成'}
      >
        <div className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-danger text-sub">
              {formError}
            </div>
          )}
          <div>
            <label className="form-label">グループ名 <span className="text-danger">*</span></label>
            <input
              type="text"
              value={formState.name}
              onChange={e => setFormState(p => ({ ...p, name: e.target.value }))}
              className="form-input"
              placeholder="例: 1Fフロア"
            />
          </div>
          <div>
            <label className="form-label">カラー</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormState(p => ({ ...p, color }))}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                    formState.color === color ? 'border-text scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="color"
                value={formState.color}
                onChange={e => setFormState(p => ({ ...p, color: e.target.value }))}
                className="w-8 h-8 rounded cursor-pointer border border-border"
              />
              <span className="text-sub text-subtext">カスタムカラー</span>
              <span className="text-xs text-subtext">{formState.color}</span>
            </div>
          </div>
          <div>
            <label className="form-label">説明</label>
            <textarea
              value={formState.description}
              onChange={e => setFormState(p => ({ ...p, description: e.target.value }))}
              className="form-input resize-none"
              rows={2}
              placeholder="グループの説明（任意）"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmitForm}
              disabled={isSubmitting}
              className="btn-primary disabled:opacity-60"
            >
              {isSubmitting ? '保存中...' : editingGroup ? '変更を保存' : '作成する'}
            </button>
            <button onClick={() => setIsFormOpen(false)} className="btn-secondary">
              キャンセル
            </button>
          </div>
        </div>
      </Modal>

      {/* Member Management Modal */}
      <Modal
        isOpen={isMemberOpen}
        onClose={() => setIsMemberOpen(false)}
        title={`メンバー管理 - ${selectedGroup?.name}`}
        size="lg"
      >
        <div className="space-y-4">
          {/* Add Member */}
          <div className="p-4 bg-gray-50 rounded-lg border border-border">
            <p className="text-sub font-medium mb-3">メンバーを追加</p>
            <input
              type="text"
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="スタッフ検索（氏名・フリガナ・ID）"
              className="form-input mb-2"
            />
            <div className="flex gap-2 flex-wrap">
              {(() => {
                const candidates = allStaff
                  .filter(s => s.role !== 'ADMIN' && !getMemberIds(selectedGroup).includes(s.id) && matchStaff(s, memberSearch))
                  .slice()
                  .sort(compareKana);
                return (
                  <select
                    value={addUserId}
                    onChange={e => setAddUserId(e.target.value)}
                    className="form-input flex-1 min-w-48"
                    size={memberSearch ? 5 : 1}
                  >
                    <option value="">スタッフを選択...（{candidates.length}名）</option>
                    {candidates.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.lastName} {s.firstName} ({s.userCode})
                      </option>
                    ))}
                  </select>
                );
              })()}
              <label className="flex items-center gap-1.5 text-sub cursor-pointer">
                <input
                  type="checkbox"
                  checked={addIsLeader}
                  onChange={e => setAddIsLeader(e.target.checked)}
                  className="w-4 h-4"
                />
                リーダー
              </label>
              <button
                onClick={handleAddMember}
                disabled={!addUserId}
                className="btn-primary disabled:opacity-60"
              >
                追加
              </button>
            </div>
          </div>

          {/* Member List */}
          <div>
            <p className="text-sub font-medium mb-2">現在のメンバー ({selectedGroup?.members?.length ?? 0} 名)</p>
            {selectedGroup?.members?.length === 0 ? (
              <p className="text-subtext text-sub py-4 text-center">メンバーがいません</p>
            ) : (
              <div className="space-y-2">
                {selectedGroup?.members?.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-white border border-border rounded-lg">
                    <div className="flex items-center gap-2">
                      {member.isLeader && (
                        <span className="text-warning text-sm font-bold">★</span>
                      )}
                      <span className="font-medium text-text">{member.lastName} {member.firstName}</span>
                      <span className="text-xs text-subtext">{member.userCode}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="text-danger text-xs hover:underline"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
