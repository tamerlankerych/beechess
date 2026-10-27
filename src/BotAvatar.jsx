// src/BotAvatar.jsx
import React, { useEffect, useState } from 'react';

// Картинка бота из public/bots/. Если файла нет — аккуратная заглушка с эмодзи.
export default function BotAvatar({ bot, size = 64, className = '' }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [bot?.avatar]);

  if (!bot) return null;
  const showImage = bot.avatar && !failed;

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-inner flex items-center justify-center bg-gradient-to-br ${
        bot.accent || 'from-indigo-500 to-violet-600'
      } ${className}`}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <img
          src={bot.avatar}
          alt={bot.name}
          className="w-full h-full object-cover"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span style={{ fontSize: size * 0.55, lineHeight: 1 }}>{bot.emoji || '🤖'}</span>
      )}
    </div>
  );
}
