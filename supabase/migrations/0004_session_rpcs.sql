-- Session state transitions.
--
-- Every one of these is security definer and stamps its own timestamps with
-- now(). The client names a session and an intent; it never supplies a time.
-- The only exception is the offline replay path on complete_session, where a
-- client timestamp is accepted and then clamped into [started_at, now()].

create or replace function public.server_now()
returns timestamptz
language sql stable parallel safe
as $$ select now(); $$;

-- Finalize anything the user left running past the cap. Called at the top of
-- every transition and by the read path, so the database and the UI can never
-- hold different opinions about whether a session is still going.
create or replace function public.finalize_stale_sessions(p_user uuid default auth.uid())
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_cap   interval := public.cfg('max_session_hours') * interval '1 hour';
  v_count integer;
begin
  if p_user is null or p_user <> auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Close any open pause at the same instant, so pause math stays consistent.
  update public.session_pauses p
     set resumed_at = s.started_at + v_cap
    from public.sessions s
   where p.session_id = s.id
     and p.resumed_at is null
     and s.user_id = p_user
     and s.status in ('running', 'paused')
     and s.started_at + v_cap <= now()
     and p.paused_at <= s.started_at + v_cap;

  update public.sessions s
     set status      = 'completed',
         ended_at    = s.started_at + v_cap,
         auto_closed = true
   where s.user_id = p_user
     and s.status in ('running', 'paused')
     and s.started_at + v_cap <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.start_session(
  p_subject_id      uuid,
  p_subtopic_id     uuid    default null,
  p_mode            public.session_mode default 'stopwatch',
  p_planned_seconds integer default null
) returns public.sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.sessions;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  perform public.finalize_stale_sessions(v_user);

  if exists (
    select 1 from public.sessions
    where user_id = v_user and status in ('running', 'paused')
  ) then
    raise exception 'a session is already running'
      using errcode = 'P0001', hint = 'active_session_exists';
  end if;

  if not exists (
    select 1 from public.subjects
    where id = p_subject_id and user_id = v_user and archived_at is null
  ) then
    raise exception 'subject not found' using errcode = 'P0002';
  end if;

  if p_subtopic_id is not null and not exists (
    select 1 from public.subtopics
    where id = p_subtopic_id and subject_id = p_subject_id and archived_at is null
  ) then
    raise exception 'subtopic does not belong to that subject' using errcode = 'P0002';
  end if;

  insert into public.sessions (
    user_id, subject_id, subtopic_id, mode, status, started_at, planned_seconds
  ) values (
    v_user, p_subject_id, p_subtopic_id, p_mode, 'running', now(),
    case when p_mode = 'pomodoro' then p_planned_seconds end
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.pause_session(p_session_id uuid)
returns public.sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.sessions;
begin
  update public.sessions
     set status = 'paused'
   where id = p_session_id and user_id = v_user and status = 'running'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'no running session to pause' using errcode = 'P0002';
  end if;

  insert into public.session_pauses (session_id, paused_at)
  values (p_session_id, now());

  return v_row;
end;
$$;

create or replace function public.resume_session(p_session_id uuid)
returns public.sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.sessions;
begin
  update public.sessions
     set status = 'running'
   where id = p_session_id and user_id = v_user and status = 'paused'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'no paused session to resume' using errcode = 'P0002';
  end if;

  update public.session_pauses
     set resumed_at = now()
   where session_id = p_session_id and resumed_at is null;

  return v_row;
end;
$$;

-- p_client_ended_at exists only for the offline replay path: a stop that
-- happened while the device had no signal. It is clamped to the session's own
-- span so a wrong device clock cannot write a future or pre-start end time.
create or replace function public.complete_session(
  p_session_id      uuid,
  p_client_ended_at timestamptz default null
) returns public.sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.sessions;
  v_end  timestamptz;
begin
  select * into v_row
  from public.sessions
  where id = p_session_id and user_id = v_user and status in ('running', 'paused')
  for update;

  if v_row.id is null then
    raise exception 'no active session to complete' using errcode = 'P0002';
  end if;

  v_end := greatest(v_row.started_at, least(coalesce(p_client_ended_at, now()), now()));

  update public.session_pauses
     set resumed_at = least(greatest(paused_at, v_end), v_end)
   where session_id = p_session_id and resumed_at is null;

  -- net_seconds and the cap are applied by the sessions_set_net_seconds
  -- trigger, which recomputes from timestamps and ignores anything sent here.
  update public.sessions
     set status = 'completed', ended_at = v_end
   where id = p_session_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Discard marks rather than deletes, so undo can actually restore. Discarded
-- rows are excluded from every aggregate, so they cost nothing by staying.
create or replace function public.discard_session(p_session_id uuid)
returns public.sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.sessions;
begin
  update public.sessions
     set status = 'discarded', ended_at = coalesce(ended_at, now())
   where id = p_session_id and user_id = v_user and status in ('running', 'paused')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'no active session to discard' using errcode = 'P0002';
  end if;

  update public.session_pauses
     set resumed_at = now()
   where session_id = p_session_id and resumed_at is null;

  return v_row;
end;
$$;

create or replace function public.undo_discard_session(p_session_id uuid)
returns public.sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_row  public.sessions;
begin
  if exists (
    select 1 from public.sessions
    where user_id = v_user and status in ('running', 'paused')
  ) then
    raise exception 'another session is already running'
      using errcode = 'P0001', hint = 'active_session_exists';
  end if;

  update public.sessions
     set status = 'running', ended_at = null
   where id = p_session_id and user_id = v_user and status = 'discarded'
  returning * into v_row;

  if v_row.id is null then
    raise exception 'no discarded session to restore' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

-- Switching subject mid-session ends the current one and opens a new one that
-- points back at it, so the chain is a real relationship rather than something
-- inferred later from adjacent timestamps.
create or replace function public.switch_session_subject(
  p_session_id  uuid,
  p_subject_id  uuid,
  p_subtopic_id uuid default null
) returns public.sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_old  public.sessions;
  v_new  public.sessions;
  v_at   timestamptz := now();
begin
  select * into v_old
  from public.sessions
  where id = p_session_id and user_id = v_user and status in ('running', 'paused')
  for update;

  if v_old.id is null then
    raise exception 'no active session to switch' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.subjects
    where id = p_subject_id and user_id = v_user and archived_at is null
  ) then
    raise exception 'subject not found' using errcode = 'P0002';
  end if;

  if p_subtopic_id is not null and not exists (
    select 1 from public.subtopics
    where id = p_subtopic_id and subject_id = p_subject_id and archived_at is null
  ) then
    raise exception 'subtopic does not belong to that subject' using errcode = 'P0002';
  end if;

  update public.session_pauses
     set resumed_at = least(greatest(paused_at, v_at), v_at)
   where session_id = p_session_id and resumed_at is null;

  update public.sessions
     set status = 'completed', ended_at = v_at
   where id = p_session_id;

  insert into public.sessions (
    user_id, subject_id, subtopic_id, mode, status, started_at,
    planned_seconds, chained_from_session_id
  ) values (
    v_user, p_subject_id, p_subtopic_id, v_old.mode, 'running', v_at,
    v_old.planned_seconds, v_old.id
  )
  returning * into v_new;

  return v_new;
