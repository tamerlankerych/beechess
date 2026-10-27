// src/BotArena.jsx
import React, { useState, useEffect } from 'react';
import { BOTS_CONFIG, GUMBALL_BOT, isGirlfriendUser } from './botsData';
import { supabase } from './supabaseClient';
import BotAvatar from './BotAvatar';
import BotMatchModal from './BotMatchModal';

export default function BotArena({ currentUser, onSelectBot }) {
  const [unlockedLevel, setUnlockedLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activeBot, setActiveBot] = useState(null);
  const [lastUnlockedBot, setLastUnlockedBot] = useState(null);

  const showGumball = isGirlfriendUser(currentUser);

  useEffect(() => {
    let cancelled = false;

    async function fetchProgress() {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('student_bot_progress')
          .select('highest_unlocked')
          .eq('user_id', currentUser.id)
          .maybeSingle();

        if (error) console.warn('Прогресс ботов недоступен:', error.message);
        if (!cancelled && data?.highest_unlocked) {
          // ФИКС: Разрешаем сохранять 6-й уровень (когда пройдены все 5 ботов)
          setUnlockedLevel(Math.min(data.highest_unlocked, BOTS_CONFIG.length + 1));
        }
      } catch (err) {
        console.warn('Прогресс пока не создан, ставим 1 уровень');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProgress();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const handleSelect = (bot) => {
    onSelectBot?.(bot);
    setActiveBot(bot);
  };

  const handleGameEnd = async ({ botId, result }) => {
    if (result !== 'win') return;

    const index = BOTS_CONFIG.findIndex((b) => b.id === botId);
    if (index === -1) return; 

    // Всегда ставим следующего бота, чтобы кнопка появилась
    if (index < BOTS_CONFIG.length - 1) {
      setLastUnlockedBot(BOTS_CONFIG[index + 1]);
    } else {
      setLastUnlockedBot(null);
    }

    const level = index + 1;
    const nextLevel = level + 1;

    if (level >= unlockedLevel) {
      // ФИКС: Не обрезаем на 5, разрешаем поставить 6 (все пройдены)
      setUnlockedLevel(Math.min(nextLevel, BOTS_CONFIG.length + 1));

      if (!currentUser?.id) return;
      try {
        const { error } = await supabase
          .from('student_bot_progress')
          .upsert(
            { user_id: currentUser.id, highest_unlocked: nextLevel, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        if (error) console.warn('Прогресс не сохранён:', error.message);
      } catch (err) {
        console.warn('Прогресс не сохранён:', err);
      }
    }
  };

  const handleCloseModal = () => {
    setActiveBot(null);
    setLastUnlockedBot(null);
  };

  const handlePlayNext = () => {
    if (!lastUnlockedBot) return;
    setActiveBot(lastUnlockedBot);
    setLastUnlockedBot(null);
  };

  // ФИКС: Ограничиваем счетчик пятью победами, даже если unlockedLevel = 6
  const defeated = Math.max(0, Math.min(unlockedLevel - 1, BOTS_CONFIG.length));

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 md:p-10 font-sans">
      <div className="max-w-4xl mx-auto text-center mb-10">
        <div className="inline-block bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500 text-transparent bg-clip-text text-4xl md:text-6xl font-extrabold tracking-wider uppercase drop-shadow-lg mb-2">
          🎮 Bot Arena Arcade
        </div>
        <p className="text-slate-400 text-lg">
          Пройди путь от веселого новичка до легендарного мастера! Побеждай ботов и открывай новых
          соперников.
        </p>
        {!loading && (
          <p className="mt-3 text-sm font-bold text-indigo-300">
            {/* ФИКС: Math.min ограничивает отображение 5 из 5 */}
            Пройдено ботов: {defeated} из {BOTS_CONFIG.length}
          </p>
        )}
      </div>

      <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {BOTS_CONFIG.map((bot, index) => {
          const botLevel = index + 1;
          // Если unlockedLevel = 6, то 5-й бот (Угвей) будет isBeaten = true (5 < 6)
          const isUnlocked = botLevel <= unlockedLevel;
          const isBeaten = botLevel < unlockedLevel;

          return (
            <div
              key={bot.id}
              className={`relative rounded-2xl p-6 transition-all duration-300 border-2 ${
                isUnlocked
                  ? 'bg-slate-800/80 border-indigo-500/50 hover:border-indigo-400 hover:scale-[1.02] shadow-lg shadow-indigo-500/10 cursor-pointer'
                  : 'bg-slate-900/60 border-slate-700/50 opacity-60 cursor-not-allowed'
              }`}
              onClick={() => isUnlocked && handleSelect(bot)}
            >
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  Уровень {botLevel} • ELO {bot.elo}
                </span>
                {!isUnlocked && <span className="text-xl" title="Заблокировано">🔒</span>}
                {isBeaten && <span className="text-xl" title="Побеждён">✅</span>}
              </div>

              <div className="flex items-center gap-4 mb-4">
                <BotAvatar bot={bot} size={64} />
                <div>
                  <h3 className="text-2xl font-black text-white">{bot.name}</h3>
                  <p className="text-indigo-400 font-medium text-sm">{bot.title}</p>
                </div>
              </div>

              <p className="text-slate-300 text-sm mb-6 leading-relaxed">{bot.description}</p>

              <button
                disabled={!isUnlocked}
                className={`w-full py-3 px-4 rounded-xl font-bold uppercase tracking-wider transition-all shadow-md ${
                  isUnlocked
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-600/30 active:scale-95 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                {isUnlocked ? '⚔️ В бой!' : 'Сначала победи предыдущего'}
              </button>
            </div>
          );
        })}

        {showGumball && (
          <div
            className="md:col-span-2 relative rounded-2xl p-6 transition-all duration-300 border-2 bg-gradient-to-r from-pink-900/40 via-purple-900/40 to-indigo-900/40 border-pink-500/60 hover:border-pink-400 hover:scale-[1.01] shadow-xl shadow-pink-500/20 cursor-pointer"
            onClick={() => handleSelect(GUMBALL_BOT)}
          >
            <div className="absolute top-4 right-4 bg-pink-500 text-white text-xs font-black uppercase px-3 py-1 rounded-full shadow-lg">
              ✨ Эксклюзив для Котенка ✨
            </div>

            <div className="flex items-center gap-4 mb-4">
              <BotAvatar bot={GUMBALL_BOT} size={64} />
              <div>
                <h3 className="text-2xl font-black text-pink-300">{GUMBALL_BOT.name}</h3>
                <p className="text-pink-400 font-medium text-sm">{GUMBALL_BOT.title}</p>
              </div>
            </div>

            <p className="text-slate-200 text-sm mb-6 leading-relaxed">{GUMBALL_BOT.description}</p>

            <button className="w-full py-3 px-4 rounded-xl font-bold uppercase tracking-wider bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white shadow-lg shadow-pink-600/40 active:scale-95 transition-all cursor-pointer">
              💖 Сыграть с секретным Гамболом!
            </button>
          </div>
        )}
      </div>

      {activeBot && (
        <BotMatchModal
          key={activeBot.id}
          bot={activeBot}
          nextBot={lastUnlockedBot}
          onGameEnd={handleGameEnd}
          onClose={handleCloseModal}
          onPlayNext={handlePlayNext}
        />
      )}
    </div>
  );
}