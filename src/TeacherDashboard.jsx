import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';

export const TeacherDashboard = ({
  onOpenRoom,
  onOpenGroupRoom,
  onStartCrmRoom,
}) => {
  const [activeTab, setActiveTab] = useState('schedule');
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  if (!userId) {
    return (
      <div className="text-center py-16 text-sm text-gray-500 bg-white rounded-2xl border border-gray-200">
        Загрузка кабинета…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex gap-2 bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm w-fit">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
            activeTab === 'schedule'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          📅 Расписание
        </button>
        <button
          onClick={() => setActiveTab('students')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
            activeTab === 'students'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          👤 Ученики
        </button>
        <button
          onClick={() => setActiveTab('groups')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${
            activeTab === 'groups'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          👥 Группы
        </button>
      </div>

      {activeTab === 'schedule' && (
        <ScheduleTab userId={userId} onStartCrmRoom={onStartCrmRoom} />
      )}
      {activeTab === 'students' && (
        <StudentsTab userId={userId} onOpenRoom={onOpenRoom} />
      )}
      {activeTab === 'groups' && (
        <GroupsTab userId={userId} onOpenGroupRoom={onOpenGroupRoom} />
      )}
    </div>
  );
};

/* ============================================================
   Вкладка: Ученики
   ============================================================ */
const StudentsTab = ({ userId, onOpenRoom }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [subs, setSubs] = useState({});
  const [fetching, setFetching] = useState(true);

  const fetchStudents = useCallback(async () => {
    setFetching(true);
    const [{ data: studentsData, error: sErr }, { data: subsData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('role', 'student')
        .order('created_at', { ascending: false }),
      supabase.from('subscriptions').select('student_id, balance'),
    ]);
    if (!sErr) setStudents(studentsData || []);
    const map = {};
    (subsData || []).forEach((s) => {
      map[s.student_id] = s.balance;
    });
    setSubs(map);
    setFetching(false);
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.rpc('create_user_by_admin', {
        target_email: email,
        target_password: '123',
        target_role: 'student',
      });
      if (error) throw error;
      setEmail('');
      await fetchStudents();
    } catch (err) {
      alert('Ошибка добавления: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async (studentId, newName) => {
    try {
      const { error } = await supabase.rpc('update_student_name', {
        target_user_id: studentId,
        new_name: newName,
      });
      if (error) throw error;
    } catch (err) {
      alert('Ошибка сохранения имени: ' + err.message);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm('Удалить этого ученика? Действие необратимо.')) return;
    try {
      const { error } = await supabase.rpc('delete_user_by_admin', {
        target_user_id: studentId,
      });
      if (error) throw error;
      setStudents((prev) => prev.filter((s) => s.id !== studentId));
    } catch (err) {
      alert('Ошибка удаления: ' + err.message);
    }
  };

  const copyLink = (studentId) => {
    const link = `${window.location.origin}/?room=room-${studentId}`;
    navigator.clipboard.writeText(link);
    alert('Ссылка скопирована!');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Добавить ученика (email)
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@example.com"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <button
          onClick={handleCreateStudent}
          disabled={loading || !email}
          className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm h-[38px] disabled:opacity-50 cursor-pointer"
        >
          {loading ? 'Создание...' : '+ Добавить'}
        </button>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Ваши ученики</h3>
        {fetching ? (
          <p className="text-sm text-gray-500">Загрузка...</p>
        ) : students.length === 0 ? (
          <p className="text-sm text-gray-400">Пока нет учеников. Добавьте первого выше.</p>
        ) : (
          <div className="space-y-3">
            {students.map((student) => {
              const balance = subs[student.id] ?? 0;
              const neg = balance < 0;
              return (
                <div
                  key={student.id}
                  className="flex flex-col sm:flex-row gap-3 items-center justify-between p-3 bg-slate-50 rounded-xl border border-gray-100"
                >
                  <div className="flex-1 w-full flex flex-col sm:flex-row gap-3 items-center">
                    <div className="flex items-center gap-2 w-56 min-w-0">
                      <span
                        className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-lg ${
                          neg
                            ? 'bg-red-50 text-red-600'
                            : balance === 0
                            ? 'bg-slate-200 text-slate-500'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                        title="Осталось занятий"
                      >
                        {balance}
                      </span>
                      <span
                        className="text-sm font-medium text-gray-600 truncate"
                        title={student.email}
                      >
                        {student.email}
                      </span>
                    </div>
                    <input
                      type="text"
                      defaultValue={student.name || ''}
                      onBlur={(e) => handleUpdateName(student.id, e.target.value)}
                      placeholder="Имя ученика"
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:border-blue-500 outline-none bg-white w-full"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => onOpenRoom(student)}
                      className="px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 text-xs font-bold rounded-lg cursor-pointer"
                    >
                      ▶ Открыть урок
                    </button>
                    <button
                      onClick={() => copyLink(student.id)}
                      className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 text-xs font-bold rounded-lg cursor-pointer"
                    >
                      🔗 Ссылка
                    </button>
                    <button
                      onClick={() => handleDeleteStudent(student.id)}
                      className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold rounded-lg cursor-pointer"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================================================
   Вкладка: Группы
   ============================================================ */
const GroupsTab = ({ userId, onOpenGroupRoom }) => {
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupMemberIds, setGroupMemberIds] = useState([]);

  const fetchStudents = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .order('created_at', { ascending: false });
    if (!error) setStudents(data || []);
  }, []);

  const fetchGroups = useCallback(async () => {
    const { data: groupsData, error } = await supabase
      .from('groups')
      .select('*')
      .eq('teacher_id', userId)
      .order('created_at', { ascending: false });
    if (error) return;

    const ids = (groupsData || []).map((g) => g.id);
    let members = [];
    if (ids.length) {
      const { data: m } = await supabase
        .from('group_members')
        .select('group_id, student_id')
        .in('group_id', ids);
      members = m || [];
    }

    setGroups(
      (groupsData || []).map((g) => ({
        ...g,
        memberIds: members.filter((m) => m.group_id === g.id).map((m) => m.student_id),
      }))
    );
  }, [userId]);

  useEffect(() => {
    setFetching(true);
    Promise.all([fetchStudents(), fetchGroups()]).finally(() => setFetching(false));
  }, [fetchStudents, fetchGroups]);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const { error } = await supabase.from('groups').insert({
        teacher_id: userId,
        name: newGroupName.trim(),
      });
      if (error) throw error;
      setNewGroupName('');
      await fetchGroups();
    } catch (err) {
      alert('Ошибка создания группы: ' + err.message);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Удалить группу? Ученики останутся в системе.')) return;
    try {
      const { error } = await supabase.from('groups').delete().eq('id', groupId);
      if (error) throw error;
      await fetchGroups();
      if (selectedGroup?.id === groupId) setSelectedGroup(null);
    } catch (err) {
      alert('Ошибка удаления группы: ' + err.message);
    }
  };

  const openGroupManager = (group) => {
    setSelectedGroup(group);
    setGroupMemberIds(group.memberIds || []);
  };

  const toggleMember = (studentId) => {
    setGroupMemberIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const saveGroupMembers = async () => {
    if (!selectedGroup) return;
    try {
      await supabase.from('group_members').delete().eq('group_id', selectedGroup.id);
      if (groupMemberIds.length) {
        const { error } = await supabase
          .from('group_members')
          .insert(groupMemberIds.map((student_id) => ({ group_id: selectedGroup.id, student_id })));
        if (error) throw error;
      }
      await fetchGroups();
      setSelectedGroup(null);
    } catch (err) {
      alert('Ошибка сохранения состава: ' + err.message);
    }
  };

  const copyGroupLink = (groupId) => {
    const link = `${window.location.origin}/?room=group-${groupId}`;
    navigator.clipboard.writeText(link);
    alert('Ссылка на группу скопирована!');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Название новой группы
          </label>
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Например, «Группа А — начинающие»"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <button
          onClick={handleCreateGroup}
          disabled={!newGroupName.trim()}
          className="py-2 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-sm h-[38px] disabled:opacity-50 cursor-pointer"
        >
          + Создать группу
        </button>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Ваши группы</h3>
        {fetching ? (
          <p className="text-sm text-gray-500">Загрузка...</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-400">Пока нет групп. Создайте первую выше.</p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className="flex flex-col sm:flex-row gap-3 items-center justify-between p-3 bg-emerald-50/40 rounded-xl border border-emerald-100"
              >
                <div className="flex-1 w-full">
                  <div className="text-sm font-bold text-gray-900">{group.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Учеников: {group.memberIds.length}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => openGroupManager(group)}
                    className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    ⚙️ Состав
                  </button>
                  <button
                    onClick={() => onOpenGroupRoom?.(group)}
                    className="px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    ▶ Открыть урок
                  </button>
                  <button
                    onClick={() => copyGroupLink(group.id)}
                    className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    🔗 Ссылка
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                Состав группы «{selectedGroup.name}»
              </h3>
              <button
                onClick={() => setSelectedGroup(null)}
                className="text-gray-400 hover:text-gray-700 text-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            {students.length === 0 ? (
              <p className="text-sm text-gray-400">
                Сначала добавьте учеников во вкладке «👤 Ученики».
              </p>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {students.map((s) => {
                  const checked = groupMemberIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer border ${
                        checked
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleMember(s.id)}
                        className="w-4 h-4"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">
                          {s.name || s.email}
                        </div>
                        {s.name && (
                          <div className="text-[11px] text-gray-400 truncate">{s.email}</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setSelectedGroup(null)}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={saveGroupMembers}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
/* ============================================================
   Вкладка: Расписание
   ============================================================ */
const ScheduleTab = ({ userId, onStartCrmRoom }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [lessons, setLessons] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [subs, setSubs] = useState({});
  const [fetching, setFetching] = useState(true);
  const [creatingAt, setCreatingAt] = useState(null);
  const [detailsLesson, setDetailsLesson] = useState(null);

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
    setFetching(true);
    try {
      const fromIso = weekStart.toISOString();
      const toIso = weekEnd.toISOString();

      const [
        { data: lessonsData, error: lessonsErr },
        { data: studentsData, error: studentsErr },
        { data: groupsData, error: groupsErr },
        { data: membersData, error: membersErr },
        { data: subsData },
      ] = await Promise.all([
        supabase
          .from('crm_lessons')
          .select('*')
          .eq('teacher_id', userId)
          .gte('starts_at', fromIso)
          .lt('starts_at', toIso)
          .order('starts_at', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, name, email, role')
          .eq('role', 'student')
          .order('created_at', { ascending: false }),
        supabase
          .from('groups')
          .select('id, name, teacher_id')
          .eq('teacher_id', userId)
          .order('created_at', { ascending: false }),
        supabase.from('group_members').select('group_id, student_id'),
        supabase.from('subscriptions').select('student_id, balance'),
      ]);

      if (lessonsErr) throw lessonsErr;
      if (studentsErr) throw studentsErr;
      if (groupsErr) throw groupsErr;
      if (membersErr) throw membersErr;

      setLessons(lessonsData || []);
      setStudents(studentsData || []);

      const map = {};
      (subsData || []).forEach((s) => {
        map[s.student_id] = s.balance;
      });
      setSubs(map);

      const groupsWithMembers = (groupsData || []).map((g) => ({
        ...g,
        memberIds: (membersData || [])
          .filter((m) => m.group_id === g.id)
          .map((m) => m.student_id),
      }));
      setGroups(groupsWithMembers);
    } catch (err) {
      console.error('Ошибка загрузки расписания:', err);
    } finally {
      setFetching(false);
    }
  }, [userId, weekStart, weekEnd]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const channel = supabase
      .channel(`crm-lessons-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_lessons' },
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

  // ЛОКАЛЬНАЯ дата в формате YYYY-MM-DD (без UTC сдвига)
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
    Object.values(map).forEach((arr) =>
      arr.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    );
    return map;
  }, [lessons, days]);

  const formatDayLabel = (d) => {
    const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    return `${weekdays[d.getDay()]}, ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const formatTime = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const isPast = (iso) => new Date(iso) < new Date();

  const getLessonLabel = (lesson) => {
    if (lesson.is_group) {
      const grp = groups.find((g) =>
        g.memberIds.some((m) => lesson.student_ids.includes(m))
      );
      if (grp) return grp.name;
      return `Группа (${lesson.student_ids.length})`;
    }
    const st = students.find((s) => s.id === lesson.student_ids[0]);
    return st?.name || st?.email || 'Ученик';
  };

  const weekTitle = `${weekStart.getDate()}.${String(weekStart.getMonth() + 1).padStart(2, '0')} – ${weekEnd.getDate()}.${String(weekEnd.getMonth() + 1).padStart(2, '0')}`;

  const markLessonDone = async (lesson, attendance) => {
    try {
      const { error } = await supabase
        .from('crm_lessons')
        .update({
          status: 'done',
          attendance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', lesson.id);
      if (error) throw error;

      const attendees = lesson.student_ids.filter(
        (sid) => attendance[sid] !== false
      );
      for (const sid of attendees) {
        await supabase.rpc('adjust_subscription', {
          p_student_id: sid,
          p_delta: -1,
          p_reason: `Посещение урока ${new Date(lesson.starts_at).toLocaleDateString('ru-RU')}`,
          p_lesson_id: lesson.id,
        });
      }

      setDetailsLesson(null);
      await fetchAll();
    } catch (err) {
      console.error('Ошибка отметки урока:', err);
      alert('Ошибка: ' + err.message);
    }
  };

  const markLessonSkipped = async (lesson) => {
    try {
      const { error } = await supabase
        .from('crm_lessons')
        .update({ status: 'skipped', updated_at: new Date().toISOString() })
        .eq('id', lesson.id);
      if (error) throw error;
      setDetailsLesson(null);
      await fetchAll();
    } catch (err) {
      alert('Ошибка: ' + err.message);
    }
  };

  const deleteLesson = async (lesson) => {
    if (lesson.recurring_group_id) {
      const deleteAll = window.confirm(
        'Это урок из постоянной серии.\n\nOK — удалить ВСЕ уроки серии.\nОтмена — удалить только этот.'
      );
      try {
        if (deleteAll) {
          const { error } = await supabase
            .from('crm_lessons')
            .delete()
            .eq('recurring_group_id', lesson.recurring_group_id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('crm_lessons')
            .delete()
            .eq('id', lesson.id);
          if (error) throw error;
        }
        setDetailsLesson(null);
        await fetchAll();
      } catch (err) {
        alert('Ошибка удаления: ' + err.message);
      }
      return;
    }

    if (!window.confirm('Удалить урок? Действие необратимо.')) return;
    try {
      const { error } = await supabase.from('crm_lessons').delete().eq('id', lesson.id);
      if (error) throw error;
      setDetailsLesson(null);
      await fetchAll();
    } catch (err) {
      alert('Ошибка удаления: ' + err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((v) => v - 1)}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-bold cursor-pointer"
          >
            ←
          </button>
          <div className="px-3 py-1.5 font-bold text-gray-800 min-w-[160px] text-center">
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

        <button
          onClick={() => setCreatingAt({ date: new Date(), hour: 15 })}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm cursor-pointer"
        >
          + Урок
        </button>
      </div>

      {fetching ? (
        <div className="bg-white p-10 rounded-2xl border border-gray-200 text-center text-sm text-gray-500">
          Загрузка расписания…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
          {days.map((day) => {
            const key = toLocalDateKey(day);
            const dayLessons = lessonsByDay[key] || [];
            const isToday = new Date().toDateString() === day.toDateString();

            return (
              <div
                key={key}
                className={`bg-white rounded-2xl border shadow-sm min-h-[260px] flex flex-col ${
                  isToday ? 'border-blue-300 ring-1 ring-blue-100' : 'border-gray-200'
                }`}
              >
                <div
                  className={`px-3 py-2 border-b text-xs font-bold ${
                    isToday ? 'text-blue-700 bg-blue-50' : 'text-gray-600'
                  }`}
                >
                  {formatDayLabel(day)}
                </div>

                <div className="flex-1 p-2 space-y-1.5">
                  {dayLessons.length === 0 ? (
                    <div className="h-full" />
                  ) : (
                    dayLessons.map((l) => {
                      const past = isPast(l.ends_at);
                      const unmarked = past && l.status === 'scheduled';
                      const cancelled = l.status === 'cancelled';
                      const done = l.status === 'done';

                      let bg = 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100';
                      if (unmarked) bg = 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100';
                      else if (cancelled)
                        bg = 'bg-slate-100 border-slate-200 text-slate-400 line-through';
                      else if (done) bg = 'bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100';

                      return (
                        <button
                          key={l.id}
                          onClick={() => setDetailsLesson(l)}
                          className={`w-full text-left px-2 py-1.5 rounded-lg border text-[11px] font-semibold transition cursor-pointer ${bg}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span>{formatTime(l.starts_at)}</span>
                            <span className="opacity-70 text-[9px]">
                              {Math.round(
                                (new Date(l.ends_at) - new Date(l.starts_at)) / 60000
                              )}
                              м
                            </span>
                          </div>
                          <div className="truncate mt-0.5">{getLessonLabel(l)}</div>
                          {unmarked && (
                            <div className="text-[9px] mt-0.5 font-bold">! Не отмечен</div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creatingAt && (
        <LessonEditor
          mode="create"
          userId={userId}
          students={students}
          groups={groups}
          subs={subs}
          initialDate={creatingAt.date}
          initialHour={creatingAt.hour}
          existingLessons={lessons}
          onClose={() => setCreatingAt(null)}
          onSaved={() => {
            setCreatingAt(null);
            fetchAll();
          }}
        />
      )}

      {detailsLesson && (
        <LessonDetailsModal
          lesson={detailsLesson}
          students={students}
          subs={subs}
          getLessonLabel={getLessonLabel}
          formatTime={formatTime}
          onClose={() => setDetailsLesson(null)}
          onDelete={() => deleteLesson(detailsLesson)}
          onStart={() => {
            onStartCrmRoom?.(detailsLesson);
          }}
          onMarkDone={(attendance) => markLessonDone(detailsLesson, attendance)}
          onMarkSkipped={() => markLessonSkipped(detailsLesson)}
          onMarkCancelled={async () => {
            try {
              const { error } = await supabase
                .from('crm_lessons')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', detailsLesson.id);
              if (error) throw error;
              setDetailsLesson(null);
              fetchAll();
            } catch (err) {
              alert('Ошибка: ' + err.message);
            }
          }}
        />
      )}
    </div>
  );
};
/* ============================================================
   Модалка: создание урока
   ============================================================ */
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

const WEEKDAYS = [
  { idx: 0, label: 'Пн' },
  { idx: 1, label: 'Вт' },
  { idx: 2, label: 'Ср' },
  { idx: 3, label: 'Чт' },
  { idx: 4, label: 'Пт' },
  { idx: 5, label: 'Сб' },
  { idx: 6, label: 'Вс' },
];

const pad2 = (n) => String(n).padStart(2, '0');

// JS getDay(): Вс=0, Пн=1 ... Сб=6
// Наш idx:    Пн=0, Вт=1 ... Вс=6
const jsDayToOurIdx = (jsDay) => (jsDay === 0 ? 6 : jsDay - 1);

// Формат YYYY-MM-DD в ЛОКАЛЬНОМ часовом поясе
const dateToInputValue = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const TimePicker = ({ hour, minute, onChange, label }) => (
  <div>
    <label className="block text-xs font-bold text-gray-700 mb-1.5">{label}</label>
    <div className="flex items-center gap-1">
      <select
        value={hour}
        onChange={(e) => onChange(Number(e.target.value), minute)}
        className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer font-mono"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {pad2(h)}
          </option>
        ))}
      </select>
      <span className="font-bold text-gray-400">:</span>
      <select
        value={minute}
        onChange={(e) => onChange(hour, Number(e.target.value))}
        className="flex-1 px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer font-mono"
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {pad2(m)}
          </option>
        ))}
      </select>
    </div>
  </div>
);

const LessonEditor = ({
  userId,
  students,
  groups,
  subs,
  initialDate,
  initialHour,
  existingLessons,
  onClose,
  onSaved,
}) => {
  const baseDate = (() => {
    const d = new Date(initialDate || new Date());
    d.setHours(initialHour ?? 15, 0, 0, 0);
    return d;
  })();

  const baseEnd = new Date(baseDate.getTime() + 45 * 60000);

  const [recurringMode, setRecurringMode] = useState('once');
  const [attendeeMode, setAttendeeMode] = useState('individual');

  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  // Дата в формате YYYY-MM-DD (локальная)
  const [startDate, setStartDate] = useState(dateToInputValue(baseDate));
  const [startHour, setStartHour] = useState(baseDate.getHours());
  const [startMinute, setStartMinute] = useState(0);
  const [endHour, setEndHour] = useState(baseEnd.getHours());
  const [endMinute, setEndMinute] = useState(baseEnd.getMinutes());

  const [recurringDays, setRecurringDays] = useState([]);
  const [recurringWeeks, setRecurringWeeks] = useState(8);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isGroup = selectedStudentIds.length > 1;
  const durationMin = endHour * 60 + endMinute - (startHour * 60 + startMinute);

  useEffect(() => {
    if (recurringMode === 'weekly' && recurringDays.length === 0 && startDate) {
      // startDate: "YYYY-MM-DD" — парсим как локальную дату
      const [y, m, d] = startDate.split('-').map(Number);
      const localDate = new Date(y, m - 1, d);
      setRecurringDays([jsDayToOurIdx(localDate.getDay())]);
    }
  }, [recurringMode, startDate, recurringDays.length]);

  const checkOverlap = (startMs, endMs) => {
    for (const l of existingLessons) {
      if (l.status === 'cancelled') continue;
      const s = new Date(l.starts_at).getTime();
      const e = new Date(l.ends_at).getTime();
      if (startMs < e && endMs > s) return l;
    }
    return null;
  };

  const switchMode = (nextMode) => {
    setAttendeeMode(nextMode);
    setError('');
    if (nextMode === 'individual') {
      setSelectedGroupId('');
      setSelectedStudentIds((prev) => (prev.length > 1 ? [prev[0]] : prev));
    } else if (nextMode === 'group') {
      setSelectedStudentIds([]);
      setSelectedGroupId('');
    } else {
      setSelectedGroupId('');
    }
  };

  const handleIndividualSelect = (studentId) => {
    setSelectedStudentIds(studentId ? [studentId] : []);
  };

  const handleGroupSelect = (groupId) => {
    setSelectedGroupId(groupId);
    if (!groupId) {
      setSelectedStudentIds([]);
      return;
    }
    const grp = groups.find((g) => g.id === groupId);
    if (grp) setSelectedStudentIds(grp.memberIds);
  };

  const toggleStudent = (studentId) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  };

  const toggleDay = (idx) => {
    setRecurringDays((prev) =>
      prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
    );
  };

  // ============================================================
  // ГЛАВНЫЙ ФИКС: строим даты в локальном времени
  // ============================================================
  const buildOccurrences = () => {
    // startDate: "YYYY-MM-DD" → строим как локальную дату
    const [y, m, d] = startDate.split('-').map(Number);
    const baseLocalDate = new Date(y, m - 1, d); // локальная дата в 00:00

    if (recurringMode === 'once') {
      // Разовый урок
      const startLocal = new Date(
        baseLocalDate.getFullYear(),
        baseLocalDate.getMonth(),
        baseLocalDate.getDate(),
        startHour,
        startMinute,
        0,
        0
      );
      const endLocal = new Date(startLocal.getTime() + durationMin * 60000);
      return [{ s: startLocal, e: endLocal }];
    }

    // Постоянный: recurringDays — массив дней недели
    const sortedDays = [...recurringDays].sort((a, b) => a - b);
    if (sortedDays.length === 0) return [];

    // Находим понедельник недели, в которой находится baseLocalDate
    const baseIdx = jsDayToOurIdx(baseLocalDate.getDay());
    const weekMonday = new Date(baseLocalDate);
    weekMonday.setDate(weekMonday.getDate() - baseIdx);

    const occurrences = [];
    const startMidnight = new Date(
      baseLocalDate.getFullYear(),
      baseLocalDate.getMonth(),
      baseLocalDate.getDate(),
      0,
      0,
      0,
      0
    );

    let week = 0;
    let safety = 0;
    while (week < recurringWeeks && safety < 500) {
      safety++;
      for (const dayIdx of sortedDays) {
        const date = new Date(weekMonday);
        date.setDate(date.getDate() + week * 7 + dayIdx);
        date.setHours(startHour, startMinute, 0, 0);

        // Пропускаем даты до startMidnight
        if (date.getTime() < startMidnight.getTime()) continue;

        const end = new Date(date.getTime() + durationMin * 60000);
        occurrences.push({ s: date, e: end });
      }
      week++;
    }

    return occurrences;
  };

  const handleSave = async () => {
    setError('');

    if (selectedStudentIds.length === 0) {
      setError('Выберите ученика или группу');
      return;
    }
    if (!startDate) {
      setError('Укажите дату');
      return;
    }
    if (durationMin <= 0) {
      setError('Окончание должно быть позже начала');
      return;
    }
    if (recurringMode === 'weekly' && recurringDays.length === 0) {
      setError('Выберите хотя бы один день недели');
      return;
    }

    const occurrences = buildOccurrences();
    if (occurrences.length === 0) {
      setError('Не удалось построить расписание. Проверьте даты.');
      return;
    }

    for (const occ of occurrences) {
      const clash = checkOverlap(occ.s.getTime(), occ.e.getTime());
      if (clash) {
        const ct = new Date(clash.starts_at);
        setError(
          `Пересечение с уроком ${pad2(ct.getHours())}:${pad2(ct.getMinutes())} (${ct.toLocaleDateString('ru-RU')})`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const recurringGroupId =
        recurringMode === 'weekly' && occurrences.length > 1
          ? crypto.randomUUID()
          : null;

      const rows = occurrences.map((occ) => ({
        teacher_id: userId,
        student_ids: selectedStudentIds,
        is_group: isGroup,
        starts_at: occ.s.toISOString(),
        ends_at: occ.e.toISOString(),
        status: 'scheduled',
        attendance: {},
        recurring_group_id: recurringGroupId,
        created_by: userId,
      }));

      const { error: insErr } = await supabase.from('crm_lessons').insert(rows);
      if (insErr) throw insErr;

      onSaved?.();
    } catch (err) {
      console.error('Ошибка сохранения урока:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const summaryText = (() => {
    if (recurringMode === 'once') return 'Разовый урок';
    const labels = [...recurringDays].sort((a, b) => a - b).map((i) => WEEKDAYS[i].label);
    return `Постоянный: ${labels.join(', ')} — ${recurringWeeks} нед.`;
  })();

  const attendeeLabels = {
    individual: '👤 Индивидуальный',
    group: '👥 Группа',
    custom: '✏️ Свой состав',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">Создать занятие</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs rounded-lg">{error}</div>
        )}

        <div className="flex gap-2 mb-4 p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => setRecurringMode('once')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold cursor-pointer transition ${
              recurringMode === 'once'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Разовый
          </button>
          <button
            type="button"
            onClick={() => setRecurringMode('weekly')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold cursor-pointer transition ${
              recurringMode === 'weekly'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Постоянный
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-bold text-gray-700 mb-1.5">
            Тип занятия
          </label>
          <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
            {['individual', 'group', 'custom'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer transition ${
                  attendeeMode === m
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {attendeeLabels[m]}
              </button>
            ))}
          </div>
        </div>

        {attendeeMode === 'individual' && (
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Ученик
            </label>
            {students.length === 0 ? (
              <div className="text-xs text-gray-400 py-3">
                Сначала добавьте учеников во вкладке «👤 Ученики».
              </div>
            ) : (
              <select
                value={selectedStudentIds[0] || ''}
                onChange={(e) => handleIndividualSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer"
              >
                <option value="">— Выберите ученика —</option>
                {students.map((s) => {
                  const balance = subs[s.id] ?? 0;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.name || s.email} ({balance} ост.)
                    </option>
                  );
                })}
              </select>
            )}
          </div>
        )}

        {attendeeMode === 'group' && (
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Группа
            </label>
            {groups.length === 0 ? (
              <div className="text-xs text-gray-400 py-3">
                Сначала создайте группу во вкладке «👥 Группы».
              </div>
            ) : (
              <>
                <select
                  value={selectedGroupId}
                  onChange={(e) => handleGroupSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer"
                >
                  <option value="">— Выберите группу —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.memberIds.length} уч.)
                    </option>
                  ))}
                </select>
                {selectedGroupId && (
                  <div className="mt-2 text-[11px] text-gray-500 bg-slate-50 rounded-lg p-2">
                    Состав:{' '}
                    {groups
                      .find((g) => g.id === selectedGroupId)
                      ?.memberIds.map((sid) => {
                        const s = students.find((st) => st.id === sid);
                        return s ? s.name || s.email : '?';
                      })
                      .join(', ') || 'пусто'}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {attendeeMode === 'custom' && (
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Ученики (выбрано: {selectedStudentIds.length})
            </label>
            {students.length === 0 ? (
              <div className="text-xs text-gray-400 py-3">
                Сначала добавьте учеников во вкладке «👤 Ученики».
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto border border-slate-100 rounded-lg p-2 space-y-1">
                {students.map((s) => {
                  const checked = selectedStudentIds.includes(s.id);
                  const balance = subs[s.id] ?? 0;
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer text-sm ${
                        checked ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStudent(s.id)}
                        className="w-4 h-4"
                      />
                      <span className="font-medium text-gray-800">
                        {s.name || s.email}
                      </span>
                      <span
                        className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          balance < 0
                            ? 'bg-red-50 text-red-600'
                            : balance === 0
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                        title="Осталось занятий"
                      >
                        {balance}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {recurringMode === 'weekly' && (
          <div className="mb-4">
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Дни недели
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {WEEKDAYS.map((d) => {
                const checked = recurringDays.includes(d.idx);
                return (
                  <button
                    key={d.idx}
                    type="button"
                    onClick={() => toggleDay(d.idx)}
                    className={`px-3.5 py-2 rounded-lg text-sm font-bold cursor-pointer transition ${
                      checked
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white text-gray-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              {recurringMode === 'weekly' ? 'Начать с' : 'Дата'}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white cursor-pointer"
            />
          </div>

          {recurringMode === 'weekly' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Повторять недель
              </label>
              <input
                type="number"
                min={1}
                max={52}
                value={recurringWeeks}
                onChange={(e) =>
                  setRecurringWeeks(
                    Math.max(1, Math.min(52, Number(e.target.value) || 1))
                  )
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <TimePicker
            label="Начало"
            hour={startHour}
            minute={startMinute}
            onChange={(h, m) => {
              setStartHour(h);
              setStartMinute(m);
            }}
          />
          <TimePicker
            label="Окончание"
            hour={endHour}
            minute={endMinute}
            onChange={(h, m) => {
              setEndHour(h);
              setEndMinute(m);
            }}
          />
        </div>

        <div className="mb-5 text-xs text-gray-500 bg-slate-50 rounded-lg p-3 space-y-1">
          <div>
            <strong>Тип:</strong> {summaryText}
          </div>
          <div>
            <strong>Формат:</strong> {isGroup ? 'Групповой' : 'Индивидуальный'}
          </div>
          <div>
            <strong>Длительность:</strong>{' '}
            {durationMin > 0
              ? `${durationMin} минут`
              : <span className="text-red-600">укажите корректное время</span>}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm cursor-pointer"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================
   Модалка: детали урока
   ============================================================ */
const LessonDetailsModal = ({
  lesson,
  students,
  subs,
  getLessonLabel,
  formatTime,
  onClose,
  onDelete,
  onStart,
  onMarkDone,
  onMarkSkipped,
  onMarkCancelled,
}) => {
  const [attendance, setAttendance] = useState(() => ({ ...(lesson.attendance || {}) }));
  const studentMap = useMemo(() => {
    const m = {};
    students.forEach((s) => (m[s.id] = s));
    return m;
  }, [students]);

  const isPast = new Date(lesson.ends_at) < new Date();

  const toggleAttendance = (studentId) => {
    setAttendance((prev) => {
      const next = { ...prev };
      const current = next[studentId] === undefined ? true : next[studentId];
      next[studentId] = !current;
      return next;
    });
  };

  const isAttended = (studentId) => {
    if (attendance[studentId] === undefined) return true;
    return attendance[studentId] === true;
  };

  const label = getLessonLabel(lesson);

  const statusBadge = (() => {
    if (lesson.status === 'done')
      return { text: '✓ Проведён', cls: 'bg-blue-50 text-blue-700' };
    if (lesson.status === 'cancelled')
      return { text: 'Отменён', cls: 'bg-slate-100 text-slate-500' };
    if (lesson.status === 'skipped')
      return { text: '⊘ Не проведён', cls: 'bg-amber-50 text-amber-700' };
    if (isPast) return { text: '! Не отмечен', cls: 'bg-red-50 text-red-700' };
    return { text: 'Запланирован', cls: 'bg-emerald-50 text-emerald-700' };
  })();

  const canMark = lesson.status === 'scheduled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-lg font-bold text-gray-900">{label}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {new Date(lesson.starts_at).toLocaleDateString('ru-RU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <span className={`px-2.5 py-1 rounded-full font-bold ${statusBadge.cls}`}>
            {statusBadge.text}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
            {formatTime(lesson.starts_at)} – {formatTime(lesson.ends_at)}
          </span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
            {lesson.is_group ? 'Групповой' : 'Индивидуальный'}
          </span>
          {lesson.recurring_group_id && (
            <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 font-semibold">
              🔁 Постоянный
            </span>
          )}
        </div>

        {lesson.student_ids.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-bold text-gray-700 mb-2">
              {canMark ? 'Кто пришёл (снимите галочку, если не был)' : 'Участники'}
            </div>
            <div className="space-y-1">
              {lesson.student_ids.map((sid) => {
                const s = studentMap[sid];
                if (!s) return null;
                const attended = isAttended(sid);
                const balance = subs[sid] ?? 0;
                return (
                  <label
                    key={sid}
                    className={`flex items-center gap-2.5 p-2 rounded-lg text-sm ${
                      canMark ? 'cursor-pointer' : ''
                    } ${
                      attended
                        ? 'bg-emerald-50 border border-emerald-100'
                        : 'bg-red-50 border border-red-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={attended}
                      onChange={() => canMark && toggleAttendance(sid)}
                      disabled={!canMark}
                      className="w-4 h-4"
                    />
                    <span className="font-medium text-gray-800 flex-1">
                      {s.name || s.email}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        balance < 0
                          ? 'bg-red-100 text-red-700'
                          : balance === 0
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                      title="Осталось занятий"
                    >
                      {balance} ост.
                    </span>
                  </label>
                );
              })}
            </div>
            {canMark && (
              <div className="mt-2 text-[11px] text-gray-500">
                При проведении урока с каждого отмеченного спишется 1 занятие.
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          {canMark && !isPast && (
            <button
              onClick={() => onStart?.()}
              className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm cursor-pointer"
            >
              ▶ Начать урок
            </button>
          )}

          {canMark && (
            <button
              onClick={() => onMarkDone?.(attendance)}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm cursor-pointer"
            >
              ✓ Провести урок (списать занятие)
            </button>
          )}

          {canMark && (
            <button
              onClick={() => onMarkSkipped?.()}
              className="w-full py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold rounded-xl text-sm cursor-pointer"
            >
              ⊘ Не проведён (не списывать)
            </button>
          )}

          {canMark && !isPast && (
            <button
              onClick={onMarkCancelled}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm cursor-pointer"
            >
              ✕ Отменить урок
            </button>
          )}

          <button
            onClick={onDelete}
            className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl text-sm cursor-pointer"
          >
            🗑 Удалить урок
          </button>
        </div>
      </div>
    </div>
  );
};