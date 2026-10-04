import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';

const PAGE_SIZE = 50;

export const AdminDashboard = ({ userRole, onObserveRoom }) => {
  const isSuper = userRole === 'admin';
  const [activeTab, setActiveTab] = useState(isSuper ? 'users' : 'subscriptions');

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex gap-2 bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm w-fit flex-wrap">
        {isSuper && (
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              activeTab === 'users'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            ⚙️ Тренеры и ученики
          </button>
        )}
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
            activeTab === 'subscriptions'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          💳 Абонементы
        </button>
        {isSuper && (
          <button
            onClick={() => setActiveTab('salary')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              activeTab === 'salary'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            💰 Зарплата
          </button>
        )}
        {isSuper && (
          <button
            onClick={() => setActiveTab('admins')}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
              activeTab === 'admins'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            🛡️ Админы
          </button>
        )}
      </div>

      {isSuper && activeTab === 'users' && <UsersTab onObserveRoom={onObserveRoom} />}
      {activeTab === 'subscriptions' && <SubscriptionsTab />}
      {isSuper && activeTab === 'salary' && <SalaryTab />}
      {isSuper && activeTab === 'admins' && <AdminsTab />}
    </div>
  );
};

/* ============================================================
   Вспомогательный компонент: пагинация
   ============================================================ */
const Pagination = ({ page, totalPages, onChange, total }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 mt-4 text-xs">
      <span className="text-gray-500">
        Всего: <strong className="text-gray-800">{total}</strong>
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold disabled:opacity-40 cursor-pointer"
        >
          ← Назад
        </button>
        <span className="font-semibold text-gray-700 px-2">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-semibold disabled:opacity-40 cursor-pointer"
        >
          Вперёд →
        </button>
      </div>
    </div>
  );
};

/* ============================================================
   Вкладка 1: Пользователи (с пагинацией)
   ============================================================ */
