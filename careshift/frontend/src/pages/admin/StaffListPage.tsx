import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffApi } from '../../api/staff';
import { groupsApi } from '../../api/groups';
import { User, Group } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import Badge from '../../components/common/Badge';
import Pagination from '../../components/common/Pagination';

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: '正社員',
  PART_TIME: 'パート',
  CONTRACT: '契約社員',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '管理者',
  GROUP_LEADER: 'グループリーダー',
  STAFF: 'スタッフ',
};

export default function StaffListPage() {
  const navigate = useNavigate();
  const [staff, setStaff] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [groupId, setGroupId] = useState('');
  const [activeFilter, setActiveFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [searchInput, setSearchInput] = useState('');

  const perPage = 20;

  const fetchStaff = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await staffApi.list({
        page,
        per_page: perPage,
        search: search || undefined,
        employment_type: employmentType || undefined,
        group_id: groupId || undefined,
        is_active: activeFilter === 'all' ? 'all' : activeFilter === 'active' ? 'true' : 'false',
      });
      setStaff(res.data.data);
      setTotal(res.data.meta?.total ?? 0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, employmentType, groupId, activeFilter]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  useEffect(() => {
    groupsApi.list().then(res => setGroups(res.data.data));
  }, []);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading font-bold text-text">スタッフ管理</h1>
          <p className="text-sub text-subtext mt-1">全 {total} 名</p>
        </div>
        <button
          onClick={() => navigate('/admin/staff/new')}
          className="btn-primary flex items-center gap-2"
        >
          <span className="text-lg">+</span>
          スタッフ登録
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-48">
            <input
              type="text"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="氏名・フリガナ・IDで検索"
              className="form-input"
            />
          </div>
          <select
            value={employmentType}
            onChange={e => { setEmploymentType(e.target.value); setPage(1); }}
            className="form-input w-auto"
          >
            <option value="">雇用形態 : すべて</option>
            <option value="FULL_TIME">正社員</option>
            <option value="PART_TIME">パート</option>
            <option value="CONTRACT">契約社員</option>
          </select>
          <select
            value={groupId}
            onChange={e => { setGroupId(e.target.value); setPage(1); }}
            className="form-input w-auto"
          >
            <option value="">グループ : すべて</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select
            value={activeFilter}
            onChange={e => { setActiveFilter(e.target.value as 'active' | 'inactive' | 'all'); setPage(1); }}
            className="form-input w-auto"
          >
            <option value="active">状態 : 有効のみ</option>
            <option value="inactive">状態 : 無効のみ</option>
            <option value="all">状態 : すべて</option>
          </select>
          <button onClick={handleSearch} className="btn-primary">検索</button>
          <button
            onClick={() => { setSearch(''); setSearchInput(''); setEmploymentType(''); setGroupId(''); setActiveFilter('active'); setPage(1); }}
            className="btn-secondary"
          >
            リセット
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="py-16"><LoadingSpinner /></div>
        ) : staff.length === 0 ? (
          <div className="py-16 text-center text-subtext">スタッフが見つかりません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">氏名</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">ユーザーID</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">ロール</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">雇用形態</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">グループ</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">入社日</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staff.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-text flex items-center gap-2">
                          {s.lastName} {s.firstName}
                          {!s.isActive && (
                            <span className="px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-subtext">無効化済み</span>
                          )}
                        </p>
                        {(s.lastNameKana || s.firstNameKana) && (
                          <p className="text-xs text-subtext">{s.lastNameKana} {s.firstNameKana}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sub text-subtext">{s.userCode}</td>
                    <td className="px-6 py-4">
                      <Badge variant={s.role === 'ADMIN' ? 'danger' : s.role === 'GROUP_LEADER' ? 'warning' : 'default'}>
                        {ROLE_LABELS[s.role]}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={s.employmentType === 'FULL_TIME' ? 'info' : 'default'}>
                        {EMPLOYMENT_TYPE_LABELS[s.employmentType]}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {s.groups?.map(g => (
                          <span
                            key={g.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                            style={{ backgroundColor: g.color || '#6B7280' }}
                          >
                            {g.isLeader ? '★ ' : ''}{g.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sub text-subtext">
                      {s.hireDate ? new Date(s.hireDate).toLocaleDateString('ja-JP') : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => navigate(`/admin/staff/${s.id}`)}
                        className="text-primary text-sub hover:underline"
                      >
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
