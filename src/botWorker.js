// src/botWorker.js
// Считает ход бота в отдельном потоке, чтобы интерфейс не замирал.
import { getBotMove } from './BotEngine';

self.onmessage = (event) => {
  const { id, fen, elo } = event.data || {};
  let result = null;
  try {
    result = getBotMove(fen, elo);
  } catch (err) {
    console.error('Ошибка движка бота:', err);
  }
  self.postMessage({ id, result });
};
