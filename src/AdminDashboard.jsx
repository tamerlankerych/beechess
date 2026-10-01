import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

export const AdminDashboard = ({ onObserveRoom }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [users, setUsers] = useState([]);
  const [fetchingUsers, setFetchingUsers] = useState(true);
  const [activeLessons, setActiveLessons] = useState([]);
  const [fetchingLessons, setFetchingLessons] = useState(true);

  // Загружаем список всех пользователей (профилей)
  const fetchUsers = useCallback(async () => {
    setFetchingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setFetchingUsers(false);
    }
  }, []);

  const fetchActiveLessons = useCallback(async () => {
    setFetchingLessons(true);
    try {
      const cutoff = new Date(Date.now() - 70000).toISOString();
      const { data: presence, error: presenceError } = await supabase
        .from('lesson_presence')
        .select('lesson_id, teacher_id, last_seen_at')
        .gte('last_seen_at', cutoff)
        .order('last_seen_at', { ascending: false });

      if (presenceError) throw presenceError;

      const profileIds = [...new Set((presence || []).flatMap((item) => [item.lesson_id, item.teacher_id]))];
      if (profileIds.length === 0) {
        setActiveLessons([]);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .in('id', profileIds);

      if (profilesError) throw profilesError;
      const profileById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));

      setActiveLessons((presence || []).map((item) => ({
        ...item,
        student: profileById[item.lesson_id],
        teacher: profileById[item.teacher_id]
      })).filter((item) => item.student));
    } catch (err) {
      console.error('Failed to load active lessons:', err);
      setActiveLessons([]);
    } finally {
      setFetchingLessons(false);
    }
  }, []);

  useEffect(() => {
    // Загрузка данных из Supabase при первом открытии панели.
    // Запросы асинхронные; изменения состояния происходят после ответа базы.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
    fetchActiveLessons();
    const refreshInterval = window.setInterval(fetchActiveLessons, 15000);
    return () => window.clearInterval(refreshInterval);
  }, [fetchActiveLessons, fetchUsers]);

  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      // Админ создает тренера с дефолтным паролем beechess123
      const { error: rpcError } = await supabase.rpc('create_user_by_admin', {
        target_email: email,
        target_password: 'beechess123',
        target_role: 'teacher',
      });

      if (rpcError) throw rpcError;

      setMessage(`Coach created successfully! Email: ${email}, Password: beechess123`);
      setEmail('');
      fetchUsers(); // Обновляем список пользователей
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Функция полного удаления пользователя через RPC-функцию в базе данных
  const handleDeleteUser = async (userId, userEmail) => {
    if (!window.confirm(`Are you sure you want to permanently delete user ${userEmail}?`)) {
      return;
    }

    setMessage(null);
    setError(null);

    try {
      const { error: deleteError } = await supabase.rpc('delete_user_by_admin', {
        target_user_id: userId,
      });

      if (deleteError) throw deleteError;

      // Обновляем локальный стейт списка пользователей, чтобы строка сразу исчезла
      setUsers(users.filter((u) => u.id !== userId));
      setMessage(`User ${userEmail} was successfully removed from the system.`);
    } catch (err) {
      console.error('Error deleting user:', err);
      setError('Failed to delete user: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-900">🟢 Active Lessons</h3>
            <p className="text-xs text-gray-400 mt-1">Observer mode does not allow board changes or lesson controls</p>
          </div>
          <button
            type="button"
            onClick={fetchActiveLessons}
            className="text-xs text-blue-600 hover:underline cursor-pointer font-medium"
          >
            Refresh
          </button>
        </div>

        {fetchingLessons ? (
          <div className="text-xs text-gray-400 py-5 text-center">Checking active rooms...</div>
        ) : activeLessons.length === 0 ? (
          <div className="rounded-xl bg-slate-50 py-6 text-center text-xs text-gray-500">
            No active lessons right now
          </div>
        ) : (
          <div className="space-y-2">
            {activeLessons.map((item) => (
              <div key={item.lesson_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">
                    {item.teacher?.name || item.teacher?.email || 'Coach'} → {item.student?.name || item.student?.email || 'Student'}
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-0.5">Lesson in progress</p>
                </div>
                <button
                  type="button"
                  onClick={() => onObserveRoom?.(item.student)}
                  className="shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-purple-700 cursor-pointer"
                >
                  👁 Observe
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Форма добавления тренера */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Admin Panel: Add Coach</h3>

        {message && <div className="mb-4 p-3 bg-green-50 text-green-700 text-xs rounded-lg">{message}</div>}
        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg">{error}</div>}

        <form onSubmit={handleCreateTeacher} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Coach email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@example.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-600"
              required
            />
            <p className="text-[10px] text-gray-400 mt-1">
              Default password: <span className="font-semibold text-gray-600">beechess123</span>
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm cursor-pointer disabled:opacity-50 h-[38px]"
          >
            {loading ? 'Creating...' : 'Add Coach'}
          </button>
        </form>
      </div>

      {/* Список зарегистрированных пользователей */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">System Users</h3>
          <button 
            onClick={fetchUsers}
            className="text-xs text-blue-600 hover:underline cursor-pointer font-medium"
          >
            Refresh List
          </button>
        </div>

        {fetchingUsers ? (
          <div className="text-xs text-gray-400 py-4 text-center">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-xs text-gray-400 py-4 text-center">No users yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-gray-400">
                  <th className="py-2.5 px-3 font-medium">Email</th>
                  <th className="py-2.5 px-3 font-medium">Role</th>
                  <th className="py-2.5 px-3 font-medium">Created</th>
                  <th className="py-2.5 px-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-gray-700">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50/50">
                    <td className="py-3 px-3 font-medium text-gray-900">{u.email}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] ${
                        u.role === 'admin' ? 'bg-purple-50 text-purple-700' :
                        u.role === 'teacher' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-400">
                      {new Date(u.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {/* Не даем удалить администратора по ошибке */}
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded transition cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
