// Tournament.jsx
import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';

/* ============================================================
   Круговая система по таблице Бергера.
   Возвращает массив туров: [ [ {table, white:{id,name}, black:{id,name}} ] ]
   ============================================================ */
export function generateRoundRobin(participants) {
  if (!participants || participants.length < 2) return [];

  const players = participants.map((p) => ({ id: p.id, name: p.name }));
  if (players.length % 2 === 1) players.push({ id: '__bye__', name: '—', isBye: true });

  const n = players.length;
  const totalRounds = n - 1;
  const half = n / 2;

  const fixed = players[0];
  let rotation = players.slice(1);
  const rounds = [];

  for (let r = 0; r < totalRounds; r++) {
    const pairs = [];

    // Фиксированный игрок vs последний в ротации
    const opp = rotation[rotation.length - 1];
    if (!fixed.isBye && !opp.isBye) {
      pairs.push(
        r % 2 === 0
          ? { white: { id: fixed.id, name: fixed.name }, black: { id: opp.id, name: opp.name } }
          : { white: { id: opp.id, name: opp.name }, black: { id: fixed.id, name: fixed.name } }
      );
    }

    // Остальные пары "по кругу"
    for (let i = 0; i < half - 1; i++) {
      const a = rotation[i];
      const b = rotation[rotation.length - 2 - i];
      if (a.isBye || b.isBye) continue;
      pairs.push(
        (r + i) % 2 === 0
          ? { white: { id: a.id, name: a.name }, black: { id: b.id, name: b.name } }
          : { white: { id: b.id, name: b.name }, black: { id: a.id, name: a.name } }
      );
    }

    pairs.forEach((p, idx) => { p.table = idx + 1; });
    rounds.push(pairs);

    // Ротация: последний → первый
    rotation = [rotation[rotation.length - 1], ...rotation.slice(0, -1)];
  }

  return rounds;
}

/* ============================================================
   Подсчёт турнирной таблицы по результатам.
   results: [{ round, whiteId, blackId, winnerId | 'draw' }]
   ============================================================ */
export function computeStandings(participants, results) {
  const stats = {};
  (participants || []).forEach((p) => {
    stats[p.id] = { id: p.id, name: p.name, points: 0, played: 0, wins: 0, draws: 0, losses: 0 };
  });

  (results || []).forEach((r) => {
    const w = stats[r.whiteId];
    const b = stats[r.blackId];
    if (!w || !b) return;
    w.played++; b.played++;
    if (r.winnerId === 'draw') {
      w.points += 0.5; b.points += 0.5; w.draws++; b.draws++;
    } else if (r.winnerId === r.whiteId) {
      w.points += 1; w.wins++; b.losses++;
    } else if (r.winnerId === r.blackId) {
      b.points += 1; b.wins++; w.losses++;
    }
  });

  return Object.values(stats).sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name)
  );
}

/* ============================================================
   Загрузка реальных участников из группы/ученика + тренер.
   ============================================================ */
export async function fetchLessonParticipants(lesson, currentUser) {
  const list = [];

  if (lesson?.isGroup && lesson?.group?.id) {
    const { data: members } = await supabase
      .from('group_members')
      .select('student_id')
      .eq('group_id', lesson.group.id);
    const ids = (members || []).map((m) => m.student_id);
    if (ids.length) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', ids);
      (profiles || []).forEach((p) =>
        list.push({ id: p.id, name: p.name || p.email || 'Ученик' })
      );
    }
  } else if (lesson?.students?.id) {
    list.push({
      id: lesson.students.id,
      name: lesson.students.name || lesson.students.email || 'Ученик',
    });
  }

  // Тренер тоже играет
  if (currentUser?.id && !list.some((p) => p.id === currentUser.id)) {
    list.push({
      id: currentUser.id,
      name: currentUser.name || currentUser.email || 'Тренер',
      isTeacher: true,
    });
  }

  return list;
}

/* ============================================================
   Панель запуска турнира (только тренер).
   ============================================================ */
