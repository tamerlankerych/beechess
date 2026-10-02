import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { supabase } from './supabaseClient';
import { ChessPieceIcon } from './ChessPieceIcon.jsx';

const CACHE_KEY = 'beechess_materials_cache_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 час

const readCache = () => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !Array.isArray(parsed?.data)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
};

const writeCache = (data) => {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // sessionStorage может быть переполнен — игнорируем
  }
};

const PositionPreview = ({ fen }) => {
  const squares = useMemo(() => {
    try {
      return new Chess(fen, { skipValidation: true }).board().flat();
    } catch {
      return Array(64).fill(null);
    }
  }, [fen]);

  return (
    <div className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-lg border border-amber-900/10">
      {squares.map((piece, index) => {
        const rank = Math.floor(index / 8);
        const file = index % 8;
        const isLight = (rank + file) % 2 === 0;
        return (
          <div
            key={index}
            className={`flex items-center justify-center text-[clamp(12px,2vw,22px)] leading-none ${
              isLight ? 'bg-[#f0d9b5]' : 'bg-[#b88a64]'
            }`}
          >
            {piece && (
              <ChessPieceIcon
                piece={`${piece.color}${piece.type}`}
                className="h-[92%] w-[92%] drop-shadow-sm"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export const MaterialsLibrary = ({ onClose, onOpenPosition }) => {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedModule, setSelectedModule] = useState('1000-1300');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedTopicNumber, setSelectedTopicNumber] = useState(null);
  const [search, setSearch] = useState('');
  const [revealedSolutions, setRevealedSolutions] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;

    const loadMaterials = async () => {
      // 1. Пробуем кэш
      const cached = readCache();
      if (cached && cached.length > 0) {
        setMaterials(cached);
        setLoading(false);
        return;
      }

      // 2. Кэша нет — грузим из БД
      setLoading(true);
      setError('');

      try {
        const { count } = await supabase
          .from('training_materials')
          .select('*', { count: 'exact', head: true });

        const total = count || 0;
        if (total === 0) {
          setMaterials([]);
          setLoading(false);
          return;
        }

        // Параллельная загрузка всех страниц
        const pageSize = 1000;
        const pages = Math.ceil(total / pageSize);

        const requests = [];
        for (let i = 0; i < pages; i++) {
          const from = i * pageSize;
          const to = from + pageSize - 1;
          requests.push(
            supabase
              .from('training_materials')
              .select(
                'module, topic_number, section, topic, position_order, puzzle_id, setup_fen, solution_uci, side_to_move, rating, themes, review_status'
              )
              .order('module')
              .order('topic_number')
              .order('position_order')
              .range(from, to)
          );
        }

        const results = await Promise.all(requests);
        const allMaterials = [];
        for (const r of results) {
          if (r.error) throw r.error;
          allMaterials.push(...(r.data || []));
        }

        if (cancelled) return;

        setMaterials(allMaterials);
        writeCache(allMaterials);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Ошибка загрузки материалов:', err);
        setError(err.message || 'Не удалось загрузить материалы');
        setMaterials([]);
        setLoading(false);
      }
    };

    loadMaterials();
    return () => {
      cancelled = true;
    };
  }, []);

  const modules = useMemo(
    () => [...new Set(materials.map((item) => item.module))],
    [materials]
  );

  const activeModule = modules.includes(selectedModule) ? selectedModule : modules[0] || '';

  const moduleMaterials = useMemo(
    () => materials.filter((item) => item.module === activeModule),
    [materials, activeModule]
  );

  const sections = useMemo(
    () => [...new Set(moduleMaterials.map((item) => item.section))],
    [moduleMaterials]
  );

  const activeSection = sections.includes(selectedSection) ? selectedSection : sections[0] || '';

  const topics = useMemo(() => {
    const query = search.trim().toLowerCase();
    const unique = new Map();

    moduleMaterials
      .filter((item) => !activeSection || item.section === activeSection)
      .forEach((item) => {
        if (query && !item.topic.toLowerCase().includes(query)) return;
        if (!unique.has(item.topic_number)) {
          unique.set(item.topic_number, {
            topic_number: item.topic_number,
            topic: item.topic,
            count: 0,
          });
        }
        unique.get(item.topic_number).count += 1;
      });

    return [...unique.values()].sort((a, b) => a.topic_number - b.topic_number);
  }, [activeSection, moduleMaterials, search]);

  const activeTopicNumber = topics.some((topic) => topic.topic_number === selectedTopicNumber)
    ? selectedTopicNumber
    : topics[0]?.topic_number ?? null;

  const positions = useMemo(
    () => moduleMaterials.filter((item) => item.topic_number === activeTopicNumber),
    [activeTopicNumber, moduleMaterials]
  );

  const activeTopic = topics.find((topic) => topic.topic_number === activeTopicNumber);

  const toggleSolution = (puzzleId) => {
    setRevealedSolutions((current) => {
      const next = new Set(current);
      if (next.has(puzzleId)) next.delete(puzzleId);
      else next.add(puzzleId);
      return next;
    });
  };
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-2 sm:p-5"
      onMouseDown={onClose}
    >
      <div
        className="flex h-[min(900px,94vh)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-lg font-black text-slate-900">📚 Материалы beeChess</h2>
            <p className="text-xs text-slate-500">
              Выберите тему и отправьте позицию на доску урока
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
          >
            ✕ Закрыть
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm font-semibold text-slate-500">
            Загрузка материалов…
          </div>
        ) : error ? (
          <div className="m-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
            <p className="font-bold text-red-700">Не удалось загрузить материалы</p>
            <p className="mt-1 text-xs text-red-600">{error}</p>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[230px_280px_minmax(0,1fr)]">
            <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-white p-3 lg:border-b-0 lg:border-r">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Модуль
              </label>
              <select
                value={activeModule}
                onChange={(event) => {
                  setSelectedModule(event.target.value);
                  setSelectedSection('');
                  setSelectedTopicNumber(null);
                }}
                className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-800"
              >
                {modules.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </select>

              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Разделы
              </p>
              <div className="flex gap-2 overflow-x-auto lg:flex-col">
                {sections.map((section) => (
                  <button
                    type="button"
                    key={section}
                    onClick={() => {
                      setSelectedSection(section);
                      setSelectedTopicNumber(null);
                    }}
                    className={`shrink-0 rounded-xl px-3 py-2 text-left text-xs font-semibold transition cursor-pointer ${
                      activeSection === section
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {section}
                  </button>
                ))}
              </div>
            </aside>

            <aside className="min-h-0 overflow-y-auto border-b border-slate-200 bg-slate-50 p-3 lg:border-b-0 lg:border-r">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск тем…"
                className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-400"
              />
              <div className="flex gap-2 overflow-x-auto lg:flex-col">
                {topics.map((topic) => (
                  <button
                    type="button"
                    key={topic.topic_number}
                    onClick={() => setSelectedTopicNumber(topic.topic_number)}
                    className={`min-w-[210px] rounded-xl border p-2.5 text-left transition cursor-pointer lg:min-w-0 ${
                      activeTopicNumber === topic.topic_number
                        ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-[10px] font-bold text-slate-400">
                      ТЕМА {topic.topic_number}
                    </span>
                    <span className="mt-0.5 block text-xs font-bold text-slate-800">
                      {topic.topic}
                    </span>
                    <span className="mt-1 block text-[10px] text-slate-400">
                      {topic.count} позиций
                    </span>
                  </button>
                ))}
              </div>
              {topics.length === 0 && (
                <p className="py-8 text-center text-xs text-slate-400">Темы не найдены</p>
              )}
            </aside>

            <main className="min-h-0 overflow-y-auto p-3 sm:p-4">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                    Тема {activeTopicNumber}
                  </p>
                  <h3 className="text-base font-black text-slate-900">
                    {activeTopic?.topic || 'Выберите тему'}
                  </h3>
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  {positions.length} позиций
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {positions.map((position) => {
                  const solutionVisible = revealedSolutions.has(position.puzzle_id);
                  return (
                    <article
                      key={position.puzzle_id}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <PositionPreview fen={position.setup_fen} />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-black text-slate-800">
                            Позиция {position.position_order}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Ход: {position.side_to_move === 'white' ? 'Белые' : 'Чёрные'}
                            {position.rating ? ` · ${position.rating}` : ''}
                          </p>
                        </div>
                        <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">
                          {position.puzzle_id}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleSolution(position.puzzle_id)}
                        className="mt-2 w-full rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800 hover:bg-amber-100 cursor-pointer"
                      >
                        {solutionVisible ? 'Скрыть решение' : '👁 Показать решение тренеру'}
                      </button>
                      {solutionVisible && (
                        <div className="mt-1.5 break-words rounded-lg bg-slate-900 p-2 font-mono text-[10px] text-white">
                          {position.solution_uci || 'Решение не задано'}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => onOpenPosition(position)}
                        className="mt-2 w-full rounded-xl bg-blue-600 py-2 text-xs font-bold text-white transition hover:bg-blue-700 cursor-pointer"
                      >
                        Открыть на доске →
                      </button>
                    </article>
                  );
                })}
              </div>
            </main>
          </div>
        )}
      </div>
    </div>
  );
};