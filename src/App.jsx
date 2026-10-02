import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { supabase } from './supabaseClient';
import { LoginScreen } from './LoginScreen';

const ChessBoardRoom = lazy(() =>
  import('./ChessBoard.jsx').then((m) => ({ default: m.ChessBoardRoom }))
);
const AdminDashboard = lazy(() =>
  import('./AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const TeacherDashboard = lazy(() =>
  import('./TeacherDashboard').then((m) => ({ default: m.TeacherDashboard }))
);
const StudentDashboard = lazy(() =>
  import('./StudentDashboard.jsx').then((m) => ({ default: m.StudentDashboard }))
);

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ============================================================
// Универсальная функция: получить lessonId и roomId для урока.
// Обе стороны (тренер и ученик) принимают одинаковое решение.
// ============================================================
const resolveLessonRoom = (crmLesson) => {
  const ids = crmLesson.student_ids || [];
  const isIndividual = ids.length === 1;
  const isGroup = !isIndividual;

  if (isIndividual) {
    return {
      id: ids[0],
      roomId: `room-${ids[0]}`,
      isGroup: false,
    };
  }

  return {
    id: crmLesson.id,
    roomId: `crm-${crmLesson.id}`,
    isGroup: true,
  };
};

const readRoleCache = () => {
  try {
    const raw = localStorage.getItem('beechess_role_cache');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.userId || !parsed?.role) return null;
    if (Date.now() - (parsed.ts || 0) > 24 * 60 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeRoleCache = (userId, role, name) => {
  try {
    localStorage.setItem(
      'beechess_role_cache',
      JSON.stringify({ userId, role, name: name || '', ts: Date.now() })
    );
  } catch {
    // ignore
  }
};

const clearRoleCache = () => {
  try {
    localStorage.removeItem('beechess_role_cache');
  } catch {
    // ignore
  }
};

export default function App() {
  const [session, setSession] = useState(null);
  const initializedUserIdRef = useRef(null);

  const [userRole, setUserRole] = useState(() => {
    const cached = readRoleCache();
    return cached?.role || localStorage.getItem('beechess_role') || 'loading';
  });
  const [dbErrorDetails, setDbErrorDetails] = useState(null);

  const [activeTab, setActiveTab] = useState(() => {
    const cached = readRoleCache();
    const role = cached?.role || localStorage.getItem('beechess_role');
    if (role === 'admin' || role === 'crm_admin') return 'admin';
    if (role === 'teacher') return 'teacher-panel';
    if (role === 'student') return 'student-panel';
    return 'board';
  });

  const [activeLesson, setActiveLesson] = useState(null);

  const applyRole = useCallback(async (role, userId, data) => {
    localStorage.setItem('beechess_role', role);
    setUserRole(role);

    if (role === 'admin' || role === 'crm_admin') {
      setActiveTab('admin');
      setActiveLesson(null);
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (role === 'teacher') {
      const hasRoom = new URLSearchParams(window.location.search).has('room');
      if (hasRoom) setActiveTab('board');
      else {
        setActiveTab('teacher-panel');
        setActiveLesson(null);
      }
      return;
    }

    if (role === 'student') {
      const params = new URLSearchParams(window.location.search);
      const urlRoom = params.get('room');

      if (urlRoom && urlRoom.startsWith('group-')) {
        const groupId = urlRoom.replace('group-', '');
        const [{ data: groupRow }, { data: groupLesson }] = await Promise.all([
          supabase.from('groups').select('id, name').eq('id', groupId).maybeSingle(),
          supabase.from('lessons').select('*').eq('id', groupId).maybeSingle(),
        ]);
        if (groupRow) {
          setActiveLesson({
            ...(groupLesson || {}),
            id: groupId,
            roomId: `group-${groupId}`,
            title: `Групповой урок: ${groupRow.name}`,
            isGroup: true,
            group: groupRow,
            students: null,
            fen: groupLesson?.fen || INITIAL_FEN,
          });
          setActiveTab('board');
          return;
        }
      }

      if (urlRoom && urlRoom.startsWith('crm-')) {
        const crmId = urlRoom.replace('crm-', '');
        const { data: crmLesson } = await supabase
          .from('crm_lessons').select('*').eq('id', crmId).maybeSingle();
        const { data: savedLesson } = await supabase
          .from('lessons').select('*').eq('id', crmId).maybeSingle();
        if (crmLesson && crmLesson.student_ids.includes(userId)) {
          const resolved = resolveLessonRoom(crmLesson);
          setActiveLesson({
            ...(savedLesson || {}),
            id: resolved.id,
            roomId: resolved.roomId,
            title: 'Урок',
            isGroup: resolved.isGroup,
            students: null,
            fen: savedLesson?.fen || INITIAL_FEN,
          });
          setActiveTab('board');
          return;
        }
      }

      if (urlRoom && urlRoom.startsWith('room-')) {
        const targetId = urlRoom.replace('room-', '');
        if (targetId === userId) {
          const { data: savedLesson } = await supabase
            .from('lessons').select('*').eq('id', userId).maybeSingle();
          setActiveLesson({
            ...(savedLesson || {}),
            id: userId,
            roomId: `room-${userId}`,
            title: 'Ваш урок',
            students: { id: userId, name: data?.name || 'Ученик' },
            fen: savedLesson?.fen || INITIAL_FEN,
          });
          setActiveTab('board');
          return;
        }
      }

      setActiveTab('student-panel');
      setActiveLesson(null);
    }
  }, []);

  const fetchUserRole = useCallback(async (userId, { silent = false } = {}) => {
    if (!silent) setDbErrorDetails(null);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, name')
        .eq('id', userId)
        .single();

      if (error) {
        if (!silent) {
          setDbErrorDetails(`Ошибка Supabase: ${error.message} (код: ${error.code})`);
          setUserRole('error');
        }
        return;
      }
      if (!data) {
        if (!silent) {
          setDbErrorDetails(`Нет строки в profiles с id = ${userId}`);
          setUserRole('error');
        }
        return;
      }

      const role = (data.role || '').trim().toLowerCase();
      if (!role) {
        if (!silent) {
          setDbErrorDetails(`У пользователя id = ${userId} не задана роль`);
          setUserRole('error');
        }
        return;
      }

      writeRoleCache(userId, role, data.name || '');

      const currentRole = localStorage.getItem('beechess_role');
      if (currentRole === role && silent) return;

      await applyRole(role, userId, data);
    } catch (err) {
      console.error('Критическая ошибка определения роли:', err);
      if (!silent) setUserRole('error');
    }
  }, [applyRole]);

  useEffect(() => {
    let isMounted = true;

    const handleAuthSession = async (currentSession) => {
      if (!isMounted) return;
      setSession(currentSession);

      if (currentSession) {
        const userId = currentSession.user.id;

        if (initializedUserIdRef.current !== userId) {
          initializedUserIdRef.current = userId;

          const cached = readRoleCache();
          if (cached && cached.userId === userId) {
            setUserRole(cached.role);
            localStorage.setItem('beechess_role', cached.role);
            if (cached.role === 'admin' || cached.role === 'crm_admin') {
              setActiveTab('admin');
            } else if (cached.role === 'teacher') {
              const hasRoom = new URLSearchParams(window.location.search).has('room');
              setActiveTab(hasRoom ? 'board' : 'teacher-panel');
            } else if (cached.role === 'student') {
              const hasRoom = new URLSearchParams(window.location.search).has('room');
              setActiveTab(hasRoom ? 'board' : 'student-panel');
            }
          }

          const doFullCheck = !cached || cached.userId !== userId;
          await fetchUserRole(userId, { silent: !doFullCheck });
        }
      } else {
        initializedUserIdRef.current = null;
        setUserRole(null);
        setDbErrorDetails(null);
        localStorage.removeItem('beechess_role');
        clearRoleCache();
        setActiveTab('board');
        setActiveLesson(null);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => handleAuthSession(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) =>
      handleAuthSession(s)
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserRole]);

  // ============================================================
  // ОТКРЫТИЕ УРОКА УЧЕНИКОМ — ИСПРАВЛЕНО
  // ============================================================
  const handleStudentOpenLesson = async (crmLesson) => {
    const resolved = resolveLessonRoom(crmLesson);
    const { data: savedLesson } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', resolved.id)
      .maybeSingle();

    setActiveLesson({
      ...(savedLesson || {}),
      id: resolved.id,
      roomId: resolved.roomId,
      title: 'Урок',
      isGroup: resolved.isGroup,
      group: null,
      students: null,
      fen: savedLesson?.fen || INITIAL_FEN,
    });

    window.history.pushState(
      {},
      '',
      `${window.location.pathname}?room=${encodeURIComponent(resolved.roomId)}`
    );
    setActiveTab('board');
  };

  const handleOpenStudentRoom = async (student) => {
    const roomId = `room-${student.id}`;
    const { data: savedLesson } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', student.id)
      .maybeSingle();

    setActiveLesson({
      ...(savedLesson || {}),
      id: student.id,
      roomId,
      title: `Урок: ${student.name || student.email}`,
      students: student,
      fen: savedLesson?.fen || INITIAL_FEN,
    });

    window.history.pushState({}, '', `${window.location.pathname}?room=${encodeURIComponent(roomId)}`);
    setActiveTab('board');
  };

  const handleOpenGroupRoom = async (group) => {
    const roomId = `group-${group.id}`;
    const { data: savedLesson } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', group.id)
      .maybeSingle();

    setActiveLesson({
      ...(savedLesson || {}),
      id: group.id,
      roomId,
      title: `Групповой урок: ${group.name}`,
      isGroup: true,
      group,
      students: null,
      fen: savedLesson?.fen || INITIAL_FEN,
    });

    window.history.pushState({}, '', `${window.location.pathname}?room=${encodeURIComponent(roomId)}`);
    setActiveTab('board');
  };

  // ============================================================
  // ОТКРЫТИЕ УРОКА ТРЕНЕРОМ — ИСПРАВЛЕНО
  // Использует ту же функцию resolveLessonRoom
  // ============================================================
  const handleStartCrmLesson = async (crmLesson) => {
    const resolved = resolveLessonRoom(crmLesson);

    // Для индивидуального урока сохраняем данные ученика для заголовка
    let students = null;
    let group = null;

    if (!resolved.isGroup) {
      const { data: student } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', resolved.id)
        .maybeSingle();
      students = student;
    }

    const { data: savedLesson } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', resolved.id)
      .maybeSingle();

    setActiveLesson({
      ...(savedLesson || {}),
      id: resolved.id,
      roomId: resolved.roomId,
      title: students
        ? `Урок: ${students.name || students.email}`
        : 'Групповой урок',
      isGroup: resolved.isGroup,
      group,
      students,
      fen: savedLesson?.fen || INITIAL_FEN,
    });

    window.history.pushState(
      {},
      '',
      `${window.location.pathname}?room=${encodeURIComponent(resolved.roomId)}`
    );
    setActiveTab('board');
  };

  useEffect(() => {
    if (
      userRole !== 'teacher' ||
      activeTab !== 'board' ||
      !activeLesson?.id ||
      !session?.user?.id
    )
      return undefined;

    const lessonId = activeLesson.id;
    const teacherId = session.user.id;
    let stopped = false;

    const announce = async () => {
      const { error } = await supabase.from('lesson_presence').upsert(
        {
          lesson_id: lessonId,
          teacher_id: teacherId,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'lesson_id' }
      );
      if (error && !stopped) console.error('Ошибка присутствия тренера:', error);
    };

    announce();
    const heartbeat = window.setInterval(announce, 20000);

    return () => {
      stopped = true;
      window.clearInterval(heartbeat);
      supabase
        .from('lesson_presence')
        .delete()
        .eq('lesson_id', lessonId)
        .eq('teacher_id', teacherId)
        .then(({ error }) => {
          if (error) console.error('Ошибка закрытия присутствия:', error);
        });
    };
  }, [activeLesson?.id, activeTab, session?.user?.id, userRole]);

  const handleLogout = async () => {
    localStorage.removeItem('beechess_role');
    clearRoleCache();
    await supabase.auth.signOut();
    setUserRole('loading');
    setSession(null);
    setDbErrorDetails(null);
    setActiveTab('board');
    setActiveLesson(null);
  };

  if (!session) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => {
              if (userRole === 'admin' || userRole === 'crm_admin') setActiveTab('admin');
              else if (userRole === 'teacher') setActiveTab('teacher-panel');
              else if (userRole === 'student') setActiveTab('student-panel');
              else setActiveTab('board');
            }}
          >
            <span className="text-2xl leading-none">🐝</span>
            <span className="text-xl font-extrabold tracking-tight text-gray-900">
              bee<span className="text-amber-500">chess</span>
            </span>
          </div>

          <nav className="flex gap-2 bg-slate-100 p-1 rounded-xl items-center">
            {(userRole === 'admin' || userRole === 'crm_admin') && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                ⚙️ {userRole === 'admin' ? 'Управление' : 'Абонементы'}
              </button>
            )}

            {userRole === 'teacher' && (
              <button
                onClick={() => setActiveTab('teacher-panel')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'teacher-panel'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🎓 Кабинет тренера
              </button>
            )}

            {userRole === 'student' && !activeLesson && (
              <button
                onClick={() => setActiveTab('student-panel')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'student-panel'
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📅 Мои уроки
              </button>
            )}

            {activeLesson && (
              <div className="flex items-center bg-white border border-blue-200 rounded-lg overflow-hidden shadow-sm">
                <button
                  onClick={() => setActiveTab('board')}
                  className={`px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'board'
                      ? 'bg-blue-600 text-white'
                      : 'text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {activeLesson.isGroup
                    ? `👥 Группа: ${activeLesson.group?.name || 'Урок'}`
                    : `🐝 Класс: ${
                        activeLesson.students?.name || activeLesson.students?.email || 'Ученик'
                      }`}
                </button>
                <button
                  onClick={() => {
                    setActiveLesson(null);
                    setActiveTab(
                      userRole === 'admin' || userRole === 'crm_admin'
                        ? 'admin'
                        : userRole === 'teacher'
                        ? 'teacher-panel'
                        : 'student-panel'
                    );
                    window.history.pushState({}, '', window.location.pathname);
                  }}
                  className="px-2 py-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition font-bold text-xs cursor-pointer border-l border-blue-100"
                  title="Закрыть урок"
                >
                  ✕
                </button>
              </div>
            )}
          </nav>

          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 hidden sm:inline">{session.user.email}</span>
            <span className="px-2.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-full uppercase">
              {userRole === 'loading'
                ? 'загрузка...'
                : userRole === 'admin'
                ? 'админ'
                : userRole === 'crm_admin'
                ? 'crm-админ'
                : userRole === 'teacher'
                ? 'тренер'
                : userRole === 'student'
                ? 'ученик'
                : userRole}
            </span>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 font-medium cursor-pointer hover:bg-gray-100 transition"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main
        className={`${activeTab === 'board' ? 'w-full max-w-none px-2 py-3' : 'max-w-7xl p-6'} mx-auto`}
        style={activeTab === 'board' ? { width: '100%', maxWidth: 'none' } : undefined}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-24 text-sm text-gray-500">
              Загрузка...
            </div>
          }
        >
          {(userRole === 'admin' || userRole === 'crm_admin') && activeTab === 'admin' && (
            <AdminDashboard userRole={userRole} onObserveRoom={handleOpenStudentRoom} />
          )}

          {userRole === 'teacher' && activeTab === 'teacher-panel' && (
            <TeacherDashboard
              onOpenRoom={handleOpenStudentRoom}
              onOpenGroupRoom={handleOpenGroupRoom}
              onStartCrmRoom={handleStartCrmLesson}
            />
          )}

          {userRole === 'student' && activeTab === 'student-panel' && (
            <StudentDashboard onOpenLesson={handleStudentOpenLesson} />
          )}

          {(userRole === 'teacher' || userRole === 'student' || userRole === 'admin' || userRole === 'crm_admin') &&
            activeTab === 'board' &&
            (activeLesson ? (
              <ChessBoardRoom
                isTeacher={userRole === 'teacher'}
                isObserver={userRole === 'admin' || userRole === 'crm_admin'}
                lesson={activeLesson}
              />
            ) : userRole === 'teacher' ? (
              <TeacherDashboard
                onOpenRoom={handleOpenStudentRoom}
                onOpenGroupRoom={handleOpenGroupRoom}
                onStartCrmRoom={handleStartCrmLesson}
              />
            ) : userRole === 'admin' || userRole === 'crm_admin' ? (
              <AdminDashboard userRole={userRole} onObserveRoom={handleOpenStudentRoom} />
            ) : (
              <StudentDashboard onOpenLesson={handleStudentOpenLesson} />
            ))}

          {userRole === 'loading' && (
            <div className="text-center py-20 text-gray-500 bg-white rounded-2xl shadow-sm border border-gray-200">
              <p className="text-base font-medium mb-1">Определяем роль пользователя...</p>
            </div>
          )}

          {userRole === 'error' && (
            <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-red-200 p-8 max-w-xl mx-auto mt-10">
              <p className="text-lg font-bold text-red-600 mb-2">Не удалось определить роль</p>
              <p className="text-xs text-gray-600 mb-4 font-mono bg-red-50 p-3 rounded-lg border border-red-100 text-left">
                {dbErrorDetails || 'Неизвестная ошибка при запросе таблицы profiles'}
              </p>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-900 transition"
              >
                Выйти и войти заново
              </button>
            </div>
          )}
        </Suspense>
      </main>
    </div>
  );
}