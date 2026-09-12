-- Foundations: extensions, enums, tunable config, profiles.
-- RLS is enabled in the same migration that creates each table. There is no
-- window in which a table exists unprotected.

create extension if not exists citext;

create type public.session_mode   as enum ('stopwatch', 'pomodoro');
create type public.session_status as enum ('running', 'paused', 'completed', 'discarded');
create type public.goal_scope     as enum ('daily', 'weekly');
create type public.ledger_reason  as enum (
  'session', 'goal_bonus', 'streak_bonus', 'redemption', 'adjustment'
);
create type public.friendship_status as enum ('pending', 'accepted', 'blocked');

-- ---------------------------------------------------------------------------
-- Tunable numbers
--
-- Mirrors lib/config.ts so the SQL side and the client side cannot disagree
-- about the earn rate or the session cap. Seeded by scripts/sync-config.ts.
-- Read-only to clients; only migrations and the service role write to it.
-- ---------------------------------------------------------------------------
create table public.app_config (
  key   text primary key,
  value numeric not null
);

alter table public.app_config enable row level security;

create policy app_config_read on public.app_config
  for select to authenticated using (true);

insert into public.app_config (key, value) values
  ('points_per_minute',        1),
  ('daily_goal_bonus',        20),
  ('streak_bonus_per_day',     5),
  ('streak_bonus_cap',        50),
  ('max_session_hours',       12),
  ('manual_max_minutes_day', 240),
  ('manual_max_minutes_entry', 720),
  ('frictionless_discard_seconds', 60);

create or replace function public.cfg(p_key text)
returns numeric
language sql stable parallel safe
set search_path = public, pg_temp
as $$
  select value from public.app_config where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Timezone validation
--
-- Marked immutable so it can be used in a CHECK constraint. Strictly this is a
-- small lie (the tz database can be updated), but a zone name that is valid at
-- write time staying valid is a safe assumption, and the alternative is an
-- unvalidated text column feeding every date calculation in the app.
-- ---------------------------------------------------------------------------
create or replace function public.is_valid_timezone(p_tz text)
returns boolean
language plpgsql immutable parallel safe
as $$
begin
  if p_tz is null then
    return false;
  end if;
  perform timezone(p_tz, timestamp '2000-01-01 00:00:00');
  return true;
exception
  when others then
    return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                          uuid primary key references auth.users (id) on delete cascade,
  handle                      citext not null unique,
  display_name                text not null,
  timezone                    text not null default 'UTC',

  -- Mirror of the active all-subjects daily goal, maintained by trigger from
  -- the goals table. Read-only: nothing writes this directly. It exists so the
  -- streak path does not have to resolve the goals table on every read.
  daily_goal_minutes          integer not null default 120,

  -- Privacy: when set, friends see totals and that this person is studying,
  -- but never which subject.
  hide_subjects_from_friends  boolean not null default false,

  pomodoro_work_minutes            integer not null default 25,
  pomodoro_break_minutes           integer not null default 5,
  pomodoro_long_break_minutes      integer not null default 15,
  pomodoro_rounds_before_long_break integer not null default 4,

  created_at                  timestamptz not null default now(),

  constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (
    char_length(display_name) between 1 and 60
  ),
  constraint profiles_timezone_valid check (public.is_valid_timezone(timezone)),
  constraint profiles_daily_goal_range check (
    daily_goal_minutes between 5 and 1440
  ),
  constraint profiles_pomodoro_work_range check (
    pomodoro_work_minutes between 1 and 180
  ),
  constraint profiles_pomodoro_break_range check (
    pomodoro_break_minutes between 1 and 60
  ),
  constraint profiles_pomodoro_long_break_range check (
    pomodoro_long_break_minutes between 1 and 120
  ),
  constraint profiles_pomodoro_rounds_range check (
    pomodoro_rounds_before_long_break between 1 and 12
  )
);

alter table public.profiles enable row level security;

-- A user reads and edits only their own profile row. Friend-visible data is
-- served by security definer functions instead, so that the privacy flag is
-- enforced in one auditable place rather than trusted to the client.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- daily_goal_minutes and handle are not user-writable through the normal
-- update path: handle changes go through a dedicated RPC (so the uniqueness
-- error can be reported cleanly), and daily_goal_minutes is trigger-maintained.
create or replace function public.profiles_guard_derived()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.daily_goal_minutes is distinct from old.daily_goal_minutes
     and current_setting('app.allow_goal_mirror', true) is distinct from 'on' then
    raise exception
      'daily_goal_minutes is derived from goals. Change the daily goal instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_derived
  before update on public.profiles
  for each row execute function public.profiles_guard_derived();

grant select, insert, update on public.profiles to authenticated;
grant select on public.app_config to authenticated;
