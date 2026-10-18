import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard, BORDER_TYPE, COLOR } from 'cm-chessboard';
import { MARKER_TYPE, Markers } from 'cm-chessboard/src/extensions/markers/Markers.js';
import 'cm-chessboard/assets/chessboard.css';
import 'cm-chessboard/assets/extensions/markers/markers.css';
import { supabase } from './supabaseClient';

/* ============================================================
   Проверка решений (чистые функции)
   ============================================================ */

// "e2e4" / "e7e8q" -> { from, to, promotion }
const uciToMove = (uci) => ({
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  promotion: uci.length > 4 ? uci[4] : undefined,
});

// Есть ли у стороны, чей сейчас ход, мат в один ход
const hasMateInOne = (game) => {
  for (const m of game.moves({ verbose: true })) {
    game.move(m);
    const mate = game.isCheckmate();
    game.undo();
    if (mate) return true;
  }
  return false;
};

// Верен ли только что сделанный ход (game — позиция ПОСЛЕ хода ученика).
// remaining — сколько ходов ученика осталось сделать, включая этот (1 = нужен мат сейчас),
// isStored — это ход из основной линии задачи (из базы).
//  - мат поставлен сразу            -> верно всегда
//  - остался 1 ход                  -> иначе неверно
//  - осталось 2 хода                -> верно любое решение: при ЛЮБОМ ответе соперника есть мат в 1
//  - осталось 3 и больше            -> верно только ход из основной линии (быстро и без перебора)
const judgeMove = (game, remaining, isStored) => {
  if (game.isCheckmate()) return true;
  if (remaining <= 1) return false;
  if (game.isGameOver()) return false;
  if (remaining === 2) {
    const replies = game.moves({ verbose: true });
    if (replies.length === 0) return false;
    for (const reply of replies) {
      game.move(reply);
      const ok = hasMateInOne(game);
      game.undo();
      if (!ok) return false;
    }
    return true;
  }
  return isStored;
};

// Подходящий ход для подсказки
const findHintMove = (game, remaining, storedUci) => {
  for (const m of game.moves({ verbose: true })) {
    const uci = `${m.from}${m.to}${m.promotion || ''}`;
    game.move(m);
    const ok = judgeMove(game, remaining, uci === storedUci);
    game.undo();
    if (ok) return m;
  }
  return null;
};

const KIND_TITLE = { mate1: 'мат в 1 ход', mate2: 'мат в 2 хода', mate3: 'мат в 3 хода' };

/* ============================================================
   Страница решения задач домашнего задания
   props: homework — строка из таблицы homework, userId — id ученика
   ============================================================ */
