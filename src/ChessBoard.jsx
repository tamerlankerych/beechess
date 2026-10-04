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

const INITIAL_TREE = {
  root: {
    id: 'root',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
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

const playSound = (type) => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
    // Звук не обязателен
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
  const parts = (
    currentFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  ).split(' ');
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
  const tempEditorFenRef = useRef(tempEditorFen);
  const selectedEditorPieceRef = useRef(selectedEditorPiece);
  const editorTurnRef = useRef(editorTurn);
  const editorCastlingRef = useRef(editorCastling);

  useEffect(() => {
    currentIdRef.current = currentId;
    treeRef.current = tree;
    timerWRef.current = timerW;
    timerBRef.current = timerB;
    activeColorRef.current = activeColor;
    clockStartedRef.current = clockStarted;
    incrementMsRef.current = incrementMs;
    canStudentMoveRef.current = canStudentMove;
    isEditorModeRef.current = isEditorMode;
    tempEditorFenRef.current = tempEditorFen;
    selectedEditorPieceRef.current = selectedEditorPiece;
    editorTurnRef.current = editorTurn;
    editorCastlingRef.current = editorCastling;

    if (whiteClockDomRef.current) whiteClockDomRef.current.textContent = formatTime(timerW);
    if (blackClockDomRef.current) blackClockDomRef.current.textContent = formatTime(timerB);
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
  ]);

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
      }, 5000);
    },
    [lesson?.id, lesson?.title]
  );

  const toggleStudentAccess = () => {
    const nextState = !canStudentMove;
    setCanStudentMove(nextState);
    canStudentMoveRef.current = nextState;
    saveState(gameRef.current.fen(), nextState);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'student_access',
      payload: { canStudentMove: nextState },
    });
  };

  useEffect(() => {
    if (!clockStarted) return;

    const tickInterval = setInterval(() => {
      if (activeColorRef.current === 'w') {
        timerWRef.current = Math.max(0, timerWRef.current - 100);
        if (whiteClockDomRef.current) {
          whiteClockDomRef.current.textContent = formatTime(timerWRef.current);
        }
        if (timerWRef.current <= 0) {
          clockStartedRef.current = false;
          setClockStarted(false);
          setTimerW(0);
          if (isTeacher) {
            saveState(gameRef.current.fen(), canStudentMoveRef.current);
            channelRef.current?.send({
              type: 'broadcast',
              event: 'clock_state',
              payload: {
                timerW: 0,
                timerB: timerBRef.current,
                incrementMs: incrementMsRef.current,
                activeColor: activeColorRef.current,
                clockStarted: false,
              },
            });
          }
        }
      } else {
        timerBRef.current = Math.max(0, timerBRef.current - 100);
        if (blackClockDomRef.current) {
          blackClockDomRef.current.textContent = formatTime(timerBRef.current);
        }
        if (timerBRef.current <= 0) {
          clockStartedRef.current = false;
          setClockStarted(false);
          setTimerB(0);
          if (isTeacher) {
            saveState(gameRef.current.fen(), canStudentMoveRef.current);
            channelRef.current?.send({
              type: 'broadcast',
              event: 'clock_state',
              payload: {
                timerW: timerWRef.current,
                timerB: 0,
                incrementMs: incrementMsRef.current,
                activeColor: activeColorRef.current,
                clockStarted: false,
              },
            });
          }
        }
      }
    }, 100);

    const syncInterval = setInterval(() => {
      setTimerW(timerWRef.current);
      setTimerB(timerBRef.current);
    }, 1000);

    return () => {
      clearInterval(tickInterval);
      clearInterval(syncInterval);
    };
  }, [clockStarted, isTeacher, saveState]);

  const setTimeControl = (minutes, incSeconds) => {
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

    saveState(gameRef.current.fen(), canStudentMove, {
      timer_w: totalMs,
      timer_b: totalMs,
      increment_ms: incMs,
      active_color: 'w',
      clock_started: false,
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

    channelRef.current?.send({
      type: 'broadcast',
      event: 'board_orientation',
      payload: { orientation: nextOrientation },
    });
  };

  const openMaterialPosition = async (material) => {
    if (!isTeacher || !material?.setup_fen) return;

    try {
      const preparedGame = new Chess(material.setup_fen, { skipValidation: true });
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

      await saveState(preparedFen, canStudentMoveRef.current, {
        moveTree: nextTree,
        currentNodeId: 'root',
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
      console.error('Не удалось открыть учебную позицию:', error);
      window.alert('Позиция повреждена и не может быть открыта.');
    }
  };

  const jumpToNode = useCallback(
    (nodeId) => {
      const targetNode = treeRef.current[nodeId];
      if (!targetNode) return;
      currentIdRef.current = nodeId;
      setCurrentId(nodeId);
      try {
        gameRef.current.load(targetNode.fen, { skipValidation: true });
        if (chessboardInstance.current) {
          chessboardInstance.current.setPosition(targetNode.fen, true);
        }

        saveState(targetNode.fen, canStudentMoveRef.current, {
          moveTree: treeRef.current,
          currentNodeId: nodeId,
        });

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
    [saveState]
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

      if (whiteClockDomRef.current) whiteClockDomRef.current.textContent = formatTime(nextW);
      if (blackClockDomRef.current) blackClockDomRef.current.textContent = formatTime(nextB);

      if (chessboardInstance.current) {
        chessboardInstance.current.removeMarkers();
        chessboardInstance.current.removeArrows();
      }

      return { moveTree: nextTree, currentNodeId: nextCurrentId };
    },
    []
  );

  const executeMove = useCallback(
    (from, to, promotion = 'q') => {
      try {
        const move = gameRef.current.move({ from, to, promotion });
        if (!move) return false;

        const newFen = gameRef.current.fen();
        const sharedMoveState = applyRemoteMove(move, newFen);
        saveState(newFen, canStudentMoveRef.current, sharedMoveState);

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
    [applyRemoteMove, saveState]
  );

  const choosePromotion = (promotion) => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    executeMove(from, to, promotion);
  };
  useEffect(() => {
    if (!boardRef.current || !lesson?.id) return;

    const initialFen =
      lesson.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const initialTree = lesson.move_tree?.root
      ? lesson.move_tree
      : {
          root: {
            id: 'root',
            fen: initialFen,
            san: '',
            parentId: null,
            children: [],
            color: initialFen.split(' ')[1] || 'w',
          },
        };
    const initialCurrentId = initialTree[lesson.current_node_id]
      ? lesson.current_node_id
      : 'root';

    treeRef.current = initialTree;
    currentIdRef.current = initialCurrentId;
    setTree(initialTree);
    setCurrentId(initialCurrentId);

    try {
      gameRef.current.load(initialFen, { skipValidation: true });
    } catch {
      gameRef.current.reset();
    }

    let restoredTimerW = lesson.timer_w ?? 600000;
    let restoredTimerB = lesson.timer_b ?? 600000;
    let restoredClockStarted = lesson.clock_started ?? false;
    const restoredActiveColor = lesson.active_color || 'w';
    const restoredIncrementMs = lesson.increment_ms ?? 5000;

    if (restoredClockStarted && lesson.clock_updated_at) {
      const elapsedMs = Math.max(
        0,
        Date.now() - new Date(lesson.clock_updated_at).getTime()
      );
      if (restoredActiveColor === 'w')
        restoredTimerW = Math.max(0, restoredTimerW - elapsedMs);
      else restoredTimerB = Math.max(0, restoredTimerB - elapsedMs);

      if (restoredTimerW <= 0 || restoredTimerB <= 0) restoredClockStarted = false;
    }

    timerWRef.current = restoredTimerW;
    timerBRef.current = restoredTimerB;
    incrementMsRef.current = restoredIncrementMs;
    activeColorRef.current = restoredActiveColor;
    clockStartedRef.current = restoredClockStarted;
    setTimerW(restoredTimerW);
    setTimerB(restoredTimerB);
    setIncrementMs(restoredIncrementMs);
    setActiveColor(restoredActiveColor);
    setClockStarted(restoredClockStarted);
    if (lesson.can_student_move !== undefined) {
      setCanStudentMove(lesson.can_student_move);
      canStudentMoveRef.current = lesson.can_student_move;
    }

    if (chessboardInstance.current) {
      chessboardInstance.current.destroy();
    }

    try {
      chessboardInstance.current = new Chessboard(boardRef.current, {
        position: gameRef.current.fen(),
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

      chessboardInstance.current.enableMoveInput((event) => {
        if (isEditorModeRef.current) {
          if (event.type === 'moveInputStarted') return true;
          if (event.type === 'moveInputFinished' && event.squareFrom && !event.squareTo) {
            const fromFile = event.squareFrom.charCodeAt(0) - 97;
            const fromRank = 8 - parseInt(event.squareFrom[1]);
            const updated = updateFenBoard(tempEditorFenRef.current, (board) => {
              board[fromRank][fromFile] = null;
            });
            const fullUpdatedFen = buildFullFen(
              updated,
              editorTurnRef.current,
              editorCastlingRef.current
            );
            tempEditorFenRef.current = fullUpdatedFen;
            setTempEditorFen(fullUpdatedFen);
            chessboardInstance.current?.setPosition(fullUpdatedFen, false);
            return false;
          }
          if (event.type === 'moveInputFinished' && event.squareFrom && event.squareTo) {
            const fromFile = event.squareFrom.charCodeAt(0) - 97;
            const fromRank = 8 - parseInt(event.squareFrom[1]);
            const toFile = event.squareTo.charCodeAt(0) - 97;
            const toRank = 8 - parseInt(event.squareTo[1]);

            const updated = updateFenBoard(tempEditorFenRef.current, (board) => {
              const piece = board[fromRank][fromFile];
              board[fromRank][fromFile] = null;
              board[toRank][toFile] = piece;
            });

            const fullUpdatedFen = buildFullFen(
              updated,
              editorTurnRef.current,
              editorCastlingRef.current
            );
            tempEditorFenRef.current = fullUpdatedFen;
            setTempEditorFen(fullUpdatedFen);
            if (chessboardInstance.current) {
              chessboardInstance.current.setPosition(fullUpdatedFen, false);
            }
          }
          return false;
        }

        if (isObserver || (!isTeacher && !canStudentMoveRef.current)) return false;

        if (event.type === 'moveInputStarted' && event.squareFrom) {
          const legalMoves = gameRef.current.moves({
            square: event.squareFrom,
            verbose: true,
          });

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

    let channelCancelled = false;
    const channel = supabase.channel(`lesson-${lesson.id}`, {
      config: {
        broadcast: { self: false },
      },
    });

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lessons',
          filter: `id=eq.${lesson.id}`,
        },
        (payload) => {
          if (!payload.new) return;

          // ВАЖНО: fen и move_tree здесь НЕ применяем.
          // Их двигает только broadcast — он быстрее и не откатывает.
          // Здесь только служебное: часы, разблокировка, смена цвета.

          if (payload.new.can_student_move !== undefined) {
            setCanStudentMove(payload.new.can_student_move);
            canStudentMoveRef.current = payload.new.can_student_move;
          }
          if (payload.new.timer_w !== undefined) {
            timerWRef.current = payload.new.timer_w;
            setTimerW(payload.new.timer_w);
            if (whiteClockDomRef.current)
              whiteClockDomRef.current.textContent = formatTime(payload.new.timer_w);
          }
          if (payload.new.timer_b !== undefined) {
            timerBRef.current = payload.new.timer_b;
            setTimerB(payload.new.timer_b);
            if (blackClockDomRef.current)
              blackClockDomRef.current.textContent = formatTime(payload.new.timer_b);
          }
          if (payload.new.active_color !== undefined) {
            activeColorRef.current = payload.new.active_color;
            setActiveColor(payload.new.active_color);
          }
          if (payload.new.clock_started !== undefined) {
            clockStartedRef.current = payload.new.clock_started;
            setClockStarted(payload.new.clock_started);
          }
          if (payload.new.increment_ms !== undefined) {
            incrementMsRef.current = payload.new.increment_ms;
            setIncrementMs(payload.new.increment_ms);
          }
        }
      )
      .on('broadcast', { event: 'make_move' }, ({ payload }) => {
        if (!payload) return;
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
                if (whiteClockDomRef.current)
                  whiteClockDomRef.current.textContent = formatTime(payload.timerW);
              }
              if (payload.timerB !== undefined) {
                timerBRef.current = payload.timerB;
                setTimerB(payload.timerB);
                if (blackClockDomRef.current)
                  blackClockDomRef.current.textContent = formatTime(payload.timerB);
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
      })
      .on('broadcast', { event: 'clock_state' }, ({ payload }) => {
        if (!payload) return;
        if (payload.timerW !== undefined) {
          timerWRef.current = payload.timerW;
          setTimerW(payload.timerW);
        }
        if (payload.timerB !== undefined) {
          timerBRef.current = payload.timerB;
          setTimerB(payload.timerB);
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
        if (payload.canStudentMove !== undefined) {
          setCanStudentMove(payload.canStudentMove);
          canStudentMoveRef.current = payload.canStudentMove;
        }
      })
      .on('broadcast', { event: 'board_orientation' }, ({ payload }) => {
        if (payload?.orientation !== COLOR.white && payload?.orientation !== COLOR.black) return;
        setOrientation(payload.orientation);
      })
      .on('broadcast', { event: 'draw_annotation' }, ({ payload }) => {
        if (!payload || !chessboardInstance.current) return;

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
      });

    channelRef.current = channel;

    supabase.realtime
      .setAuth()
      .then(() => {
        if (channelCancelled) return;
        channel.subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('Ошибка Realtime-канала:', status, error);
          }
        });
      })
      .catch((error) => {
        console.error('Не удалось авторизовать Realtime-соединение:', error);
      });

    return () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id, applyRemoteMove, executeMove, isTeacher, isObserver]);

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
    const squareEl = e.target.closest('[data-square]');
    if (!squareEl) return;
    const square = squareEl.getAttribute('data-square');
    if (!square) return;

    const fenChar = PIECES_PALETTE.find((p) => p.piece === selectedEditorPiece)?.fenChar;
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
    const defaultFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    setTempEditorFen(defaultFen);
    if (chessboardInstance.current) {
      chessboardInstance.current.setPosition(defaultFen, false);
    }
  };

  const handleSaveEditorPosition = () => {
    const boardOnly = updateFenBoard(tempEditorFen, () => {});
    const finalFen = buildFullFen(boardOnly, editorTurn, editorCastling);

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

      saveState(finalFen, canStudentMove, {
        moveTree: newTree,
        currentNodeId: 'root',
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
          } catch {
            // Если редактирование не удалось, оставляем текущую позицию
          }
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
    if (!isTeacher || !nodeId || nodeId === 'root') return;

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

    saveState(nextCurrentNode.fen, canStudentMoveRef.current, {
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

  // ============================================================
  // ОПТИМИЗИРОВАНО: обёрнуто в useMemo, чтобы не пересчитывать
  // при каждом ре-рендере (тик часов, обновление состояния)
  // ============================================================
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
                    {isObserver
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
                    className="px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold transition cursor-pointer"
                  >
                    📚 Материалы
                  </button>
                  <button
                    onClick={toggleStudentAccess}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
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
            <div
              ref={boardRef}
              onClick={handleBoardClickForEditor}
              onDragOver={(event) => {
                if (isEditorMode) event.preventDefault();
              }}
              onDrop={handlePaletteDrop}
              className={`w-full max-w-[660px] aspect-square rounded-xl border border-gray-200 overflow-hidden shadow-inner select-none ${
                isEditorMode ? 'cursor-crosshair ring-2 ring-blue-500' : 'cursor-pointer'
              }`}
            />

            {isTeacher && (
              <div className="w-full max-w-[660px] grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => {
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
                    onClick={() => setSelectedEditorPiece(item.piece)}
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
                  onClick={() => setSelectedEditorPiece(null)}
                  className={`flex-1 py-1 text-[11px] font-semibold rounded border cursor-pointer ${
                    selectedEditorPiece === null
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

              <button
                onClick={handleSaveEditorPosition}
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition shadow-sm cursor-pointer"
              >
                💾 Сохранить позицию (применить и начать запись ходов)
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
                <div className="text-[10px] font-sans font-bold text-gray-500 mb-0.5">⬜ БЕЛЫЕ</div>
                <span ref={whiteClockDomRef} className="text-xl font-black tracking-wider">
                  {formatTime(timerW)}
                </span>
              </div>
              <div
                className={`px-3 py-2.5 rounded-xl transition-all ${
                  activeColor === 'b' && clockStarted
                    ? 'bg-slate-900 text-white ring-2 ring-amber-400'
                    : 'bg-slate-100 text-gray-700'
                }`}
              >
                <div
                  className={`text-[10px] font-sans font-bold mb-0.5 ${
                    activeColor === 'b' && clockStarted ? 'text-gray-300' : 'text-gray-500'
                  }`}
                >
                  ⬛ ЧЁРНЫЕ
                </div>
                <span ref={blackClockDomRef} className="text-xl font-black tracking-wider">
                  {formatTime(timerB)}
                </span>
              </div>
            </div>

            {isTeacher && (
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
        </aside>
      </div>
    </div>
  );
};