end;
$$;

-- Time studied away from the app. Flagged is_manual in the row, so stats,
-- points and the friend leaderboard can all tell the difference.
create or replace function public.add_manual_session(
  p_subject_id  uuid,
  p_started_at  timestamptz,
  p_ended_at    timestamptz,
  p_subtopic_id uuid default null,
  p_note        text default null
) returns public.sessions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_row     public.sessions;
  v_minutes numeric;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_ended_at <= p_started_at then
    raise exception 'the end time must be after the start time' using errcode = 'P0001';
  end if;

  if p_ended_at > now() then
    raise exception 'that time is in the future' using errcode = 'P0001';
  end if;

  v_minutes := extract(epoch from (p_ended_at - p_started_at)) / 60;
  if v_minutes > public.cfg('manual_max_minutes_entry') then
    raise exception 'a single manual entry cannot be longer than % minutes',
      public.cfg('manual_max_minutes_entry')::integer using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.subjects
    where id = p_subject_id and user_id = v_user and archived_at is null
  ) then
    raise exception 'subject not found' using errcode = 'P0002';
  end if;

  if p_subtopic_id is not null and not exists (
    select 1 from public.subtopics
    where id = p_subtopic_id and subject_id = p_subject_id and archived_at is null
  ) then
    raise exception 'subtopic does not belong to that subject' using errcode = 'P0002';
  end if;

  insert into public.sessions (
    user_id, subject_id, subtopic_id, mode, status,
    started_at, ended_at, note, is_manual
  ) values (
    v_user, p_subject_id, p_subtopic_id, 'stopwatch', 'completed',
    p_started_at, p_ended_at, p_note, true
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- The one session in flight, if any, with its pause total already resolved.
-- This is what the timer screen reads on load and after every reconnect.
create or replace function public.active_session()
returns table (
  id              uuid,
  subject_id      uuid,
  subtopic_id     uuid,
  mode            public.session_mode,
  status          public.session_status,
  started_at      timestamptz,
  planned_seconds integer,
  paused_seconds  numeric,
  paused_at       timestamptz,
  server_now      timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  perform public.finalize_stale_sessions(v_user);

  return query
  select s.id, s.subject_id, s.subtopic_id, s.mode, s.status, s.started_at,
         s.planned_seconds,
         coalesce(
           (
             select sum(extract(epoch from (
               least(coalesce(p.resumed_at, now()), now()) - p.paused_at
             )))
             from public.session_pauses p
             where p.session_id = s.id and p.paused_at <= now()
           ), 0
         )::numeric,
         (
           select p.paused_at from public.session_pauses p
           where p.session_id = s.id and p.resumed_at is null
           limit 1
         ),
         now()
  from public.sessions s
  where s.user_id = v_user and s.status in ('running', 'paused')
  limit 1;
end;
$$;

revoke all on function public.finalize_stale_sessions(uuid) from public;

grant execute on function public.server_now()                      to authenticated, anon;
grant execute on function public.finalize_stale_sessions(uuid)     to authenticated;
grant execute on function public.start_session(uuid, uuid, public.session_mode, integer) to authenticated;
grant execute on function public.pause_session(uuid)               to authenticated;
grant execute on function public.resume_session(uuid)              to authenticated;
grant execute on function public.complete_session(uuid, timestamptz) to authenticated;
grant execute on function public.discard_session(uuid)             to authenticated;
grant execute on function public.undo_discard_session(uuid)        to authenticated;
grant execute on function public.switch_session_subject(uuid, uuid, uuid) to authenticated;
grant execute on function public.add_manual_session(uuid, timestamptz, timestamptz, uuid, text) to authenticated;
grant execute on function public.active_session()                  to authenticated;
