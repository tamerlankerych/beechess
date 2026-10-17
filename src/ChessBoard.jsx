import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Chessboard, BORDER_TYPE, COLOR } from 'cm-chessboard';
import { MARKER_TYPE, Markers } from 'cm-chessboard/src/extensions/markers/Markers.js';
import { Arrows, ARROW_TYPE } from 'cm-chessboard/src/extensions/arrows/Arrows.js';
import 'cm-chessboard/assets/chessboard.css';
import 'cm-chessboard/assets/extensions/markers/markers.css';
import { supabase } from './supabaseClient';
import { VideoRoom } from './VideoRoom.jsx';
import { MaterialsLibrary } from './MaterialsLibrary.jsx';
import { ChessPieceIcon } from './ChessPieceIcon.jsx';

const generateId = () => Math.random().toString(36).substr(2, 9);

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const INITIAL_TREE = {
  root: {
    id: 'root',
    fen: INITIAL_FEN,
    san: '',
    parentId: null,
    children: [],
    color: 'w',
  },
};

const PIECES_PALETTE = [
  { piece: 'wK', name: 'Белый король', fenChar: 'K' },
  { piece: 'wQ', name: 'Белый ферзь', fenChar: 'Q' },
  { piece: 'wR', name: 'Белая ладья', fenChar: 'R' },
  { piece: 'wB', name: 'Белый слон', fenChar: 'B' },
  { piece: 'wN', name: 'Белый конь', fenChar: 'N' },
  { piece: 'wP', name: 'Белая пешка', fenChar: 'P' },
  { piece: 'bK', name: 'Чёрный король', fenChar: 'k' },
  { piece: 'bQ', name: 'Чёрный ферзь', fenChar: 'q' },
  { piece: 'bR', name: 'Чёрная ладья', fenChar: 'r' },
  { piece: 'bB', name: 'Чёрный слон', fenChar: 'b' },
  { piece: 'bN', name: 'Чёрный конь', fenChar: 'n' },
  { piece: 'bP', name: 'Чёрная пешка', fenChar: 'p' },
];

let sharedAudioCtx = null;
const getAudioCtx = () => {
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return sharedAudioCtx;
};

const playSound = (type) => {
  try {
    const audioCtx = getAudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'capture') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.1);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'tick' || type === 'go' || type === 'lowtime') {
      // 'tick' — секунда отсчёта, 'go' — старт тура, 'lowtime' — двойной сигнал «мало времени»
      const freq = type === 'go' ? 1320 : type === 'lowtime' ? 988 : 660;
      const dur = type === 'go' ? 0.5 : 0.12;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.start(now);
      osc.stop(now + dur);
      if (type === 'lowtime') {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq, now + 0.2);
        gain2.gain.setValueAtTime(0.3, now + 0.2);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc2.start(now + 0.2);
        osc2.stop(now + 0.32);
      }
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(550, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.05);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch {
    // Звук
  }
};

const formatSanWithIcons = (san) => {
  if (!san) return '';
  return san
    .replace(/^N/, '♘')
    .replace(/^B/, '♗')
    .replace(/^R/, '♖')
    .replace(/^Q/, '♕')
    .replace(/^K/, '♔');
};

const updateFenBoard = (currentFen, updaterFn) => {
  const parts = (currentFen || INITIAL_FEN).split(' ');
  const boardPart = parts[0];
  const rows = boardPart.split('/');
  const board = [];
  for (let r = 0; r < 8; r++) {
    const row = rows[r] || '8';
    const expandedRow = [];
    for (let char of row) {
      if (!isNaN(char)) {
        for (let i = 0; i < parseInt(char); i++) expandedRow.push(null);
      } else {
        expandedRow.push(char);
      }
    }
    while (expandedRow.length < 8) expandedRow.push(null);
    board.push(expandedRow);
  }

  updaterFn(board);

  const newRows = board.map((row) => {
    let emptyCount = 0;
    let res = '';
    for (let cell of row) {
      if (cell === null) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          res += emptyCount;
          emptyCount = 0;
        }
        res += cell;
      }
    }
    if (emptyCount > 0) res += emptyCount;
    return res;
  });
  parts[0] = newRows.join('/');
  return parts.join(' ');
};

const buildFullFen = (boardFen, turn, castling) => {
  const parts = boardFen.split(' ');
  const boardPart = parts[0];
  const activeColor = turn || 'w';
  const castlingPart = castling && castling.trim() !== '' ? castling : '-';
  return `${boardPart} ${activeColor} ${castlingPart} - 0 1`;
};

const expandFenRows = (fen) =>
  fen
    .split(' ')[0]
    .split('/')
    .map((row) => {
      const cells = [];
      for (const ch of row) {
        if (/\d/.test(ch)) for (let i = 0; i < parseInt(ch, 10); i++) cells.push(null);
        else cells.push(ch);
      }
      while (cells.length < 8) cells.push(null);
      return cells;
    });

// chess.js (при skipValidation) верит праву рокировки на слово: если в FEN стоит KQkq,
// а король не на e1/e8 (например, в углу), генерация ходов ломается и фигуры «не ходят».
// Оставляем только те права, которые реально возможны на этой доске.
const sanitizeCastlingInFen = (fen) => {
  const parts = fen.split(' ');
  const rows = expandFenRows(fen);
  const at = (file, rank) => rows[8 - rank]?.[file] ?? null;
  const rights = parts[2] && parts[2] !== '-' ? parts[2] : '';
  const keep = [];
  if (at(4, 1) === 'K') {
    if (rights.includes('K') && at(7, 1) === 'R') keep.push('K');
    if (rights.includes('Q') && at(0, 1) === 'R') keep.push('Q');
  }
  if (at(4, 8) === 'k') {
    if (rights.includes('k') && at(7, 8) === 'r') keep.push('k');
    if (rights.includes('q') && at(0, 8) === 'r') keep.push('q');
  }
  parts[2] = keep.length ? keep.join('') : '-';
  return parts.join(' ');
};

// Возвращает текст проблемы или null, если позицию можно играть
const validateEditorPosition = (fen) => {
  const rows = expandFenRows(fen);
  const flat = rows.flat();
  if (flat.filter((c) => c === 'K').length !== 1) return 'На доске должен быть ровно один белый король.';
  if (flat.filter((c) => c === 'k').length !== 1) return 'На доске должен быть ровно один чёрный король.';
  if (rows[0].some((c) => c === 'P' || c === 'p') || rows[7].some((c) => c === 'P' || c === 'p')) {
    return 'Пешки не могут стоять на первой и восьмой горизонталях.';
  }
  try {
    // Если король стороны, которая НЕ ходит, под шахом — позиция невозможна
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w';
    parts[2] = '-';
    const probe = new Chess();
    probe.load(parts.join(' '), { skipValidation: true });
    if (probe.isCheck()) return 'Король стороны, которая не ходит, стоит под шахом — такая позиция невозможна.';
  } catch {
    // не удалось проверить — не блокируем сохранение
  }
  return null;
};

// В редакторе: null = режим перемещения (клик ничего не меняет), EDITOR_ERASER = ластик
const EDITOR_ERASER = '__eraser__';

const LOW_TIME_MS = 10000;
const COUNTDOWN_SECONDS = 5;

// Рисует время и краснеет при малом остатке
const setClockText = (el, ms) => {
  if (!el) return;
  el.textContent = formatTime(ms);
  el.style.color = ms <= LOW_TIME_MS ? '#ef4444' : '';
};

