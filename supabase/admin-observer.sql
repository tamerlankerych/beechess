-- Выполните этот файл один раз в Supabase SQL Editor.
-- Он хранит только присутствие тренера в комнате; записи старше 70 секунд
-- интерфейс администратора автоматически считает завершёнными.

create table if not exists public.lesson_presence (
  lesson_id uuid primary key references public.lessons(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

create index if not exists lesson_presence_last_seen_idx
  on public.lesson_presence(last_seen_at desc);

alter table public.lesson_presence enable row level security;

drop policy if exists "teachers insert own lesson presence" on public.lesson_presence;
create policy "teachers insert own lesson presence"
on public.lesson_presence for insert
to authenticated
with check (
  teacher_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and lower(btrim(role::text)) = 'teacher'
  )
);

drop policy if exists "teachers update own lesson presence" on public.lesson_presence;
create policy "teachers update own lesson presence"
on public.lesson_presence for update
to authenticated
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

drop policy if exists "teachers delete own lesson presence" on public.lesson_presence;
create policy "teachers delete own lesson presence"
on public.lesson_presence for delete
to authenticated
using (teacher_id = auth.uid());

drop policy if exists "teachers read own lesson presence" on public.lesson_presence;
create policy "teachers read own lesson presence"
on public.lesson_presence for select
to authenticated
using (teacher_id = auth.uid());

drop policy if exists "admins read lesson presence" on public.lesson_presence;
create policy "admins read lesson presence"
on public.lesson_presence for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and lower(btrim(role::text)) = 'admin'
  )
);
