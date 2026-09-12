-- Points, goals, streaks and redemption.
\set QUIET on
\pset pager off
set client_min_messages = notice;

do $$
declare
  v_user  uuid;
  v_subj  uuid;
  v_rew   uuid;
  v_s     public.sessions;
  v_bal   integer;
  v_bal2  integer;
  v_today date;
  v_n     integer;
begin
  v_user := t.make_user('earner', 'UTC');
  v_subj := t.first_subject(v_user);
  perform auth.login_as(v_user);

  v_today := public.user_today(v_user);

  -- One point per minute, awarded once, on completion.
  perform t.eq('a new account starts at zero points', public.point_balance(v_user), 0);

  perform t.past_session(v_user, v_subj,
    v_today::timestamp at time zone 'UTC' + interval '9 hours',
    v_today::timestamp at time zone 'UTC' + interval '9 hours 30 minutes');
  perform t.eq('30 minutes earns 30 points', t.session_points(v_user), 30);

  perform t.eq('exactly one session row in the ledger',
    (select count(*)::integer from public.points_ledger
      where user_id = v_user and reason = 'session'), 1);

  -- Meeting the 120 minute daily goal pays the bonus once, plus a streak bonus.
  perform t.past_session(v_user, v_subj,
    v_today::timestamp at time zone 'UTC' + interval '10 hours',
    v_today::timestamp at time zone 'UTC' + interval '12 hours');
  perform t.ok('the daily goal is met', public.daily_goal_met_on(v_user, v_today));
  perform t.eq('the goal bonus is paid once',
    (select count(*)::integer from public.points_ledger
      where user_id = v_user and reason = 'goal_bonus'), 1);
  perform t.eq('the goal bonus is 20',
    (select delta from public.points_ledger
      where user_id = v_user and reason = 'goal_bonus'), 20);

  -- More study on the same day must not pay the bonus again.
  perform t.past_session(v_user, v_subj,
    v_today::timestamp at time zone 'UTC' + interval '13 hours',
    v_today::timestamp at time zone 'UTC' + interval '14 hours');
  perform t.eq('the goal bonus is still paid only once',
    (select count(*)::integer from public.points_ledger
      where user_id = v_user and reason = 'goal_bonus'), 1);
  perform t.eq('the streak bonus is also paid only once',
    (select count(*)::integer from public.points_ledger
      where user_id = v_user and reason = 'streak_bonus'), 1);

  -- The streak bonus is capped.
  perform t.ok('the streak bonus respects the cap',
    (select max(delta) from public.points_ledger
      where user_id = v_user and reason = 'streak_bonus') <= 50);

  -- Balance is the sum of the ledger, with no stored total to disagree with.
  perform t.eq('balance equals sum(delta)',
    public.point_balance(v_user),
    (select sum(delta)::integer from public.points_ledger where user_id = v_user));

  -- ---------------------------------------------------------------------
  -- Streaks
  -- ---------------------------------------------------------------------
  perform t.eq('one qualifying day is a streak of one',
    public.current_streak(v_user), 1);

  -- Three consecutive qualifying days, ending yesterday, with today short.
  delete from public.sessions where user_id = v_user;
  perform auth.logout();
  delete from public.points_ledger where user_id = v_user;
  perform auth.login_as(v_user);

  for v_n in 1..3 loop
    perform t.past_session(v_user, v_subj,
      (v_today - v_n)::timestamp at time zone 'UTC' + interval '9 hours',
      (v_today - v_n)::timestamp at time zone 'UTC' + interval '12 hours');
  end loop;
  perform t.eq('three consecutive days, today not yet earned, is a streak of three',
    public.current_streak(v_user), 3);

  -- A gap breaks it.
  delete from public.sessions where user_id = v_user;
  perform t.past_session(v_user, v_subj,
    (v_today - 1)::timestamp at time zone 'UTC' + interval '9 hours',
    (v_today - 1)::timestamp at time zone 'UTC' + interval '12 hours');
  perform t.past_session(v_user, v_subj,
    (v_today - 3)::timestamp at time zone 'UTC' + interval '9 hours',
    (v_today - 3)::timestamp at time zone 'UTC' + interval '12 hours');
  perform t.eq('a missed day ends the streak', public.current_streak(v_user), 1);

  -- A day that falls short of the goal does not count, even if time was logged.
  delete from public.sessions where user_id = v_user;
  perform t.past_session(v_user, v_subj,
    (v_today - 1)::timestamp at time zone 'UTC' + interval '9 hours',
    (v_today - 1)::timestamp at time zone 'UTC' + interval '9 hours 10 minutes');
  perform t.eq('ten minutes is not a streak day', public.current_streak(v_user), 0);

  -- ---------------------------------------------------------------------
  -- Redemption
  -- ---------------------------------------------------------------------
  perform auth.logout();
  delete from public.points_ledger where user_id = v_user;
  insert into public.points_ledger (user_id, delta, reason)
  values (v_user, 500, 'adjustment');
  perform auth.login_as(v_user);

  select id into v_rew from public.rewards
    where user_id = v_user and title = 'One episode';

  perform t.eq('balance before redeeming', public.point_balance(v_user), 500);
  perform public.redeem_reward(v_rew);
  perform t.eq('redeeming spends the cost', public.point_balance(v_user), 380);
  perform t.eq('a redemption row is written',
    (select count(*)::integer from public.redemptions where user_id = v_user), 1);
  perform t.eq('the ledger records the spend as negative',
    (select delta from public.points_ledger
      where user_id = v_user and reason = 'redemption'), -120);

  -- The cooldown holds.
  perform t.raises('a reward on cooldown cannot be redeemed again',
    format('select public.redeem_reward(%L)', v_rew));

  -- Overdrawing is impossible.
  select id into v_rew from public.rewards
    where user_id = v_user and title = 'Buy the thing in my cart';
  perform t.raises('a reward beyond the balance is refused',
    format('select public.redeem_reward(%L)', v_rew));
  perform t.eq('a refused redemption changes nothing',
    public.point_balance(v_user), 380);
  perform t.eq('and writes no redemption row',
    (select count(*)::integer from public.redemptions where user_id = v_user), 1);

  -- Spending everything lands exactly on zero and cannot go below.
  perform auth.logout();
  delete from public.points_ledger where user_id = v_user;
  delete from public.redemptions where user_id = v_user;
  insert into public.points_ledger (user_id, delta, reason)
  values (v_user, 120, 'adjustment');
  perform auth.login_as(v_user);

  select id into v_rew from public.rewards
    where user_id = v_user and title = 'One episode';
  perform public.redeem_reward(v_rew);
  perform t.eq('spending the exact balance lands on zero',
    public.point_balance(v_user), 0);
  perform t.raises('and a further redemption is refused',
    format('select public.redeem_reward(%L)', v_rew));

  -- ---------------------------------------------------------------------
  -- The manual entry ceiling
  --
  -- Anchored to a fixed past day rather than to now(), so the assertion does
  -- not depend on what time of day the suite happens to run. The ceiling is
  -- keyed on the local day a session starts.
  -- ---------------------------------------------------------------------
  perform auth.logout();
  delete from public.points_ledger where user_id = v_user;
  delete from public.sessions where user_id = v_user;
  perform auth.login_as(v_user);

  -- Four hours of manual entry on one day is exactly the daily ceiling.
  perform t.past_manual_session(v_user, v_subj,
    (v_today - 5)::timestamp at time zone 'UTC' + interval '8 hours',
    (v_today - 5)::timestamp at time zone 'UTC' + interval '12 hours');
  v_bal := t.session_points(v_user);
  perform t.eq('manual entry earns up to the ceiling', v_bal, 240);

  -- A further manual hour on the same day earns no more points.
  perform t.past_manual_session(v_user, v_subj,
    (v_today - 5)::timestamp at time zone 'UTC' + interval '13 hours',
    (v_today - 5)::timestamp at time zone 'UTC' + interval '14 hours');
  v_bal2 := t.session_points(v_user);
  perform t.eq('manual entry past the ceiling earns no more points', v_bal2, v_bal);

  -- The time above the ceiling still counts as studied.
  perform t.eq('time above the ceiling still counts toward totals',
    (select sum(seconds) from public.user_day_seconds(v_user, v_today - 5, v_today - 5)),
    (5 * 3600)::numeric);

  -- The next day gets its own allowance.
  perform t.past_manual_session(v_user, v_subj,
    (v_today - 4)::timestamp at time zone 'UTC' + interval '8 hours',
    (v_today - 4)::timestamp at time zone 'UTC' + interval '9 hours');
  perform t.eq('the ceiling resets the following day',
    t.session_points(v_user), v_bal + 60);

  -- Timed sessions are not subject to the manual ceiling.
  perform t.past_session(v_user, v_subj,
    (v_today - 5)::timestamp at time zone 'UTC' + interval '15 hours',
    (v_today - 5)::timestamp at time zone 'UTC' + interval '17 hours');
  perform t.eq('a timed session is not capped by the manual ceiling',
    t.session_points(v_user), v_bal + 60 + 120);

  perform auth.logout();
end
$$;
