import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { fetchMyStudentIds } from './studentScope';

const KIND_LABELS = {
  mate1: 'Мат в 1 ход',
  mate2: 'Мат в 2 хода',
  mate3: 'Мат в 3 хода',
  mixed: 'Смешанное: мат в 1 → в 2 → в 3',
};

const LEVEL_NAMES = ['Очень лёгкий', 'Лёгкий', 'Средний', 'Сложный', 'Очень сложный'];
const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

const LEVELS = [
  { value: 'easy', label: 'Лёгкие' },
  { value: 'medium', label: 'Средние' },
  { value: 'hard', label: 'Сложные' },
  { value: 'any', label: 'Любые' },
];

const levelRange = (total, level) => {
  if (level === 'any' || total < 3) return [0, Math.max(0, total - 1)];
  const third = Math.floor(total / 3);
  if (level === 'easy') return [0, Math.max(0, third - 1)];
  if (level === 'medium') return [third, Math.max(third, third * 2 - 1)];
  return [third * 2, total - 1];
};

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pickPuzzleIds = async (kind, level, n) => {
  const { count, error: countError } = await supabase
    .from('puzzles')
    .select('id', { count: 'exact', head: true })
    .eq('kind', kind);
  if (countError) throw countError;
  if (!count) throw new Error(`В базе нет задач вида «${KIND_LABELS[kind]}». Загрузите их скриптом import_puzzles.mjs.`);

  const [from, to] = levelRange(count, level);
  const { data, error } = await supabase
    .from('puzzles')
    .select('id')
    .eq('kind', kind)
    .order('rating', { ascending: true })
    .order('id', { ascending: true })
    .range(from, Math.min(to, from + 999));
  if (error) throw error;
  return shuffle((data || []).map((r) => r.id)).slice(0, n);
};

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—';

