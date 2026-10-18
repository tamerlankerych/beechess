import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { PuzzleSolver } from './PuzzleSolver.jsx';

export const StudentDashboard = ({ onOpenLesson }) => {
  const [userId, setUserId] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [teachers, setTeachers] = useState({});
  const [balance, setBalance] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [now, setNow] = useState(new Date());
  const [homeworks, setHomeworks] = useState([]);
  const [hwSolved, setHwSolved] = useState({});
  const [activeHomework, setActiveHomework] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  // Домашние задания ученика и сколько задач в каждом уже решено
  const fetchHomework = useCallback(async () => {
    if (!userId) return;
    try {
      const { data: hw, error } = await supabase
        .from('homework')
        .select('*')
        .contains('student_ids', [userId])
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      const list = hw || [];
      setHomeworks(list);

      if (list.length === 0) {
        setHwSolved({});
        return;
      }
      const { data: rs } = await supabase
        .from('homework_results')
        .select('homework_id, solved')
        .eq('student_id', userId)
        .in(
          'homework_id',
          list.map((h) => h.id)
        );
      const counts = {};
      (rs || []).forEach((r) => {
        if (r.solved) counts[r.homework_id] = (counts[r.homework_id] || 0) + 1;
      });
      setHwSolved(counts);
    } catch (err) {
      console.warn('Домашние задания недоступны:', err?.message || err);
    }
  }, [userId]);

  useEffect(() => {
    fetchHomework();
  }, [fetchHomework]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const weekStart = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay() === 0 ? 6 : today.getDay() - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - day + weekOffset * 7);
    return monday;
  }, [weekOffset]);

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
    return end;
  }, [weekStart]);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setFetching(true);
    try {
      const fromIso = weekStart.toISOString();
      const toIso = weekEnd.toISOString();

      const [{ data: lessonsData, error: lErr }, { data: subData }] = await Promise.all([
        supabase
          .from('crm_lessons')
          .select('*')
          .contains('student_ids', [userId])
          .gte('starts_at', fromIso)
          .lt('starts_at', toIso)
          .order('starts_at', { ascending: true }),
        supabase
          .from('subscriptions')
          .select('balance')
          .eq('student_id', userId)
          .maybeSingle(),
      ]);

      if (lErr) throw lErr;

      setLessons(lessonsData || []);
      setBalance(subData?.balance ?? 0);

      const teacherIds = [...new Set((lessonsData || []).map((l) => l.teacher_id))];
      if (teacherIds.length) {
        const { data: teacherProfiles } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', teacherIds);
        const map = {};
        (teacherProfiles || []).forEach((t) => {
          map[t.id] = t;
        });
        setTeachers(map);
      }
    } catch (err) {
      console.error('Ошибка загрузки расписания ученика:', err);
    } finally {
      setFetching(false);
    }
  }, [userId, weekStart, weekEnd]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`student-lessons-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_lessons' },
        () => fetchAll()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        () => fetchAll()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchAll]);

  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [weekStart]);

  const toLocalDateKey = (dateInput) => {
    const d = new Date(dateInput);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const lessonsByDay = useMemo(() => {
    const map = {};
    days.forEach((d) => {
      map[toLocalDateKey(d)] = [];
    });
    lessons.forEach((l) => {
      const key = toLocalDateKey(l.starts_at);
      if (map[key]) map[key].push(l);
    });
    return map;
  }, [lessons, days]);

  const formatDayLabel = (d) => {
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return {
      line1: weekdays[d.getDay()],
      line2: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      isToday,
    };
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // ============================================================
  // БЕЗ ОКНА -30 / +15 — можно зайти в любой момент
  // ============================================================
  const getLessonStatus = (lesson) => {
    const start = new Date(lesson.starts_at);
    const end = new Date(lesson.ends_at);
    const nowMs = now.getTime();

    if (lesson.status === 'cancelled') {
      return { label: 'Отменён', cls: 'bg-slate-100 text-slate-500', canJoin: false };
    }
    if (lesson.status === 'skipped') {
      return { label: 'Не состоялся', cls: 'bg-amber-50 text-amber-700', canJoin: false };
    }
    if (lesson.status === 'done') {
      return { label: 'Проведён', cls: 'bg-blue-50 text-blue-700', canJoin: false };
    }

    // scheduled — зайти можно в любой момент
    if (nowMs >= start.getTime() && nowMs <= end.getTime()) {
      return { label: 'Идёт сейчас', cls: 'bg-emerald-100 text-emerald-800', canJoin: true };
    }
    if (nowMs > end.getTime()) {
      return { label: 'Прошёл', cls: 'bg-slate-100 text-slate-500', canJoin: true };
    }
    return { label: 'Запланирован', cls: 'bg-emerald-50 text-emerald-700', canJoin: true };
  };

  const weekTitle = `${weekStart.getDate()}.${String(weekStart.getMonth() + 1).padStart(2, '0')} – ${weekEnd.getDate()}.${String(weekEnd.getMonth() + 1).padStart(2, '0')}`;

  const isNegativeBalance = (balance ?? 0) < 0;
  const isZeroBalance = balance === 0;

  // Открыто решение задач — показываем его вместо расписания
  if (activeHomework) {
    return (
      <PuzzleSolver
        homework={activeHomework}
        userId={userId}
        onBack={() => {
          setActiveHomework(null);
          fetchHomework();
        }}
      />
    );
  }

  const pendingHomework = homeworks.filter(
    (h) => (hwSolved[h.id] || 0) < h.puzzle_ids.length
  ).length;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={`flex flex-col items-center justify-center min-w-[88px] px-3 py-2 rounded-xl ${
              isNegativeBalance
                ? 'bg-red-50 border border-red-100'
                : isZeroBalance
                ? 'bg-slate-100 border border-slate-200'
                : 'bg-emerald-50 border border-emerald-100'
            }`}
          >
            <span
              className={`text-2xl font-black leading-none ${
                isNegativeBalance
                  ? 'text-red-600'
                  : isZeroBalance
                  ? 'text-slate-500'
                  : 'text-emerald-700'
              }`}
            >
              {balance ?? '—'}
            </span>
            <span className="text-[10px] font-bold text-gray-500 mt-1 uppercase tracking-wider">
              Осталось
            </span>
          </div>
          <div>
            <div className="text-sm font-bold text-gray-900">
              {isNegativeBalance
                ? '⚠️ Долг по занятиям'
                : isZeroBalance
                ? 'Абонемент израсходован'
                : 'Абонемент активен'}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {isNegativeBalance
                ? 'Свяжитесь с администратором'
                : isZeroBalance
                ? 'Попросите админа пополнить'
                : 'Продолжайте заниматься'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setWeekOffset((v) => v - 1)}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-bold cursor-pointer"
          >
            ←
          </button>
          <div className="px-3 py-1.5 font-bold text-gray-800 min-w-[150px] text-center text-sm">
            {weekTitle}
          </div>
          <button
            onClick={() => setWeekOffset((v) => v + 1)}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-bold cursor-pointer"
          >
            →
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold cursor-pointer"
            >
              Сегодня
            </button>
          )}
        </div>
      </div>

      {homeworks.length > 0 && (
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-gray-900">📚 Домашние задания</h3>
            {pendingHomework > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold">
                не сдано: {pendingHomework}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {homeworks.map((h) => {
              const total = h.puzzle_ids.length;
              const done = hwSolved[h.id] || 0;
              const finished = done >= total;
              const overdue = !finished && h.due_at && new Date(h.due_at) < now;
              const percent = total ? Math.round((done / total) * 100) : 0;
              return (
                <div
                  key={h.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between p-3 rounded-xl border border-gray-100 bg-slate-50/60"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">{h.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                      <span>
                        Решено {done} из {total}
                      </span>
                      {h.due_at && (
                        <span className={overdue ? 'text-red-600 font-bold' : ''}>
                          · {overdue ? 'просрочено, ' : 'до '}
                          {new Date(h.due_at).toLocaleDateString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 h-1.5 w-full max-w-[260px] rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${finished ? 'bg-emerald-500' : 'bg-blue-500'}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveHomework(h)}
                    className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer ${
                      finished
                        ? 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {finished ? '✓ Посмотреть' : done > 0 ? 'Продолжить' : 'Решать'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {fetching ? (
        <div className="bg-white p-10 rounded-2xl border border-gray-200 text-center text-sm text-gray-500">
          Загрузка расписания…
        </div>
      ) : lessons.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
          <div className="text-4xl mb-3">📅</div>
          <div className="text-base font-bold text-gray-800 mb-1">
            На этой неделе уроков нет
          </div>
          <div className="text-xs text-gray-400">
            Тренер ещё не назначил занятия. Загляни позже.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {days.map((day) => {
            const key = toLocalDateKey(day);
            const dayLessons = lessonsByDay[key] || [];
            if (dayLessons.length === 0) return null;
            const label = formatDayLabel(day);

            return (
              <div
                key={key}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
                  label.isToday ? 'border-blue-300 ring-1 ring-blue-100' : 'border-gray-200'
                }`}
              >
                <div
                  className={`px-4 py-2 border-b text-xs font-bold flex items-center gap-2 ${
                    label.isToday ? 'text-blue-700 bg-blue-50' : 'text-gray-600 bg-slate-50'
                  }`}
                >
                  <span className="text-sm">{label.line1}</span>
                  <span>{label.line2}</span>
                  {label.isToday && (
                    <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] uppercase">
                      Сегодня
                    </span>
                  )}
                </div>

                <div className="divide-y divide-gray-50">
                  {dayLessons.map((l) => {
                    const st = getLessonStatus(l);
                    const teacher = teachers[l.teacher_id];
                    return (
                      <div
                        key={l.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-base font-black text-gray-900 font-mono">
                              {formatTime(l.starts_at)}
                            </span>
                            <span className="text-gray-300">–</span>
                            <span className="text-sm text-gray-500 font-mono">
                              {formatTime(l.ends_at)}
                            </span>
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${st.cls}`}
                            >
                              {st.label}
                            </span>
                          </div>
                          <div className="mt-1 text-sm text-gray-700">
                            Тренер:{' '}
                            <span className="font-semibold">
                              {teacher?.name || teacher?.email || '—'}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {l.is_group
                              ? `Групповой · ${l.student_ids.length} участников`
                              : 'Индивидуальный'}
                          </div>
                        </div>

                        <div className="shrink-0">
                          {st.canJoin ? (
                            <button
                              onClick={() => onOpenLesson?.(l)}
                              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm cursor-pointer"
                            >
                              ▶ Войти в урок
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};