// src/EditableGroupName.jsx
import { useState, useRef, useEffect } from 'react';
import { supabase } from './supabaseClient';

export const EditableGroupName = ({ group, onRenamed, className = '' }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(group.name || '');
  }, [group.name]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    setDraft(group.name || '');
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(group.name || '');
    setError(null);
  };

  const save = async () => {
    const name = draft.trim();
    if (!name) {
      setError('Название не может быть пустым');
      return;
    }
    if (name === group.name) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);

    const { data, error: updErr } = await supabase
      .from('groups')
      .update({ name })
      .eq('id', group.id)
      .select('id, name')
      .single();

    setSaving(false);

    if (updErr) {
      setError('Не удалось сохранить: ' + updErr.message);
      return;
    }

    setEditing(false);
    onRenamed?.(data);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={saving}
            maxLength={80}
            className="min-w-0 flex-1 px-2 py-1 border border-blue-400 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:opacity-60"
          />
          <button
            type="button"
            onClick={save}
            disabled={saving || !draft.trim()}
            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg disabled:opacity-40 cursor-pointer"
            title="Сохранить (Enter)"
          >
            {saving ? '…' : '✓'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg disabled:opacity-40 cursor-pointer"
            title="Отмена (Esc)"
          >
            ✕
          </button>
        </div>
        {error && <span className="text-[10px] text-red-600">{error}</span>}
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 group ${className}`}>
      <span className="font-semibold text-gray-900">{group.name || '—'}</span>
      <button
        type="button"
        onClick={startEdit}
        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition cursor-pointer text-xs"
        title="Переименовать группу"
      >
        ✏️
      </button>
    </span>
  );
};