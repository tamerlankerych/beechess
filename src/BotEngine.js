// src/BotEngine.js
import { Chess } from 'chess.js';

/**
 * Шахматный движок для ботов Bot Arena.
 *
 * Сила зависит от ELO бота:
 *  - глубина поиска (сколько ходов вперёд он «видит»),
 *  - «шум» оценки: слабый бот выбирает не лучший, а один из «неплохих» ходов,
 *  - шанс полного зевка: случайный ход вместо расчёта.
 * Сильные боты видят вилки, жертвы, мат в несколько ходов и почти не зевают.
 *
 * Поиск ограничен по времени, поэтому не «вешает» вкладку.
 */

const MATE = 100000;
const INF = 1000000;
const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

// Таблицы «выгодности» клеток для фигуры. Индекс 0 = a8 (взгляд за белых).
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

const KING_ENDGAME = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

// Профили силы: глубина, глубина добора взятий, шанс зевка, «шум» оценки (сантипешки), лимит времени
const PROFILES = [
  { maxElo: 700, depth: 1, qDepth: 0, blunder: 0.35, noise: 150, timeMs: 200 },
  { maxElo: 1100, depth: 2, qDepth: 0, blunder: 0.2, noise: 80, timeMs: 400 },
  { maxElo: 1500, depth: 2, qDepth: 2, blunder: 0.1, noise: 40, timeMs: 700 },
  { maxElo: 1900, depth: 3, qDepth: 3, blunder: 0.03, noise: 15, timeMs: 1000 },
  { maxElo: Infinity, depth: 4, qDepth: 4, blunder: 0, noise: 6, timeMs: 1600 },
];

export const getProfile = (elo) =>
  PROFILES.find((p) => elo <= p.maxElo) || PROFILES[PROFILES.length - 1];

const TIME_UP = { timeUp: true };

/* ---------------- Оценка позиции (для стороны, чей ход) ---------------- */
const evaluate = (game) => {
  const board = game.board();
  let nonPawn = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (sq && sq.type !== 'p' && sq.type !== 'k') nonPawn += VALUE[sq.type];
    }
  }
  const endgame = nonPawn <= 2600;

  let score = 0; // с точки зрения белых
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (!sq) continue;
      const idx = sq.color === 'w' ? r * 8 + f : (7 - r) * 8 + f;
      const table = sq.type === 'k' && endgame ? KING_ENDGAME : PST[sq.type];
      const value = VALUE[sq.type] + table[idx];
      score += sq.color === 'w' ? value : -value;
    }
  }
  return game.turn() === 'w' ? score : -score;
};

// Сначала взятия (старшая жертва / младший нападающий), превращения и шахи
const orderMoves = (moves) => {
  for (const m of moves) {
    let s = 0;
    if (m.captured) s += 1000 + 10 * VALUE[m.captured] - VALUE[m.piece] / 10;
    if (m.promotion) s += 800;
    if (m.san.endsWith('+') || m.san.endsWith('#')) s += 50;
    m._order = s;
  }
  moves.sort((a, b) => b._order - a._order);
  return moves;
};

const play = (game, m) => game.move({ from: m.from, to: m.to, promotion: m.promotion });

const checkTime = (ctx) => {
  ctx.nodes += 1;
  if ((ctx.nodes & 127) === 0 && Date.now() > ctx.deadline) throw TIME_UP;
};