export const HomeworkTeacher = () => {
  const [userId, setUserId] = useState(null);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [ruleGroupId, setRuleGroupId] = useState('');
  const [names, setNames] = useState({});
  const [homeworks, setHomeworks] = useState([]);
  const [results, setResults] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const [selected, setSelected] = useState([]);
  const [kind, setKind] = useState('mate1');
  const [level, setLevel] = useState('easy');
  const [count, setCount] = useState(10);
  const [dueDate, setDueDate] = useState('');
  const [title, setTitle] = useState('');

  const [rules, setRules] = useState([]);
  const [ruleTitle, setRuleTitle] = useState('');
  const [ruleWeekday, setRuleWeekday] = useState(1);
  const [ruleCounts, setRuleCounts] = useState({ n1: 4, n2: 4, n3: 2 });
  const [ruleLevel, setRuleLevel] = useState(1);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const myStudentIds = await fetchMyStudentIds(userId);

      const { data: studentRows } = myStudentIds.length
        ? await supabase
            .from('profiles')
            .select('id, name, email')
            .in('id', myStudentIds)
            .order('created_at', { ascending: false })
        : { data: [] };
      const studentList = studentRows || [];
      const studentIds = studentList.map((p) => p.id);

      const { data: groupRows } = await supabase
        .from('groups')
        .select('id, name')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: false });
      let memberRows = [];
      if ((groupRows || []).length) {
        const { data: m } = await supabase
          .from('group_members')
          .select('group_id, student_id')
          .in('group_id', groupRows.map((g) => g.id));
        memberRows = m || [];
      }
      setGroups(
        (groupRows || []).map((g) => ({
          ...g,
          memberIds: memberRows.filter((m) => m.group_id === g.id).map((m) => m.student_id),
        }))
      );

      const { data: hw, error: hwError } = await supabase
        .from('homework')
        .select('*')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);
      if (hwError) throw hwError;
      const hwList = hw || [];

      const { data: ruleRows } = await supabase
        .from('homework_auto_rules')
        .select('*')
        .eq('teacher_id', userId)
        .order('created_at', { ascending: true });
      const ruleList = ruleRows || [];
      setRules(ruleList);

      const knownNames = {};
      studentList.forEach((p) => {
        knownNames[p.id] = p.name || p.email || 'Ученик';
      });

      const allIds = [
        ...new Set([
          ...studentIds,
          ...hwList.flatMap((h) => h.student_ids || []),
          ...ruleList.flatMap((r) => r.student_ids || []),
        ]),
      ];
      const missing = allIds.filter((id) => !knownNames[id]);
      if (missing.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, name, email')
          .in('id', missing);
        (profiles || []).forEach((p) => {
          knownNames[p.id] = p.name || p.email || 'Ученик';
        });
      }
      setNames(knownNames);

      setStudents(studentIds);
      setHomeworks(hwList);

      if (hwList.length) {
        const { data: rs } = await supabase
          .from('homework_results')
          .select('*')
          .in('homework_id', hwList.map((h) => h.id));
        setResults(rs || []);
      } else {
        setResults([]);
      }
    } catch (e) {
      console.error('Ошибка загрузки домашних заданий:', e);
      setNotice({ type: 'err', text: 'Не удалось загрузить данные. Выполнены ли SQL-скрипты?' });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStudent = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const createHomework = async () => {
    if (!userId || busy) return;
    if (selected.length === 0) {
      setNotice({ type: 'err', text: 'Выберите хотя бы одного ученика.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      let puzzleIds = [];
      if (kind === 'mixed') {
        const third = Math.round(count * 0.2);
        const first = Math.ceil((count - third) / 2);
        const second = count - third - first;
        const a = await pickPuzzleIds('mate1', level, first);
        const b = await pickPuzzleIds('mate2', level, second);
        const c = third > 0 ? await pickPuzzleIds('mate3', level, third) : [];
        puzzleIds = [...a, ...b, ...c];
      } else {
        puzzleIds = await pickPuzzleIds(kind, level, count);
      }
      if (puzzleIds.length === 0) throw new Error('Не нашлось подходящих задач.');

      const levelLabel = LEVELS.find((l) => l.value === level)?.label.toLowerCase();
      const { error } = await supabase.from('homework').insert({
        teacher_id: userId,
        title: title.trim() || `${KIND_LABELS[kind]} · ${puzzleIds.length} задач (${levelLabel})`,
        kind,
        puzzle_ids: puzzleIds,
        student_ids: selected,
        due_at: dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : null,
      });
      if (error) throw error;

      setNotice({ type: 'ok', text: `Задание выдано: ${selected.length} уч., задач: ${puzzleIds.length}.` });
      setSelected([]);
      setTitle('');
      await load();
    } catch (e) {
      console.error('Ошибка создания задания:', e);
      setNotice({ type: 'err', text: e.message || 'Не удалось создать задание.' });
    } finally {
      setBusy(false);
    }
  };

  const deleteHomework = async (id) => {
    if (!window.confirm('Удалить задание вместе с результатами учеников?')) return;
    const { error } = await supabase.from('homework').delete().eq('id', id);
    if (error) {
      setNotice({ type: 'err', text: 'Не удалось удалить задание.' });
      return;
    }
    await load();
  };

  const createRule = async () => {
    if (!userId || busy) return;
    const ruleGroup = groups.find((g) => g.id === ruleGroupId);
    const ruleStudents = ruleGroup ? ruleGroup.memberIds : selected;
    if (ruleStudents.length === 0) {
      setNotice({
        type: 'err',
        text: ruleGroup
          ? 'В этой группе пока нет учеников.'
          : 'Выберите группу или отметьте учеников выше.',
      });
      return;
    }
    const total = ruleCounts.n1 + ruleCounts.n2 + ruleCounts.n3;
    if (total === 0) {
      setNotice({ type: 'err', text: 'Укажите хотя бы одну задачу в наборе.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const { error } = await supabase.from('homework_auto_rules').insert({
        teacher_id: userId,
        title: ruleTitle.trim() || 'Домашка на неделю',
        student_ids: ruleStudents,
        group_id: ruleGroup ? ruleGroup.id : null,
        weekday: ruleWeekday,
        n_mate1: ruleCounts.n1,
        n_mate2: ruleCounts.n2,
        n_mate3: ruleCounts.n3,
        level: ruleLevel,
      });
      if (error) throw error;
      setNotice({
        type: 'ok',
        text: `Правило создано: каждую неделю (${WEEKDAYS[ruleWeekday - 1].toLowerCase()}) ${ruleGroup ? `группе «${ruleGroup.name}»` : `${ruleStudents.length} уч.`} будет выдаваться ДЗ.`,
      });
      setSelected([]);
      setRuleGroupId('');
      setRuleTitle('');
      await load();
    } catch (e) {
      console.error('Ошибка создания правила:', e);
      setNotice({ type: 'err', text: e.message || 'Не удалось создать правило.' });
    } finally {
      setBusy(false);
    }
  };

  const toggleRule = async (rule) => {
    const { error } = await supabase
      .from('homework_auto_rules')
      .update({ active: !rule.active })
      .eq('id', rule.id);
    if (error) setNotice({ type: 'err', text: 'Не удалось изменить правило.' });
    await load();
  };

  const deleteRule = async (id) => {
    if (!window.confirm('Удалить правило? Уже выданные задания останутся.')) return;
    const { error } = await supabase.from('homework_auto_rules').delete().eq('id', id);
    if (error) setNotice({ type: 'err', text: 'Не удалось удалить правило.' });
    await load();
  };

  const issueRuleNow = async (id) => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.rpc('issue_auto_homework_now', { p_rule_id: id });
      if (error) throw error;
      setNotice(
        data
          ? { type: 'ok', text: 'Задание выдано.' }
          : { type: 'err', text: 'В банке не нашлось подходящих задач. Загрузите больше задач.' }
      );
      await load();
    } catch (e) {
      console.error('Ошибка выдачи по правилу:', e);
      setNotice({ type: 'err', text: e.message || 'Не удалось выдать задание.' });
    } finally {
      setBusy(false);
    }
  };

  const summary = useMemo(() => {
    const map = {};
    results.forEach((r) => {
      const key = `${r.homework_id}:${r.student_id}`;
      if (!map[key]) map[key] = { solved: 0, mistakes: 0, hints: 0, last: null };
      if (r.solved) map[key].solved += 1;
      map[key].mistakes += r.mistakes || 0;
      map[key].hints += r.hints || 0;
      if (!map[key].last || r.updated_at > map[key].last) map[key].last = r.updated_at;
    });
    return map;
  }, [results]);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <h3 className="text-base font-black text-gray-900">📚 Выдать домашнее задание</h3>

        {groups.length > 0 && (
          <div>
            <div className="text-xs font-bold text-gray-500 mb-2">Группы (нажмите, чтобы выбрать всех)</div>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => {
                const all = g.memberIds.length > 0 && g.memberIds.every((id) => selected.includes(id));
                return (
                  <button
                    key={g.id}
                    onClick={() =>
                      setSelected((prev) =>
                        all
                          ? prev.filter((id) => !g.memberIds.includes(id))
                          : [...new Set([...prev, ...g.memberIds])]
                      )
                    }
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition ${
                      all
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    👥 {g.name} ({g.memberIds.length})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-bold text-gray-500 mb-2">Ученики</div>
          {students.length === 0 ? (
            <div className="text-xs text-gray-400">
              Пока нет учеников. Добавьте их на вкладке «Ученики».
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {students.map((id) => (
                <button
                  key={id}
                  onClick={() => toggleStudent(id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer transition ${
                    selected.includes(id)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {names[id] || 'Ученик'}
                </button>
              ))}
              <button
                onClick={() => setSelected(selected.length === students.length ? [] : [...students])}
                className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                {selected.length === students.length ? 'Снять всех' : 'Выбрать всех'}
              </button>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <label className="space-y-1">
            <span className="font-bold text-gray-500">Тип задач</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 bg-white font-semibold cursor-pointer"
            >
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-bold text-gray-500">Сложность</span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 bg-white font-semibold cursor-pointer"
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-bold text-gray-500">Сколько задач</span>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 bg-white font-semibold cursor-pointer"
            >
              {[5, 10, 15, 20, 30, 40].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="font-bold text-gray-500">Срок сдачи (необязательно)</span>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 bg-white font-semibold"
            />
          </label>
        </div>

        <label className="block space-y-1 text-xs">
          <span className="font-bold text-gray-500">Название (необязательно)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Например: Домашка на неделю"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white"
          />
        </label>

        {notice && (
          <div
            className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
              notice.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {notice.text}
          </div>
        )}

        <button
          onClick={createHomework}
          disabled={busy || selected.length === 0}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold cursor-pointer"
        >
          {busy ? 'Создаём…' : 'Выдать задание'}
        </button>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
        <div>
          <h3 className="text-base font-black text-gray-900">🔁 Автоматическое ДЗ раз в неделю</h3>
          <p className="text-xs text-gray-400 mt-1 leading-snug">
            Выберите группу (или отметьте учеников выше) и настройте набор. В выбранный день недели в 09:00 система сама выдаст
            группе новое задание. Сложность подстраивается: если группа сдала от 80% задач и делает в среднем не
            больше одной ошибки на задачу — уровень растёт; если сдано меньше половины или ошибок больше трёх на
            задачу — снижается. Уже выданные задачи не повторяются.
          </p>
        </div>

        <label className="block space-y-1 text-xs">
          <span className="font-bold text-gray-500">Кому выдавать</span>
          <select
            value={ruleGroupId}
            onChange={(e) => setRuleGroupId(e.target.value)}
            className="w-full sm:w-auto border border-gray-200 rounded-lg px-2 py-2 bg-white font-semibold cursor-pointer"
          >
            <option value="">Отмеченные выше ученики (состав фиксируется)</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                Группа «{g.name}» (состав берётся на момент выдачи)
              </option>
            ))}
          </select>
        </label>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <label className="space-y-1 lg:col-span-2">
            <span className="font-bold text-gray-500">Название</span>
            <input
              type="text"
              value={ruleTitle}
              onChange={(e) => setRuleTitle(e.target.value)}
              placeholder="Например: Группа А — домашка"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 bg-white"
            />
          </label>
          <label className="space-y-1">
            <span className="font-bold text-gray-500">День недели</span>
            <select
              value={ruleWeekday}
              onChange={(e) => setRuleWeekday(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 bg-white font-semibold cursor-pointer"
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="font-bold text-gray-500">Стартовый уровень</span>
            <select
              value={ruleLevel}
              onChange={(e) => setRuleLevel(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 bg-white font-semibold cursor-pointer"
            >
              {LEVEL_NAMES.map((n, i) => (
                <option key={n} value={i + 1}>
                  {i + 1}. {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3 text-xs">
          {[
            ['n1', 'Мат в 1'],
            ['n2', 'Мат в 2'],
            ['n3', 'Мат в 3'],
          ].map(([key, label]) => (
            <label key={key} className="space-y-1">
              <span className="font-bold text-gray-500">{label}</span>
              <select
                value={ruleCounts[key]}
                onChange={(e) => setRuleCounts({ ...ruleCounts, [key]: Number(e.target.value) })}
                className="block border border-gray-200 rounded-lg px-2 py-2 bg-white font-semibold cursor-pointer"
              >
                {[0, 1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} шт.
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            onClick={createRule}
            disabled={busy || (!ruleGroupId && selected.length === 0)}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold cursor-pointer"
          >
            Создать правило
          </button>
        </div>

        {rules.length > 0 && (
          <div className="space-y-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-gray-100 bg-slate-50/60 rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-bold text-gray-900 truncate">
                    {r.title}{' '}
                    {!r.active && (
                      <span className="text-[10px] font-bold text-gray-400 uppercase">· на паузе</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {WEEKDAYS[r.weekday - 1]} ·{' '}
                    {r.group_id
                      ? `группа «${groups.find((g) => g.id === r.group_id)?.name || '—'}»`
                      : `${r.student_ids.length} уч.`}{' '}
                    · набор {r.n_mate1}+{r.n_mate2}+
                    {r.n_mate3} · уровень {r.level}: {LEVEL_NAMES[r.level - 1]}
                  </div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {r.student_ids.map((id) => names[id] || 'Ученик').join(', ')}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => issueRuleNow(r.id)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 text-xs font-bold cursor-pointer"
                  >
                    Выдать сейчас
                  </button>
                  <button
                    onClick={() => toggleRule(r)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold cursor-pointer"
                  >
                    {r.active ? 'Пауза' : 'Включить'}
                  </button>
                  <button
                    onClick={() => deleteRule(r.id)}
                    className="text-xs text-red-500 hover:text-red-700 font-bold cursor-pointer"
                    title="Удалить правило"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-gray-900">Выданные задания</h3>
          <button
            onClick={load}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold cursor-pointer"
          >
            ↻ Обновить
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-gray-400">Загрузка…</div>
        ) : homeworks.length === 0 ? (
          <div className="text-sm text-gray-400">Вы пока не выдавали заданий.</div>
        ) : (
          <div className="space-y-2">
            {homeworks.map((h) => {
              const total = h.puzzle_ids.length;
              const open = expanded === h.id;
              const finishedCount = h.student_ids.filter(
                (sid) => (summary[`${h.id}:${sid}`]?.solved || 0) >= total
              ).length;
              return (
                <div key={h.id} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div
                    onClick={() => setExpanded(open ? null : h.id)}
                    className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate">{h.title}</div>
                      <div className="text-[11px] text-gray-400">
                        Выдано {formatDate(h.created_at)} · срок {formatDate(h.due_at)} · задач: {total}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-bold text-gray-600">
                        Сдали: {finishedCount} из {h.student_ids.length}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteHomework(h.id);
                        }}
                        className="text-xs text-red-500 hover:text-red-700 font-bold cursor-pointer"
                        title="Удалить задание"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div className="border-t border-gray-100 bg-slate-50/60 px-4 py-3 space-y-1.5">
                      {h.student_ids.map((sid) => {
                        const s = summary[`${h.id}:${sid}`] || { solved: 0, mistakes: 0, hints: 0 };
                        const done = s.solved >= total;
                        return (
                          <div
                            key={sid}
                            className="flex items-center justify-between gap-3 text-xs bg-white rounded-lg border border-gray-100 px-3 py-2"
                          >
                            <span className="font-semibold text-gray-800 truncate">
                              {names[sid] || 'Ученик'}
                            </span>
                            <span className="flex items-center gap-3 shrink-0 text-gray-500">
                              <span
                                className={`font-black ${
                                  done ? 'text-emerald-600' : s.solved > 0 ? 'text-amber-600' : 'text-gray-400'
                                }`}
                              >
                                {s.solved}/{total}
                              </span>
                              <span title="Ошибочные попытки">❌ {s.mistakes}</span>
                              <span title="Подсказки">💡 {s.hints}</span>
                            </span>
                          </div>
                        );
                      })}
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