export function TournamentPanel({ lesson, currentUser, onStart, onClose }) {
  const [participants, setParticipants] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState(5);
  const [increment, setIncrement] = useState(3);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await fetchLessonParticipants(lesson, currentUser);
      if (cancelled) return;
      setParticipants(list);
      setSelected(new Set(list.map((p) => p.id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [lesson, currentUser]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedList = participants.filter((p) => selected.has(p.id));
  const canStart = selectedList.length >= 2;
  const gamesCount = (selectedList.length * (selectedList.length - 1)) / 2;
  const roundsCount =
    selectedList.length % 2 === 0 ? selectedList.length - 1 : selectedList.length;

  const handleStart = () => {
    if (!canStart) return;
    const schedule = generateRoundRobin(selectedList);
    if (schedule.length === 0) return;
    onStart({
      participants: selectedList,
      schedule,
      timeControl: { min: minutes, inc: increment },
    });
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">🏆 Мини-турнир (Round Robin)</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl cursor-pointer">✕</button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Каждый играет с каждым. Пары формируются по таблице Бергера автоматически.
          Жеребьёвка считается только у тренера и рассылается всем одной командой.
        </p>

        {loading ? (
          <div className="py-6 text-center text-xs text-gray-400">Загрузка участников…</div>
        ) : participants.length < 2 ? (
          <div className="py-6 text-center text-xs text-gray-400">
            Нужно минимум 2 участника. Проверьте состав группы / ученика.
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="text-xs font-bold text-gray-700 mb-2">
                Участники ({selectedList.length} из {participants.length})
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto border border-slate-100 rounded-lg p-2">
                {participants.map((p) => (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm ${
                      selected.has(p.id) ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="w-4 h-4"
                    />
                    <span className="font-medium text-gray-800">{p.name}</span>
                    {p.isTeacher && (
                      <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                        Тренер
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Минут на партию</label>
                <input
                  type="number" min={1} max={60} value={minutes}
                  onChange={(e) => setMinutes(Math.max(1, Math.min(60, Number(e.target.value) || 5)))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">+ сек за ход</label>
                <input
                  type="number" min={0} max={60} value={increment}
                  onChange={(e) => setIncrement(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>

            {canStart && (
              <div className="mb-4 text-xs text-gray-500 bg-slate-50 rounded-lg p-3">
                Всего <strong>{gamesCount}</strong> партий, <strong>{roundsCount}</strong> туров.
                Контроль: <strong>{minutes}+{increment}</strong>.
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm cursor-pointer"
              >
                Отмена
              </button>
              <button
                onClick={handleStart}
                disabled={!canStart}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-sm cursor-pointer disabled:opacity-50"
              >
                🚀 Начать турнир
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   Общая таблица для всех участников турнира.
   ============================================================ */
export function TournamentScoreboard({
  tournament, results, currentUserId, onNextRound, isTeacher,
}) {
  const standings = useMemo(
    () => computeStandings(tournament?.participants || [], results || []),
    [tournament?.participants, results]
  );

  if (!tournament) return null;

  const pairings = tournament.pairings || [];
  const isLastRound = tournament.round >= tournament.totalRounds;
  const roundComplete = pairings.every((p) =>
    (results || []).some(
      (r) =>
        r.round === tournament.round &&
        ((r.whiteId === p.white.id && r.blackId === p.black.id) ||
          (r.whiteId === p.black.id && r.blackId === p.white.id))
    )
  );

  return (
    <div className="bg-white p-3 rounded-2xl border border-amber-200 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-gray-900 text-sm">🏆 Турнир</h3>
        <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
          Тур {tournament.round} / {tournament.totalRounds}
        </span>
      </div>

      <div className="mb-3">
        <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Пары текущего тура</div>
        <div className="space-y-1">
          {pairings.map((p, i) => {
            const isMine = p.white.id === currentUserId || p.black.id === currentUserId;
            const result = (results || []).find(
              (r) =>
                r.round === tournament.round &&
                ((r.whiteId === p.white.id && r.blackId === p.black.id) ||
                  (r.whiteId === p.black.id && r.blackId === p.white.id))
            );
            return (
              <div
                key={i}
                className={`px-2 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 ${
                  isMine ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'
                }`}
              >
                <span className="font-semibold text-gray-500 shrink-0">Стол {p.table}</span>
                <span className="flex-1 text-center text-gray-700 truncate">
                  <span className="font-medium">{p.white.name}</span>
                  <span className="text-gray-400"> — </span>
                  <span className="font-medium">{p.black.name}</span>
                </span>
                {result ? (
                  <span className="font-bold text-emerald-600 shrink-0">
                    {result.winnerId === 'draw'
                      ? '½-½'
                      : result.winnerId === p.white.id
                      ? '1-0'
                      : '0-1'}
                  </span>
                ) : (
                  <span className="text-gray-300 shrink-0">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">Таблица</div>
        <div className="space-y-0.5">
          {standings.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                s.id === currentUserId ? 'bg-amber-50 font-bold' : 'hover:bg-slate-50'
              }`}
            >
              <span className="w-4 text-gray-400 text-center">{i + 1}</span>
              <span className="flex-1 truncate text-gray-800">{s.name}</span>
              <span className="font-mono font-bold text-gray-900">{s.points}</span>
            </div>
          ))}
        </div>
      </div>

      {isTeacher && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          {isLastRound && roundComplete ? (
            <div className="text-center text-xs font-bold text-emerald-600 py-2">
              🎉 Турнир завершён!
            </div>
          ) : roundComplete ? (
            <button
              onClick={onNextRound}
              className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-xs cursor-pointer"
            >
              ▶ Следующий тур ({tournament.round + 1} из {tournament.totalRounds})
            </button>
          ) : (
            <div className="text-center text-[10px] text-gray-400 py-1">
              Ожидаем завершения партий тура…
            </div>
          )}
        </div>
      )}
    </div>
  );
}