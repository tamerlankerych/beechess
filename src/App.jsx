import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { ChessBoardRoom } from './ChessBoard.jsx';
import { LoginScreen } from './LoginScreen';
import { AdminDashboard } from './AdminDashboard';
import { TeacherDashboard } from './TeacherDashboard';

export default function App() {
  const [session, setSession] = useState(null);
  const initializedUserIdRef = useRef(null);
  
  // Инициализируем роль строго из localStorage, а если её нет — ставим 'loading'
  const [userRole, setUserRole] = useState(() => {
    return localStorage.getItem('beechess_role') || 'loading';
  });
  
  const [dbErrorDetails, setDbErrorDetails] = useState(null);

  const [activeTab, setActiveTab] = useState(() => {
    const savedRole = localStorage.getItem('beechess_role');
    if (savedRole === 'admin') return 'admin';
    if (savedRole === 'teacher') return 'teacher-panel';
    return 'board';
  });
  
  const [activeLesson, setActiveLesson] = useState(null);

  const fetchUserRole = useCallback(async (userId) => {
    setDbErrorDetails(null);
    try {
      console.log('Запрос роли для userId:', userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Ошибка Supabase при запросе профиля:', error);
        setDbErrorDetails(`Ошибка Supabase: ${error.message} (код: ${error.code})`);
        throw error;
      }

      if (!data) {
        setDbErrorDetails(`В таблице profiles нет строки с id = ${userId}`);
        throw new Error('Профиль не найден в базе');
      }

      const role = data?.role ? data.role.trim().toLowerCase() : null;
      console.log('Получена роль из базы:', role);

      if (!role) {
        setDbErrorDetails(`У пользователя id = ${userId} поле role пустое (NULL)`);
        throw new Error('Поле role пустое');
      }

      setUserRole(role);
      localStorage.setItem('beechess_role', role);

      if (role === 'admin') {
        setActiveTab('admin');
        setActiveLesson(null);
        // Администратор всегда начинает с панели управления. Оставшийся в
        // адресе ?room= не должен автоматически подключать его к прошлому
        // уроку — наблюдение запускается только кнопкой «Наблюдать».
        window.history.replaceState({}, '', window.location.pathname);
      } else if (role === 'teacher') {
        const hasRoomInUrl = new URLSearchParams(window.location.search).has('room');

        if (hasRoomInUrl) {
          setActiveTab('board');
        } else {
          setActiveTab('teacher-panel');
          setActiveLesson(null);
        }
      } else if (role === 'student') {
        const { data: savedLesson } = await supabase
          .from('lessons')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        setActiveLesson({
          ...(savedLesson || {}),
          id: userId,
          roomId: `room-${userId}`,
          title: 'Ваш урок',
          students: { id: userId, name: 'Ученик' },
          fen: savedLesson?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        });
        setActiveTab('board');
      }
    } catch (err) {
      console.error('Критическая ошибка определения роли:', err);
      setUserRole('error');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const handleAuthSession = async (currentSession) => {
      if (!isMounted) return;
      
      setSession(currentSession);
      if (currentSession) {
        const userId = currentSession.user.id;

        // Supabase повторно присылает события авторизации при возвращении во
        // вкладку. Для уже загруженного пользователя не сбрасываем открытый
        // урок и текущий раздел интерфейса.
        if (initializedUserIdRef.current !== userId) {
          initializedUserIdRef.current = userId;
          await fetchUserRole(userId);
        }
      } else {
        initializedUserIdRef.current = null;
        setUserRole(null);
        setDbErrorDetails(null);
        localStorage.removeItem('beechess_role');
        setActiveTab('board');
        setActiveLesson(null);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthSession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserRole]);

  useEffect(() => {
    const checkUrlParams = async () => {
      const params = new URLSearchParams(window.location.search);
      const roomId = params.get('room');

      if (roomId && session) {
        const cleanId = roomId.replace('room-', '');

        const [studentResult, lessonResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .eq('id', cleanId)
            .single(),
          supabase
            .from('lessons')
            .select('*')
            .eq('id', cleanId)
            .maybeSingle()
        ]);

        const student = studentResult.data;
        const savedLesson = lessonResult.data;

        if (student) {
          setActiveLesson({
            ...(savedLesson || {}),
            id: student.id,
            roomId: `room-${student.id}`,
            title: `Урок: ${student.name || student.email}`,
            students: student,
            fen: savedLesson?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
          });
          setActiveTab('board');
        }
      }
    };

    // Автоматически открывать комнату из URL разрешено только тренеру.
    // Ученик всегда получает собственный урок, а администратор выбирает
    // активный урок вручную в своей панели.
    if (session && userRole === 'teacher') {
      checkUrlParams();
    }
  }, [session, userRole]);

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
      fen: savedLesson?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    });

    const roomUrl = `${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    window.history.pushState({}, '', roomUrl);
    setActiveTab('board');
  };

  useEffect(() => {
    if (userRole !== 'teacher' || activeTab !== 'board' || !activeLesson?.id || !session?.user?.id) {
      return undefined;
    }

    const lessonId = activeLesson.id;
    const teacherId = session.user.id;
    let stopped = false;

    const announcePresence = async () => {
      const { error } = await supabase
        .from('lesson_presence')
        .upsert({
          lesson_id: lessonId,
          teacher_id: teacherId,
          last_seen_at: new Date().toISOString()
        }, { onConflict: 'lesson_id' });

      if (error && !stopped) {
        console.error('Не удалось обновить присутствие тренера:', error);
      }
    };

    announcePresence();
    const heartbeat = window.setInterval(announcePresence, 20000);

    return () => {
      stopped = true;
      window.clearInterval(heartbeat);
      supabase
        .from('lesson_presence')
        .delete()
        .eq('lesson_id', lessonId)
        .eq('teacher_id', teacherId)
        .then(({ error }) => {
          if (error) console.error('Не удалось закрыть присутствие тренера:', error);
        });
    };
  }, [activeLesson?.id, activeTab, session?.user?.id, userRole]);

  const handleLogout = async () => {
    localStorage.removeItem('beechess_role');
    await supabase.auth.signOut();
    setUserRole('loading');
    setSession(null);
    setDbErrorDetails(null);
    setActiveTab('board');
    setActiveLesson(null);
  };

  if (!session) {
    // Роль, activeTab и всё остальное после входа полностью определяет
    // onAuthStateChange -> fetchUserRole ниже. Это единственный источник
    // истины, поэтому никакого отдельного колбэка от LoginScreen не нужно.
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer select-none" 
            onClick={() => {
              if (userRole === 'admin') setActiveTab('admin');
              else if (userRole === 'teacher') setActiveTab('teacher-panel');
              else setActiveTab('board');
            }}
          >
            <span className="text-2xl leading-none">🐝</span>
            <span className="text-xl font-extrabold tracking-tight text-gray-900">
              bee<span className="text-amber-500">chess</span>
            </span>
          </div>

          <nav className="flex gap-2 bg-slate-100 p-1 rounded-xl items-center">
            {userRole === 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'admin' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                ⚙️ Управление тренерами
              </button>
            )}

            {userRole === 'teacher' && (
              <button
                onClick={() => setActiveTab('teacher-panel')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  activeTab === 'teacher-panel' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🎓 Управление учениками
              </button>
            )}

            {activeLesson && (
              <div className="flex items-center bg-white border border-blue-200 rounded-lg overflow-hidden shadow-sm">
                <button
                  onClick={() => setActiveTab('board')}
                  className={`px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    activeTab === 'board' ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  🐝 Класс: {activeLesson.students?.name || activeLesson.students?.email}
                </button>
                <button
                  onClick={() => {
                    setActiveLesson(null);
                    setActiveTab(userRole === 'admin' ? 'admin' : 'teacher-panel');
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
              {userRole === 'loading' ? 'загрузка...' : userRole}
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
        {userRole === 'admin' && activeTab === 'admin' && (
          <AdminDashboard onObserveRoom={handleOpenStudentRoom} />
        )}
        
        {userRole === 'teacher' && activeTab === 'teacher-panel' && (
          <TeacherDashboard onOpenRoom={handleOpenStudentRoom} />
        )}
        
        {(userRole === 'teacher' || userRole === 'student' || userRole === 'admin') && activeTab === 'board' && (
          activeLesson ? (
            <ChessBoardRoom
              isTeacher={userRole === 'teacher'}
              isObserver={userRole === 'admin'}
              lesson={activeLesson}
            />
          ) : userRole === 'teacher' ? (
            <TeacherDashboard onOpenRoom={handleOpenStudentRoom} />
          ) : userRole === 'admin' ? (
            <AdminDashboard onObserveRoom={handleOpenStudentRoom} />
          ) : (
            <div className="text-center py-20 text-gray-500 bg-white rounded-2xl shadow-sm border border-gray-200">
              <p className="text-base font-medium mb-1">Нет активного урока</p>
              <p className="text-xs text-gray-400">Ожидание подключения к уроку...</p>
            </div>
          )
        )}

        {userRole === 'loading' && (
          <div className="text-center py-20 text-gray-500 bg-white rounded-2xl shadow-sm border border-gray-200">
            <p className="text-base font-medium mb-1">Определение роли пользователя...</p>
          </div>
        )}

        {userRole === 'error' && (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-red-200 p-8 max-w-xl mx-auto mt-10">
            <p className="text-lg font-bold text-red-600 mb-2">Ошибка определения роли из базы</p>
            <p className="text-xs text-gray-600 mb-4 font-mono bg-red-50 p-3 rounded-lg border border-red-100 text-left">
              {dbErrorDetails || 'Неизвестная ошибка запроса к таблице profiles'}
            </p>
            <button 
              onClick={handleLogout}
              className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold hover:bg-slate-900 transition"
            >
              Выйти и войти снова
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
