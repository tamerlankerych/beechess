// src/BotMatchModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { getBotMove } from './BotEngine';
import BotAvatar from './BotAvatar';

const getPieceColor = (piece) => {
  if (!piece) return null;
  if (typeof piece === 'string') return piece[0] || null;
  if (typeof piece.pieceType === 'string') return piece.pieceType[0];
  return null;
};

export default function BotMatchModal({
  bot,
  onClose,
  onGameEnd,
  nextBot = null,
  onPlayNext,
}) {
  const [game, setGame] = useState(() => new Chess());
  const [playerColor, setPlayerColor] = useState('w');
  const [phase, setPhase] = useState('setup');
  const [thinking, setThinking] = useState(false);
  const [speechText, setSpeechText] = useState(bot.speech?.start || 'Погнали!');
  const [outcome, setOutcome] = useState(null);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [promotionPending, setPromotionPending] = useState(null);

  // ЗВУКИ ХОДОВ
  const sounds = useRef({
    move: new Audio('/sounds/Move.mp3'),
    capture: new Audio('/sounds/Capture.mp3'),
    check: new Audio('/sounds/Check.mp3'),
  });

  // ФОНОВАЯ МУЗЫКА
  const bgmAudio = useRef(null);

  useEffect(() => {
    // Предзагрузка звуков ходов
    Object.values(sounds.current).forEach((audio) => {
      audio.preload = 'auto';
      audio.load();
    });

    // Создаем фоновую музыку, если она есть
    if (bot.bgm) {
      bgmAudio.current = new Audio(bot.bgm);
      bgmAudio.current.loop = true; // Зацикливаем
      bgmAudio.current.volume = 0.3; // Делаем потише (30%), чтобы не перебивать ходы
    }

    // Очистка при закрытии модалки
    return () => {
      if (bgmAudio.current) {
        bgmAudio.current.pause();
        bgmAudio.current.currentTime = 0;
      }
    };
  }, [bot.bgm]);

  const playMoveSound = (isCapture, isCheck) => {
    let audio = sounds.current.move;
    if (isCheck) {
      audio = sounds.current.check;
      audio.currentTime = 0.2; 
    } else if (isCapture) {
      audio = sounds.current.capture;
      audio.currentTime = 0;
    } else {
      audio.currentTime = 0;
    }
    if (audio) {
      audio.play().catch(() => {
        if (isCheck) {
          const fallback = sounds.current.capture;
          if (fallback) { fallback.currentTime = 0; fallback.play().catch(() => {}); }
        }
      });
    }
  };

  const updateSpeech = (text) => {
    setSpeechText(text);
  };

  const startGame = (choice) => {
    const color = choice === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : choice;
    const newGame = new Chess();

    setPlayerColor(color);
    setGame(newGame);
    setOutcome(null);
    setThinking(false);
    setSelectedSquare(null);
    setPromotionPending(null);
    
    updateSpeech(bot.speech?.start || 'Погнали!');
    setPhase('playing');

    // Запускаем музыку (сработает, т.к. был клик по кнопке)
    if (bgmAudio.current) {
      bgmAudio.current.currentTime = 0;
      bgmAudio.current.play().catch(e => console.warn('Музыка заблокирована браузером:', e));
    }

    if (color === 'b') {
      triggerBotMove(newGame);
    }
  };

  const triggerBotMove = (currentGame) => {
    if (currentGame.isGameOver()) return;

    setThinking(true);
    setTimeout(() => {
      try {
        const botMove = getBotMove(currentGame.fen(), bot.elo);
        if (!botMove) return;

        const gameCopy = new Chess(currentGame.fen());
        const result = gameCopy.move({
          from: botMove.from,
          to: botMove.to,
          promotion: botMove.promotion,
        });

        if (result) {
          playMoveSound(!!result.captured, gameCopy.isCheck());
          setGame(gameCopy);
          
          if (gameCopy.isGameOver()) {
            handleGameOver(gameCopy);
          } else if (botMove.blunder) {
            updateSpeech(bot.speech?.blunder || 'Ой!');
          } else if (result.captured) {
            updateSpeech(bot.speech?.capture || 'Ха!');
          }
        }
      } catch (err) {
        console.error('Ошибка хода бота:', err);
      } finally {
        setThinking(false);
      }
    }, 400);
  };

  const executeMove = (from, to, promotionPiece) => {
    const gameCopy = new Chess(game.fen());
    try {
      const move = gameCopy.move({ from, to, promotion: promotionPiece });
      if (move === null) return false;

      playMoveSound(!!move.captured, gameCopy.isCheck());
      setGame(gameCopy);
      setSelectedSquare(null);
      setPromotionPending(null);

      if (gameCopy.isGameOver()) {
        handleGameOver(gameCopy);
        return true;
      }
      triggerBotMove(gameCopy);
      return true;
    } catch (e) {
      return false;
    }
  };

  const tryPlayerMove = (sourceSquare, targetSquare) => {
    if (thinking || game.isGameOver() || game.turn() !== playerColor) return false;

    const gameCopy = new Chess(game.fen());
    try {
      const piece = gameCopy.get(sourceSquare);
      const isPromotion = piece?.type === 'p' && (targetSquare[1] === '8' || targetSquare[1] === '1');

      if (isPromotion) {
        setPromotionPending({ from: sourceSquare, to: targetSquare, color: playerColor });
        return false;
      }
      return executeMove(sourceSquare, targetSquare);
    } catch (e) {
      return false;
    }
  };

  const onPieceDrop = ({ sourceSquare, targetSquare }) => tryPlayerMove(sourceSquare, targetSquare);

  const onSquareClick = ({ square, piece }) => {
    if (promotionPending || thinking || game.isGameOver() || game.turn() !== playerColor) return;
    const pieceColor = getPieceColor(piece);

    if (selectedSquare) {
      if (selectedSquare !== square) {
        const ok = tryPlayerMove(selectedSquare, square);
        if (!ok) setSelectedSquare(pieceColor === playerColor ? square : null);
      } else {
        setSelectedSquare(null);
      }
    } else if (pieceColor === playerColor) {
      setSelectedSquare(square);
    }
  };

  const legalMovesForSelected = (() => {
    if (!selectedSquare || promotionPending) return [];
    return game.moves({ square: selectedSquare, verbose: true });
  })();

  const handleGameOver = (finalGame) => {
    let kind = 'draw';
    let text = 'Ничья!';
    if (finalGame.isCheckmate()) {
      const winner = finalGame.turn() === 'w' ? 'b' : 'w';
      kind = winner === playerColor ? 'win' : 'loss';
      text = kind === 'win' ? 'Мат! Ты победил! 🎉' : 'Мат. Бот победил.';
    }
    setOutcome({ kind, text });
    setPhase('over');
    
    updateSpeech(kind === 'win' ? bot.speech?.lose || 'Хорошая игра!' : bot.speech?.win || 'Я победил!');
    
    // Выключаем фоновую музыку при завершении игры
    if (bgmAudio.current) {
      bgmAudio.current.pause();
    }

    onGameEnd?.({ botId: bot.id, result: kind });
  };

  const handleResign = () => {
    if (!window.confirm('Сдаться и закончить партию?')) return;
    setOutcome({ kind: 'loss', text: 'Ты сдался.' });
    setPhase('over');
    if (bgmAudio.current) bgmAudio.current.pause();
    onGameEnd?.({ botId: bot.id, result: 'loss' });
  };

  // Обертка для onClose, чтобы точно остановить музыку
  const handleClose = () => {
    if (bgmAudio.current) {
      bgmAudio.current.pause();
    }
    onClose();
  };

  const myTurn = phase === 'playing' && !thinking && game.turn() === playerColor && !promotionPending;

  const squareStyles = {};
  if (selectedSquare) {
    squareStyles[selectedSquare] = { backgroundColor: 'rgba(250, 204, 21, 0.45)' };
  }
  legalMovesForSelected.forEach((move) => {
    if (!squareStyles[move.to]) {
      const isCapture = !!move.captured;
      squareStyles[move.to] = {
        background: isCapture
          ? 'radial-gradient(circle, transparent 60%, rgba(0,0,0,0.35) 62%)'
          : 'radial-gradient(circle, rgba(0,0,0,0.35) 22%, transparent 24%)',
        borderRadius: '50%',
      };
    }
  });

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-2xl w-full p-5 sm:p-6 text-white shadow-2xl relative my-auto">
        
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <BotAvatar bot={bot} size={52} />
            <div>
              <h2 className="text-xl font-black">{bot.name}</h2>
              <span className="text-xs text-indigo-400">ELO {bot.elo} • {bot.title}</span>
            </div>
          </div>
          <button onClick={handleClose} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer">
            ✕ Выйти
          </button>
        </div>

        <div className="bg-slate-800/80 border border-indigo-500/30 rounded-2xl p-3 mb-4 flex items-center gap-3">
          <span className="text-2xl">💬</span>
          <p className="text-sm text-indigo-200 italic">«{speechText}»</p>
        </div>

        {phase === 'setup' ? (
          <div className="text-center py-6">
            <p className="text-slate-300 mb-1 font-semibold">За кого играешь?</p>
            <p className="text-slate-500 text-xs mb-5">{bot.description}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => startGame('w')} className="px-5 py-3 rounded-xl bg-slate-100 text-slate-900 font-bold hover:bg-white active:scale-95 transition cursor-pointer">⬜ Белые</button>
              <button onClick={() => startGame('b')} className="px-5 py-3 rounded-xl bg-slate-950 border border-slate-600 text-white font-bold hover:bg-black active:scale-95 transition cursor-pointer">⬛ Чёрные</button>
              <button onClick={() => startGame('r')} className="px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold hover:from-indigo-500 hover:to-violet-500 active:scale-95 transition cursor-pointer">🎲 Случайно</button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative w-full max-w-[min(90vw,560px)] mx-auto aspect-square mb-4">
              <Chessboard
                options={{
                  position: game.fen(),
                  boardOrientation: playerColor === 'w' ? 'white' : 'black',
                  allowDragging: myTurn,
                  onPieceDrop,
                  onSquareClick,
                  animationDurationInMs: 200,
                  boardStyle: { borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' },
                  darkSquareStyle: { backgroundColor: '#4a5568' },
                  lightSquareStyle: { backgroundColor: '#cbd5e0' },
                  squareStyles,
                }}
              />

              {promotionPending && (
                <div className="absolute inset-0 z-50 bg-black/60 rounded-2xl flex flex-col items-center justify-center backdrop-blur-sm">
                  <p className="text-white font-bold text-lg mb-4">Выберите фигуру:</p>
                  <div className="flex gap-3">
                    {[{ type: 'q', label: '♕' }, { type: 'r', label: '♖' }, { type: 'b', label: '♗' }, { type: 'n', label: '♘' }].map((p) => (
                      <button key={p.type} onClick={() => executeMove(promotionPending.from, promotionPending.to, p.type)} className="w-16 h-16 bg-white rounded-xl shadow-lg text-4xl flex items-center justify-center text-slate-900 hover:bg-amber-100 hover:scale-110 transition cursor-pointer">
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="text-center font-medium text-sm min-h-[1.5rem]">
              {thinking ? (
                <span className="text-indigo-400 animate-pulse">🤖 {bot.name} думает над ходом...</span>
              ) : phase === 'over' ? (
                <span className={outcome?.kind === 'win' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>{outcome?.text}</span>
              ) : (
                <span className="text-slate-300">{myTurn ? 'Твой ход' : 'Ход соперника'}</span>
              )}
            </div>

            {phase === 'over' && outcome?.kind === 'win' && nextBot && (
              <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <div className="text-center text-sm font-bold text-emerald-300 mb-2">🔓 Открыт новый соперник: {nextBot.name}!</div>
                {onPlayNext && (
                  <button onClick={onPlayNext} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold transition cursor-pointer">
                    ⚔️ Сыграть с {nextBot.name}
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-center gap-3">
              {phase === 'playing' && (
                <button onClick={handleResign} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold transition cursor-pointer">🏳 Сдаться</button>
              )}
              {phase === 'over' && (
                <>
                  <button onClick={() => setPhase('setup')} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold transition cursor-pointer">⚔️ Реванш</button>
                  <button onClick={handleClose} className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold transition cursor-pointer">К списку ботов</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}