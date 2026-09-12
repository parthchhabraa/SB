-- Session lifecycle through the real RPCs, as an authenticated user.
\set QUIET on
\pset pager off
set client_min_messages = notice;

do $$
declare
  v_user    uuid;
  v_other   uuid;
  v_subj    uuid;
  v_subj2   uuid;
  v_s       public.sessions;
  v_s2      public.sessions;
  v_net     integer;
  v_n       integer;
begin
  v_user  := t.make_user('runner', 'Asia/Kolkata');
  v_other := t.make_user('bystander', 'UTC');
  v_subj  := t.first_subject(v_user);
  select id into v_subj2 from public.subjects
    where user_id = v_user and id <> v_subj order by sort_order limit 1;

  perform auth.login_as(v_user);

  -- Start, pause, resume, complete.
  v_s := public.start_session(v_subj);
  perform t.eq('start yields a running session', v_s.status, 'running'::public.session_status);
  perform t.ok('net_seconds is null while running', v_s.net_seconds is null);

  perform t.raises('cannot start a second session',
    format('select public.start_session(%L)', v_subj));

  perform public.pause_session(v_s.id);
  perform t.eq('pause writes a pause row',
    (select count(*)::integer from public.session_pauses where session_id = v_s.id), 1);
  perform t.eq('paused session has an open pause',
    (select count(*)::integer from public.session_pauses
      where session_id = v_s.id and resumed_at is null), 1);

  perform public.resume_session(v_s.id);
  perform t.eq('resume closes the pause',
    (select count(*)::integer from public.session_pauses
      where session_id = v_s.id and resumed_at is null), 0);

  v_s := public.complete_session(v_s.id);
  perform t.eq('complete sets status', v_s.status, 'completed'::public.session_status);
  perform t.ok('complete sets net_seconds', v_s.net_seconds is not null);

  -- The client cannot choose how long a session took. Writing net_seconds
  -- directly is silently recomputed from timestamps by the trigger.
  update public.sessions set net_seconds = 999999 where id = v_s.id;
  select net_seconds into v_net from public.sessions where id = v_s.id;
  perform t.ok('a forged net_seconds is overwritten by the trigger',
    v_net < 1000, format('got %s', v_net));

  -- An end time in the future is clamped to now.
  v_s := public.start_session(v_subj);
  v_s := public.complete_session(v_s.id, now() + interval '5 hours');
  perform t.ok('a future client end time is clamped', v_s.ended_at <= now() + interval '1 second');
  perform t.ok('clamped session earns nothing absurd', v_s.net_seconds < 60,
    format('got %s', v_s.net_seconds));

  -- An end time before the start is clamped up to the start.
  v_s := public.start_session(v_subj);
  v_s := public.complete_session(v_s.id, now() - interval '10 hours');
  perform t.eq('a pre-start client end time is clamped to the start',
    v_s.net_seconds, 0);

  -- Switching subject mid-session chains two sessions together.
  v_s := public.start_session(v_subj);
  v_s2 := public.switch_session_subject(v_s.id, v_subj2);
  perform t.eq('switch completes the first session',
    (select status from public.sessions where id = v_s.id),
    'completed'::public.session_status);
  perform t.eq('switch opens a new running session', v_s2.status,
    'running'::public.session_status);
  perform t.eq('the new session records what it came from',
    v_s2.chained_from_session_id, v_s.id);
  perform t.eq('the new session uses the new subject', v_s2.subject_id, v_subj2);
  perform t.eq('the chain leaves exactly one session active',
    (select count(*)::integer from public.sessions
      where user_id = v_user and status in ('running','paused')), 1);

  -- Discard marks rather than deletes, so undo can restore.
  perform public.discard_session(v_s2.id);
  perform t.eq('discard marks the session',
    (select status from public.sessions where id = v_s2.id),
    'discarded'::public.session_status);
  perform t.ok('a discarded session still exists',
    exists (select 1 from public.sessions where id = v_s2.id));
  perform public.undo_discard_session(v_s2.id);
  perform t.eq('undo restores it to running',
    (select status from public.sessions where id = v_s2.id),
    'running'::public.session_status);
  perform public.discard_session(v_s2.id);

  -- The abandoned session cap.
  insert into public.sessions (user_id, subject_id, status, started_at)
  values (v_user, v_subj, 'running', now() - interval '20 hours');
  perform t.eq('finalize closes the abandoned session',
    public.finalize_stale_sessions(v_user), 1);
  select net_seconds into v_net from public.sessions
   where user_id = v_user and auto_closed order by started_at desc limit 1;
  perform t.eq('it is capped at 12 hours, not 20', v_net, 12 * 3600);
  perform t.ok('and it is flagged as auto closed',
    (select auto_closed from public.sessions
      where user_id = v_user and auto_closed limit 1));

  -- Manual entry.
  v_s := public.add_manual_session(
    v_subj, now() - interval '3 hours', now() - interval '1 hour', null, 'library');
  perform t.ok('manual entry is flagged', v_s.is_manual);
  perform t.eq('manual entry duration is derived from its timestamps',
    v_s.net_seconds, 2 * 3600);
  perform t.raises('a manual entry in the future is refused',
    format('select public.add_manual_session(%L, now(), now() + interval ''1 hour'')', v_subj));
  perform t.raises('a backwards manual entry is refused',
    format('select public.add_manual_session(%L, now(), now() - interval ''1 hour'')', v_subj));
  perform t.raises('an over-long manual entry is refused',
    format('select public.add_manual_session(%L, now() - interval ''20 hours'', now())', v_subj));
  perform t.raises('a manual entry on someone else''s subject is refused',
    format('select public.add_manual_session(%L, now() - interval ''1 hour'', now())',
           t.first_subject(v_other)));

  -- Day totals in the user's own zone. 23:30 to 00:45 India time splits.
  delete from public.sessions where user_id = v_user;
  perform t.past_session(v_user, v_subj,
    timestamptz '2025-03-10 18:00:00+00', timestamptz '2025-03-10 19:15:00+00');
  perform t.eq('day totals split at the user''s midnight, day one',
    (select seconds from public.user_day_seconds(v_user, '2025-03-10', '2025-03-11')
      where local_date = date '2025-03-10'), 1800::numeric);
  perform t.eq('day totals split at the user''s midnight, day two',
    (select seconds from public.user_day_seconds(v_user, '2025-03-10', '2025-03-11')
      where local_date = date '2025-03-11'), 2700::numeric);

  -- Changing timezone re-buckets history, because nothing was precomputed.
  perform auth.logout();
  update public.profiles set timezone = 'UTC' where id = v_user;
  perform auth.login_as(v_user);
  perform t.eq('after a timezone change the same session re-buckets',
    (select seconds from public.user_day_seconds(v_user, '2025-03-10', '2025-03-11')
      where local_date = date '2025-03-10'), 4500::numeric);
  select count(*)::integer into v_n from public.user_day_seconds(v_user, '2025-03-10', '2025-03-11');
  perform t.eq('and now occupies a single day', v_n, 1);

  perform auth.logout();
end
$$;
