-- What the timer screen reads on load and after every reconnect.
\set QUIET on
\pset pager off
set client_min_messages = notice;

do $$
declare
  v_user  uuid;
  v_subj  uuid;
  v_s     public.sessions;
  v_a     record;
begin
  v_user := t.make_user('timekeeper', 'UTC');
  v_subj := t.first_subject(v_user);
  perform auth.login_as(v_user);

  perform t.eq('no active session on a fresh account',
    (select count(*)::integer from public.active_session()), 0);

  v_s := public.start_session(v_subj);
  select * into v_a from public.active_session();

  perform t.eq('the running session is returned', v_a.id, v_s.id);
  perform t.eq('with its status', v_a.status, 'running'::public.session_status);
  perform t.eq('no closed pauses yet', v_a.closed_paused_seconds, 0::numeric);
  perform t.ok('and no open pause', v_a.paused_at is null);
  perform t.ok('the server clock comes back with it', v_a.server_now is not null);

  -- While paused, the open pause must not appear in the closed total. That is
  -- the bug this shape exists to prevent: a client holding a total that grows
  -- cannot render a paused timer that holds still.
  perform public.pause_session(v_s.id);
  select * into v_a from public.active_session();

  perform t.eq('pausing does not inflate the closed total',
    v_a.closed_paused_seconds, 0::numeric);
  perform t.ok('the open pause is reported separately', v_a.paused_at is not null);
  perform t.eq('and the status says paused', v_a.status, 'paused'::public.session_status);

  -- Reading it again must give the same closed total.
  perform t.eq('and it still does not grow on a second read',
    (select closed_paused_seconds from public.active_session()), 0::numeric);

  -- now() is the transaction timestamp, so a pause and a resume issued inside
  -- this one DO block would land on the same instant. In the running app each
  -- RPC is its own transaction; here the pause is backdated explicitly so the
  -- aggregation has a real duration to add up.
  update public.session_pauses
     set paused_at = paused_at - interval '5 minutes'
   where session_id = v_s.id and resumed_at is null;

  perform public.resume_session(v_s.id);
  select * into v_a from public.active_session();

  perform t.eq('resuming moves the pause into the closed total',
    round(v_a.closed_paused_seconds), 300::numeric);
  perform t.ok('and clears the open pause', v_a.paused_at is null);

  -- A second pause adds to the first rather than replacing it.
  perform public.pause_session(v_s.id);
  update public.session_pauses
     set paused_at = paused_at - interval '2 minutes'
   where session_id = v_s.id and resumed_at is null;
  perform public.resume_session(v_s.id);

  perform t.eq('a second pause adds to the total',
    round((select closed_paused_seconds from public.active_session())), 420::numeric);

  perform public.complete_session(v_s.id);
  perform t.eq('a completed session is no longer active',
    (select count(*)::integer from public.active_session()), 0);

  -- An abandoned session is finalized by the read path, and the caller is told
  -- so it can explain where the running timer went.
  insert into public.sessions (user_id, subject_id, status, started_at)
  values (v_user, v_subj, 'running', now() - interval '20 hours');

  select * into v_a from public.active_session();
  perform t.eq('reading clears an abandoned session',
    (select count(*)::integer from public.active_session()), 0);

  perform t.ok('the abandoned session was capped and flagged',
    exists (
      select 1 from public.sessions
      where user_id = v_user and auto_closed and net_seconds = 12 * 3600
    ));

  -- Today's total, which sits beside the running number on the timer screen.
  delete from public.sessions where user_id = v_user;
  perform t.eq('today starts at zero',
    (select s2.seconds from public.today_seconds() s2), 0::numeric);
  perform t.ok('and says when it was measured',
    (select s2.as_of from public.today_seconds() s2) is not null);

  perform t.past_session(v_user, v_subj,
    (public.user_today(v_user))::timestamp at time zone 'UTC' + interval '9 hours',
    (public.user_today(v_user))::timestamp at time zone 'UTC' + interval '10 hours 30 minutes');
  perform t.eq('and counts completed sessions from today',
    (select s2.seconds from public.today_seconds() s2), (90 * 60)::numeric);

  -- A running session is already inside the total. The client must add only
  -- the time since as_of, not the session's whole elapsed time, or the same
  -- minutes are counted twice.
  insert into public.sessions (user_id, subject_id, status, started_at)
  values (v_user, v_subj, 'running', now() - interval '30 minutes');
  perform t.ok('a running session is already counted in the total',
    (select s2.seconds from public.today_seconds() s2) > (90 * 60)::numeric,
    format('got %s', (select s2.seconds from public.today_seconds() s2)));

  perform auth.logout();
end
$$;
