-- Corrects what active_session returns.
--
-- The first version summed every pause, including one that is still open,
-- up to the server's clock at query time. That value grows while the session
-- is paused, so a client holding it could not render a paused timer: the
-- frozen number would drift by however long the tab had been open.
--
-- Resolved pauses and the open one are now returned separately, which is what
-- the client actually needs:
--
--   running:  elapsed = now - started_at - closed_paused_seconds
--   paused:   elapsed = paused_at - started_at - closed_paused_seconds
--
-- Both are arithmetic on fixed timestamps, so neither can drift.

drop function if exists public.active_session();

create function public.active_session()
returns table (
  id                    uuid,
  subject_id            uuid,
  subtopic_id           uuid,
  mode                  public.session_mode,
  status                public.session_status,
  started_at            timestamptz,
  planned_seconds       integer,
  -- Resolved pauses only. Never includes a pause that is still open.
  closed_paused_seconds numeric,
  -- When the open pause began, or null when the session is running.
  paused_at             timestamptz,
  auto_closed_last      boolean,
  server_now            timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_closed integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  v_closed := public.finalize_stale_sessions(v_user);

  return query
  select s.id, s.subject_id, s.subtopic_id, s.mode, s.status, s.started_at,
         s.planned_seconds,
         coalesce(
           (
             select sum(extract(epoch from (p.resumed_at - p.paused_at)))
             from public.session_pauses p
             where p.session_id = s.id and p.resumed_at is not null
           ),
           0
         )::numeric,
         (
           select p.paused_at
           from public.session_pauses p
           where p.session_id = s.id and p.resumed_at is null
           limit 1
         ),
         -- Tells the client that a session was closed by the 12 hour cap on
         -- this call, so the timer screen can say so rather than silently
         -- showing nothing where a running timer used to be.
         v_closed > 0,
         now()
  from public.sessions s
  where s.user_id = v_user and s.status in ('running', 'paused')
  limit 1;
end;
$$;

grant execute on function public.active_session() to authenticated;

-- Today's total for the signed in user, in their own timezone. The timer
-- screen shows this next to the running number, so the figure someone is
-- accumulating is visible while they accumulate it.
--
-- The total already includes whatever the running session has accrued, because
-- user_day_seconds counts running sessions. It is returned with the instant it
-- was measured so a client can keep it ticking by adding only the time since
-- that instant. Adding the session's whole elapsed time instead would count
-- the same minutes twice.
create or replace function public.today_seconds()
returns table (seconds numeric, as_of timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
           (
             select sum(d.seconds)
             from public.user_day_seconds(
               auth.uid(),
               public.user_today(auth.uid()),
               public.user_today(auth.uid())
             ) d
           ),
           0
         )::numeric,
         now();
$$;

grant execute on function public.today_seconds() to authenticated;
