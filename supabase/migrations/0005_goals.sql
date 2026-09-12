-- Goals and streaks.
--
-- The goals table is canonical. profiles.daily_goal_minutes is a trigger
-- maintained mirror of the active all-subjects daily goal, kept so the streak
-- path does not resolve this table on every read. Nothing writes it directly.

create table public.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  scope          public.goal_scope not null,
  -- Null means all subjects. A row with a subject is a per-subject goal.
  subject_id     uuid references public.subjects (id) on delete cascade,
  target_minutes integer not null,
  active_from    date not null default current_date,
  active_to      date,
  created_at     timestamptz not null default now(),

  constraint goals_target_range check (target_minutes between 5 and 1440),
  constraint goals_active_order check (active_to is null or active_to >= active_from)
);

-- One live goal per scope per subject. Superseding a goal means closing the old
-- row with active_to, which keeps history intact instead of overwriting it.
create unique index goals_one_active
  on public.goals (user_id, scope, subject_id)
  nulls not distinct
  where active_to is null;

create index goals_user_scope on public.goals (user_id, scope) where active_to is null;

alter table public.goals enable row level security;

create policy goals_all_own on public.goals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- The mirror. profiles.daily_goal_minutes follows the active all-subjects
-- daily goal and is not independently settable.
-- ---------------------------------------------------------------------------
create or replace function public.sync_daily_goal_mirror()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := coalesce(new.user_id, old.user_id);
  v_target integer;
begin
  select g.target_minutes into v_target
  from public.goals g
  where g.user_id = v_user
    and g.scope = 'daily'
    and g.subject_id is null
    and g.active_to is null
  limit 1;

  perform set_config('app.allow_goal_mirror', 'on', true);
  update public.profiles
     set daily_goal_minutes = coalesce(v_target, 120)
   where id = v_user;
  perform set_config('app.allow_goal_mirror', 'off', true);

  return null;
end;
$$;

create trigger goals_sync_mirror
  after insert or update or delete on public.goals
  for each row execute function public.sync_daily_goal_mirror();

-- Replaces the live goal for a scope and subject, closing the previous one
-- rather than mutating it, so past goals stay auditable.
create or replace function public.set_goal(
  p_scope          public.goal_scope,
  p_target_minutes integer,
  p_subject_id     uuid default null
) returns public.goals
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.goals;
  v_today date;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_subject_id is not null and not exists (
    select 1 from public.subjects where id = p_subject_id and user_id = v_user
  ) then
    raise exception 'subject not found' using errcode = 'P0002';
  end if;

  v_today := public.user_today(v_user);

  update public.goals
     set active_to = v_today
   where user_id = v_user
     and scope = p_scope
     and subject_id is not distinct from p_subject_id
     and active_to is null;

  insert into public.goals (user_id, scope, subject_id, target_minutes, active_from)
  values (v_user, p_scope, p_subject_id, p_target_minutes, v_today)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.clear_goal(
  p_scope      public.goal_scope,
  p_subject_id uuid default null
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  update public.goals
     set active_to = public.user_today(v_user)
   where user_id = v_user
     and scope = p_scope
     and subject_id is not distinct from p_subject_id
     and active_to is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Progress and streaks
-- ---------------------------------------------------------------------------

-- Was the all-subjects daily goal met on a given local day?
create or replace function public.daily_goal_met_on(p_user uuid, p_date date)
returns boolean
language sql stable parallel safe
set search_path = public, pg_temp
as $$
  select coalesce(
    (select d.seconds from public.user_day_seconds(p_user, p_date, p_date) d limit 1),
    0
  ) >= (
    select p.daily_goal_minutes * 60 from public.profiles p where p.id = p_user
  );
$$;

-- Consecutive local days meeting the daily goal.
--
-- Today counts once met, but a not-yet-met today does not break the run: the
-- streak is anchored to yesterday until today is earned. Otherwise every
-- streak would read zero every morning.
create or replace function public.current_streak(p_user uuid)
returns integer
language plpgsql stable
set search_path = public, pg_temp
as $$
declare
  v_today  date := public.user_today(p_user);
  v_anchor date;
  v_window integer := 400;
  v_target integer;
  v_miss   date;
begin
  if v_today is null then
    return 0;
  end if;

  select p.daily_goal_minutes into v_target from public.profiles p where p.id = p_user;

  if public.daily_goal_met_on(p_user, v_today) then
    v_anchor := v_today;
  else
    v_anchor := v_today - 1;
    if not public.daily_goal_met_on(p_user, v_anchor) then
      return 0;
    end if;
  end if;

  -- The streak runs back to the most recent day that fell short. One pass over
  -- the window, driven by the same day totals every other number uses.
  with days as (
    select gs::date as d
    from generate_series(v_anchor - v_window, v_anchor, interval '1 day') gs
  ),
  totals as (
    select d.local_date, d.seconds
    from public.user_day_seconds(p_user, v_anchor - v_window, v_anchor) d
  )
  select max(days.d) into v_miss
  from days
  left join totals on totals.local_date = days.d
  where coalesce(totals.seconds, 0) < v_target * 60;

  if v_miss is null then
    return v_window + 1;
  end if;

  return (v_anchor - v_miss)::integer;
end;
$$;

-- Every live goal with its current progress. One call powers the goals screen.
create or replace function public.goal_status(p_user uuid default auth.uid())
returns table (
  goal_id          uuid,
  scope            public.goal_scope,
  subject_id       uuid,
  target_minutes   integer,
  achieved_seconds numeric,
  met              boolean
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_today      date;
  v_week_start date;
begin
  if p_user is null or p_user <> auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_today := public.user_today(p_user);
  -- Weeks run Monday to Sunday.
  v_week_start := v_today - ((extract(isodow from v_today)::integer) - 1);

  return query
  with spans as (
    select g.id, g.scope, g.subject_id, g.target_minutes,
           case when g.scope = 'daily' then v_today else v_week_start end as from_date,
           v_today as to_date
    from public.goals g
    where g.user_id = p_user and g.active_to is null
  )
  select sp.id, sp.scope, sp.subject_id, sp.target_minutes,
         coalesce(agg.seconds, 0)::numeric,
         coalesce(agg.seconds, 0) >= sp.target_minutes * 60
  from spans sp
  left join lateral (
    select sum(u.seconds) as seconds
    from public.user_day_subject_seconds(p_user, sp.from_date, sp.to_date) u
    where sp.subject_id is null or u.subject_id = sp.subject_id
  ) agg on true;
end;
$$;

grant select, insert, update, delete on public.goals to authenticated;
grant execute on function public.set_goal(public.goal_scope, integer, uuid) to authenticated;
grant execute on function public.clear_goal(public.goal_scope, uuid)        to authenticated;
grant execute on function public.current_streak(uuid)                       to authenticated;
grant execute on function public.daily_goal_met_on(uuid, date)              to authenticated;
grant execute on function public.goal_status(uuid)                          to authenticated;