/* ---------------- Добор взятий (чтобы не «зевать» в конце расчёта) ---------------- */
const quiesce = (game, alpha, beta, qDepth, ctx) => {
  checkTime(ctx);
  const standPat = evaluate(game);
  if (qDepth <= 0) return standPat;
  if (standPat >= beta) return beta;
  if (standPat > alpha) alpha = standPat;

  const moves = orderMoves(game.moves({ verbose: true }).filter((m) => m.captured || m.promotion));
  for (const m of moves) {
    play(game, m);
    const score = -quiesce(game, -beta, -alpha, qDepth - 1, ctx);
    game.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
};

/* ---------------- Основной поиск (negamax + alpha-beta) ---------------- */
const negamax = (game, depth, alpha, beta, ply, ctx) => {
  checkTime(ctx);

  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return game.isCheck() ? -MATE + ply : 0; // мат или пат
  if (game.isInsufficientMaterial()) return 0;

  if (depth <= 0) {
    // Под шахом не останавливаемся — иначе можно пропустить мат
    if (game.isCheck() && ply < ctx.maxPly) depth = 1;
    else return quiesce(game, alpha, beta, ctx.qDepth, ctx);
  }

  orderMoves(moves);
  let best = -INF;
  for (const m of moves) {
    play(game, m);
    const score = -negamax(game, depth - 1, -beta, -alpha, ply + 1, ctx);
    game.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
};

// Поиск на корне: возвращает оценки всех ходов, которые лежат в «окне шума» от лучшего
const searchRoot = (game, depth, ctx, noise, firstKey) => {
  const moves = orderMoves(game.moves({ verbose: true }));
  if (firstKey) {
    const i = moves.findIndex((m) => m.from + m.to + (m.promotion || '') === firstKey);
    if (i > 0) moves.unshift(moves.splice(i, 1)[0]);
  }

  let bestScore = -INF;
  const scored = [];
  for (const m of moves) {
    play(game, m);
    const alpha = bestScore === -INF ? -INF : bestScore - noise - 1;
    const score = -negamax(game, depth - 1, -INF, -alpha, 1, ctx);
    game.undo();
    if (alpha === -INF || score > alpha) {
      scored.push({ move: m, score });
      if (score > bestScore) bestScore = score;
    }
  }
  return { scored, bestScore };
};

const toResult = (m, extra) => ({
  from: m.from,
  to: m.to,
  promotion: m.promotion,
  san: m.san,
  captured: m.captured || null,
  ...extra,
});

/**
 * Возвращает ход бота для позиции fen при заданном ELO.
 * { from, to, promotion, san, captured, blunder, score, depth } или null, если ходов нет.
 */
export const getBotMove = (fen, elo) => {
  const profile = getProfile(elo);
  const root = new Chess(fen);
  const legal = root.moves({ verbose: true });
  if (legal.length === 0) return null;
  if (legal.length === 1) return toResult(legal[0], { blunder: false, score: 0, depth: 0 });

  // Случайный зевок для слабых ботов
  if (Math.random() < profile.blunder) {
    const m = legal[Math.floor(Math.random() * legal.length)];
    return toResult(m, { blunder: true, score: 0, depth: 0 });
  }

  const deadline = Date.now() + profile.timeMs;
  let best = null;
  let firstKey = null;

  for (let depth = 1; depth <= profile.depth; depth++) {
    // Новая доска на каждую глубину: при тайм-ауте поиск обрывается «на середине хода»
    const game = new Chess(fen);
    const ctx = { nodes: 0, deadline, qDepth: profile.qDepth, maxPly: depth + 4 };
    try {
      const result = searchRoot(game, depth, ctx, profile.noise, firstKey);
      best = { ...result, depth };
      const top = result.scored.reduce((a, b) => (b.score > a.score ? b : a));
      firstKey = top.move.from + top.move.to + (top.move.promotion || '');
      if (Math.abs(result.bestScore) > MATE - 1000) break; // нашёл мат — дальше считать не нужно
    } catch (e) {
      if (e === TIME_UP) break;
      throw e;
    }
  }

  if (!best || best.scored.length === 0) {
    // Не успел даже глубину 1 — берём самый «разумный» ход по сортировке
    const m = orderMoves(legal)[0];
    return toResult(m, { blunder: false, score: 0, depth: 0 });
  }

  // Выбор среди ходов в «окне шума»; найденный мат берём всегда
  const { scored, bestScore } = best;
  const pool =
    bestScore > MATE - 1000
      ? scored.filter((s) => s.score === bestScore)
      : scored.filter((s) => s.score >= bestScore - profile.noise);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return toResult(pick.move, { blunder: false, score: pick.score, depth: best.depth });
};
