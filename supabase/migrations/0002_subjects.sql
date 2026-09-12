-- Subjects and subtopics.

create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  color       text not null,
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint subjects_name_len check (char_length(name) between 1 and 40),
  -- Colors are a closed set chosen to stay separable at 4px in the day strip.
  -- Free-form hex would let a user pick something indistinguishable from a
  -- neighbouring subject, or from the running state.
  constraint subjects_color_valid check (
    color in ('blue','cyan','green','lime','rust','pink','violet','slate')
  )
);

-- One active subject per name per user. Archived rows are excluded so a name
-- can be reused after archiving.
create unique index subjects_user_name_active
  on public.subjects (user_id, lower(name))
  where archived_at is null;

create index subjects_user_order
  on public.subjects (user_id, sort_order, created_at)
  where archived_at is null;

alter table public.subjects enable row level security;

create policy subjects_all_own on public.subjects
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table public.subtopics (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  name        text not null,
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint subtopics_name_len check (char_length(name) between 1 and 40)
);

create unique index subtopics_subject_name_active
  on public.subtopics (subject_id, lower(name))
  where archived_at is null;

create index subtopics_subject_order
  on public.subtopics (subject_id, sort_order, created_at)
  where archived_at is null;

alter table public.subtopics enable row level security;

-- Subtopics carry no user_id of their own; ownership is inherited from the
-- parent subject, checked against the subjects table under its own RLS.
create policy subtopics_all_own on public.subtopics
  for all to authenticated
  using (
    exists (
      select 1 from public.subjects s
      where s.id = subtopics.subject_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.subjects s
      where s.id = subtopics.subject_id and s.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.subjects  to authenticated;
grant select, insert, update, delete on public.subtopics to authenticated;