const UsersTab = ({ onObserveRoom }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [fetchingUsers, setFetchingUsers] = useState(true);

  const [activeLessons, setActiveLessons] = useState([]);
  const [fetchingLessons, setFetchingLessons] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setFetchingUsers(true);
    try {
      let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      const q = searchDebounced.trim();
      if (q) {
        query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;
      setUsers(data || []);
      setTotalUsers(count || 0);
    } catch (err) {
      console.error('Не удалось загрузить пользователей:', err);
    } finally {
      setFetchingUsers(false);
    }
  }, [page, searchDebounced]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const fetchActiveLessons = useCallback(async () => {
    try {
      const cutoff = new Date(Date.now() - 70000).toISOString();
      const { data: presence, error: presenceError } = await supabase
        .from('lesson_presence')
        .select('lesson_id, teacher_id, last_seen_at')
        .gte('last_seen_at', cutoff)
        .order('last_seen_at', { ascending: false });

      if (presenceError) throw presenceError;

      const rawIds = (presence || []).map((i) => i.lesson_id);
      const teacherIds = (presence || []).map((i) => i.teacher_id);
      const allIds = [...new Set([...rawIds, ...teacherIds])];

      if (allIds.length === 0) {
        setActiveLessons([]);
        return;
      }

      const [{ data: profiles }, { data: groups }] = await Promise.all([
        supabase.from('profiles').select('id, name, email, role').in('id', allIds),
        supabase.from('groups').select('id, name, teacher_id').in('id', rawIds),
      ]);

      const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      const groupById = Object.fromEntries((groups || []).map((g) => [g.id, g]));

      setActiveLessons(
        (presence || [])
          .map((item) => {
            const group = groupById[item.lesson_id];
            return {
              ...item,
              isGroup: !!group,
              group,
              student: group ? null : profileById[item.lesson_id],
              teacher: profileById[item.teacher_id],
            };
          })
          .filter((i) => i.isGroup || i.student)
      );
    } catch (err) {
      console.error('Не удалось загрузить активные уроки:', err);
      setActiveLessons([]);
    } finally {
      setFetchingLessons(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveLessons();

    const channel = supabase
      .channel('admin-presence')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lesson_presence' },
        () => {
          fetchActiveLessons();
        }
      )
      .subscribe();

    const safetyInterval = window.setInterval(fetchActiveLessons, 30000);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(safetyInterval);
    };
  }, [fetchActiveLessons]);

  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const { error: rpcError } = await supabase.rpc('create_user_by_admin', {
        target_email: email,
        target_password: 'beechess123',
        target_role: 'teacher',
      });
      if (rpcError) throw rpcError;

      setMessage(`Тренер создан! Email: ${email}, пароль: beechess123`);
      setEmail('');
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Удалить пользователя ${userEmail} безвозвратно?`)) return;
    setMessage(null);
    setError(null);
    try {
      const { error: deleteError } = await supabase.rpc('delete_user_by_admin', {
        target_user_id: userId,
      });
      if (deleteError) throw deleteError;
      setUsers(users.filter((u) => u.id !== userId));
      setTotalUsers((t) => Math.max(0, t - 1));
      setMessage(`Пользователь ${userEmail} удалён из системы.`);
    } catch (err) {
      console.error('Ошибка удаления:', err);
      setError('Не удалось удалить: ' + err.message);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">🟢 Активные уроки</h3>
            <p className="text-xs text-gray-400 mt-1">
              Режим наблюдателя: без права делать ходы и управлять уроком
            </p>
          </div>
          <button
            type="button"
            onClick={fetchActiveLessons}
            className="text-xs text-blue-600 hover:underline cursor-pointer font-medium"
          >
            Обновить
          </button>
        </div>

        {fetchingLessons ? (
          <div className="text-xs text-gray-400 py-5 text-center">Проверяем активные комнаты...</div>
        ) : activeLessons.length === 0 ? (
          <div className="rounded-xl bg-slate-50 py-6 text-center text-xs text-gray-500">
            Сейчас нет активных уроков
          </div>
        ) : (
          <div className="space-y-2">
            {activeLessons.map((item) => (
              <div
                key={item.lesson_id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {item.isGroup
                      ? `👥 Группа: ${item.group?.name || '—'} · тренер ${
                          item.teacher?.name || item.teacher?.email || '—'
                        }`
                      : `${item.teacher?.name || item.teacher?.email || 'Тренер'} → ${
                          item.student?.name || item.student?.email || 'Ученик'
                        }`}
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    {item.isGroup ? 'Групповой урок идёт' : 'Урок идёт'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onObserveRoom?.(
                      item.isGroup
                        ? {
                            id: item.group.id,
                            name: item.group.name,
                            isGroup: true,
                            teacher: item.teacher,
                          }
                        : item.student
                    )
                  }
                  className="shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-purple-700 cursor-pointer"
                >
                  👁 Наблюдать
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Добавить тренера</h3>

        {message && <div className="mb-4 p-3 bg-green-50 text-green-700 text-xs rounded-lg">{message}</div>}
        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg">{error}</div>}

        <form onSubmit={handleCreateTeacher} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Email тренера</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@example.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-600"
              required
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Пароль по умолчанию: <span className="font-semibold text-gray-600">beechess123</span>
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm cursor-pointer disabled:opacity-50 h-[38px]"
          >
            {loading ? 'Создание...' : 'Добавить тренера'}
          </button>
        </form>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <h3 className="text-lg font-bold text-gray-900">Пользователи системы</h3>
          <button
            onClick={fetchUsers}
            className="text-xs text-blue-600 hover:underline cursor-pointer font-medium"
          >
            Обновить список
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по email или имени…"
          className="w-full mb-4 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
        />

        {fetchingUsers ? (
          <div className="text-xs text-gray-400 py-4 text-center">Загрузка пользователей...</div>
        ) : users.length === 0 ? (
          <div className="text-xs text-gray-400 py-4 text-center">
            {searchDebounced ? 'Ничего не найдено' : 'Пользователей пока нет'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400">
                    <th className="py-2.5 px-3 font-medium">Email</th>
                    <th className="py-2.5 px-3 font-medium">Роль</th>
                    <th className="py-2.5 px-3 font-medium">Создан</th>
                    <th className="py-2.5 px-3 font-medium text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-3 font-medium text-gray-900">{u.email}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] ${
                            u.role === 'admin'
                              ? 'bg-purple-50 text-purple-700'
                              : u.role === 'crm_admin'
                              ? 'bg-emerald-50 text-emerald-700'
                              : u.role === 'teacher'
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-gray-400">
                        {new Date(u.created_at).toLocaleString('ru-RU')}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {u.role !== 'admin' && (
                          <button
                            onClick={() => handleDeleteUser(u.id, u.email)}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded transition cursor-pointer"
                          >
                            Удалить
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              total={totalUsers}
            />
          </>
        )}
      </div>
    </div>
  );
};
/* ============================================================
   Вкладка 2: Абонементы (с пагинацией)
   ============================================================ */
const SubscriptionsTab = () => {
  const [students, setStudents] = useState([]);
  const [subsByStudent, setSubsByStudent] = useState({});
  const [totalStudents, setTotalStudents] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [fetching, setFetching] = useState(true);
  const [busyStudentId, setBusyStudentId] = useState(null);
  const [historyStudent, setHistoryStudent] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setFetching(true);
    try {
      let query = supabase
        .from('profiles')
        .select('id, email, name, role, created_at', { count: 'exact' })
        .eq('role', 'student')
        .order('created_at', { ascending: false });

      const q = searchDebounced.trim();
      if (q) {
        query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data: studentsData, error: sErr, count } = await query.range(from, to);
      if (sErr) throw sErr;

      setStudents(studentsData || []);
      setTotalStudents(count || 0);

      const ids = (studentsData || []).map((s) => s.id);
      if (ids.length) {
        const { data: subsData, error: subErr } = await supabase
          .from('subscriptions')
          .select('student_id, balance')
          .in('student_id', ids);
        if (subErr) throw subErr;
        const map = {};
        (subsData || []).forEach((s) => {
          map[s.student_id] = s.balance;
        });
        setSubsByStudent(map);
      } else {
        setSubsByStudent({});
      }
    } catch (err) {
      console.error('Ошибка загрузки абонементов:', err);
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }, [page, searchDebounced]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const adjust = async (studentId, delta, reason = 'Ручная корректировка') => {
    setBusyStudentId(studentId);
    setMessage(null);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('adjust_subscription', {
        p_student_id: studentId,
        p_delta: delta,
        p_reason: reason,
        p_lesson_id: null,
      });
      if (rpcError) throw rpcError;

      const newBalance = data?.balance ?? (subsByStudent[studentId] || 0) + delta;
      setSubsByStudent((prev) => ({ ...prev, [studentId]: newBalance }));
      setMessage(`Баланс обновлён: ${delta > 0 ? '+' : ''}${delta}`);
      setTimeout(() => setMessage(null), 2500);
    } catch (err) {
      console.error('Ошибка изменения абонемента:', err);
      setError(err.message);
    } finally {
      setBusyStudentId(null);
    }
  };

  const openHistory = async (student) => {
    setHistoryStudent(student);
    setHistoryLoading(true);
    setHistoryRows([]);
    try {
      const { data, error } = await supabase
        .from('subscription_transactions')
        .select('id, delta, reason, created_at, lesson_id')
        .eq('student_id', student.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setHistoryRows(data || []);
    } catch (err) {
      console.error('Ошибка истории:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const askCustomAmount = (student) => {
    const input = window.prompt(
      `Сколько занятий добавить/списать для ${student.name || student.email}?\nВведите положительное число для добавления, отрицательное — для списания.`
    );
    if (!input) return;
    const delta = parseInt(input, 10);
    if (!Number.isFinite(delta) || delta === 0) {
      alert('Нужно ввести целое число, не равное нулю.');
      return;
    }
    const reason = delta > 0 ? 'Ручное пополнение' : 'Ручное списание';
    adjust(student.id, delta, reason);
  };

  const totalPages = Math.max(1, Math.ceil(totalStudents / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">💳 Абонементы учеников</h3>
            <p className="text-xs text-gray-400 mt-1">
              Баланс — количество оставшихся занятий. Может быть отрицательным (в долг).
            </p>
          </div>
          <button
            onClick={fetchData}
            className="text-xs text-blue-600 hover:underline cursor-pointer font-medium self-start sm:self-auto"
          >
            Обновить
          </button>
        </div>

        {message && <div className="mb-3 p-2 bg-green-50 text-green-700 text-xs rounded-lg">{message}</div>}
        {error && <div className="mb-3 p-2 bg-red-50 text-red-600 text-xs rounded-lg">{error}</div>}

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени или email…"
          className="w-full mb-4 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-500"
        />

        {fetching ? (
          <div className="text-xs text-gray-400 py-6 text-center">Загрузка…</div>
        ) : students.length === 0 ? (
          <div className="text-xs text-gray-400 py-6 text-center">
            {searchDebounced ? 'Ничего не найдено' : 'Учеников пока нет'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400">
                    <th className="py-2.5 px-3 font-medium">Ученик</th>
                    <th className="py-2.5 px-3 font-medium w-24 text-center">Баланс</th>
                    <th className="py-2.5 px-3 font-medium text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-700">
                  {students.map((s) => {
                    const balance = subsByStudent[s.id] ?? 0;
                    const busy = busyStudentId === s.id;
                    const isNegative = balance < 0;
                    return (
                      <tr key={s.id} className="hover:bg-gray-50/50">
                        <td className="py-3 px-3">
                          <div className="font-medium text-gray-900">{s.name || '—'}</div>
                          <div className="text-[11px] text-gray-400">{s.email}</div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-block min-w-[42px] px-2 py-1 rounded-lg font-bold text-sm ${
                              isNegative
                                ? 'bg-red-50 text-red-600'
                                : balance === 0
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {balance}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <button
                              disabled={busy}
                              onClick={() => adjust(s.id, 1, 'Ручное пополнение')}
                              className="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded font-bold disabled:opacity-40 cursor-pointer"
                              title="Добавить 1 занятие"
                            >
                              +1
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => adjust(s.id, 8, 'Пополнение абонемента (8 занятий)')}
                              className="px-2 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 rounded font-bold disabled:opacity-40 cursor-pointer"
                              title="Добавить 8 занятий"
                            >
                              +8
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => adjust(s.id, -1, 'Ручное списание')}
                              className="px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 rounded font-bold disabled:opacity-40 cursor-pointer"
                              title="Списать 1 занятие"
                            >
                              −1
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => askCustomAmount(s)}
                              className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded font-semibold disabled:opacity-40 cursor-pointer"
                              title="Другая сумма"
                            >
                              ±N
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => openHistory(s)}
                              className="px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded font-semibold disabled:opacity-40 cursor-pointer"
                              title="История операций"
                            >
                              📜
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              total={totalStudents}
            />
          </>
        )}
      </div>

      {historyStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">История абонемента</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {historyStudent.name || '—'} · {historyStudent.email}
                </p>
              </div>
              <button
                onClick={() => setHistoryStudent(null)}
                className="text-gray-400 hover:text-gray-700 text-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            {historyLoading ? (
              <div className="text-xs text-gray-400 py-6 text-center">Загрузка…</div>
            ) : historyRows.length === 0 ? (
              <div className="text-xs text-gray-400 py-6 text-center">Операций пока нет</div>
            ) : (
              <div className="space-y-1.5">
                {historyRows.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-slate-100 bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-800 truncate">
                        {r.reason}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(r.created_at).toLocaleString('ru-RU')}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-bold ${
                        r.delta > 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {r.delta > 0 ? '+' : ''}
                      {r.delta}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setHistoryStudent(null)}
              className="mt-4 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm cursor-pointer"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ============================================================
   Вкладка 3: Зарплата тренеров
   ============================================================ */
const SalaryTab = () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = firstDay;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = lastDay;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [teacherFilter, setTeacherFilter] = useState('');
  const [teachers, setTeachers] = useState([]);
  const [earnings, setEarnings] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const fetchTeachers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('role', 'teacher')
      .order('name');
    setTeachers(data || []);
  }, []);

  const fetchEarnings = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const fromIso = new Date(dateFrom + 'T00:00:00').toISOString();
      const toIso = new Date(dateTo + 'T23:59:59').toISOString();

      let query = supabase
        .from('teacher_earnings')
        .select('id, teacher_id, lesson_id, amount, duration_min, student_count, is_group, lesson_date')
        .gte('lesson_date', fromIso)
        .lte('lesson_date', toIso)
        .order('lesson_date', { ascending: false });

      if (teacherFilter) {
        query = query.eq('teacher_id', teacherFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setEarnings(data || []);
    } catch (err) {
      console.error('Ошибка загрузки зарплаты:', err);
      setError(err.message);
    } finally {
      setFetching(false);
    }
  }, [dateFrom, dateTo, teacherFilter]);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  const handleRecalculate = async () => {
    if (
      !window.confirm(
        'Пересчитать все уже проведённые уроки?\n\nБудут добавлены записи только для уроков, у которых их ещё нет.'
      )
    )
      return;
    setRecalculating(true);
    setMessage(null);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('recalculate_all_earnings');
      if (error) throw error;
      setMessage(`Добавлено записей: ${data || 0}`);
      await fetchEarnings();
    } catch (err) {
      setError(err.message);
    } finally {
      setRecalculating(false);
    }
  };

  const teacherMap = useMemo(() => {
    const m = {};
    teachers.forEach((t) => (m[t.id] = t));
    return m;
  }, [teachers]);

  const total = useMemo(
    () => earnings.reduce((sum, e) => sum + (e.amount || 0), 0),
    [earnings]
  );

  const byTeacher = useMemo(() => {
    const m = {};
    earnings.forEach((e) => {
      if (!m[e.teacher_id]) {
        m[e.teacher_id] = { total: 0, count: 0 };
      }
      m[e.teacher_id].total += e.amount || 0;
      m[e.teacher_id].count += 1;
    });
    return m;
  }, [earnings]);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">💰 Зарплата тренеров</h3>
            <p className="text-xs text-gray-400 mt-1">
              Период — по дате урока. Считается по фактически пришедшим ученикам.
            </p>
          </div>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="text-xs px-3 py-1.5 bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-lg font-bold disabled:opacity-50 cursor-pointer"
          >
            {recalculating ? 'Пересчёт...' : '🔄 Пересчитать всё'}
          </button>
        </div>

        {message && (
          <div className="mb-3 p-2 bg-green-50 text-green-700 text-xs rounded-lg">{message}</div>
        )}
        {error && (
          <div className="mb-3 p-2 bg-red-50 text-red-600 text-xs rounded-lg">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">С даты</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">По дату</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Тренер</label>
            <select
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer"
            >
              <option value="">Все тренеры</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name || t.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-amber-700 uppercase tracking-wide">
              Итого за период
            </div>
            <div className="text-2xl font-black text-amber-900 mt-1">
              {total.toLocaleString('ru-RU')} ₸
            </div>
          </div>
          <div className="text-right text-xs text-amber-700">
            Уроков: <strong>{earnings.length}</strong>
          </div>
        </div>

        {Object.keys(byTeacher).length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wide">
              По тренерам
            </div>
            {Object.entries(byTeacher).map(([tid, info]) => {
              const t = teacherMap[tid];
              return (
                <div
                  key={tid}
                  className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-100"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">
                      {t?.name || t?.email || 'Тренер'}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      Уроков: {info.count}
                    </div>
                  </div>
                  <div className="text-base font-black text-emerald-700 shrink-0">
                    {info.total.toLocaleString('ru-RU')} ₸
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h3 className="text-base font-bold text-gray-900 mb-4">Детализация</h3>

        {fetching ? (
          <div className="text-xs text-gray-400 py-6 text-center">Загрузка…</div>
        ) : earnings.length === 0 ? (
          <div className="text-xs text-gray-400 py-6 text-center">
            За выбранный период начислений нет
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400">
                  <th className="py-2.5 px-3 font-medium">Дата</th>
                  <th className="py-2.5 px-3 font-medium">Тренер</th>
                  <th className="py-2.5 px-3 font-medium text-center">Длит.</th>
                  <th className="py-2.5 px-3 font-medium text-center">Учеников</th>
                  <th className="py-2.5 px-3 font-medium text-center">Тип</th>
                  <th className="py-2.5 px-3 font-medium text-right">Сумма</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-700">
                {earnings.map((e) => {
                  const t = teacherMap[e.teacher_id];
                  return (
                    <tr key={e.id} className="hover:bg-gray-50/50">
                      <td className="py-3 px-3 text-gray-500 font-mono text-[11px]">
                        {new Date(e.lesson_date).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-3 font-medium text-gray-900">
                        {t?.name || t?.email || '—'}
                      </td>
                      <td className="py-3 px-3 text-center">{e.duration_min}м</td>
                      <td className="py-3 px-3 text-center">{e.student_count}</td>
                      <td className="py-3 px-3 text-center text-[10px]">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                            e.is_group
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {e.is_group ? 'Группа' : 'Индив.'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700">
                        {e.amount.toLocaleString('ru-RU')} ₸
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
/* ============================================================
   Вкладка 4: Админы (только для суперадмина)
   ============================================================ */
const AdminsTab = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('beechess123');
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [admins, setAdmins] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const fetchAdmins = useCallback(async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, name, role, created_at')
        .in('role', ['admin', 'crm_admin'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAdmins(data || []);
    } catch (err) {
      console.error('Ошибка загрузки админов:', err);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setCreating(true);
    setMessage(null);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc('create_user_by_admin', {
        target_email: email.trim(),
        target_password: password || 'beechess123',
        target_role: 'crm_admin',
      });
      if (rpcErr) throw rpcErr;
      setMessage(`Админ CRM создан: ${email} · пароль: ${password}`);
      setEmail('');
      setPassword('beechess123');
      await fetchAdmins();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    const roleNames = {
      admin: 'админ',
      crm_admin: 'админ CRM',
      teacher: 'тренер',
      student: 'ученик',
    };
    if (!window.confirm(`Сменить роль на «${roleNames[newRole]}»?`)) return;
    setBusyId(userId);
    setMessage(null);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc('update_user_role', {
        target_user_id: userId,
        new_role: newRole,
      });
      if (rpcErr) throw rpcErr;
      setMessage(`Роль изменена на «${roleNames[newRole]}»`);
      await fetchAdmins();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (userId, userEmail) => {
    if (!window.confirm(`Удалить админа ${userEmail}? Действие необратимо.`)) return;
    setBusyId(userId);
    setMessage(null);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc('delete_user_by_admin', {
        target_user_id: userId,
      });
      if (rpcErr) throw rpcErr;
      setMessage(`Админ ${userEmail} удалён.`);
      setAdmins((prev) => prev.filter((a) => a.id !== userId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Создать админа CRM</h3>
        <p className="text-xs text-gray-400 mb-4">
          Админ CRM видит только раздел «Абонементы» — может пополнять и списывать занятия.
          Доступа к тренерам, ученикам и расписанию у него нет.
        </p>

        {message && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 text-xs rounded-lg">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg">{error}</div>
        )}

        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-600"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Пароль</label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="beechess123"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-600 font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !email.trim()}
            className="py-2 px-5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm cursor-pointer disabled:opacity-50 h-[38px]"
          >
            {creating ? 'Создание...' : 'Создать админа'}
          </button>
        </form>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Список админов</h3>
          <button
            onClick={fetchAdmins}
            className="text-xs text-blue-600 hover:underline cursor-pointer font-medium"
          >
            Обновить
          </button>
        </div>

        {fetching ? (
          <div className="text-xs text-gray-400 py-4 text-center">Загрузка…</div>
        ) : admins.length === 0 ? (
          <div className="text-xs text-gray-400 py-4 text-center">Админов пока нет</div>
        ) : (
          <div className="space-y-2">
            {admins.map((a) => {
              const busy = busyId === a.id;
              const isSuper = a.role === 'admin';
              return (
                <div
                  key={a.id}
                  className={`flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-3 rounded-xl border ${
                    isSuper
                      ? 'bg-purple-50/50 border-purple-100'
                      : 'bg-emerald-50/40 border-emerald-100'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900 truncate">
                        {a.name || a.email}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          isSuper
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {isSuper ? 'админ' : 'админ CRM'}
                      </span>
                    </div>
                    {a.name && (
                      <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                        {a.email}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Создан: {new Date(a.created_at).toLocaleString('ru-RU')}
                    </div>
                  </div>

                  {!isSuper && (
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-end">
                      <button
                        disabled={busy}
                        onClick={() => handleChangeRole(a.id, 'teacher')}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 cursor-pointer"
                        title="Сменить на тренера"
                      >
                        → тренер
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleChangeRole(a.id, 'student')}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 cursor-pointer"
                        title="Сменить на ученика"
                      >
                        → ученик
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleDelete(a.id, a.email)}
                        className="px-2.5 py-1 text-xs font-bold rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-40 cursor-pointer"
                      >
                        Удалить
                      </button>
                    </div>
                  )}

                  {isSuper && (
                    <div className="text-[10px] text-purple-600 font-bold uppercase">
                      Суперадмин
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};