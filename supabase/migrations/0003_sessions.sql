-- Sessions, pauses, and the time accounting that everything else is built on.
--
-- The rule this file exists to enforce: study time is always derived from
-- timestamps. Nothing counts, nothing accumulates, and the client never gets
-- to say how long anything took.

create table public.sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  subject_id   uuid not null references public.subjects (id) on delete restrict,
  subtopic_id  uuid references public.subtopics (id) on delete set null,
  mode         public.session_mode   not null default 'stopwatch',
  status       public.session_status not null default 'running',
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,

  -- Pomodoro only: the length of the work phase. The phase boundary is derived
  -- from this, never scheduled, so a backgrounded tab cannot miss it.
  planned_seconds integer,

  -- Written on completion by trigger, from timestamps. Null until then.
  net_seconds  integer,
  note         text,

  is_manual    boolean not null default false,
  -- Set when the 12 hour cap finalized this session rather than the user.
  auto_closed  boolean not null default false,
  -- Set when a mid-session subject switch ended one session and began this one.
  chained_from_session_id uuid references public.sessions (id) on delete set null,

  created_at   timestamptz not null default now(),

  constraint sessions_end_after_start check (
    ended_at is null or ended_at >= started_at
  ),
  constraint sessions_net_iff_completed check (
    (status = 'completed') = (net_seconds is not null)
  ),
  constraint sessions_completed_has_end check (
    status <> 'completed' or ended_at is not null
  ),
  constraint sessions_planned_only_pomodoro check (
    mode = 'pomodoro' or planned_seconds is null
  ),
  constraint sessions_planned_positive check (
    planned_seconds is null or planned_seconds > 0
  ),
  constraint sessions_manual_is_completed check (
    not is_manual or (status = 'completed' and ended_at is not null)
  ),
  constraint sessions_note_len check (note is null or char_length(note) <= 500),
  constraint sessions_not_self_chained check (chained_from_session_id <> id)
);

-- At most one session in flight per user. Two running timers would make every
-- total ambiguous, so it is a constraint rather than a UI convention.
create unique index sessions_one_active_per_user
  on public.sessions (user_id)
  where status in ('running', 'paused');

create index sessions_user_started on public.sessions (user_id, started_at desc);
create index sessions_user_window
  on public.sessions (user_id, started_at)
  where status in ('running', 'paused', 'completed');
create index sessions_subject on public.sessions (subject_id);

alter table public.sessions enable row level security;

-- Owner only, with no exception for friends. Everything friend-facing is served
-- by security definer functions so that the privacy flag is a real control and
-- not a client-side suggestion.
create policy sessions_all_own on public.sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table public.session_pauses (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  paused_at  timestamptz not null default now(),
  resumed_at timestamptz,

  constraint pauses_resume_after_pause check (
    resumed_at is null or resumed_at >= paused_at
  )
);

create index session_pauses_session on public.session_pauses (session_id, paused_at);

-- One open pause per session, for the same reason as one active session.
create unique index session_pauses_one_open
  on public.session_pauses (session_id)
  where resumed_at is null;

alter table public.session_pauses enable row level security;

create policy session_pauses_all_own on public.session_pauses
  for all to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_pauses.session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_pauses.session_id and s.user_id = auth.uid()
    )
  );

-- ===========================================================================
-- Pure time math
--
-- These take plain values rather than reading tables, so they can be tested
-- directly against fixtures with no rows involved.
-- ===========================================================================

-- Where a session actually ends, accounting for the abandoned-session cap.
create or replace function public.session_effective_end(
  p_started_at timestamptz,
  p_ended_at   timestamptz,
  p_now        timestamptz,
  p_max_hours  numeric
) returns timestamptz
language sql immutable parallel safe
as $$
  select greatest(
    p_started_at,
    least(
      coalesce(p_ended_at, p_now),
      p_started_at + (p_max_hours * interval '1 hour')
    )
  );
$$;

-- The intervals during which a session was actually running: its wall clock
-- span minus every pause.
create or replace function public.active_ranges(
  p_started_at timestamptz,
  p_ended_at   timestamptz,
  p_pauses     tstzmultirange
) returns tstzmultirange
language sql immutable parallel safe
as $$
  select tstzmultirange(
           tstzrange(p_started_at, greatest(p_started_at, p_ended_at), '[)')
         )
         - coalesce(p_pauses, '{}'::tstzmultirange);
$$;

-- Total active seconds, with no day splitting. This is what net_seconds holds.
create or replace function public.active_seconds(
  p_started_at timestamptz,
  p_ended_at   timestamptz,
  p_pauses     tstzmultirange
) returns numeric
language sql immutable parallel safe
as $$
  select coalesce(
    (
      select sum(extract(epoch from (upper(r) - lower(r))))
      from unnest(public.active_ranges(p_started_at, p_ended_at, p_pauses)) as r
    ),
    0
  )::numeric;
$$;

