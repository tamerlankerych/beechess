// src/botsData.js

// Картинки лежат в public/bots/<id>.png (или .webp/.jpg — поменяйте расширение ниже).
// Если файла нет или он не загрузился, вместо картинки автоматически показывается эмодзи.
export const BOTS_CONFIG = [
  {
    id: 'spongebob',
    name: 'Спанч Боб',
    title: 'Веселая Губка',
    elo: 500,
    avatar: '/bots/spongebob.png',
    emoji: '🧽',
    accent: 'from-yellow-300 to-amber-500',
    description: 'Любит смеяться, часто зевает фигуры и играет очень наивно.',
    speech: {
      start: 'Я готов, я готов! Погнали играть в шахматы!',
      blunder: 'Ой! Кажется, моя пешка убежала в Кэсти Крабс...',
      capture: 'Ха-ха! Хрустящая булочка!',
      win: 'Ура! Я лучший повар в шахматах!',
      lose: 'Ого! Ты меня обыграл! Давай ещё разок?',
    },
    bgm: '/music/spongebob.mp3',
  },
  {
    id: 'spiderman',
    name: 'Человек-Паук',
    title: 'Дружелюбный сосед',
    elo: 900,
    avatar: '/bots/spiderman.png',
    emoji: '🕷️',
    accent: 'from-red-500 to-blue-700',
    description: 'Прыгает по доске, как паучок, и ловит соперника на вилках.',
    speech: {
      start: 'С великой силой приходит великая шахматная партия!',
      blunder: 'Тьфу ты, паутина запуталась...',
      capture: 'Поймался в сети!',
      win: 'Паучье чутье меня не подвело!',
      lose: 'Ты меня переиграл! Респект!',
    },
    bgm: '/music/spiderman.mp3',
  },
  {
    id: 'mcqueen',
    name: 'Молния Маккуин',
    title: 'Легенда Радиатор-Спрингс',
    elo: 1300,
    avatar: '/bots/mcqueen.png',
    emoji: '🏎️',
    accent: 'from-red-600 to-orange-500',
    description: 'Играет быстро, агрессивно атакует центр и стремится к молниеносному мату.',
    speech: {
      start: 'Кача-а-ау! Я — скорость!',
      blunder: 'Эй, кто поставил этот бампер на дороге?!',
      capture: 'Обгнал на повороте!',
      win: 'Керчик! Я первый на финише!',
      lose: 'Ты обогнал меня! Реванш?',
    },
    bgm: '/music/mcqueen.mp3',
  },
  {
    id: 'batman',
    name: 'Бэтмен',
    title: 'Темный Рыцарь',
    elo: 1700,
    avatar: '/bots/batman.png',
    emoji: '🦇',
    accent: 'from-slate-700 to-slate-900',
    description: 'Хладнокровный тактик. Наказывает за любую ошибку в миттельшпиле.',
    speech: {
      start: 'Я — ночь. Я — шахматный порядок.',
      blunder: '...даже у меня бывают просчеты.',
      capture: 'Правосудие свершилось.',
      win: 'Город снова в безопасности.',
      lose: 'Хороший ход. Ты победил.',
    },
    bgm: '/music/batman.mp3',
  },
  {
    id: 'oogway',
    name: 'Мастер Угвей',
    title: 'Мудрая Черепаха',
    elo: 2100,
    avatar: '/bots/oogway.png',
    emoji: '🐢',
    accent: 'from-emerald-500 to-teal-700',
    description: 'Играет безупречно. Постигнет гармонию каждой позиции на доске.',
    speech: {
      start: 'Случайности не случайны. Сделай свой ход, ученик.',
      blunder: 'Даже у падающего листа есть свой путь.',
      capture: 'Цветок распускается в свое время.',
      win: 'Вчера — это история, завтра — загадка, а этот мат — дар.',
      lose: 'Ты достиг мастерства, ученик.',
    },
    bgm: '/music/oogway.mp3',
  },
];

export const GUMBALL_BOT = {
  id: 'gumball',
  name: 'Гамбол',
  title: 'Любимый Котенок',
  elo: 1000,
  avatar: '/bots/gumball.png',
  emoji: '🐱',
  accent: 'from-sky-400 to-pink-500',
  description: 'Секретный бот, созданный специально для самой особенной соперницы.',
  speech: {
    start: 'Йоу, Малика! Надеюсь, это не тест по математике, потому что я к нему не готов. Погнали!',
    blunder: 'Ой... Кажется, я засмотрелся на тебя и проворонил фигуру. Дарвин, ты видел это?',
    capture: 'Бум! Съел твою фигурку. Не волнуйся, она была вкусной!',
    win: 'Я ГАМБОЛ УОТТЕРСОН, И Я... ну, ты поняла. Я выиграл! Но ты всё равно самая лучшая 💕',
    lose: 'Эй, это вообще законно? Ты явно использовала свои супер-силы! Ладно, реванш?',
  },
  bgm: '/music/gumball.mp3',
};

// Проверка доступа для Малики
export const isGirlfriendUser = (user) => {
  if (!user) return false;
  const name = (user.name || '').toLowerCase();
  const email = (user.email || '').toLowerCase();

  return (
    name.includes('малика') ||
    name.includes('котенок') ||
    email === 'mylovelygirl@gmail.com'
  );
};