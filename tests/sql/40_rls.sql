-- Row level security, tested adversarially.
--
-- Every assertion here is of the form "this must not be possible". A second
-- user tries to read and write the first user's data, and a client tries to
-- write its own points.
\set QUIET on
\pset pager off
set client_min_messages = notice;

do $$
declare
  v_a     uuid;
  v_b     uuid;
  v_subj_a uuid;
  v_subj_b uuid;
  v_sess_a uuid;
  v_rew_a  uuid;
  v_fs     uuid;
  v_n      integer;
begin
  v_a := t.make_user('alice', 'UTC');
  v_b := t.make_user('bob', 'UTC');
  v_subj_a := t.first_subject(v_a);
  v_subj_b := t.first_subject(v_b);

  v_sess_a := t.past_session(v_a, v_subj_a,
    now() - interval '3 hours', now() - interval '1 hour');

  select id into v_rew_a from public.rewards where user_id = v_a limit 1;

  -- =====================================================================
  -- Bob, an ordinary authenticated user who is not Alice's friend.
  -- =====================================================================
  perform auth.login_as(v_b);

  perform t.eq('bob cannot see alice''s profile',
    (select count(*)::integer from public.profiles where id = v_a), 0);
  perform t.eq('bob cannot see alice''s subjects',
    (select count(*)::integer from public.subjects where user_id = v_a), 0);
  perform t.eq('bob cannot see alice''s subtopics',
    (select count(*)::integer from public.subtopics s
      join public.subjects sj on sj.id = s.subject_id where sj.user_id = v_a), 0);
  perform t.eq('bob cannot see alice''s sessions',
    (select count(*)::integer from public.sessions where user_id = v_a), 0);
  perform t.eq('bob cannot see alice''s pauses',
    (select count(*)::integer from public.session_pauses p
      join public.sessions s on s.id = p.session_id where s.user_id = v_a), 0);
  perform t.eq('bob cannot see alice''s goals',
    (select count(*)::integer from public.goals where user_id = v_a), 0);
  perform t.eq('bob cannot see alice''s rewards',
    (select count(*)::integer from public.rewards where user_id = v_a), 0);
  perform t.eq('bob cannot see alice''s ledger',
    (select count(*)::integer from public.points_ledger where user_id = v_a), 0);
  perform t.eq('bob cannot see alice''s redemptions',
    (select count(*)::integer from public.redemptions where user_id = v_a), 0);

  -- Writes into Alice's data are rejected rather than silently ignored.
  perform t.raises('bob cannot insert a session for alice',
    format('insert into public.sessions (user_id, subject_id, status, started_at) '
           'values (%L, %L, ''running'', now())', v_a, v_subj_a));
  perform t.raises('bob cannot insert a subject for alice',
    format('insert into public.subjects (user_id, name, color) '
           'values (%L, ''sneaky'', ''blue'')', v_a));
  perform t.raises('bob cannot reassign his own session to alice',
    format('insert into public.sessions (user_id, subject_id, status, started_at) '
           'values (%L, %L, ''running'', now())', v_a, v_subj_b));
  perform t.raises('bob cannot start a session on alice''s subject',
    format('select public.start_session(%L)', v_subj_a));
  perform t.raises('bob cannot redeem alice''s reward',
    format('select public.redeem_reward(%L)', v_rew_a));
  perform t.raises('bob cannot read alice''s balance',
    format('select public.point_balance(%L)', v_a));
  perform t.raises('bob cannot read alice''s goal status',
    format('select * from public.goal_status(%L)', v_a));
  perform t.raises('bob cannot finalize alice''s sessions',
    format('select public.finalize_stale_sessions(%L)', v_a));

  -- Updates and deletes touch nothing.
  update public.sessions set note = 'tampered' where user_id = v_a;
  perform t.eq('bob''s update of alice''s sessions affects no rows',
    (select count(*)::integer from public.sessions
      where id = v_sess_a and note = 'tampered'), 0);

  delete from public.subjects where user_id = v_a;
  perform auth.logout();
  perform t.ok('bob''s delete of alice''s subjects removed nothing',
    exists (select 1 from public.subjects where id = v_subj_a));
  perform auth.login_as(v_b);

  -- =====================================================================
  -- The ledger. No client may write to it under any circumstances.
  -- =====================================================================
  perform t.raises('bob cannot mint points for himself',
    format('insert into public.points_ledger (user_id, delta, reason) '
           'values (%L, 1000000, ''adjustment'')', v_b));
  perform t.raises('bob cannot mint points for alice',
    format('insert into public.points_ledger (user_id, delta, reason) '
           'values (%L, 1000000, ''adjustment'')', v_a));
  perform t.raises('bob cannot edit his own ledger rows',
    'update public.points_ledger set delta = 999999');
  perform t.raises('bob cannot delete ledger rows',
    'delete from public.points_ledger');
  perform t.raises('bob cannot write a redemption directly',
    format('insert into public.redemptions (user_id, reward_id, points_spent) '
           'values (%L, %L, 1)', v_b, v_rew_a));
  perform t.raises('bob cannot call the award function directly',
    format('select public.award_session_points(%L)', v_sess_a));
  perform t.raises('bob cannot bootstrap an arbitrary user',
    format('select public.bootstrap_user(%L, ''x'')', v_a));

  -- The derived daily goal mirror is not directly settable.
  perform t.raises('bob cannot set his daily goal mirror by hand',
    'update public.profiles set daily_goal_minutes = 1 where id = auth.uid()');

  -- =====================================================================
  -- Friend visibility, before and after accepting.
  -- =====================================================================
  perform t.eq('a stranger sees nobody on the leaderboard but themselves',
    (select count(*)::integer from public.friend_leaderboard('today')), 1);
  perform t.eq('a stranger sees no friend activity',
    (select count(*)::integer from public.friend_activity()), 0);

  -- Bob finds Alice by handle. He learns her name and nothing else.
  perform t.eq('handle lookup finds the account',
    (select count(*)::integer from public.find_profile_by_handle('alice')), 1);
  perform t.eq('handle lookup on a stranger reports no relationship',
    (select friendship_status from public.find_profile_by_handle('alice')), 'none');

  perform public.send_friend_request('alice');
  perform t.eq('the request shows as outgoing',
    (select friendship_status from public.find_profile_by_handle('alice')), 'outgoing');

  -- Still nothing visible while the request is pending.
  perform t.eq('a pending request grants no visibility',
    (select count(*)::integer from public.friend_activity()), 0);

  perform auth.logout();
  perform auth.login_as(v_a);
  select friendship_id into v_fs from public.pending_friend_requests()
    where direction = 'incoming';
  perform t.ok('alice sees the incoming request', v_fs is not null);
  perform public.respond_to_friend_request(v_fs, true);
  perform auth.logout();
  perform auth.login_as(v_b);

  perform t.eq('after accepting, bob sees alice in his activity list',
    (select count(*)::integer from public.friend_activity() where handle = 'alice'), 1);
  perform t.eq('and on the leaderboard',
    (select count(*)::integer from public.friend_leaderboard('today')), 2);

  -- Even as a friend, direct table access is still denied. Everything a
  -- friend can see comes through the functions.
  perform t.eq('a friend still cannot select alice''s sessions',
    (select count(*)::integer from public.sessions where user_id = v_a), 0);
  perform t.eq('a friend still cannot select alice''s profile row',
    (select count(*)::integer from public.profiles where id = v_a), 0);
  perform t.eq('a friend still cannot select alice''s subjects',
    (select count(*)::integer from public.subjects where user_id = v_a), 0);
  perform t.eq('a friend still cannot read alice''s balance',
    (select count(*)::integer from public.points_ledger where user_id = v_a), 0);

  -- =====================================================================
  -- The privacy toggle actually withholds the subject name.
  -- =====================================================================
  perform auth.logout();
  perform auth.login_as(v_a);
  perform public.start_session(v_subj_a);
  perform auth.logout();
  perform auth.login_as(v_b);

  perform t.ok('bob can see that alice is studying',
    (select is_studying from public.friend_activity() where handle = 'alice'));
  perform t.ok('and can see which subject, by default',
    (select subject_name from public.friend_activity() where handle = 'alice')
      is not null);

  perform auth.logout();
  update public.profiles set hide_subjects_from_friends = true where id = v_a;
  perform auth.login_as(v_b);

  perform t.ok('with privacy on, bob still sees that alice is studying',
    (select is_studying from public.friend_activity() where handle = 'alice'));
  perform t.ok('but the subject name is withheld',
    (select subject_name from public.friend_activity() where handle = 'alice') is null);
  perform t.ok('and so is the subject colour',
    (select subject_color from public.friend_activity() where handle = 'alice') is null);
  perform t.ok('while totals are still shared',
    (select today_seconds from public.friend_activity() where handle = 'alice')
      is not null);
  perform t.ok('and the client is told privacy is on, so the UI can say so',
    (select subjects_hidden from public.friend_activity() where handle = 'alice'));

  -- =====================================================================
  -- The anon role, which is what an unauthenticated page holds.
  -- =====================================================================
  perform auth.logout();
  execute 'set local role anon';
  -- anon holds no table privileges at all, so these fail before RLS is even
  -- consulted. That is a stronger result than returning zero rows.
  perform t.raises('anon cannot read profiles',
    'select count(*) from public.profiles');
  perform t.raises('anon cannot read sessions',
    'select count(*) from public.sessions');
  perform t.raises('anon cannot read the ledger',
    'select count(*) from public.points_ledger');
  perform t.raises('anon cannot start a session',
    format('select public.start_session(%L)', v_subj_a));
  execute 'set local role postgres';
end
$$;