const formatTime = (ms) => {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0 && ms < 20000) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${sec}.${tenths}`;
  }
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

/* ============================================================
   Круговой турнир: константы и чистые функции
   ============================================================ */
const ROUND_PAUSE_MS = 4000;

const TIME_CONTROLS = [
  { min: 3, inc: 2 },
  { min: 5, inc: 3 },
  { min: 10, inc: 5 },
];

const RESULT_REASON_LABELS = {
  checkmate: 'мат',
  stalemate: 'пат',
  insufficient: 'недостаточно материала',
  repetition: 'троекратное повторение',
  fifty: 'правило 50 ходов',
  draw: 'ничья',
  timeout: 'просрочка времени',
  resign: 'сдача',
};

const formatPoints = (pts) => {
  const v = Number(pts) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
};

const formatGameResult = (res) => {
  if (!res) return '';
  const score = res.result === '1-0' ? '1–0' : res.result === '0-1' ? '0–1' : '½–½';
  const reason = RESULT_REASON_LABELS[res.reason];
  return reason ? `${score} · ${reason}` : score;
};

const describeMyResult = (res, myColor) => {
  if (!res || res.result === '1/2-1/2') return 'Ничья';
  const whiteWon = res.result === '1-0';
  return (whiteWon && myColor === 'w') || (!whiteWon && myColor === 'b') ? 'Победа' : 'Поражение';
};

/**
 * Полная сетка круговой системы (метод «круга») на все туры вперёд.
 * Цвета: игрок на первой доске чередует цвет каждый тур, на остальных досках
 * цвет определяется чётностью номера доски. Для чётного N это даёт разницу
 * белых/чёрных не больше 1 и не более одного «слома» чередования на игрока.
 * При нечётном N в каждом туре один игрок пропускает тур (bye).
 */
const generateRoundRobinSchedule = (participants) => {
  const list = participants.map((p) => ({ id: p.id, name: p.name }));
  if (list.length % 2 !== 0) list.push(null);
  const n = list.length;
  let arr = [...list];
  const rounds = [];

  for (let r = 0; r < n - 1; r++) {
    const pairings = [];
    let bye = null;
    let table = 1;
    for (let i = 0; i < n / 2; i++) {
      const x = arr[i];
      const y = arr[n - 1 - i];
      if (!x || !y) {
        bye = x || y;
        continue;
      }
      const xWhite = i === 0 ? r % 2 === 0 : i % 2 === 0;
      pairings.push({
        table: table++,
        white: xWhite ? x : y,
        black: xWhite ? y : x,
      });
    }
    rounds.push({ round: r + 1, pairings, bye });
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return rounds;
};

const computeStandings = (tournament) => {
  if (!tournament) return [];
  const rows = {};
  const games = [];
  tournament.participants.forEach((p) => {
    rows[p.id] = { id: p.id, name: p.name, points: 0, sb: 0, wins: 0, draws: 0, losses: 0, played: 0 };
  });
  tournament.schedule.forEach((roundInfo) => {
    roundInfo.pairings.forEach((pair) => {
      const res = tournament.results?.[`${roundInfo.round}:${pair.table}`];
      if (!res) return;
      const w = rows[pair.white.id];
      const b = rows[pair.black.id];
      if (!w || !b) return;
      games.push({ w, b, result: res.result });
      w.played += 1;
      b.played += 1;
      if (res.result === '1-0') {
        w.points += 1;
        w.wins += 1;
        b.losses += 1;
      } else if (res.result === '0-1') {
        b.points += 1;
        b.wins += 1;
        w.losses += 1;
      } else {
        w.points += 0.5;
        b.points += 0.5;
        w.draws += 1;
        b.draws += 1;
      }
    });
  });
  // Зоннеборн-Бергер: очки побеждённых соперников + половина очков тех, с кем ничья
  games.forEach(({ w, b, result }) => {
    if (result === '1-0') w.sb += b.points;
    else if (result === '0-1') b.sb += w.points;
    else {
      w.sb += b.points / 2;
      b.sb += w.points / 2;
    }
  });
  return Object.values(rows).sort(
    (a, b) =>
      b.points - a.points ||
      b.sb - a.sb ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name, 'ru')
  );
};

/** Воспроизводит партию по списку SAN-ходов и строит линейное дерево ходов. */
const replayMoves = (moves = []) => {
  const game = new Chess();
  const tree = {
    root: { id: 'root', fen: game.fen(), san: '', parentId: null, children: [], color: 'w' },
  };
  let parentId = 'root';
  for (const san of moves) {
    let move = null;
    try {
      move = game.move(san);
    } catch {
      move = null;
    }
    if (!move) break;
    const id = `m${Object.keys(tree).length}`;
    tree[id] = { id, fen: game.fen(), san: move.san, color: move.color, parentId, children: [] };
    tree[parentId] = { ...tree[parentId], children: [id] };
    parentId = id;
  }
  return { game, tree, currentId: parentId };
};

/** Может ли сторона теоретически поставить мат (для правила просрочки времени). */
const hasMatingMaterial = (game, color) => {
  const pieces = game
    .board()
    .flat()
    .filter((sq) => sq && sq.color === color && sq.type !== 'k');
  if (pieces.length === 0) return false;
  if (pieces.some((p) => p.type === 'p' || p.type === 'r' || p.type === 'q')) return true;
  return pieces.length >= 2;
};

const detectGameOver = (game) => {
  if (game.isCheckmate()) {
    return { result: game.turn() === 'w' ? '0-1' : '1-0', reason: 'checkmate' };
  }
  if (game.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate' };
  if (game.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient' };
  if (game.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'repetition' };
  if (game.isDraw()) return { result: '1/2-1/2', reason: 'fifty' };
  return null;
};

/* ============================================================
   Панель кругового турнира (только отображение; логика — в комнате)
   ============================================================ */
const TournamentPanel = ({
  isTeacher,
  isObserver,
  tournament,
  standings,
  settings,
  onSettingsChange,
  participantCount,
  lobbyPlayers,
  lobbyJoined,
  onToggleJoin,
  currentUserId,
  gameCtx,
  onStart,
  onAbort,
  onNewTournament,
  onResign,
  onWatchTable,
  onPause,
  onResume,
  countdownActive,
}) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!tournament?.nextRoundAt) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [tournament?.nextRoundAt]);

  const status = tournament?.status || 'idle';
  const isRunning = status === 'running';
  const isFinished = status === 'finished';
  const roundInfo = isRunning ? tournament.schedule[tournament.round - 1] : null;
  const secondsLeft =
    isRunning && tournament.nextRoundAt
      ? Math.max(0, Math.ceil((Date.parse(tournament.nextRoundAt) - now) / 1000))
      : null;
  const isPlayer = !!gameCtx?.myColor;
  const playing = isPlayer && !gameCtx.finished && isRunning && !tournament.paused;
  const timeLabel = tournament
    ? `${tournament.settings.timeControl.min}+${tournament.settings.timeControl.inc}`
    : '';
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm font-sans select-none">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
          <span>🏆</span> Круговой турнир
        </h3>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
            isRunning
              ? 'bg-emerald-100 text-emerald-800'
              : isFinished
              ? 'bg-amber-100 text-amber-800'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {isRunning
            ? `Тур ${tournament.round} из ${tournament.totalRounds}`
            : isFinished
            ? 'Завершён'
            : 'Ожидание'}
        </span>
      </div>

      {!tournament && isTeacher && !isObserver && (
        <div className="mb-3 p-3 bg-blue-50/80 border border-blue-100 rounded-xl space-y-2.5">
          <div className="text-xs font-bold text-blue-900">Настройки турнира:</div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-700 font-medium">Участвовать тренеру:</span>
            <input
              type="checkbox"
              checked={settings.includeTeacher}
              onChange={(e) => onSettingsChange({ ...settings, includeTeacher: e.target.checked })}
              className="w-4 h-4 accent-blue-600 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-700 font-medium">Контроль времени:</span>
            <select
              value={`${settings.timeControl.min}+${settings.timeControl.inc}`}
              onChange={(e) => {
                const [min, inc] = e.target.value.split('+').map(Number);
                onSettingsChange({ ...settings, timeControl: { min, inc } });
              }}
              className="border border-blue-200 bg-white rounded px-2 py-1 text-xs font-bold cursor-pointer"
            >
              {TIME_CONTROLS.map((tc) => (
                <option key={`${tc.min}+${tc.inc}`} value={`${tc.min}+${tc.inc}`}>
                  {tc.min} мин + {tc.inc} сек
                </option>
              ))}
            </select>
          </div>

          {lobbyPlayers.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {lobbyPlayers.map((p) => (
                <span
                  key={p.id}
                  className="text-[11px] font-semibold bg-white border border-blue-200 text-blue-900 rounded-full px-2 py-0.5"
                >
                  ✋ {p.name}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-blue-700 bg-white/70 rounded-lg px-2 py-1.5">
              Пока никто не записался. Ученики сами нажимают «Участвовать» в этой панели.
            </div>
          )}

          <div className="text-[11px] text-blue-800">
            Игроков: <strong>{participantCount}</strong>
            {participantCount >= 2 && participantCount % 2 === 1 && (
              <span className="text-amber-700">
                {' '}
                · нечётное число: в каждом туре один игрок отдыхает
              </span>
            )}
            {participantCount < 2 && <span className="text-red-600"> · нужно минимум 2</span>}
          </div>

          <button
            onClick={onStart}
            disabled={participantCount < 2}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
          >
            🚀 Запустить турнир
          </button>
          <div className="text-[10px] text-blue-700 leading-snug">
            Нажмите один раз — туры, цвета, часы и переходы между турами пойдут автоматически.
          </div>
        </div>
      )}

      {!tournament && !isTeacher && (
        <div className="mb-1 p-3 bg-blue-50/80 border border-blue-100 rounded-xl space-y-2">
          {isObserver ? (
            <div className="text-xs text-gray-500 text-center">
              Турнир ещё не запущен. Вы наблюдатель.
            </div>
          ) : (
            <>
              <button
                onClick={onToggleJoin}
                className={`w-full py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  lobbyJoined
                    ? 'bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                }`}
              >
                {lobbyJoined ? '✓ Вы записаны (нажмите, чтобы выйти)' : '✋ Участвовать в турнире'}
              </button>
              <div className="text-[11px] text-blue-800 text-center">
                Записались: <strong>{lobbyPlayers.length}</strong>
                {lobbyPlayers.length > 0 && ` — ${lobbyPlayers.map((p) => p.name).join(', ')}`}
              </div>
              <div className="text-[10px] text-gray-500 text-center">
                Тренер запустит турнир, дальше всё пойдёт автоматически.
              </div>
            </>
          )}
        </div>
      )}

      {isRunning && tournament.paused && (
        <div className="mb-3 p-2 bg-amber-100 border border-amber-300 rounded-xl text-center text-xs font-bold text-amber-900">
          ⏸ Турнир на паузе — часы остановлены
        </div>
      )}

      {isRunning && isTeacher && !isObserver && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {tournament.paused ? (
            <button
              onClick={onResume}
              className="py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
            >
              ▶ Продолжить
            </button>
          ) : (
            <button
              onClick={onPause}
              disabled={countdownActive || !!tournament.nextRoundAt}
              title="Пауза доступна, пока идут партии"
              className="py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-xs font-bold transition cursor-pointer"
            >
              ⏸ Пауза
            </button>
          )}
          <button
            onClick={onAbort}
            className="py-1.5 bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Завершить
          </button>
        </div>
      )}

      {isRunning && (
        <div className="mb-3 p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
            <span>Тур {tournament.round}</span>
            <span className="font-semibold text-amber-700">Контроль {timeLabel}</span>
          </div>

          {roundInfo.pairings.map((pair) => {
            const res = tournament.results?.[`${tournament.round}:${pair.table}`];
            const isMine = pair.white.id === currentUserId || pair.black.id === currentUserId;
            const watched = !isPlayer && gameCtx?.table === pair.table;
            const clickable = !isPlayer && !isMine;
            return (
              <div
                key={pair.table}
                onClick={clickable ? () => onWatchTable(pair.table) : undefined}
                title={clickable ? 'Смотреть эту партию' : undefined}
                className={`text-xs rounded-lg border px-2 py-1.5 transition ${
                  isMine
                    ? 'bg-emerald-50 border-emerald-300'
                    : watched
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-white border-amber-100'
                } ${clickable ? 'cursor-pointer hover:border-blue-300' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 font-semibold">
                    Стол {pair.table}
                    {isMine && ' · ваша партия'}
                    {watched && ' · вы смотрите'}
                  </span>
                  <span
                    className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                      res ? 'bg-slate-800 text-white' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {res ? formatGameResult(res) : '● идёт'}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <span className="font-bold text-gray-800 truncate max-w-[45%]" title={pair.white.name}>
                    ⬜ {pair.white.name}
                  </span>
                  <span className="text-gray-400">vs</span>
                  <span className="font-bold text-gray-800 truncate max-w-[45%]" title={pair.black.name}>
                    ⬛ {pair.black.name}
                  </span>
                </div>
              </div>
            );
          })}

          {roundInfo.bye && (
            <div className="text-[11px] text-gray-600 px-1">
              😴 Пропускает тур: <strong>{roundInfo.bye.name}</strong>
            </div>
          )}

          {secondsLeft !== null && (
            <div className="text-[11px] font-bold text-emerald-700 text-center pt-1">
              Все партии тура завершены. Следующий тур через {secondsLeft} с…
            </div>
          )}
        </div>
      )}

      {playing && (
        <button
          onClick={() => {
            if (window.confirm('Сдать партию?')) onResign();
          }}
          className="w-full mb-3 py-1.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition cursor-pointer"
        >
          🏳 Сдаться
        </button>
      )}

      {isFinished && standings.length > 0 && (
        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
          <div className="text-xs font-bold text-amber-900">🏁 Турнир завершён</div>
          <div className="text-sm font-black text-amber-800 mt-0.5">
            Победитель: {standings[0].name}
          </div>
        </div>
      )}

      {isFinished && isTeacher && !isObserver && (
        <button
          onClick={onNewTournament}
          className="w-full mb-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
        >
          ➕ Новый турнир
        </button>
      )}

      {tournament && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide px-1">
            {isFinished ? 'Итоговая таблица' : 'Таблица очков'}
          </div>
          {standings.map((p, idx) => {
            const isMe = p.id === currentUserId;
            return (
              <div
                key={p.id}
                className={`flex items-center justify-between px-3 py-2 rounded-xl border transition ${
                  isMe
                    ? 'bg-amber-100/80 border-amber-300 ring-1 ring-amber-400 font-bold'
                    : 'bg-slate-50 border-slate-100 text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-gray-400 w-5">
                    {isFinished && idx < 3 ? medals[idx] : `${idx + 1}.`}
                  </span>
                  <span className="text-xs truncate" title={p.name}>
                    {p.name} {isMe && '(Вы)'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-gray-400" title="Победы / ничьи / поражения">
                    {p.wins}/{p.draws}/{p.losses}
                  </span>
                  <span
                    className="text-[10px] text-gray-400"
                    title="Коэффициент Зоннеборна-Бергера: очки побеждённых соперников + половина очков тех, с кем сыграна ничья"
                  >
                    СБ {formatPoints(p.sb)}
                  </span>
                  <span className="text-xs font-black bg-white px-2 py-0.5 rounded border border-gray-200">
                    {formatPoints(p.points)} очк.
                  </span>
                </div>
              </div>
            );
          })}
          {isFinished && (
            <div className="text-[10px] text-gray-400 px-1">
              При равенстве очков место определяет коэффициент Зоннеборна-Бергера (СБ).
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ChessBoardRoom = ({ isTeacher = true, isObserver = false, lesson }) => {
  const boardRef = useRef(null);
  const chessboardInstance = useRef(null);
  const gameRef = useRef(new Chess());
  const channelRef = useRef(null);

  const saveQueueRef = useRef(null);
  const saveTimerRef = useRef(null);

  const [canStudentMove, setCanStudentMove] = useState(false);
  const [isVideoOpen, setIsVideoOpen] = useState(true);
  const [orientation, setOrientation] = useState(COLOR.white);
  const [copied, setCopied] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);
  const [isMaterialsOpen, setIsMaterialsOpen] = useState(false);
  const [loadedMaterial, setLoadedMaterial] = useState(null);

  const [isEditorMode, setIsEditorMode] = useState(false);
  const [selectedEditorPiece, setSelectedEditorPiece] = useState(null);
  const [tempEditorFen, setTempEditorFen] = useState('');
  const [editorTurn, setEditorTurn] = useState('w');
  const [editorCastling, setEditorCastling] = useState('KQkq');

  const [tree, setTree] = useState(INITIAL_TREE);
  const [currentId, setCurrentId] = useState('root');

  const [timerW, setTimerW] = useState(600000);
  const [timerB, setTimerB] = useState(600000);
  const [activeColor, setActiveColor] = useState('w');
  const [clockStarted, setClockStarted] = useState(false);
  const [incrementMs, setIncrementMs] = useState(5000);

  // --- Турнир ---
  const [currentUser, setCurrentUser] = useState(null);
  const [tournament, setTournament] = useState(null);
  const [gameCtx, setGameCtx] = useState(null);
  const [tournamentSettings, setTournamentSettings] = useState({
    includeTeacher: false,
    timeControl: { min: 3, inc: 2 },
  });
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [lobbyJoined, setLobbyJoined] = useState(false);
  const lobbyJoinedRef = useRef(false);

  const tournamentRef = useRef(null);
  const gameCtxRef = useRef(null);
  const currentUserRef = useRef(null);
  const nextRoundTimerRef = useRef(null);
  const lastTickRef = useRef(Date.now());
  const tournamentApiRef = useRef({});
  const restoreTournamentRef = useRef(null);
  const clockExpiredRef = useRef(null);
  const [countdown, setCountdown] = useState(null);
  const countdownTimerRef = useRef(null);
  const countdownActiveRef = useRef(false);
  const lowTimeWarnedRef = useRef({ w: false, b: false });

  const timerWRef = useRef(timerW);
  const timerBRef = useRef(timerB);
  const whiteClockDomRef = useRef(null);
  const blackClockDomRef = useRef(null);

  const currentIdRef = useRef(currentId);
  const treeRef = useRef(tree);
  const activeColorRef = useRef(activeColor);
  const clockStartedRef = useRef(clockStarted);
  const incrementMsRef = useRef(incrementMs);
  const canStudentMoveRef = useRef(canStudentMove);
  const isEditorModeRef = useRef(isEditorMode);
  const orientationRef = useRef(COLOR.white);
  const lastPointerRef = useRef({ x: null, y: null });
  const editorDownRef = useRef(null);
  const tempEditorFenRef = useRef(tempEditorFen);
  const selectedEditorPieceRef = useRef(selectedEditorPiece);
  const editorTurnRef = useRef(editorTurn);
  const editorCastlingRef = useRef(editorCastling);

  const paintClocks = useCallback(() => {
    setClockText(whiteClockDomRef.current, timerWRef.current);
    setClockText(blackClockDomRef.current, timerBRef.current);
  }, []);

  const setWhiteClockEl = useCallback((el) => {
    whiteClockDomRef.current = el;
    setClockText(el, timerWRef.current);
  }, []);

  const setBlackClockEl = useCallback((el) => {
    blackClockDomRef.current = el;
    setClockText(el, timerBRef.current);
  }, []);

  const ensureCurrentUser = useCallback(async () => {
    if (currentUserRef.current) return currentUserRef.current;
    try {
      const { data } = await supabase.auth.getUser();
      const id = data?.user?.id;
      if (!id) return null;
      let name = data.user.email || 'Игрок';
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', id)
          .maybeSingle();
        if (profile) name = profile.name || profile.email || name;
      } catch {
        // имя профиля необязательно
      }
      const user = { id, name };
      currentUserRef.current = user;
      setCurrentUser(user);
      return user;
    } catch (e) {
      console.error('Не удалось получить пользователя:', e);
      return null;
    }
  }, []);

  useEffect(() => {
    ensureCurrentUser();
  }, [ensureCurrentUser]);

  // Участники = ученики, нажавшие «Участвовать» (Presence), + тренер по переключателю
  const lessonParticipants = useMemo(() => {
    const list = [...lobbyPlayers];
    if (tournamentSettings.includeTeacher && currentUser?.id) {
      list.unshift({ id: currentUser.id, name: currentUser.name });
    }
    const seen = new Set();
    return list.filter((p) => p.id && !seen.has(p.id) && seen.add(p.id));
  }, [lobbyPlayers, tournamentSettings.includeTeacher, currentUser]);

  useEffect(() => {
    currentIdRef.current = currentId;
    treeRef.current = tree;
    activeColorRef.current = activeColor;
    clockStartedRef.current = clockStarted;
    incrementMsRef.current = incrementMs;
    canStudentMoveRef.current = canStudentMove;
    isEditorModeRef.current = isEditorMode;
    orientationRef.current = orientation;
    tempEditorFenRef.current = tempEditorFen;
    selectedEditorPieceRef.current = selectedEditorPiece;
    editorTurnRef.current = editorTurn;
    editorCastlingRef.current = editorCastling;

    paintClocks();
  }, [
    currentId,
    tree,
    timerW,
    timerB,
    activeColor,
    clockStarted,
    incrementMs,
    canStudentMove,
    isEditorMode,
    tempEditorFen,
    selectedEditorPiece,
    editorTurn,
    editorCastling,
    orientation,
    paintClocks,
  ]);

  const saveStateInstant = useCallback(
    async (overrides = {}) => {
      if (!lesson?.id) return;

      const payload = {
        id: lesson.id,
        title: lesson.title || 'Урок',
        fen: overrides.fen ?? gameRef.current.fen(),
        move_tree: overrides.moveTree ?? treeRef.current,
        current_node_id: overrides.currentNodeId ?? currentIdRef.current,
        can_student_move: overrides.canStudentMove ?? canStudentMoveRef.current,
        timer_w: Math.round(timerWRef.current),
        timer_b: Math.round(timerBRef.current),
        increment_ms: incrementMsRef.current,
        active_color: overrides.activeColor ?? activeColorRef.current,
        clock_started: clockStartedRef.current,
        clock_updated_at: new Date().toISOString(),
      };

      try {
        const { error } = await supabase
          .from('lessons')
          .upsert(payload, { onConflict: 'id' });
        if (error) throw error;
      } catch (e) {
        console.error('Ошибка мгновенного сохранения:', e);
      }
    },
    [lesson?.id, lesson?.title]
  );

  const saveState = useCallback(
    async (fen, studentCanMove, sharedState = {}) => {
      if (!lesson?.id) return;

      const lessonState = {
        id: lesson.id,
        title: lesson.title || 'Урок',
        fen,
        can_student_move: studentCanMove,
        timer_w: Math.round(timerWRef.current),
        timer_b: Math.round(timerBRef.current),
        increment_ms: incrementMsRef.current,
        active_color: activeColorRef.current,
        clock_started: clockStartedRef.current,
        clock_updated_at: new Date().toISOString(),
      };

      if (sharedState.moveTree) lessonState.move_tree = sharedState.moveTree;
      if (sharedState.currentNodeId) lessonState.current_node_id = sharedState.currentNodeId;

      saveQueueRef.current = lessonState;
      if (saveTimerRef.current) return;

      saveTimerRef.current = setTimeout(async () => {
        saveTimerRef.current = null;
        const payload = saveQueueRef.current;
        saveQueueRef.current = null;

        if (!payload) return;

        try {
          const { error } = await supabase
            .from('lessons')
            .upsert(payload, { onConflict: 'id' });
          if (error) throw error;
        } catch (e) {
          console.error('Ошибка сохранения состояния:', e);
        }
      }, 3000);
    },
    [lesson?.id, lesson?.title]
  );

  const toggleStudentAccess = async () => {
    if (tournamentRef.current?.status === 'running') return;
    const nextState = !canStudentMove;
    setCanStudentMove(nextState);
    canStudentMoveRef.current = nextState;

    if (nextState === false) {
      try {
        chessboardInstance.current?.removeLegalMovesMarkers();
        chessboardInstance.current?.setPosition(gameRef.current.fen());
      } catch {}
    }

    await saveStateInstant({ canStudentMove: nextState });

    channelRef.current?.send({
      type: 'broadcast',
      event: 'student_access',
      payload: { canStudentMove: nextState },
    });
  };

  // Часы считаются по реальному времени (Date.now), а не по числу тиков, поэтому
  // не «уплывают» при троттлинге таймеров в фоновой вкладке. Сеть не используется.
  const tickClock = useCallback(() => {
    const now = Date.now();
    const delta = Math.max(0, now - lastTickRef.current);
    lastTickRef.current = now;
    if (!clockStartedRef.current) return;

    // Сигнал при 10 секундах: один раз на сторону, в турнире — только тому, чьи это часы
    const checkLowTime = (c, remaining) => {
      if (remaining > LOW_TIME_MS) {
        lowTimeWarnedRef.current[c] = false;
        return;
      }
      if (lowTimeWarnedRef.current[c] || remaining <= 0) return;
      lowTimeWarnedRef.current[c] = true;
      if (tournamentRef.current?.status === 'running') {
        if (gameCtxRef.current?.myColor === c) playSound('lowtime');
      } else {
        playSound('lowtime');
      }
    };

    const color = activeColorRef.current;
    if (color === 'w') {
      timerWRef.current = Math.max(0, timerWRef.current - delta);
      setClockText(whiteClockDomRef.current, timerWRef.current);
      checkLowTime('w', timerWRef.current);
      if (timerWRef.current <= 0) clockExpiredRef.current?.('w');
    } else {
      timerBRef.current = Math.max(0, timerBRef.current - delta);
      setClockText(blackClockDomRef.current, timerBRef.current);
      checkLowTime('b', timerBRef.current);
      if (timerBRef.current <= 0) clockExpiredRef.current?.('b');
    }
  }, []);

  useEffect(() => {
    if (!clockStarted) return undefined;

    lastTickRef.current = Date.now();
    const tickInterval = setInterval(tickClock, 100);

    const syncInterval = setInterval(() => {
      setTimerW(timerWRef.current);
      setTimerB(timerBRef.current);
    }, 1000);

    return () => {
      clearInterval(tickInterval);
      clearInterval(syncInterval);
    };
  }, [clockStarted, tickClock]);

  const setTimeControl = (minutes, incSeconds) => {
    if (tournamentRef.current?.status === 'running') return;
    const totalMs = minutes * 60 * 1000;
    const incMs = incSeconds * 1000;
    timerWRef.current = totalMs;
    timerBRef.current = totalMs;
    incrementMsRef.current = incMs;
    activeColorRef.current = 'w';
    clockStartedRef.current = false;
    setTimerW(totalMs);
    setTimerB(totalMs);
    setIncrementMs(incMs);
    setActiveColor('w');
    setClockStarted(false);

    saveStateInstant({
      timerW: totalMs,
      timerB: totalMs,
      incrementMs: incMs,
      activeColor: 'w',
      clockStarted: false,
    });

    channelRef.current?.send({
      type: 'broadcast',
      event: 'clock_state',
      payload: {
        timerW: totalMs,
        timerB: totalMs,
        incrementMs: incMs,
        activeColor: 'w',
        clockStarted: false,
      },
    });
  };

  const toggleClockStart = () => {
    if (tournamentRef.current?.status === 'running') return;
    const nextState = !clockStarted;
    clockStartedRef.current = nextState;
    setClockStarted(nextState);
    saveState(gameRef.current.fen(), canStudentMove, { clock_started: nextState });

    channelRef.current?.send({
      type: 'broadcast',
      event: 'clock_state',
      payload: {
        timerW: timerWRef.current,
        timerB: timerBRef.current,
        incrementMs: incrementMsRef.current,
        activeColor: activeColorRef.current,
        clockStarted: nextState,
      },
    });
  };

  const toggleBoardOrientation = () => {
    const nextOrientation = orientation === COLOR.white ? COLOR.black : COLOR.white;
    setOrientation(nextOrientation);
    if (tournamentRef.current?.status === 'running') return; // в турнире доска переворачивается только локально

    channelRef.current?.send({
      type: 'broadcast',
      event: 'board_orientation',
      payload: { orientation: nextOrientation },
    });
  };

  const openMaterialPosition = async (material) => {
    if (!isTeacher || !material?.setup_fen || tournamentRef.current?.status === 'running') return;

    try {
      const preparedGame = new Chess(sanitizeCastlingInFen(material.setup_fen), { skipValidation: true });
      const preparedFen = preparedGame.fen();
      const nextTree = {
        root: {
          id: 'root',
          fen: preparedFen,
          san: '',
          parentId: null,
          children: [],
          color: preparedGame.turn(),
        },
      };

      gameRef.current = preparedGame;
      treeRef.current = nextTree;
      currentIdRef.current = 'root';
      activeColorRef.current = preparedGame.turn();
      clockStartedRef.current = false;

      setTree(nextTree);
      setCurrentId('root');
      setActiveColor(preparedGame.turn());
      setClockStarted(false);
      setPendingPromotion(null);
      setIsEditorMode(false);
      setSelectedEditorPiece(null);
      setLoadedMaterial(material);
      setIsMaterialsOpen(false);

      chessboardInstance.current?.setPosition(preparedFen, true);
      chessboardInstance.current?.removeMarkers();
      chessboardInstance.current?.removeArrows();

      await saveStateInstant({
        fen: preparedFen,
        moveTree: nextTree,
        currentNodeId: 'root',
        activeColor: preparedGame.turn(),
      });

      channelRef.current?.send({
        type: 'broadcast',
        event: 'make_move',
        payload: {
          fen: preparedFen,
          moveTree: nextTree,
          currentNodeId: 'root',
        },
      });
      channelRef.current?.send({
        type: 'broadcast',
        event: 'clock_state',
        payload: {
          timerW: timerWRef.current,
          timerB: timerBRef.current,
          incrementMs: incrementMsRef.current,
          activeColor: preparedGame.turn(),
          clockStarted: false,
        },
      });
      channelRef.current?.send({ type: 'broadcast', event: 'clear_drawings', payload: {} });
    } catch (error) {
      console.error('Не удалось открыть позицию:', error);
      window.alert('Позиция повреждена.');
    }
  };

  const jumpToNode = useCallback(
    (nodeId) => {
      const targetNode = treeRef.current[nodeId];
      if (!targetNode || tournamentRef.current?.status === 'running') return;
      currentIdRef.current = nodeId;
      setCurrentId(nodeId);
      try {
        gameRef.current.load(targetNode.fen, { skipValidation: true });
        if (chessboardInstance.current) {
          chessboardInstance.current.setPosition(targetNode.fen, true);
        }

        channelRef.current?.send({
          type: 'broadcast',
          event: 'make_move',
          payload: {
            fen: targetNode.fen,
            moveTree: treeRef.current,
            currentNodeId: nodeId,
          },
        });
      } catch (err) {
        console.error('Ошибка FEN:', err);
      }
    },
    []
  );

  useEffect(() => {
    if (!isTeacher) return;
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const currId = currentIdRef.current;
      const currTree = treeRef.current;
      if (e.key === 'ArrowLeft') {
        const parentId = currTree[currId]?.parentId;
        if (parentId) jumpToNode(parentId);
      } else if (e.key === 'ArrowRight') {
        const children = currTree[currId]?.children || [];
        if (children.length > 0) jumpToNode(children[0]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jumpToNode, isTeacher]);

  const applyRemoteMove = useCallback(
    (moveResult, newFen, syncedTree = null, syncedCurrentId = null) => {
      if (moveResult.captured) playSound('capture');
      else playSound('move');

      if (chessboardInstance.current) {
        chessboardInstance.current.setPosition(newFen, true);
      }

      let nextTree;
      let nextCurrentId;

      if (syncedTree && syncedCurrentId && syncedTree[syncedCurrentId]) {
        nextTree = syncedTree;
        nextCurrentId = syncedCurrentId;
      } else {
        const activeId = currentIdRef.current;
        const activeTree = treeRef.current;
        const parentNode = activeTree[activeId] || activeTree.root;
        const existingChildId = (parentNode.children || []).find(
          (childId) => activeTree[childId]?.san === moveResult.san
        );

        if (existingChildId) {
          nextTree = activeTree;
          nextCurrentId = existingChildId;
        } else {
          const newId = generateId();
          const newNode = {
            id: newId,
            fen: newFen,
            san: moveResult.san,
            color: moveResult.color,
            parentId: parentNode.id,
            children: [],
          };

          nextTree = {
            ...activeTree,
            [parentNode.id]: {
              ...parentNode,
              children: [...(parentNode.children || []), newId],
            },
            [newId]: newNode,
          };
          nextCurrentId = newId;
        }
      }

      treeRef.current = nextTree;
      currentIdRef.current = nextCurrentId;
      setTree(nextTree);
      setCurrentId(nextCurrentId);

      let nextW = timerWRef.current;
      let nextB = timerBRef.current;
      const currColor = activeColorRef.current;
      const inc = incrementMsRef.current;

      if (clockStartedRef.current) {
        if (currColor === 'w') nextW += inc;
        else nextB += inc;
      }
      const nextColor = currColor === 'w' ? 'b' : 'w';

      timerWRef.current = nextW;
      timerBRef.current = nextB;
      activeColorRef.current = nextColor;
      setTimerW(nextW);
      setTimerB(nextB);
      setActiveColor(nextColor);

      paintClocks();

      if (chessboardInstance.current) {
        chessboardInstance.current.removeMarkers();
        chessboardInstance.current.removeArrows();
      }

      return { moveTree: nextTree, currentNodeId: nextCurrentId };
    },
    [paintClocks]
  );

  const executeMove = useCallback(
    (from, to, promotion = 'q') => {
      if (tournamentRef.current?.status === 'running') {
        return tournamentApiRef.current.playMove?.(from, to, promotion) ?? false;
      }
      try {
        const move = gameRef.current.move({ from, to, promotion });
        if (!move) return false;

        const newFen = gameRef.current.fen();
        const sharedMoveState = applyRemoteMove(move, newFen);

        saveStateInstant({
          fen: newFen,
          moveTree: sharedMoveState.moveTree,
          currentNodeId: sharedMoveState.currentNodeId,
          activeColor: activeColorRef.current,
        });

        channelRef.current?.send({
          type: 'broadcast',
          event: 'make_move',
          payload: {
            from,
            to,
            promotion,
            fen: newFen,
            san: move.san,
            captured: !!move.captured,
            color: move.color,
            timerW: timerWRef.current,
            timerB: timerBRef.current,
            activeColor: activeColorRef.current,
            moveTree: sharedMoveState.moveTree,
            currentNodeId: sharedMoveState.currentNodeId,
          },
        });
        channelRef.current?.send({ type: 'broadcast', event: 'clear_drawings', payload: {} });
        return true;
      } catch {
        chessboardInstance.current?.setPosition(gameRef.current.fen());
        return false;
      }
    },
    [applyRemoteMove, saveStateInstant]
  );

  const choosePromotion = (promotion) => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    executeMove(from, to, promotion);
  };

  /* ============================================================
     Круговой турнир: полностью автоматический процесс.
     Координатор (тренер) собирает результаты и сам запускает следующий тур.
     Каждая партия идёт локально у двух игроков; ходы летят через Broadcast,
     а FEN + остаток времени + clock_updated_at пишутся в БД только при ходе.
     ============================================================ */
  const tournamentRunning = tournament?.status === 'running';

  const updateGameCtx = (next) => {
    gameCtxRef.current = next;
    setGameCtx(next);
  };

  const clearNextRoundTimer = () => {
    if (nextRoundTimerRef.current) {
      clearTimeout(nextRoundTimerRef.current);
      nextRoundTimerRef.current = null;
    }
  };

  const cancelCountdown = () => {
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    countdownActiveRef.current = false;
    setCountdown(null);
  };

  // Отсчёт 5‑4‑3‑2‑1 со звуком; по нулю вызывается onGo (старт часов и разблокировка ходов)
  const runCountdown = (ms, onGo) => {
    cancelCountdown();
    countdownActiveRef.current = true;
    const endAt = Date.now() + ms;
    let shown = null;
    const step = () => {
      const left = endAt - Date.now();
      if (left <= 0) {
        countdownActiveRef.current = false;
        setCountdown(0);
        playSound('go');
        onGo();
        countdownTimerRef.current = setTimeout(() => {
          countdownTimerRef.current = null;
          setCountdown(null);
        }, 900);
        return;
      }
      const sec = Math.ceil(left / 1000);
      if (sec !== shown) {
        shown = sec;
        setCountdown(sec);
        playSound('tick');
      }
      countdownTimerRef.current = setTimeout(step, Math.min(100, left));
    };
    step();
  };

  const stopLocalGame = () => {
    cancelCountdown();
    clockStartedRef.current = false;
    setClockStarted(false);
    setTimerW(timerWRef.current);
    setTimerB(timerBRef.current);
    setCanStudentMove(false);
    canStudentMoveRef.current = false;
    setPendingPromotion(null);
    try {
      chessboardInstance.current?.removeLegalMovesMarkers();
    } catch {
      // нет маркеров
    }
  };

  const persistTournamentMeta = async (state) => {
    if (!lesson?.id) return;
    try {
      const { error } = await supabase
        .from('lessons')
        .update({ tournament_state: state })
        .eq('id', lesson.id);
      if (error) {
        console.warn('Состояние турнира не сохранено (нужна колонка lessons.tournament_state):', error.message);
      }
    } catch (e) {
      console.warn('Состояние турнира не сохранено:', e);
    }
  };

  const persistTournamentGame = async (resultInfo = null) => {
    const ctx = gameCtxRef.current;
    const st = tournamentRef.current;
    if (!ctx || !st || !ctx.myColor || !lesson?.id) return;
    try {
      const { error } = await supabase.from('tournament_games').upsert(
        {
          tournament_id: st.id,
          lesson_id: String(lesson.id),
          round: ctx.round,
          table_no: ctx.table,
          white_id: ctx.whiteId,
          black_id: ctx.blackId,
          fen: gameRef.current.fen(),
          moves: gameRef.current.history(),
          timer_w: Math.round(timerWRef.current),
          timer_b: Math.round(timerBRef.current),
          active_color: activeColorRef.current,
          clock_updated_at: new Date().toISOString(),
          result: resultInfo?.result ?? null,
          reason: resultInfo?.reason ?? null,
        },
        { onConflict: 'tournament_id,round,table_no' }
      );
      if (error) {
        console.warn('Партия не сохранена (нужна таблица tournament_games):', error.message);
      }
    } catch (e) {
      console.warn('Партия не сохранена:', e);
    }
  };

  const fetchTableRow = async (st, table) => {
    try {
      const { data, error } = await supabase
        .from('tournament_games')
        .select('*')
        .eq('tournament_id', st.id)
        .eq('round', st.round)
        .eq('table_no', table)
        .maybeSingle();
      if (error) return null;
      return data || null;
    } catch {
      return null;
    }
  };

  // Применяет «снимок» стола: позиция + часы. При running и updatedAt остаток
  // времени = остаток − (сейчас − clock_updated_at).
  const applyTableSnapshot = ({ moves = [], timerW: w0, timerB: b0, updatedAt = null, running = true }) => {
    const { game, tree: nextTree, currentId: nextCurrentId } = replayMoves(moves);
    gameRef.current = game;
    const turn = game.turn();

    let w = w0;
    let b = b0;
    if (running && updatedAt) {
      const elapsed = Math.max(0, Date.now() - new Date(updatedAt).getTime());
      if (turn === 'w') w = Math.max(0, w - elapsed);
      else b = Math.max(0, b - elapsed);
    }

    const alive = running && w > 0 && b > 0;
    lowTimeWarnedRef.current = { w: w <= LOW_TIME_MS, b: b <= LOW_TIME_MS };
    timerWRef.current = w;
    timerBRef.current = b;
    activeColorRef.current = turn;
    clockStartedRef.current = alive;
    treeRef.current = nextTree;
    currentIdRef.current = nextCurrentId;
    lastTickRef.current = Date.now();

    setTimerW(w);
    setTimerB(b);
    setActiveColor(turn);
    setClockStarted(alive);
    setTree(nextTree);
    setCurrentId(nextCurrentId);
    setPendingPromotion(null);
    paintClocks();

    const board = chessboardInstance.current;
    if (board) {
      try {
        board.removeLegalMovesMarkers();
      } catch {
        // нет маркеров
      }
      board.removeMarkers();
      board.removeArrows();
      board.setPosition(game.fen(), false);
    }

    let expiredColor = null;
    if (running) {
      if (w <= 0) expiredColor = 'w';
      else if (b <= 0) expiredColor = 'b';
    }
    return { expiredColor };
  };

  // Вход в тур: определяем соперника, цвет, ориентацию доски, ставим часы и позицию.
  // restore=true — берём состояние стола из БД (перезагрузка страницы / поздний вход).
  const enterRound = async (st, restore = false) => {
    const me = await ensureCurrentUser();
    tournamentRef.current = st;
    setTournament(st);
    clearNextRoundTimerIfNotCoordinator();

    const roundInfo = st.schedule[st.round - 1];
    if (!roundInfo) return;

    const tc = st.settings.timeControl;
    const totalMs = tc.min * 60 * 1000;
    const incMs = tc.inc * 1000;
    incrementMsRef.current = incMs;
    setIncrementMs(incMs);

    const myPair =
      !isObserver && me
        ? roundInfo.pairings.find((p) => p.white.id === me.id || p.black.id === me.id)
        : null;
    const pair = myPair || roundInfo.pairings[0];
    if (!pair) return;
    const myColor = myPair ? (myPair.white.id === me.id ? 'w' : 'b') : null;

    const row = restore ? await fetchTableRow(st, pair.table) : null;
    const savedResult = st.results?.[`${st.round}:${pair.table}`] || null;
    const rowResult = row?.result ? { result: row.result, reason: row.reason || 'draw' } : null;
    const finalResult = savedResult || rowResult;

    updateGameCtx({
      tournamentId: st.id,
      round: st.round,
      table: pair.table,
      whiteId: pair.white.id,
      blackId: pair.black.id,
      myColor,
      finished: !!finalResult,
      result: finalResult,
    });

    setOrientation(myColor === 'b' ? COLOR.black : COLOR.white);

    const startsAtMs = Date.parse(st.roundStartedAt) + COUNTDOWN_SECONDS * 1000;
    const startsAtIso = new Date(startsAtMs).toISOString();
    const live = !finalResult && !st.paused;

    let snapshot = { moves: [], timerW: totalMs, timerB: totalMs, running: live };
    if (restore) {
      snapshot = row
        ? {
            moves: row.moves || [],
            timerW: row.timer_w,
            timerB: row.timer_b,
            updatedAt: st.paused ? null : row.clock_updated_at,
            running: live,
          }
        : { moves: [], timerW: totalMs, timerB: totalMs, updatedAt: startsAtIso, running: live };
    }

    // Партия ещё не начиналась — сначала отсчёт 5‑4‑3‑2‑1, часы и ходы заморожены
    let startDelayMs = 0;
    if (live && snapshot.moves.length === 0 && (!restore || !row)) {
      const target = restore ? startsAtMs : Date.now() + COUNTDOWN_SECONDS * 1000;
      startDelayMs = Math.min(COUNTDOWN_SECONDS * 1000, Math.max(0, target - Date.now()));
    }

    cancelCountdown();
    const { expiredColor } = applyTableSnapshot({
      ...snapshot,
      running: snapshot.running && startDelayMs === 0,
    });

    const canPlay = !!myColor && live && !expiredColor && startDelayMs === 0;
    setCanStudentMove(canPlay);
    canStudentMoveRef.current = canPlay;

    if (startDelayMs > 0) {
      runCountdown(startDelayMs, () => {
        lastTickRef.current = Date.now();
        clockStartedRef.current = true;
        setClockStarted(true);
        const ctxNow = gameCtxRef.current;
        const ok = !!ctxNow?.myColor && !ctxNow.finished && !tournamentRef.current?.paused;
        setCanStudentMove(ok);
        canStudentMoveRef.current = ok;
      });
    }

    if (expiredColor) clockExpiredRef.current?.(expiredColor);
  };

  // Не координатор не должен держать таймер перехода между турами
  const clearNextRoundTimerIfNotCoordinator = () => {
    if (!isTeacher) clearNextRoundTimer();
  };

  // Наблюдение за другим столом (тренер без партии, отдыхающие игроки, наблюдатели)
  const watchTournamentTable = async (table) => {
    const st = tournamentRef.current;
    const ctx = gameCtxRef.current;
    if (!st || st.status !== 'running' || (ctx && ctx.myColor)) return;
    if (ctx && ctx.table === table && ctx.round === st.round) return;
    const pair = st.schedule[st.round - 1]?.pairings.find((p) => p.table === table);
    if (!pair) return;

    const row = await fetchTableRow(st, table);
    const res = st.results?.[`${st.round}:${table}`] || null;
    const tc = st.settings.timeControl;
    const totalMs = tc.min * 60 * 1000;

    updateGameCtx({
      tournamentId: st.id,
      round: st.round,
      table,
      whiteId: pair.white.id,
      blackId: pair.black.id,
      myColor: null,
      finished: !!res,
      result: res,
    });

    const { expiredColor } = applyTableSnapshot(
      row
        ? {
            moves: row.moves || [],
            timerW: row.timer_w,
            timerB: row.timer_b,
            updatedAt: st.paused ? null : row.clock_updated_at,
            running: !res && !row.result && !st.paused,
          }
        : {
            moves: [],
            timerW: totalMs,
            timerB: totalMs,
            updatedAt: new Date(Date.parse(st.roundStartedAt) + COUNTDOWN_SECONDS * 1000).toISOString(),
            running: !res && !st.paused,
          }
    );
    if (expiredColor) clockExpiredRef.current?.(expiredColor);
  };

  // Игрок фиксирует итог своей партии: стопорим часы, шлём результат координатору
  const reportTournamentResult = (res) => {
    const ctx = gameCtxRef.current;
    const st = tournamentRef.current;
    if (!ctx || !st || ctx.finished || !ctx.myColor) return;

    updateGameCtx({ ...ctx, finished: true, result: res });
    stopLocalGame();

    const payload = {
      event: 'game_result',
      tournamentId: st.id,
      round: ctx.round,
      table: ctx.table,
      result: res.result,
      reason: res.reason,
    };
    channelRef.current?.send({ type: 'broadcast', event: 'tournament_action', payload });
    persistTournamentGame(res);
    if (isTeacher) recordTournamentResult(payload);
  };

  // Собственный ход в турнирной партии
  const playTournamentMove = (from, to, promotion) => {
    const ctx = gameCtxRef.current;
    const st = tournamentRef.current;
    const resetBoard = () => chessboardInstance.current?.setPosition(gameRef.current.fen());

    if (!ctx || !st || !ctx.myColor || ctx.finished) {
      resetBoard();
      return false;
    }
    if (gameRef.current.turn() !== ctx.myColor || countdownActiveRef.current || st.paused) {
      resetBoard();
      return false;
    }

    // Фиксируем точный остаток времени на момент хода
    tickClock();
    if (gameCtxRef.current?.finished) {
      resetBoard();
      return false;
    }

    let move = null;
    try {
      move = gameRef.current.move({ from, to, promotion });
    } catch {
      move = null;
    }
    if (!move) {
      resetBoard();
      return false;
    }

    const newFen = gameRef.current.fen();
    applyRemoteMove(move, newFen); // дерево ходов, звук, +инкремент, смена очереди часов
    lastTickRef.current = Date.now();

    channelRef.current?.send({
      type: 'broadcast',
      event: 'tournament_action',
      payload: {
        event: 'game_move',
        tournamentId: st.id,
        round: ctx.round,
        table: ctx.table,
        from,
        to,
        promotion,
        san: move.san,
        fen: newFen,
        ply: gameRef.current.history().length,
        timerW: Math.round(timerWRef.current),
        timerB: Math.round(timerBRef.current),
        activeColor: activeColorRef.current,
        clockUpdatedAt: new Date().toISOString(),
      },
    });
    persistTournamentGame();

    const over = detectGameOver(gameRef.current);
    if (over) reportTournamentResult(over);
    return true;
  };

  // Повторная загрузка стола из БД (пропущен ход / рассинхрон)
  const resyncTable = async (table) => {
    const st = tournamentRef.current;
    if (!st) return;
    const row = await fetchTableRow(st, table);
    const ctx = gameCtxRef.current;
    if (!row || !ctx || ctx.table !== table || ctx.round !== st.round) return;
    const finished = ctx.finished || !!row.result || !!st.results?.[`${st.round}:${table}`];
    const { expiredColor } = applyTableSnapshot({
      moves: row.moves || [],
      timerW: row.timer_w,
      timerB: row.timer_b,
      updatedAt: st.paused ? null : row.clock_updated_at,
      running: !finished && !st.paused,
    });
    if (expiredColor) clockExpiredRef.current?.(expiredColor);
  };

  // Ход соперника (или ход на наблюдаемом столе)
  const applyRemoteTournamentMove = (payload) => {
    const ctx = gameCtxRef.current;
    const st = tournamentRef.current;
    if (!ctx || !st || st.status !== 'running' || ctx.finished) return;
    if (payload.tournamentId !== st.id || payload.round !== ctx.round || payload.table !== ctx.table) {
      return;
    }

    const game = gameRef.current;
    const plyNow = game.history().length;
    if (payload.ply <= plyNow) return; // дубликат
    if (payload.ply !== plyNow + 1) {
      resyncTable(ctx.table);
      return;
    }

    let move = null;
    try {
      move = game.move({
        from: payload.from,
        to: payload.to,
        promotion: payload.promotion || 'q',
      });
    } catch {
      move = null;
    }
    if (!move) {
      resyncTable(ctx.table);
      return;
    }

    applyRemoteMove(move, game.fen());

    // Остаток времени после хода — от того, кто его сделал (без сетевых запросов каждую секунду)
    timerWRef.current = payload.timerW;
    timerBRef.current = payload.timerB;
    activeColorRef.current = game.turn();
    setTimerW(payload.timerW);
    setTimerB(payload.timerB);
    setActiveColor(game.turn());
    lastTickRef.current = Date.now();
    paintClocks();

    if (ctx.myColor) {
      const over = detectGameOver(game);
      if (over) reportTournamentResult(over);
    }
  };

  /* ----- Координатор (тренер) ----- */

  const publishTournamentState = (state) => {
    tournamentRef.current = state;
    setTournament(state);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'tournament_action',
      payload: { event: 'state_update', state },
    });
    persistTournamentMeta(state);
  };

  const launchRound = (state) => {
    tournamentRef.current = state;
    setTournament(state);
    persistTournamentMeta(state);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'tournament_action',
      payload: { event: 'round_start', state },
    });
    enterRound(state, false);
  };

  const runNextRound = () => {
    nextRoundTimerRef.current = null;
    const cur = tournamentRef.current;
    if (!cur || cur.status !== 'running') return;
    launchRound({
      ...cur,
      round: cur.round + 1,
      nextRoundAt: null,
      roundStartedAt: new Date().toISOString(),
    });
  };

  const scheduleNextRound = (state) => {
    clearNextRoundTimer();
    publishTournamentState({
      ...state,
      nextRoundAt: new Date(Date.now() + ROUND_PAUSE_MS).toISOString(),
    });
    nextRoundTimerRef.current = setTimeout(() => {
      tournamentApiRef.current.runNextRound?.();
    }, ROUND_PAUSE_MS);
  };

  const finishTournament = (state) => {
    clearNextRoundTimer();
    publishTournamentState({ ...state, status: 'finished', nextRoundAt: null });
    stopLocalGame();
  };

  const recordTournamentResult = ({ tournamentId, round, table, result, reason }) => {
    if (!isTeacher) return;
    const st = tournamentRef.current;
    if (!st || st.status !== 'running' || st.id !== tournamentId || st.round !== round) return;
    const key = `${round}:${table}`;
    if (st.results[key]) return; // результат стола уже занесён

    const next = { ...st, results: { ...st.results, [key]: { result, reason } } };
    const roundDone = next.schedule[round - 1].pairings.every(
      (p) => next.results[`${round}:${p.table}`]
    );

    if (!roundDone || next.paused) {
      publishTournamentState(next);
    } else if (round >= next.totalRounds) {
      finishTournament(next);
    } else {
      scheduleNextRound(next);
    }
  };

  const startTournament = () => {
    if (!isTeacher || isObserver || tournamentRef.current?.status === 'running') return;
    const players = lessonParticipants;
    if (players.length < 2) {
      window.alert('Для турнира нужно минимум 2 участника.');
      return;
    }
    const schedule = generateRoundRobinSchedule(players);
    launchRound({
      id: `${Date.now().toString(36)}${generateId()}`,
      status: 'running',
      settings: {
        includeTeacher: tournamentSettings.includeTeacher,
        timeControl: { ...tournamentSettings.timeControl },
      },
      participants: players,
      schedule,
      totalRounds: schedule.length,
      round: 1,
      results: {},
      roundStartedAt: new Date().toISOString(),
      nextRoundAt: null,
    });
  };

  const endTournament = () => {
    if (!isTeacher) return;
    clearNextRoundTimer();
    tournamentRef.current = null;
    setTournament(null);
    updateGameCtx(null);
    stopLocalGame();
    channelRef.current?.send({
      type: 'broadcast',
      event: 'tournament_action',
      payload: { event: 'tournament_end' },
    });
    persistTournamentMeta(null);
  };

  const abortTournament = () => {
    if (!window.confirm('Завершить турнир досрочно? Незавершённые партии не будут засчитаны.')) return;
    endTournament();
  };

  // Пауза: часы у всех встают, ходы блокируются; время простоя не списывается
  const pauseLocalClock = () => {
    tickClock();
    clockStartedRef.current = false;
    setClockStarted(false);
    setTimerW(timerWRef.current);
    setTimerB(timerBRef.current);
    paintClocks();
    const ctx = gameCtxRef.current;
    if (ctx?.myColor && !ctx.finished) persistTournamentGame();
  };

  const resumeLocalClock = () => {
    const ctx = gameCtxRef.current;
    if (!ctx || ctx.finished || countdownActiveRef.current) return;
    lastTickRef.current = Date.now();
    clockStartedRef.current = true;
    setClockStarted(true);
    if (ctx.myColor) persistTournamentGame(); // обновляем clock_updated_at на момент возобновления
  };

  const pauseTournament = () => {
    const st = tournamentRef.current;
    if (!isTeacher || !st || st.status !== 'running' || st.paused) return;
    if (st.nextRoundAt || countdownActiveRef.current) return;
    pauseLocalClock();
    publishTournamentState({ ...st, paused: true });
  };

  const resumeTournament = () => {
    const st = tournamentRef.current;
    if (!isTeacher || !st || st.status !== 'running' || !st.paused) return;
    const resumed = { ...st, paused: false };
    const roundDone = resumed.schedule[resumed.round - 1].pairings.every(
      (p) => resumed.results[`${resumed.round}:${p.table}`]
    );
    if (roundDone) {
      // тур закончился во время паузы — идём дальше
      if (resumed.round >= resumed.totalRounds) finishTournament(resumed);
      else scheduleNextRound(resumed);
      return;
    }
    publishTournamentState(resumed);
    resumeLocalClock();
  };

  const resignTournamentGame = () => {
    const ctx = gameCtxRef.current;
    if (!ctx || !ctx.myColor || ctx.finished) return;
    reportTournamentResult({
      result: ctx.myColor === 'w' ? '0-1' : '1-0',
      reason: 'resign',
    });
  };

  /* ----- Приём общего состояния ----- */

  const adoptTournamentState = (st) => {
    if (!st) return;
    const cur = tournamentRef.current;
    if (cur && cur.id === st.id && st.round < cur.round) return;

    tournamentRef.current = st;
    setTournament(st);

    if (st.status === 'finished') {
      stopLocalGame();
      return;
    }

    if (cur && cur.id === st.id && !!st.paused !== !!cur.paused) {
      if (st.paused) pauseLocalClock();
      else resumeLocalClock();
    }

    const ctx = gameCtxRef.current;
    // Пропустили начало тура — входим в него, восстанавливая стол из БД
    if (!ctx || ctx.tournamentId !== st.id || ctx.round < st.round) {
      enterRound(st, true);
      return;
    }
    if (!ctx.finished && ctx.round === st.round) {
      const res = st.results?.[`${ctx.round}:${ctx.table}`];
      if (res) {
        updateGameCtx({ ...ctx, finished: true, result: res });
        stopLocalGame();
      }
    }
  };

  const handleTournamentAction = (payload) => {
    if (!payload) return;
    switch (payload.event) {
      case 'round_start':
        enterRound(payload.state, false);
        break;
      case 'state_update':
        adoptTournamentState(payload.state);
        break;
      case 'tournament_end':
        clearNextRoundTimer();
        tournamentRef.current = null;
        setTournament(null);
        updateGameCtx(null);
        stopLocalGame();
        break;
      case 'game_move':
        applyRemoteTournamentMove(payload);
        break;
      case 'game_result':
        recordTournamentResult(payload);
        break;
      default:
        break;
    }
  };

  // Тренер после перезагрузки: подбираем результаты, пришедшие пока он был офлайн,
  // и возобновляем паузу между турами
  const resumeCoordinator = async (st) => {
    try {
      const { data } = await supabase
        .from('tournament_games')
        .select('round, table_no, result, reason')
        .eq('tournament_id', st.id)
        .eq('round', st.round)
        .not('result', 'is', null);
      (data || []).forEach((row) =>
        recordTournamentResult({
          tournamentId: st.id,
          round: row.round,
          table: row.table_no,
          result: row.result,
          reason: row.reason || 'draw',
        })
      );
    } catch (e) {
      console.warn('Не удалось подобрать результаты турнира:', e);
    }

    const cur = tournamentRef.current;
    if (cur?.status === 'running' && cur.nextRoundAt && !nextRoundTimerRef.current) {
      const left = Math.max(0, Date.parse(cur.nextRoundAt) - Date.now());
      nextRoundTimerRef.current = setTimeout(() => {
        tournamentApiRef.current.runNextRound?.();
      }, left);
    }
  };

  // Восстановление после обновления страницы / позднего входа в комнату
  const restoreTournament = async () => {
    if (!lesson?.id) return;
    try {
      await ensureCurrentUser();
      const { data, error } = await supabase
        .from('lessons')
        .select('tournament_state')
        .eq('id', lesson.id)
        .maybeSingle();
      if (error || !data?.tournament_state) return;

      const st = data.tournament_state;
      if (!st.id || !st.schedule) return;

      const cur = tournamentRef.current;
      if (cur && cur.id === st.id && cur.round >= st.round) return; // уже синхронизированы по Broadcast

      tournamentRef.current = st;
      setTournament(st);
      if (st.status !== 'running') return;

      await enterRound(st, true);
      if (isTeacher) await resumeCoordinator(st);
    } catch (e) {
      console.warn('Не удалось восстановить турнир:', e);
    }
  };

  // Конец времени: в турнире — результат партии, в обычном уроке — как раньше
  const handleClockExpired = (color) => {
    clockStartedRef.current = false;
    setClockStarted(false);
    setTimerW(timerWRef.current);
    setTimerB(timerBRef.current);
    paintClocks();

    const ctx = gameCtxRef.current;
    if (tournamentRef.current?.status === 'running' && ctx) {
      if (ctx.myColor && !ctx.finished) {
        const opponent = color === 'w' ? 'b' : 'w';
        reportTournamentResult(
          hasMatingMaterial(gameRef.current, opponent)
            ? { result: color === 'w' ? '0-1' : '1-0', reason: 'timeout' }
            : { result: '1/2-1/2', reason: 'insufficient' }
        );
      }
      return;
    }

    if (isTeacher) {
      saveState(gameRef.current.fen(), canStudentMoveRef.current);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'clock_state',
        payload: {
          timerW: timerWRef.current,
          timerB: timerBRef.current,
          incrementMs: incrementMsRef.current,
          activeColor: activeColorRef.current,
          clockStarted: false,
        },
      });
    }
  };

  // Ученик записывается в турнир / выходит из лобби (Presence на канале урока)
  const toggleLobby = async () => {
    if (isTeacher || isObserver || !channelRef.current) return;
    const user = await ensureCurrentUser();
    if (!user) {
      window.alert('Войдите в аккаунт, чтобы участвовать в турнире.');
      return;
    }
    const next = !lobbyJoinedRef.current;
    try {
      if (next) {
        await channelRef.current.track({ user_id: user.id, name: user.name, joined: true });
      } else {
        await channelRef.current.untrack();
      }
      lobbyJoinedRef.current = next;
      setLobbyJoined(next);
    } catch (e) {
      console.error('Не удалось изменить запись на турнир:', e);
    }
  };

  // Обработчики всегда видят свежие замыкания через ref (канал создаётся один раз)
  tournamentApiRef.current = {
    playMove: playTournamentMove,
    handleAction: handleTournamentAction,
    runNextRound,
  };
  restoreTournamentRef.current = restoreTournament;
  clockExpiredRef.current = handleClockExpired;

  useEffect(
    () => () => {
      if (nextRoundTimerRef.current) clearTimeout(nextRoundTimerRef.current);
    },
    []
  );

  // Клетка под указателем в момент отпускания (с запасом на рамку доски)
  const resolveDropSquare = () => {
    const el = boardRef.current;
    const p = lastPointerRef.current;
    if (!el || p.x == null) return null;
    const r = el.getBoundingClientRect();
    const tol = 14;
    if (p.x < r.left - tol || p.x > r.right + tol || p.y < r.top - tol || p.y > r.bottom + tol) {
      return null;
    }
    const idx = (v) => Math.min(7, Math.max(0, Math.floor(v)));
    const col = idx(((p.x - r.left) / r.width) * 8);
    const row = idx(((p.y - r.top) / r.height) * 8);
    const whiteBottom = orientationRef.current === COLOR.white;
    const file = whiteBottom ? col : 7 - col;
    const rank = whiteBottom ? 8 - row : row + 1;
    return `${String.fromCharCode(97 + file)}${rank}`;
  };

  useEffect(() => {
    if (!boardRef.current || !lesson?.id) return;

    let cancelled = false;

    const initFromDb = async () => {
      let freshFen = lesson.fen || INITIAL_FEN;
      let freshTree = lesson.move_tree?.root
        ? lesson.move_tree
        : {
            root: {
              id: 'root',
              fen: freshFen,
              san: '',
              parentId: null,
              children: [],
              color: freshFen.split(' ')[1] || 'w',
            },
          };
      let freshCurrentId = freshTree[lesson.current_node_id]
        ? lesson.current_node_id
        : 'root';

      let freshTimerW = lesson.timer_w ?? 600000;
      let freshTimerB = lesson.timer_b ?? 600000;
      let freshClockStarted = lesson.clock_started ?? false;
      let freshActiveColor = lesson.active_color || 'w';
      let freshIncrementMs = lesson.increment_ms ?? 5000;
      let freshClockUpdatedAt = lesson.clock_updated_at;
      let freshCanStudentMove = lesson.can_student_move;

      try {
        const { data } = await supabase
          .from('lessons')
          .select(
            'fen, move_tree, current_node_id, can_student_move, timer_w, timer_b, active_color, clock_started, increment_ms, clock_updated_at'
          )
          .eq('id', lesson.id)
          .maybeSingle();

        if (cancelled) return;

        if (data) {
          if (data.fen) freshFen = data.fen;
          if (data.move_tree?.root) {
            freshTree = data.move_tree;
            freshCurrentId = freshTree[data.current_node_id]
              ? data.current_node_id
              : 'root';
          }
          if (data.can_student_move !== undefined) {
            freshCanStudentMove = data.can_student_move;
          }
          if (data.timer_w !== undefined) freshTimerW = data.timer_w;
          if (data.timer_b !== undefined) freshTimerB = data.timer_b;
          if (data.active_color) freshActiveColor = data.active_color;
          if (data.clock_started !== undefined) freshClockStarted = data.clock_started;
          if (data.increment_ms !== undefined) freshIncrementMs = data.increment_ms;
          if (data.clock_updated_at) freshClockUpdatedAt = data.clock_updated_at;
        }
      } catch (e) {
        console.error('Ошибка получения свежего состояния урока:', e);
      }

      if (cancelled) return;

      treeRef.current = freshTree;
      currentIdRef.current = freshCurrentId;
      setTree(freshTree);
      setCurrentId(freshCurrentId);

      try {
        gameRef.current.load(freshFen, { skipValidation: true });
      } catch {
        gameRef.current.reset();
      }

      if (freshClockStarted && freshClockUpdatedAt) {
        const elapsedMs = Math.max(
          0,
          Date.now() - new Date(freshClockUpdatedAt).getTime()
        );
        if (freshActiveColor === 'w')
          freshTimerW = Math.max(0, freshTimerW - elapsedMs);
        else freshTimerB = Math.max(0, freshTimerB - elapsedMs);

        if (freshTimerW <= 0 || freshTimerB <= 0) freshClockStarted = false;
      }

      timerWRef.current = freshTimerW;
      timerBRef.current = freshTimerB;
      incrementMsRef.current = freshIncrementMs;
      activeColorRef.current = freshActiveColor;
      clockStartedRef.current = freshClockStarted;
      setTimerW(freshTimerW);
      setTimerB(freshTimerB);
      setIncrementMs(freshIncrementMs);
      setActiveColor(freshActiveColor);
      setClockStarted(freshClockStarted);

      if (freshCanStudentMove !== undefined) {
        setCanStudentMove(freshCanStudentMove);
        canStudentMoveRef.current = freshCanStudentMove;
      }

      if (chessboardInstance.current) {
        chessboardInstance.current.destroy();
      }

      try {
        chessboardInstance.current = new Chessboard(boardRef.current, {
          position: freshFen,
          orientation: orientation,
          assetsUrl: '/assets/',
          style: {
            borderType: BORDER_TYPE.thin,
            animationDuration: 150,
          },
          extensions: [
            { class: Markers, props: { autoMarkers: null } },
            { class: Arrows, props: { headSize: 5 } },
          ],
        });

        chessboardInstance.current.setPosition(freshFen, false);

        chessboardInstance.current.enableMoveInput((event) => {
          if (isEditorModeRef.current) {
            if (event.type === 'moveInputStarted') return true;
            if (event.type === 'moveInputFinished' && event.squareFrom) {
              // Если библиотека не определила клетку (отпустили у самого края/в углу),
              // определяем её по координатам указателя. Удаляем фигуру, только если
              // её реально утащили за пределы доски.
              let target = event.squareTo || null;
              let removeIt = false;
              if (!target) {
                target = resolveDropSquare();
                removeIt = !target;
              }

              if (!removeIt && target === event.squareFrom) {
                chessboardInstance.current?.setPosition(tempEditorFenRef.current, false);
                return false;
              }

              const fromFile = event.squareFrom.charCodeAt(0) - 97;
              const fromRank = 8 - parseInt(event.squareFrom[1]);
              const toFile = target ? target.charCodeAt(0) - 97 : 0;
              const toRank = target ? 8 - parseInt(target[1]) : 0;

              const updated = updateFenBoard(tempEditorFenRef.current, (board) => {
                const piece = board[fromRank][fromFile];
                board[fromRank][fromFile] = null;
                // не затираем клетку назначения, если на исходной уже ничего нет
                if (!removeIt && piece) board[toRank][toFile] = piece;
              });

              const fullUpdatedFen = buildFullFen(
                updated,
                editorTurnRef.current,
                editorCastlingRef.current
              );
              tempEditorFenRef.current = fullUpdatedFen;
              setTempEditorFen(fullUpdatedFen);
              chessboardInstance.current?.setPosition(fullUpdatedFen, false);
            }
            return false;
          }

          if (tournamentRef.current?.status === 'running') {
            const tctx = gameCtxRef.current;
            const canPlay =
              !isObserver &&
              tctx &&
              tctx.myColor &&
              !tctx.finished &&
              !countdownActiveRef.current &&
              !tournamentRef.current?.paused;
            if (!canPlay) {
              try {
                chessboardInstance.current?.removeLegalMovesMarkers();
                chessboardInstance.current?.setPosition(gameRef.current.fen());
              } catch {}
              return false;
            }
            if (event.type === 'moveInputStarted' && event.squareFrom) {
              const pieceAtSquare = gameRef.current.get(event.squareFrom);
              if (
                !pieceAtSquare ||
                pieceAtSquare.color !== tctx.myColor ||
                gameRef.current.turn() !== tctx.myColor
              ) {
                return false;
              }
            }
          }

          if (isObserver || (!isTeacher && !canStudentMoveRef.current)) {
            try {
              chessboardInstance.current?.removeLegalMovesMarkers();
              chessboardInstance.current?.setPosition(gameRef.current.fen());
            } catch {}
            return false;
          }

          if (event.type === 'moveInputStarted' && event.squareFrom) {
            let legalMoves = [];
            try {
              legalMoves = gameRef.current.moves({
                square: event.squareFrom,
                verbose: true,
              });
            } catch (err) {
              console.error('Не удалось получить ходы для клетки', event.squareFrom, err);
              return false;
            }

            event.chessboard.removeLegalMovesMarkers();

            if (legalMoves.length === 0) return false;

            event.chessboard.addLegalMovesMarkers(legalMoves);
            return true;
          }

          if (event.type === 'moveInputCanceled') {
            chessboardInstance.current?.removeLegalMovesMarkers();
            return false;
          }

          if (event.type === 'moveInputFinished' && event.squareFrom && event.squareTo) {
            chessboardInstance.current?.removeLegalMovesMarkers();
            const piece = gameRef.current.get(event.squareFrom);
            const reachesLastRank =
              piece?.type === 'p' &&
              ((piece.color === 'w' && event.squareTo[1] === '8') ||
                (piece.color === 'b' && event.squareTo[1] === '1'));

            if (reachesLastRank) {
              setPendingPromotion({
                from: event.squareFrom,
                to: event.squareTo,
                color: piece.color,
              });
              chessboardInstance.current?.setPosition(gameRef.current.fen());
              return false;
            }

            return executeMove(event.squareFrom, event.squareTo);
          }
          return true;
        });
      } catch (err) {
        console.error('Ошибка инициализации cm-chessboard:', err);
      }

      if (!cancelled) restoreTournamentRef.current?.();
    };

    initFromDb();

    let channelCancelled = false;
    const channel = supabase.channel(`lesson-${lesson.id}`, {
      config: {
        broadcast: { self: false },
      },
    });

    channel
      .on(
        'broadcast',
        { event: 'make_move' },
        ({ payload }) => {
          if (!payload) return;
          if (tournamentRef.current?.status === 'running') return;
          if (payload.from && payload.to) {
            try {
              const move = gameRef.current.move({
                from: payload.from,
                to: payload.to,
                promotion: payload.promotion || 'q',
              });
              if (move) {
                applyRemoteMove(move, payload.fen, payload.moveTree, payload.currentNodeId);
                if (payload.timerW !== undefined) {
                  timerWRef.current = payload.timerW;
                  setTimerW(payload.timerW);
                  paintClocks();
                }
                if (payload.timerB !== undefined) {
                  timerBRef.current = payload.timerB;
                  setTimerB(payload.timerB);
                  paintClocks();
                }
                if (payload.activeColor !== undefined) {
                  activeColorRef.current = payload.activeColor;
                  setActiveColor(payload.activeColor);
                }
              }
            } catch {
              if (payload.fen) {
                gameRef.current.load(payload.fen, { skipValidation: true });
                if (chessboardInstance.current)
                  chessboardInstance.current.setPosition(payload.fen, true);
              }
            }
          } else if (payload.fen) {
            gameRef.current.load(payload.fen, { skipValidation: true });
            if (chessboardInstance.current)
              chessboardInstance.current.setPosition(payload.fen, true);
            if (payload.moveTree?.root) {
              const syncedCurrentId = payload.moveTree[payload.currentNodeId]
                ? payload.currentNodeId
                : 'root';
              treeRef.current = payload.moveTree;
              currentIdRef.current = syncedCurrentId;
              setTree(payload.moveTree);
              setCurrentId(syncedCurrentId);
            }
          }
        }
      )
      .on('broadcast', { event: 'clock_state' }, ({ payload }) => {
        if (!payload) return;
        if (tournamentRef.current?.status === 'running') return;
        if (payload.timerW !== undefined) {
          timerWRef.current = payload.timerW;
          setTimerW(payload.timerW);
          paintClocks();
        }
        if (payload.timerB !== undefined) {
          timerBRef.current = payload.timerB;
          setTimerB(payload.timerB);
          paintClocks();
        }
        if (payload.incrementMs !== undefined) {
          incrementMsRef.current = payload.incrementMs;
          setIncrementMs(payload.incrementMs);
        }
        if (payload.activeColor !== undefined) {
          activeColorRef.current = payload.activeColor;
          setActiveColor(payload.activeColor);
        }
        if (payload.clockStarted !== undefined) {
          clockStartedRef.current = payload.clockStarted;
          setClockStarted(payload.clockStarted);
        }
      })
      .on('broadcast', { event: 'student_access' }, ({ payload }) => {
        if (!payload) return;
        if (tournamentRef.current?.status === 'running') return;
        if (payload.canStudentMove !== undefined) {
          const val = payload.canStudentMove;
          setCanStudentMove(val);
          canStudentMoveRef.current = val;
          if (val === false) {
            try {
              chessboardInstance.current?.removeLegalMovesMarkers();
              chessboardInstance.current?.setPosition(gameRef.current.fen());
            } catch {}
          }
        }
      })
      .on('broadcast', { event: 'board_orientation' }, ({ payload }) => {
        if (tournamentRef.current?.status === 'running') return;
        if (payload?.orientation !== COLOR.white && payload?.orientation !== COLOR.black) return;
        setOrientation(payload.orientation);
      })
      .on('broadcast', { event: 'draw_annotation' }, ({ payload }) => {
        if (!payload || !chessboardInstance.current) return;
        {
          const tctx = gameCtxRef.current;
          if (tournamentRef.current?.status === 'running' && tctx?.myColor && !tctx.finished) return;
        }

        if (payload.kind === 'circle' && payload.square) {
          if (payload.visible)
            chessboardInstance.current.addMarker(MARKER_TYPE.circle, payload.square);
          else chessboardInstance.current.removeMarkers(MARKER_TYPE.circle, payload.square);
        }

        if (payload.kind === 'arrow' && payload.from && payload.to) {
          if (payload.visible)
            chessboardInstance.current.addArrow(ARROW_TYPE.default, payload.from, payload.to);
          else
            chessboardInstance.current.removeArrows(ARROW_TYPE.default, payload.from, payload.to);
        }
      })
      .on('broadcast', { event: 'clear_drawings' }, () => {
        if (!chessboardInstance.current) return;
        chessboardInstance.current.removeMarkers();
        chessboardInstance.current.removeArrows();
      })
      .on('broadcast', { event: 'tournament_action' }, ({ payload }) => {
        tournamentApiRef.current.handleAction?.(payload);
      })
      .on('presence', { event: 'sync' }, () => {
        const players = [];
        Object.values(channel.presenceState()).forEach((entries) => {
          entries.forEach((p) => {
            if (p?.joined && p.user_id) players.push({ id: p.user_id, name: p.name || 'Ученик' });
          });
        });
        const seen = new Set();
        setLobbyPlayers(players.filter((p) => !seen.has(p.id) && seen.add(p.id)));
      });

    channelRef.current = channel;

    supabase.realtime
      .setAuth()
      .then(() => {
        if (channelCancelled) return;
        channel.subscribe((status, error) => {
          if (status === 'SUBSCRIBED' && lobbyJoinedRef.current && currentUserRef.current) {
            channel
              .track({
                user_id: currentUserRef.current.id,
                name: currentUserRef.current.name,
                joined: true,
              })
              .catch(() => {});
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('Ошибка Realtime-канала:', status, error);
          }
        });
      })
      .catch((error) => {
        console.error('Не удалось авторизовать Realtime-соединение:', error);
      });

    return () => {
      cancelled = true;
      channelCancelled = true;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
      if (chessboardInstance.current) {
        chessboardInstance.current.destroy();
        chessboardInstance.current = null;
      }
    };
  }, [lesson?.id, applyRemoteMove, executeMove, isTeacher, isObserver]);

  useEffect(() => {
    const record = (e) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointerup', record, true);
    window.addEventListener('mouseup', record, true);
    return () => {
      window.removeEventListener('pointerup', record, true);
      window.removeEventListener('mouseup', record, true);
    };
  }, []);

  const setEditorSquare = (square, fenChar) => {
    if (!isEditorMode || !square) return;

    try {
      const file = square.charCodeAt(0) - 97;
      const rank = 8 - parseInt(square[1]);
      if (file < 0 || file > 7 || rank < 0 || rank > 7) return;

      const updated = updateFenBoard(tempEditorFenRef.current || tempEditorFen, (board) => {
        board[rank][file] = fenChar || null;
      });
      const fullUpdatedFen = buildFullFen(updated, editorTurn, editorCastling);
      tempEditorFenRef.current = fullUpdatedFen;
      setTempEditorFen(fullUpdatedFen);
      chessboardInstance.current?.setPosition(fullUpdatedFen, false);
    } catch (err) {
      console.error('Ошибка обновления поля в редакторе:', err);
    }
  };

  const handlePaletteDrop = (event) => {
    if (!isEditorMode) return;
    event.preventDefault();

    const fenChar = event.dataTransfer.getData('application/x-beechess-piece');
    if (!fenChar) return;

    const squareElement = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((element) => element.hasAttribute?.('data-square'));
    const square = squareElement?.getAttribute('data-square');
    if (square) setEditorSquare(square, fenChar);
  };

  const handleBoardClickForEditor = (e) => {
    if (!isEditorMode) return;
    // Это было перетаскивание фигуры, а не клик — не трогаем клетку
    const down = editorDownRef.current;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    // Режим перемещения: клик по доске ничего не стирает и не ставит
    if (selectedEditorPiece === null) return;

    const squareEl = e.target.closest?.('[data-square]');
    if (!squareEl) return;
    const square = squareEl.getAttribute('data-square');
    if (!square) return;

    const fenChar =
      selectedEditorPiece === EDITOR_ERASER
        ? null
        : PIECES_PALETTE.find((p) => p.piece === selectedEditorPiece)?.fenChar;
    setEditorSquare(square, fenChar || null);
  };

  const handleUpdateEditorSettings = (newTurn, newCastling) => {
    try {
      const updatedBoardOnly = updateFenBoard(tempEditorFen, () => {});
      const fullFen = buildFullFen(updatedBoardOnly, newTurn, newCastling);
      setTempEditorFen(fullFen);
      if (chessboardInstance.current) {
        chessboardInstance.current.setPosition(fullFen, false);
      }
    } catch (e) {
      console.error('Ошибка настроек позиции:', e);
    }
  };

  const handleClearBoard = () => {
    const boardOnly = '8/8/8/8/8/8/8/8';
    const fullFen = buildFullFen(boardOnly, editorTurn, editorCastling);
    setTempEditorFen(fullFen);
    if (chessboardInstance.current) {
      chessboardInstance.current.setPosition(fullFen, false);
    }
  };

  const handleResetEditor = () => {
    setEditorTurn('w');
    setEditorCastling('KQkq');
    setTempEditorFen(INITIAL_FEN);
    if (chessboardInstance.current) {
      chessboardInstance.current.setPosition(INITIAL_FEN, false);
    }
  };

  const handleSaveEditorPosition = async () => {
    const boardOnly = updateFenBoard(tempEditorFen, () => {});
    const rawFen = buildFullFen(boardOnly, editorTurn, editorCastling);
    const problem = validateEditorPosition(rawFen);
    if (problem) {
      window.alert(`Позицию нельзя сохранить: ${problem}`);
      return;
    }
    const finalFen = sanitizeCastlingInFen(rawFen);

    try {
      gameRef.current.load(finalFen, { skipValidation: true });
      if (chessboardInstance.current) {
        chessboardInstance.current.setPosition(finalFen, true);
      }

      const newTree = {
        root: {
          id: 'root',
          fen: finalFen,
          san: '',
          parentId: null,
          children: [],
          color: editorTurn,
        },
      };
      treeRef.current = newTree;
      currentIdRef.current = 'root';
      setTree(newTree);
      setCurrentId('root');
      setIsEditorMode(false);
      setSelectedEditorPiece(null);
      setActiveColor(editorTurn);

      await saveStateInstant({
        fen: finalFen,
        moveTree: newTree,
        currentNodeId: 'root',
        activeColor: editorTurn,
      });

      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'make_move',
          payload: {
            fen: finalFen,
            activeColor: editorTurn,
            moveTree: newTree,
            currentNodeId: 'root',
          },
        });
        channelRef.current.send({ type: 'broadcast', event: 'clear_drawings', payload: {} });
      }
    } catch (err) {
      console.error('Ошибка сохранения позиции:', err);
    }
  };

  useEffect(() => {
    if (chessboardInstance.current) {
      chessboardInstance.current.setOrientation(orientation);
    }
  }, [orientation]);

  useEffect(() => {
    const boardEl = boardRef.current;
    if (!boardEl) return;

    let isRightClicking = false;
    let startSquare = null;

    const blockStudentAnnotations = (e) => {
      const isRightMouseEvent = e.type === 'contextmenu' || e.button === 2;
      if (isTeacher || !isRightMouseEvent) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    const getSquareFromPoint = (x, y) => {
      const elements = document.elementsFromPoint(x, y);
      for (const el of elements) {
        const sq = el.getAttribute('data-square');
        if (sq) return sq;
      }
      return null;
    };

    const handleMouseDown = (e) => {
      if (!isTeacher) return;

      if (e.button === 2) {
        isRightClicking = true;
        startSquare = getSquareFromPoint(e.clientX, e.clientY);
      } else if (e.button === 0 && chessboardInstance.current && !isEditorModeRef.current) {
        chessboardInstance.current.removeMarkers(MARKER_TYPE.circle);
        chessboardInstance.current.removeArrows();
        if (channelRef.current) {
          channelRef.current.send({ type: 'broadcast', event: 'clear_drawings', payload: {} });
        }
      }
    };

    const handleMouseUp = (e) => {
      if (!isTeacher) return;

      if (e.button === 2 && isRightClicking && chessboardInstance.current) {
        const endSquare = getSquareFromPoint(e.clientX, e.clientY);

        if (
          isEditorModeRef.current &&
          e.ctrlKey &&
          startSquare &&
          endSquare &&
          startSquare === endSquare
        ) {
          e.preventDefault();
          try {
            const file = startSquare.charCodeAt(0) - 97;
            const rank = 8 - parseInt(startSquare[1]);
            const updated = updateFenBoard(tempEditorFenRef.current, (board) => {
              board[rank][file] = null;
            });
            const fullUpdatedFen = buildFullFen(updated, editorTurn, editorCastling);
            setTempEditorFen(fullUpdatedFen);
            chessboardInstance.current.setPosition(fullUpdatedFen, false);
          } catch {}
        } else if (!isEditorModeRef.current && startSquare && endSquare) {
          if (startSquare === endSquare) {
            const existing = chessboardInstance.current.getMarkers(
              MARKER_TYPE.circle,
              startSquare
            );
            const visible = existing.length === 0;
            if (visible)
              chessboardInstance.current.addMarker(MARKER_TYPE.circle, startSquare);
            else chessboardInstance.current.removeMarkers(MARKER_TYPE.circle, startSquare);

            channelRef.current?.send({
              type: 'broadcast',
              event: 'draw_annotation',
              payload: { kind: 'circle', square: startSquare, visible },
            });
          } else {
            const existing = chessboardInstance.current.getArrows(
              ARROW_TYPE.default,
              startSquare,
              endSquare
            );
            const visible = existing.length === 0;
            if (visible)
              chessboardInstance.current.addArrow(ARROW_TYPE.default, startSquare, endSquare);
            else
              chessboardInstance.current.removeArrows(
                ARROW_TYPE.default,
                startSquare,
                endSquare
              );

            channelRef.current?.send({
              type: 'broadcast',
              event: 'draw_annotation',
              payload: { kind: 'arrow', from: startSquare, to: endSquare, visible },
            });
          }
        }

        isRightClicking = false;
        startSquare = null;
      }
    };

    const handleContextMenu = (e) => {
      if (!isTeacher || !isEditorModeRef.current || e.ctrlKey) {
        e.preventDefault();
      }
    };

    boardEl.addEventListener('mousedown', blockStudentAnnotations, true);
    boardEl.addEventListener('mouseup', blockStudentAnnotations, true);
    boardEl.addEventListener('contextmenu', blockStudentAnnotations, true);
    boardEl.addEventListener('mousedown', handleMouseDown);
    boardEl.addEventListener('mouseup', handleMouseUp);
    boardEl.addEventListener('contextmenu', handleContextMenu);

    return () => {
      boardEl.removeEventListener('mousedown', blockStudentAnnotations, true);
      boardEl.removeEventListener('mouseup', blockStudentAnnotations, true);
      boardEl.removeEventListener('contextmenu', blockStudentAnnotations, true);
      boardEl.removeEventListener('mousedown', handleMouseDown);
      boardEl.removeEventListener('mouseup', handleMouseUp);
      boardEl.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isTeacher, editorTurn, editorCastling]);

  const copyInviteLink = () => {
    const inviteUrl = lesson?.isGroup
      ? `${window.location.origin}/?room=group-${lesson.id}`
      : `${window.location.origin}/?room=room-${lesson?.students?.id || lesson?.id || ''}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const deleteMoveBranch = (nodeId, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!isTeacher || !nodeId || nodeId === 'root' || tournamentRef.current?.status === 'running') return;

    const activeTree = treeRef.current;
    const nodeToDelete = activeTree[nodeId];
    const parentNode = activeTree[nodeToDelete?.parentId];
    if (!nodeToDelete || !parentNode) return;

    const idsToDelete = new Set();
    const collectBranch = (id) => {
      if (!id || idsToDelete.has(id) || !activeTree[id]) return;
      idsToDelete.add(id);
      (activeTree[id].children || []).forEach(collectBranch);
    };
    collectBranch(nodeId);

    const nextTree = { ...activeTree };
    idsToDelete.forEach((id) => delete nextTree[id]);
    nextTree[parentNode.id] = {
      ...parentNode,
      children: (parentNode.children || []).filter((id) => id !== nodeId),
    };

    const nextCurrentId = idsToDelete.has(currentIdRef.current)
      ? parentNode.id
      : currentIdRef.current;
    const nextCurrentNode = nextTree[nextCurrentId] || nextTree.root;

    treeRef.current = nextTree;
    currentIdRef.current = nextCurrentNode.id;
    setTree(nextTree);
    setCurrentId(nextCurrentNode.id);

    try {
      gameRef.current.load(nextCurrentNode.fen, { skipValidation: true });
      chessboardInstance.current?.setPosition(nextCurrentNode.fen, true);
    } catch (error) {
      console.error('Ошибка навигации после удаления хода:', error);
    }

    saveStateInstant({
      fen: nextCurrentNode.fen,
      moveTree: nextTree,
      currentNodeId: nextCurrentNode.id,
    });

    channelRef.current?.send({
      type: 'broadcast',
      event: 'make_move',
      payload: {
        fen: nextCurrentNode.fen,
        moveTree: nextTree,
        currentNodeId: nextCurrentNode.id,
      },
    });
  };

  const moveNotationContent = useMemo(() => {
    const rootNode = tree.root;
    if (!rootNode || !rootNode.children?.length) {
      return (
        <div className="p-4 text-center text-xs text-gray-400 font-sans">Пока нет ходов</div>
      );
    }

    const rootFenParts = (rootNode.fen || '').split(' ');
    const rootTurn = rootFenParts[1] || 'w';
    const rootMoveNumber = Math.max(1, Number.parseInt(rootFenParts[5], 10) || 1);
    const firstPly = (rootMoveNumber - 1) * 2 + (rootTurn === 'b' ? 1 : 0);

    const moveControl = (node, ply, isFirstInLine = false) => {
      const moveNumber = Math.floor(ply / 2) + 1;
      const prefix = ply % 2 === 0 ? `${moveNumber}.` : isFirstInLine ? `${moveNumber}...` : '';
      const selected = currentId === node.id;
      const className = `inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[12px] leading-none font-semibold transition ${
        selected ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-800 hover:bg-slate-200'
      }`;

      const content = (
        <>
          {prefix && (
            <span className={selected ? 'text-blue-100' : 'text-gray-400'}>{prefix}</span>
          )}
          <span>{formatSanWithIcons(node.san)}</span>
        </>
      );

      return isTeacher ? (
        <button
          key={node.id}
          onClick={() => jumpToNode(node.id)}
          onContextMenu={(event) => deleteMoveBranch(node.id, event)}
          title="Правый клик — удалить ход и продолжение"
          className={`${className} cursor-pointer`}
        >
          {content}
        </button>
      ) : (
        <span key={node.id} className={className}>
          {content}
        </span>
      );
    };

    const renderLine = (startNodeId, startPly, depth = 0, path = new Set()) => {
      const items = [];
      let nodeId = startNodeId;
      let ply = startPly;
      let firstInLine = true;
      const visited = new Set(path);

      while (nodeId && tree[nodeId] && !visited.has(nodeId)) {
        visited.add(nodeId);
        const node = tree[nodeId];
        items.push(moveControl(node, ply, firstInLine));

        const alternatives = (tree[node.parentId]?.children || []).filter(
          (id) => id !== nodeId
        );
        const isMainChoice = tree[node.parentId]?.children?.[0] === nodeId;

        if (isMainChoice && alternatives.length > 0) {
          alternatives.forEach((alternativeId, index) => {
            items.push(
              <div
                key={`variation-${node.parentId}-${alternativeId}-${index}`}
                className={`basis-full w-full my-1 py-1.5 pr-1 rounded-r-lg border-l-2 ${
                  depth === 0
                    ? 'pl-2 bg-amber-50/80 border-amber-400'
                    : 'pl-2 bg-slate-100 border-slate-300'
                }`}
              >
                <div className="flex flex-wrap items-center gap-0.5">
                  <span className="text-[10px] text-gray-400 mr-0.5">↳</span>
                  {renderLine(alternativeId, ply, depth + 1, new Set(visited))}
                </div>
              </div>
            );
          });
        }

        nodeId = node.children?.[0];
        ply += 1;
        firstInLine = false;
      }

      return items;
    };

    return (
      <div className="flex flex-wrap content-start items-center gap-x-0.5 gap-y-1 p-2 font-sans">
        {renderLine(rootNode.children[0], firstPly)}
      </div>
    );
  }, [tree, currentId, isTeacher, jumpToNode]);

  const standings = useMemo(() => computeStandings(tournament), [tournament]);
  const tablePair =
    tournament && gameCtx
      ? tournament.schedule[gameCtx.round - 1]?.pairings.find((p) => p.table === gameCtx.table)
      : null;

  if (!lesson) return <div className="p-8 text-center text-gray-500">Урок не выбран</div>;
  return (
    <div className="min-h-[calc(100vh-7rem)] bg-slate-100">
      {isTeacher && isMaterialsOpen && (
        <MaterialsLibrary
          onClose={() => setIsMaterialsOpen(false)}
          onOpenPosition={openMaterialPosition}
        />
      )}
      {pendingPromotion && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
            <h3 className="text-center text-base font-extrabold text-slate-900">
              Выберите фигуру
            </h3>
            <p className="mt-1 text-center text-xs text-slate-500">Превращение пешки</p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[
                { type: 'q', white: '♕', black: '♛', label: 'Ферзь' },
                { type: 'r', white: '♖', black: '♜', label: 'Ладья' },
                { type: 'b', white: '♗', black: '♝', label: 'Слон' },
                { type: 'n', white: '♘', black: '♞', label: 'Конь' },
              ].map((piece) => (
                <button
                  key={piece.type}
                  type="button"
                  onClick={() => choosePromotion(piece.type)}
                  title={piece.label}
                  className="flex aspect-square items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-5xl transition hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
                >
                  {pendingPromotion.color === 'w' ? piece.white : piece.black}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPendingPromotion(null)}
              className="mt-3 w-full rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200 cursor-pointer"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,660px)_minmax(220px,280px)_minmax(320px,1fr)] 2xl:grid-cols-[minmax(0,660px)_minmax(230px,280px)_minmax(360px,1fr)] gap-3 items-start">
        <section className="flex flex-col gap-3 min-w-0">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center text-xl shadow-sm shrink-0">
                🐝
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-black tracking-tight text-slate-900">
                    bee<span className="text-amber-500">chess</span>
                  </span>
                  <span className="text-gray-300">/</span>
                  <h2 className="text-sm font-bold text-gray-800 truncate">
                    {lesson.title || 'Шахматный урок'}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      canStudentMove ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                  <span className="text-[11px] text-gray-500">
                    {tournamentRunning
                      ? `${tournament.paused ? 'Пауза' : 'Идёт турнир'} — тур ${tournament.round} из ${tournament.totalRounds}`
                      : isObserver
                      ? 'Режим наблюдателя — управление отключено'
                      : canStudentMove
                      ? 'Ученик может ходить'
                      : 'Ходы ученика заблокированы'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isTeacher && (
                <>
                  <button
                    onClick={() => setIsMaterialsOpen(true)}
                    disabled={tournamentRunning}
                    className="px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    📚 Материалы
                  </button>
                  <button
                    onClick={toggleStudentAccess}
                    disabled={tournamentRunning}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      canStudentMove
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {canStudentMove ? '🔒 Запретить ходы' : '🟢 Разрешить ходы'}
                  </button>
                </>
              )}
              {!isObserver && (
                <button
                  onClick={copyInviteLink}
                  className="px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 cursor-pointer"
                >
                  {copied ? '✓ Скопировано' : '🔗 Ссылка'}
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-2 sm:p-3 flex flex-col items-start gap-3">
            {isTeacher && loadedMaterial && (
              <div className="flex w-full max-w-[660px] items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-blue-900">
                    📘 {loadedMaterial.topic}
                  </p>
                  <p className="text-[10px] text-blue-600">
                    Позиция {loadedMaterial.position_order} · {loadedMaterial.module}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLoadedMaterial(null)}
                  className="shrink-0 text-xs font-bold text-blue-500 hover:text-blue-700 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {tournament && gameCtx && tablePair && (
              <div
                className={`flex w-full max-w-[660px] flex-col gap-0.5 rounded-xl border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between ${
                  gameCtx.finished
                    ? 'border-slate-200 bg-slate-50 text-slate-700'
                    : gameCtx.myColor
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-blue-100 bg-blue-50 text-blue-900'
                }`}
              >
                <span className="font-bold">
                  {gameCtx.myColor
                    ? `${gameCtx.myColor === 'w' ? '⬜ Вы играете белыми' : '⬛ Вы играете чёрными'} против ${
                        gameCtx.myColor === 'w' ? tablePair.black.name : tablePair.white.name
                      }`
                    : `👁 Стол ${gameCtx.table}: ${tablePair.white.name} — ${tablePair.black.name}`}
                </span>
                <span className="font-semibold">
                  {gameCtx.finished && gameCtx.result
                    ? `${
                        gameCtx.myColor
                          ? `${describeMyResult(gameCtx.result, gameCtx.myColor)}: `
                          : 'Партия окончена: '
                      }${formatGameResult(gameCtx.result)}`
                    : `Тур ${gameCtx.round} · стол ${gameCtx.table}`}
                </span>
              </div>
            )}

            <div className="w-full max-w-[660px]">
              <div
                className={`relative w-full rounded-xl border border-gray-200 overflow-hidden shadow-inner ${
                  isEditorMode ? 'ring-2 ring-blue-500' : ''
                }`}
                style={{ paddingBottom: '100%' }}
              >
                <div
                  ref={boardRef}
                  onPointerDownCapture={(e) => {
                    editorDownRef.current = { x: e.clientX, y: e.clientY };
                  }}
                  onClick={handleBoardClickForEditor}
                  onDragOver={(event) => {
                    if (isEditorMode) event.preventDefault();
                  }}
                  onDrop={handlePaletteDrop}
                  className={`absolute inset-0 select-none ${
                    isEditorMode ? 'cursor-crosshair' : 'cursor-pointer'
                  }`}
                />
                {tournament && (countdown !== null || tournament.paused) && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/55">
                    {countdown !== null ? (
                      <>
                        <div className="text-sm font-bold uppercase tracking-widest text-amber-300">
                          Тур {tournament.round} начинается
                        </div>
                        <div
                          className={`font-black text-white drop-shadow ${
                            countdown === 0 ? 'text-6xl' : 'text-9xl'
                          }`}
                        >
                          {countdown === 0 ? 'Старт!' : countdown}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-6xl">⏸</div>
                        <div className="mt-2 text-lg font-black text-white">Пауза</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isTeacher && (
              <div className="w-full max-w-[660px] grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => {
                    if (tournamentRef.current?.status === 'running') return;
                    const nextMode = !isEditorMode;
                    if (nextMode) {
                      const currentFen = gameRef.current.fen();
                      setTempEditorFen(currentFen);
                      const parts = currentFen.split(' ');
                      if (parts[1]) setEditorTurn(parts[1]);
                      if (parts[2]) setEditorCastling(parts[2]);
                      chessboardInstance.current?.setPosition(currentFen, false);
                    }
                    setIsEditorMode(nextMode);
                    setSelectedEditorPiece(null);
                  }}
                  className={`py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    isEditorMode
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  ⚙️ Редактор позиции
                </button>
                <button
                  onClick={toggleBoardOrientation}
                  className="py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  🔄 Перевернуть доску
                </button>
                <div className="hidden sm:flex items-center justify-center rounded-xl bg-amber-50 text-amber-800 text-[11px] font-medium px-2">
                  ПКМ: круги и стрелки
                </div>
              </div>
            )}
          </div>

          {isTeacher && isEditorMode && (
            <div className="w-full bg-blue-50/90 border border-blue-200 p-4 rounded-2xl shadow-sm flex flex-col gap-3">
              <div className="flex justify-between items-center text-xs font-bold text-blue-900">
                <span>⚙️ Редактор позиции (перетаскивание)</span>
                <button
                  onClick={() => setIsEditorMode(false)}
                  className="text-red-600 hover:underline cursor-pointer"
                >
                  Отмена
                </button>
              </div>

              <div className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-medium text-center">
                Перетаскивайте фигуры мышью, ставьте их кликом по палитре, а удаляйте сочетанием{' '}
                <strong>Ctrl + ПКМ</strong>.
              </div>

              <div className="grid grid-cols-6 gap-1">
                {PIECES_PALETTE.map((item) => (
                  <button
                    key={item.piece}
                    type="button"
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'copy';
                      event.dataTransfer.setData('application/x-beechess-piece', item.fenChar);
                      setSelectedEditorPiece(item.piece);
                    }}
                    onClick={() =>
                      setSelectedEditorPiece(selectedEditorPiece === item.piece ? null : item.piece)
                    }
                    title={`${item.name}: перетащите на доску или выберите кликом`}
                    className={`flex aspect-square items-center justify-center rounded border bg-white p-0.5 cursor-grab active:cursor-grabbing hover:bg-gray-100 ${
                      selectedEditorPiece === item.piece
                        ? 'border-blue-600 ring-2 ring-blue-400'
                        : 'border-gray-200'
                    }`}
                  >
                    <ChessPieceIcon piece={item.piece} className="h-[82%] w-[82%]" />
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-1.5 bg-white p-2 rounded-lg border border-blue-100 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-700">Чей ход:</span>
                  <select
                    value={editorTurn}
                    onChange={(e) => {
                      const newT = e.target.value;
                      setEditorTurn(newT);
                      handleUpdateEditorSettings(newT, editorCastling);
                    }}
                    className="border border-gray-300 rounded px-1.5 py-0.5 bg-white font-medium cursor-pointer"
                  >
                    <option value="w">Белые</option>
                    <option value="b">Чёрные</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-gray-700">Права на рокировку:</span>
                  <div className="flex flex-wrap gap-2.5">
                    {[
                      { label: 'Белые O-O (K)', char: 'K' },
                      { label: 'Белые O-O-O (Q)', char: 'Q' },
                      { label: 'Чёрные O-O (k)', char: 'k' },
                      { label: 'Чёрные O-O-O (q)', char: 'q' },
                    ].map(({ label, char }) => {
                      const isChecked = editorCastling.includes(char);
                      return (
                        <label
                          key={char}
                          className="flex items-center gap-1 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              let nextC = editorCastling.replace('-', '');
                              if (e.target.checked) {
                                if (!nextC.includes(char)) nextC += char;
                              } else {
                                nextC = nextC.replace(char, '');
                              }
                              const finalC = nextC || '-';
                              setEditorCastling(finalC);
                              handleUpdateEditorSettings(editorTurn, finalC);
                            }}
                          />
                          {label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setSelectedEditorPiece(selectedEditorPiece === EDITOR_ERASER ? null : EDITOR_ERASER)
                  }
                  className={`flex-1 py-1 text-[11px] font-semibold rounded border cursor-pointer ${
                    selectedEditorPiece === EDITOR_ERASER
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-red-600 border-gray-200'
                  }`}
                >
                  🗑️ Ластик (или Ctrl + ПКМ)
                </button>
                <button
                  onClick={handleClearBoard}
                  className="px-2 py-1 bg-white border border-gray-200 rounded text-[11px] text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  Очистить доску
                </button>
                <button
                  onClick={handleResetEditor}
                  className="px-2 py-1 bg-white border border-gray-200 rounded text-[11px] text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  Начальная позиция
                </button>
              </div>
              <div className="text-[10px] text-gray-500 leading-snug">
                {selectedEditorPiece === null
                  ? 'Режим перемещения: фигуры на доске перетаскиваются. Выберите фигуру в палитре, чтобы ставить её кликом, или ластик, чтобы стирать.'
                  : selectedEditorPiece === EDITOR_ERASER
                  ? 'Ластик: клик по клетке стирает фигуру. Нажмите на ластик ещё раз, чтобы вернуться к перемещению.'
                  : 'Клик по клетке ставит выбранную фигуру. Нажмите на неё в палитре ещё раз, чтобы вернуться к перемещению.'}
              </div>

              <button
                onClick={handleSaveEditorPosition}
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shadow-sm cursor-pointer"
              >
                💾 Сохранить позицию
              </button>
            </div>
          )}

        </section>

        <section className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm flex flex-col h-[420px] xl:h-[calc(100vh-7rem)] xl:max-h-[760px] xl:min-h-[520px] font-mono select-none xl:sticky xl:top-20 min-w-0">
          <div className="flex justify-between items-center mb-2 px-1 gap-2">
            <h3 className="font-bold text-gray-900 text-sm font-sans whitespace-nowrap">📋 Список ходов</h3>
            {isTeacher && (
              <span className="text-[9px] text-gray-400 font-sans text-right">
                ← → навигация<br />ПКМ — удалить
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl bg-white">
            {moveNotationContent}
          </div>
          {isTeacher && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => tree[currentId]?.parentId && jumpToNode(tree[currentId].parentId)}
                disabled={!tree[currentId]?.parentId}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg text-xs font-bold cursor-pointer font-sans"
              >
                ‹ Назад
              </button>
              <button
                onClick={() => tree[currentId]?.children?.[0] && jumpToNode(tree[currentId].children[0])}
                disabled={!tree[currentId]?.children?.length}
                className="py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg text-xs font-bold cursor-pointer font-sans"
              >
                Вперёд ›
              </button>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-3 xl:sticky xl:top-20 min-w-0">
          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex justify-between items-center px-1 mb-2">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">📹 Видеоурок</h3>
                <p className="text-[10px] text-gray-400">Защищённая комната beeChess</p>
              </div>
              <button
                onClick={() => setIsVideoOpen(!isVideoOpen)}
                className="text-xs text-blue-600 font-semibold cursor-pointer"
              >
                {isVideoOpen ? 'Свернуть' : 'Развернуть'}
              </button>
            </div>
            {isVideoOpen ? (
              <div className="w-full h-[260px] lg:h-[280px] xl:h-[340px] 2xl:h-[380px] bg-gray-900 rounded-xl overflow-hidden border border-gray-200">
                <VideoRoom lesson={lesson} isObserver={isObserver} isTeacher={isTeacher} />
              </div>
            ) : (
              <div className="h-20 flex items-center justify-center bg-slate-50 rounded-xl text-xs text-gray-500">
                Видео свёрнуто
              </div>
            )}
          </div>

          <div className="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm font-mono select-none">
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`px-3 py-2.5 rounded-xl transition-all ${
                  activeColor === 'w' && clockStarted
                    ? 'bg-amber-50 text-gray-900 ring-2 ring-amber-400'
                    : 'bg-slate-100 text-gray-700'
                }`}
              >
                <div className="text-[10px] font-sans font-bold text-gray-500 mb-0.5 truncate">⬜ {tablePair ? tablePair.white.name : 'БЕЛЫЕ'}</div>
                <span ref={setWhiteClockEl} className="text-xl font-black tracking-wider" />
              </div>
              <div
                className={`px-3 py-2.5 rounded-xl transition-all ${
                  activeColor === 'b' && clockStarted
                    ? 'bg-slate-900 text-white ring-2 ring-amber-400'
                    : 'bg-slate-100 text-gray-700'
                }`}
              >
                <div
                  className={`text-[10px] font-sans font-bold mb-0.5 truncate ${
                    activeColor === 'b' && clockStarted ? 'text-gray-300' : 'text-gray-500'
                  }`}
                >
                  ⬛ {tablePair ? tablePair.black.name : 'ЧЁРНЫЕ'}
                </div>
                <span ref={setBlackClockEl} className="text-xl font-black tracking-wider" />
              </div>
            </div>

            {isTeacher && !tournamentRunning && (
              <div className="grid grid-cols-4 gap-1.5 mt-2 text-[11px] font-sans">
                <button
                  onClick={() => setTimeControl(3, 2)}
                  className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold cursor-pointer"
                >
                  3+2
                </button>
                <button
                  onClick={() => setTimeControl(10, 5)}
                  className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold cursor-pointer"
                >
                  10+5
                </button>
                <button
                  onClick={() => setTimeControl(30, 15)}
                  className="py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold cursor-pointer"
                >
                  30+15
                </button>
                <button
                  onClick={toggleClockStart}
                  className={`py-1.5 rounded-lg font-bold text-white cursor-pointer ${
                    clockStarted
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {clockStarted ? 'Стоп' : 'Старт'}
                </button>
              </div>
            )}
          </div>

          {/* Панель кругового турнира */}
          <TournamentPanel
            isTeacher={isTeacher}
            isObserver={isObserver}
            tournament={tournament}
            standings={standings}
            settings={tournamentSettings}
            onSettingsChange={setTournamentSettings}
            participantCount={lessonParticipants.length}
            lobbyPlayers={lobbyPlayers}
            lobbyJoined={lobbyJoined}
            onToggleJoin={toggleLobby}
            currentUserId={currentUser?.id}
            gameCtx={gameCtx}
            onStart={startTournament}
            onAbort={abortTournament}
            onNewTournament={endTournament}
            onResign={resignTournamentGame}
            onWatchTable={watchTournamentTable}
            onPause={pauseTournament}
            onResume={resumeTournament}
            countdownActive={countdown !== null}
          />
        </aside>
      </div>
    </div>
  );
};