-- ---------------------------------------------------------------------------
-- The load-bearing one.
--
-- Splits a session's active intervals at local midnight in the given zone and
-- returns one row per local day touched. A 23:30 to 00:45 session returns two
-- rows with the right seconds on each side. A 14 hour session returns however
-- many days it crosses.
--
-- Every aggregate in the app goes through this, so there is exactly one place
-- where day attribution can be wrong, and it is the place that is tested.
--
-- DST is handled by construction: local midnight is resolved through the zone
-- rather than assumed to be 24 hours apart, so a 23 hour spring-forward day and
-- a 25 hour fall-back day both come out right.
-- ---------------------------------------------------------------------------
create or replace function public.active_slices(
  p_started_at timestamptz,
  p_ended_at   timestamptz,
  p_pauses     tstzmultirange,
  p_tz         text
) returns table (
  local_date  date,
  slice_start timestamptz,
  slice_end   timestamptz,
  seconds     numeric
)
language sql immutable parallel safe
as $$
  with active as (
    select r
    from unnest(
      public.active_ranges(p_started_at, p_ended_at, p_pauses)
    ) as r
    where not isempty(r)
  ),
  spread as (
    select a.r,
           d::date as d
    from active a
    cross join lateral generate_series(
      (lower(a.r) at time zone p_tz)::date::timestamp,
      (upper(a.r) at time zone p_tz)::date::timestamp,
      interval '1 day'
    ) as d
  ),
  cut as (
    select d,
           greatest(lower(r), timezone(p_tz, d::timestamp))              as s,
           least(upper(r),    timezone(p_tz, (d + 1)::timestamp))        as e
    from spread
  )
  select d,
         s,
         e,
         extract(epoch from (e - s))::numeric
  from cut
  where e > s
  order by d, s;
$$;

-- ===========================================================================
-- Table-reading wrappers
-- ===========================================================================

-- A session's pauses as a multirange. An unresolved pause (the session is
-- paused right now) is treated as running to the effective end, so paused time
-- is never counted as study time.
create or replace function public.session_pause_ranges(
  p_session_id uuid,
  p_end        timestamptz
) returns tstzmultirange
language sql stable parallel safe
set search_path = public, pg_temp
as $$
  select coalesce(
    range_agg(
      tstzrange(
        p.paused_at,
        least(coalesce(p.resumed_at, p_end), p_end),
        '[)'
      )
    ),
    '{}'::tstzmultirange
  )
  from public.session_pauses p
  where p.session_id = p_session_id
    and p.paused_at < p_end;
$$;

-- net_seconds is recomputed here from timestamps on every write, discarding
-- whatever the client sent. There is no code path that lets a client choose
-- how long a session lasted.
create or replace function public.sessions_set_net_seconds()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_end timestamptz;
begin
  if new.status = 'completed' then
    v_end := public.session_effective_end(
      new.started_at, new.ended_at, now(), public.cfg('max_session_hours')
    );
    new.ended_at := v_end;
    new.net_seconds := floor(
      public.active_seconds(
        new.started_at,
        v_end,
        public.session_pause_ranges(new.id, v_end)
      )
    )::integer;
  else
    new.net_seconds := null;
  end if;
  return new;
end;
$$;

create trigger sessions_set_net_seconds
  before insert or update on public.sessions
  for each row execute function public.sessions_set_net_seconds();

-- Per local day, per subject, for one user. Includes the running session live.
create or replace function public.user_day_subject_seconds(
  p_user uuid,
  p_from date,
  p_to   date
) returns table (local_date date, subject_id uuid, seconds numeric)
language sql stable parallel safe
set search_path = public, pg_temp
as $$
  with w as (
    select p.timezone                                     as tz,
           timezone(p.timezone, p_from::timestamp)        as w_start,
           timezone(p.timezone, (p_to + 1)::timestamp)    as w_end
    from public.profiles p
    where p.id = p_user
  ),
  s as (
    select ses.id,
           ses.subject_id,
           ses.started_at,
           public.session_effective_end(
             ses.started_at, ses.ended_at, now(), public.cfg('max_session_hours')
           ) as eff_end
    from public.sessions ses, w
    where ses.user_id = p_user
      and ses.status in ('running', 'paused', 'completed')
      and ses.started_at < w.w_end
  ),
  sliced as (
    select sl.local_date, s.subject_id, sl.seconds
    from s
    cross join w
    cross join lateral public.active_slices(
      s.started_at, s.eff_end, public.session_pause_ranges(s.id, s.eff_end), w.tz
    ) sl
    where s.eff_end > w.w_start
  )
  select sliced.local_date, sliced.subject_id, sum(sliced.seconds)::numeric
  from sliced
  where sliced.local_date between p_from and p_to
  group by sliced.local_date, sliced.subject_id;
$$;

-- Per local day totals across all subjects. What goals, streaks and the
-- heatmap read.
create or replace function public.user_day_seconds(
  p_user uuid,
  p_from date,
  p_to   date
) returns table (local_date date, seconds numeric)
language sql stable parallel safe
set search_path = public, pg_temp
as $$
  select d.local_date, sum(d.seconds)::numeric
  from public.user_day_subject_seconds(p_user, p_from, p_to) d
  group by d.local_date;
$$;

-- Today in the user's own zone. Every date-sensitive query starts here rather
-- than with the server's idea of the date.
create or replace function public.user_today(p_user uuid)
returns date
language sql stable parallel safe
set search_path = public, pg_temp
as $$
  select (now() at time zone p.timezone)::date
  from public.profiles p
  where p.id = p_user;
$$;

grant select, insert, update, delete on public.sessions       to authenticated;
grant select, insert, update, delete on public.session_pauses to authenticated;