export const PuzzleSolver = ({ homework, userId, onBack }) => {
  const boardRef = useRef(null);
  const chessboardRef = useRef(null);
  const gameRef = useRef(null);
  const puzzleRef = useRef(null);
  const stageRef = useRef(0); // 0 — ждём первый ход ученика, 1 — ждём финальный (мат в 2)
  const mistakesRef = useRef(0);
  const hintsRef = useRef(0);
  const busyRef = useRef(true);
  const solvedRef = useRef(false);
  const startRef = useRef(Date.now());
  const timersRef = useRef([]);
  const loadTokenRef = useRef(0);
  const resultsRef = useRef({});
  const studentMoveRef = useRef(() => false);

  const [puzzles, setPuzzles] = useState([]);
  const [results, setResults] = useState({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState({ type: 'info', text: '' });
  const [solved, setSolved] = useState(false);

  const clearTimers = () => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  };

  const later = (fn, ms) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
  };

  // Сохранение результата в БД (и локально)
  const saveResult = async (patch = {}) => {
    const p = puzzleRef.current;
    if (!p) return;
    const row = {
      homework_id: homework.id,
      student_id: userId,
      puzzle_id: p.id,
      solved: false,
      mistakes: mistakesRef.current,
      hints: hintsRef.current,
      time_ms: null,
      updated_at: new Date().toISOString(),
      ...patch,
    };
    const next = { ...resultsRef.current, [p.id]: row };
    resultsRef.current = next;
    setResults(next);
    try {
      const { error } = await supabase
        .from('homework_results')
        .upsert(row, { onConflict: 'homework_id,student_id,puzzle_id' });
      if (error) console.warn('Результат не сохранён:', error.message);
    } catch (e) {
      console.warn('Результат не сохранён:', e);
    }
  };

  // ---------- Загрузка задачи на доску ----------
  const loadPuzzle = async (p) => {
    const board = chessboardRef.current;
    if (!board || !p) return;
    clearTimers();
    const token = ++loadTokenRef.current;

    const alreadySolved = !!resultsRef.current[p.id]?.solved;
    puzzleRef.current = p;
    stageRef.current = 0;
    mistakesRef.current = resultsRef.current[p.id]?.mistakes || 0;
    hintsRef.current = resultsRef.current[p.id]?.hints || 0;
    solvedRef.current = alreadySolved;
    busyRef.current = true;
    setSolved(alreadySolved);
    setMessage({ type: 'info', text: 'Загружаем задачу…' });

    let game;
    try {
      game = new Chess(p.fen);
    } catch (e) {
      console.error('Некорректная позиция задачи', p.id, e);
      setMessage({ type: 'err', text: 'Эта задача повреждена. Перейдите к следующей.' });
      return;
    }
    gameRef.current = game;

    const uci = p.moves.split(' ');
    const studentColor = game.turn() === 'w' ? 'b' : 'w'; // первый ход делает соперник
    try {
      board.removeLegalMovesMarkers();
      board.removeMarkers();
    } catch {
      // нет маркеров
    }
    board.setPosition(p.fen, false);
    await board.setOrientation(studentColor === 'w' ? COLOR.white : COLOR.black);
    if (token !== loadTokenRef.current) return;

    later(() => {
      if (token !== loadTokenRef.current) return;
      try {
        game.move(uciToMove(uci[0]));
        board.setPosition(game.fen(), true);
      } catch (e) {
        console.error('Не удалось сыграть первый ход задачи', p.id, e);
      }
      startRef.current = Date.now();
      if (alreadySolved) {
        busyRef.current = true;
        setMessage({ type: 'ok', text: 'Эта задача уже решена ✓' });
      } else {
        busyRef.current = false;
        setMessage({
          type: 'info',
          text: `Ход ${studentColor === 'w' ? 'белых' : 'чёрных'}: ${KIND_TITLE[p.kind] || 'мат'}`,
        });
      }
    }, 600);
  };

  // ---------- Ход ученика ----------
  const handleStudentMove = (from, to) => {
    const game = gameRef.current;
    const board = chessboardRef.current;
    const p = puzzleRef.current;
    if (!game || !board || !p || busyRef.current || solvedRef.current) return false;

    const uci = p.moves.split(' ');
    const totalMoves = Math.max(1, Math.floor(uci.length / 2)); // сколько ходов должен сделать ученик
    const stage = stageRef.current;
    const remaining = totalMoves - stage;
    const storedUci = uci[1 + 2 * stage]; // ход ученика из основной линии

    const piece = game.get(from);
    const isPromotion = piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
    // Превращение выбирается автоматически: берём то, которое ведёт к верному решению
    const promos = isPromotion ? ['q', 'n', 'r', 'b'] : [undefined];

    let played = null;
    let playedUci = '';
    let wasLegal = false;
    for (const promotion of promos) {
      let move = null;
      try {
        move = game.move({ from, to, promotion });
      } catch {
        move = null;
      }
      if (!move) continue;
      wasLegal = true;
      const moveUci = `${move.from}${move.to}${move.promotion || ''}`;
      if (judgeMove(game, remaining, moveUci === storedUci)) {
        played = move;
        playedUci = moveUci;
        break;
      }
      game.undo();
    }

    if (!wasLegal) {
      board.setPosition(game.fen(), false);
      return false;
    }

    if (!played) {
      // Ход разрешён правилами, но не решает задачу
      mistakesRef.current += 1;
      board.setPosition(game.fen(), true);
      let text;
      if (remaining === 1) {
        text = totalMoves === 1 ? 'Это не мат. Попробуй ещё!' : 'Здесь есть мат в 1 ход — найди его!';
      } else if (remaining === 2) {
        text = 'Не подходит: соперник сможет избежать мата. Попробуй другой ход!';
      } else {
        text = 'Это не тот ход. Подумай над шахами и угрозами и попробуй ещё!';
      }
      setMessage({ type: 'err', text });
      saveResult();
      return false;
    }

    board.setPosition(game.fen(), true);

    if (game.isCheckmate()) {
      solvedRef.current = true;
      busyRef.current = true;
      setSolved(true);
      setMessage({ type: 'ok', text: 'Мат! Задача решена ✓' });
      saveResult({ solved: true, time_ms: Date.now() - startRef.current });
      return true;
    }

    // Ход верный, но это ещё не мат: соперник отвечает, затем следующий ход ученика
    busyRef.current = true;
    setMessage({ type: 'ok', text: 'Верно! Соперник отвечает…' });
    const replyUci = uci[2 + 2 * stage];
    later(() => {
      if (gameRef.current !== game) return; // уже перешли на другую задачу
      let reply = null;
      if (playedUci === storedUci && replyUci) {
        try {
          reply = game.move(uciToMove(replyUci));
        } catch {
          reply = null;
        }
      }
      if (!reply) {
        const options = game.moves({ verbose: true });
        if (options.length) reply = game.move(options[0]);
      }
      chessboardRef.current?.setPosition(game.fen(), true);
      stageRef.current = stage + 1;
      busyRef.current = false;
      const left = remaining - 1;
      setMessage({
        type: 'info',
        text: left === 1 ? 'Теперь поставь мат в 1 ход' : `Верно, продолжай: до мата ещё ${left} хода`,
      });
    }, 500);
    return true;
  };
  studentMoveRef.current = handleStudentMove;

  const showHint = () => {
    const game = gameRef.current;
    const board = chessboardRef.current;
    const p = puzzleRef.current;
    if (!game || !board || !p || busyRef.current || solvedRef.current) return;
    const uci = p.moves.split(' ');
    const totalMoves = Math.max(1, Math.floor(uci.length / 2));
    const stage = stageRef.current;
    const move = findHintMove(game, totalMoves - stage, uci[1 + 2 * stage]);
    if (!move) return;
    hintsRef.current += 1;
    board.removeMarkers();
    board.addMarker(MARKER_TYPE.circle, move.from);
    setMessage({ type: 'info', text: '💡 Подсказка: сходи фигурой, выделенной на доске.' });
    saveResult();
  };

  const goNext = () => {
    const next = puzzles.findIndex((p, i) => i > index && !results[p.id]?.solved);
    const first = puzzles.findIndex((p) => !results[p.id]?.solved);
    if (next !== -1) setIndex(next);
    else if (first !== -1) setIndex(first);
  };

  // ---------- Создание доски ----------
  useEffect(() => {
    if (!boardRef.current) return undefined;
    const board = new Chessboard(boardRef.current, {
      position: new Chess().fen(),
      assetsUrl: '/assets/',
      style: { borderType: BORDER_TYPE.thin, animationDuration: 150 },
      extensions: [{ class: Markers, props: { autoMarkers: null } }],
    });
    chessboardRef.current = board;

    board.enableMoveInput((event) => {
      const game = gameRef.current;
      switch (event.type) {
        case 'moveInputStarted': {
          if (!game || busyRef.current || solvedRef.current) return false;
          const piece = game.get(event.squareFrom);
          if (!piece || piece.color !== game.turn()) return false;
          let legal = [];
          try {
            legal = game.moves({ square: event.squareFrom, verbose: true });
          } catch {
            return false;
          }
          event.chessboard.removeLegalMovesMarkers();
          event.chessboard.removeMarkers(MARKER_TYPE.circle);
          if (legal.length === 0) return false;
          event.chessboard.addLegalMovesMarkers(legal);
          return true;
        }
        case 'moveInputCanceled':
          event.chessboard.removeLegalMovesMarkers();
          return false;
        case 'moveInputFinished':
          event.chessboard.removeLegalMovesMarkers();
          if (event.squareFrom && event.squareTo) {
            return studentMoveRef.current(event.squareFrom, event.squareTo);
          }
          return false;
        default:
          return true;
      }
    });

    return () => {
      clearTimers();
      loadTokenRef.current += 1;
      try {
        board.destroy();
      } catch {
        // уже уничтожена
      }
      chessboardRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Загрузка задач и прошлых результатов ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = homework.puzzle_ids || [];
        const [puzzleRes, resultRes] = await Promise.all([
          supabase.from('puzzles').select('id, fen, moves, kind, rating').in('id', ids),
          supabase
            .from('homework_results')
            .select('*')
            .eq('homework_id', homework.id)
            .eq('student_id', userId),
        ]);
        if (puzzleRes.error) throw puzzleRes.error;
        if (resultRes.error) throw resultRes.error;

        const byId = Object.fromEntries((puzzleRes.data || []).map((p) => [p.id, p]));
        const ordered = ids.map((id) => byId[id]).filter(Boolean);
        const map = {};
        (resultRes.data || []).forEach((r) => {
          map[r.puzzle_id] = r;
        });
        if (cancelled) return;

        resultsRef.current = map;
        setResults(map);
        setPuzzles(ordered);
        if (ordered.length === 0) setLoadError('В этом задании не нашлось задач.');
        const firstUnsolved = ordered.findIndex((p) => !map[p.id]?.solved);
        setIndex(firstUnsolved === -1 ? 0 : firstUnsolved);
      } catch (e) {
        console.error('Ошибка загрузки задания:', e);
        if (!cancelled) setLoadError('Не удалось загрузить задание. Проверьте соединение.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homework.id, userId]);

  // ---------- Показ текущей задачи ----------
  useEffect(() => {
    if (!puzzles.length || !chessboardRef.current) return;
    loadPuzzle(puzzles[index]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzles, index]);

  const solvedCount = puzzles.filter((p) => results[p.id]?.solved).length;
  const allDone = puzzles.length > 0 && solvedCount === puzzles.length;
  const current = puzzles[index];

  const messageCls =
    message.type === 'ok'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
      : message.type === 'err'
      ? 'bg-red-50 border-red-200 text-red-700'
      : 'bg-blue-50 border-blue-100 text-blue-800';

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
        <button
          onClick={onBack}
          className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-bold cursor-pointer"
        >
          ← К расписанию
        </button>
        <div className="text-sm font-bold text-gray-900 truncate">{homework.title}</div>
        <div className="text-xs font-semibold text-gray-500">
          Решено: {solvedCount} из {puzzles.length}
        </div>
      </div>

      <div className="grid md:grid-cols-[minmax(0,560px)_1fr] gap-4 items-start">
        <div className="w-full max-w-[560px] mx-auto">
          <div
            className="relative w-full rounded-xl border border-gray-200 overflow-hidden shadow-inner"
            style={{ paddingBottom: '100%' }}
          >
            <div ref={boardRef} className="absolute inset-0 select-none" />
          </div>
        </div>

        <div className="space-y-3">
          {loading && (
            <div className="bg-white p-4 rounded-2xl border border-gray-200 text-sm text-gray-500">
              Загрузка задач…
            </div>
          )}

          {loadError && (
            <div className="bg-red-50 p-4 rounded-2xl border border-red-200 text-sm text-red-700">
              {loadError}
            </div>
          )}

          {current && (
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-black text-gray-900">
                  Задача {index + 1} из {puzzles.length}
                </div>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {KIND_TITLE[current.kind] || 'мат'}
                </span>
              </div>

              <div className={`px-3 py-2.5 rounded-xl border text-sm font-semibold ${messageCls}`}>
                {message.text || '…'}
              </div>

              <div className="flex gap-2 flex-wrap">
                {!solved && (
                  <button
                    onClick={showHint}
                    className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 text-xs font-bold cursor-pointer"
                  >
                    💡 Подсказка
                  </button>
                )}
                {solved && !allDone && (
                  <button
                    onClick={goNext}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold cursor-pointer"
                  >
                    Следующая →
                  </button>
                )}
              </div>
            </div>
          )}

          {allDone && (
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 text-center">
              <div className="text-3xl mb-1">🎉</div>
              <div className="text-sm font-black text-amber-900">Все задачи решены!</div>
              <div className="text-xs text-amber-700 mt-0.5">Тренер увидит твой результат.</div>
            </div>
          )}

          {puzzles.length > 0 && (
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                Задачи
              </div>
              <div className="flex flex-wrap gap-1.5">
                {puzzles.map((p, i) => {
                  const done = !!results[p.id]?.solved;
                  const active = i === index;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setIndex(i)}
                      className={`w-9 h-9 rounded-lg text-xs font-bold cursor-pointer border transition ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : done
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {done && !active ? '✓' : i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
