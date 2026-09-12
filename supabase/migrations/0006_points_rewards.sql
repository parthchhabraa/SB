-- Points, rewards, redemptions.
--
-- Balance is always sum(delta) over points_ledger. There is no balance column
-- anywhere, and there never will be one, because a running total is a number
-- that can drift out of agreement with its own history.
--
-- The ledger is enforced rather than merely intended: it has no INSERT, UPDATE
-- or DELETE policy for authenticated users, and those privileges are revoked.
-- A client holding an anon key cannot mint a single point. Only the security
-- definer functions below write to it.

create table public.rewards (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  title          text not null,
  cost_points    integer not null,
  cooldown_hours integer,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),

  constraint rewards_title_len check (char_length(title) between 1 and 80),
  constraint rewards_cost_positive check (cost_points between 1 and 1000000),
  constraint rewards_cooldown_positive check (cooldown_hours is null or cooldown_hours > 0)
);

create index rewards_user on public.rewards (user_id, created_at)
  where archived_at is null;

alter table public.rewards enable row level security;

create policy rewards_all_own on public.rewards
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table public.redemptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  reward_id    uuid not null references public.rewards (id) on delete restrict,
  -- Snapshotted, so editing a reward's cost later does not rewrite history.
  points_spent integer not null,
  redeemed_at  timestamptz not null default now(),

  constraint redemptions_spent_positive check (points_spent > 0)
);

create index redemptions_user on public.redemptions (user_id, redeemed_at desc);
create index redemptions_reward on public.redemptions (reward_id, redeemed_at desc);

alter table public.redemptions enable row level security;

-- Readable by the owner, written only by redeem_reward.
create policy redemptions_select_own on public.redemptions
  for select to authenticated using (user_id = auth.uid());

create table public.points_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  delta         integer not null,
  reason        public.ledger_reason not null,
  -- Cascade, not set null: if a session row is ever hard deleted, the time it
  -- represented is gone, so the points it paid must go with it. Setting null
  -- here would both break ledger_session_link below and leave points behind
  -- that no longer correspond to any studying. The app itself never hard
  -- deletes a session (discard marks the row instead), so in practice this
  -- fires only on account deletion.
  session_id    uuid references public.sessions (id) on delete cascade,
  redemption_id uuid references public.redemptions (id) on delete cascade,
  -- The local day a bonus was earned for. Makes bonus awarding idempotent, so
  -- a recompute or a retry cannot pay twice.
  awarded_for_date date,
  created_at    timestamptz not null default now(),

  constraint ledger_delta_nonzero check (delta <> 0),
  constraint ledger_redemption_is_negative check (
    reason <> 'redemption' or delta < 0
  ),
  constraint ledger_session_link check (
    (reason = 'session') = (session_id is not null)
  ),
  constraint ledger_redemption_link check (
    (reason = 'redemption') = (redemption_id is not null)
  )
);

create index points_ledger_user on public.points_ledger (user_id, created_at desc);
create index points_ledger_user_delta on public.points_ledger (user_id) include (delta);

-- One payment per session, ever.
create unique index points_ledger_one_per_session
  on public.points_ledger (session_id)
  where reason = 'session';

-- One goal bonus and one streak bonus per local day, ever.
create unique index points_ledger_one_bonus_per_day
  on public.points_ledger (user_id, reason, awarded_for_date)
  where reason in ('goal_bonus', 'streak_bonus');

alter table public.points_ledger enable row level security;

-- Select only. No insert, update or delete policy exists for any client role.
create policy points_ledger_select_own on public.points_ledger
  for select to authenticated using (user_id = auth.uid());

create or replace function public.point_balance(p_user uuid default auth.uid())
returns integer
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
begin
  if p_user is null or p_user <> auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(sum(delta), 0) into v_balance
  from public.points_ledger where user_id = p_user;

  return v_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- Awarding
-- ---------------------------------------------------------------------------
create or replace function public.award_session_points(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_s        public.sessions;
  v_tz       text;
  v_rate     numeric := public.cfg('points_per_minute');
  v_points   integer;
  v_day      date;
  v_already  integer;
  v_allowed  integer;
  v_streak   integer;
  v_bonus    integer;
  r          record;
begin
  select * into v_s from public.sessions where id = p_session_id;
  if v_s.id is null or v_s.status <> 'completed' or coalesce(v_s.net_seconds, 0) <= 0 then
    return;
  end if;

  select p.timezone into v_tz from public.profiles p where p.id = v_s.user_id;
  v_day := (v_s.started_at at time zone v_tz)::date;

  v_points := floor(v_s.net_seconds / 60.0 * v_rate)::integer;

  -- Manual entries earn normally up to a daily ceiling. Above it they still
  -- count toward goals, streaks and stats; only the points stop. Without this
  -- the friend leaderboard is decided by whoever is most willing to type.
  if v_s.is_manual then
    select coalesce(sum(l.delta), 0) into v_already
    from public.points_ledger l
    join public.sessions s2 on s2.id = l.session_id
    where l.user_id = v_s.user_id
      and l.reason = 'session'
      and s2.is_manual
      and l.awarded_for_date = v_day;

    v_allowed := greatest(
      0,
      floor(public.cfg('manual_max_minutes_day') * v_rate)::integer - v_already
    );
    v_points := least(v_points, v_allowed);
  end if;

  if v_points > 0 then
    insert into public.points_ledger (user_id, delta, reason, session_id, awarded_for_date)
    values (v_s.user_id, v_points, 'session', v_s.id, v_day)
    on conflict do nothing;
  end if;

  -- Goal and streak bonuses, once per local day, for every day this session
  -- actually touched. A session that ran across midnight can complete two days.
  for r in
    select distinct sl.local_date as d
    from public.active_slices(
      v_s.started_at,
      public.session_effective_end(v_s.started_at, v_s.ended_at, now(),
                                   public.cfg('max_session_hours')),
      public.session_pause_ranges(v_s.id, v_s.ended_at),
      v_tz
    ) sl
  loop
    if public.daily_goal_met_on(v_s.user_id, r.d) then
      insert into public.points_ledger (user_id, delta, reason, awarded_for_date)
      values (v_s.user_id, public.cfg('daily_goal_bonus')::integer, 'goal_bonus', r.d)
      on conflict do nothing;

      v_streak := public.current_streak(v_s.user_id);
      v_bonus := least(
        v_streak * public.cfg('streak_bonus_per_day')::integer,
        public.cfg('streak_bonus_cap')::integer
      );
      if v_bonus > 0 then
        insert into public.points_ledger (user_id, delta, reason, awarded_for_date)
        values (v_s.user_id, v_bonus, 'streak_bonus', r.d)
        on conflict do nothing;
      end if;
    end if;
  end loop;
end;
$$;

-- Security definer because it writes to points_ledger, which no client role
-- has any privilege on. The ledger is only ever written by code that runs as
-- the owner, which is the whole point of it being a ledger.
create or replace function public.sessions_award_points()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform public.award_session_points(new.id);
  end if;

  -- Undoing a discard or otherwise leaving completed reverses the payment with
  -- an adjustment row rather than deleting history.
  if tg_op = 'UPDATE' and old.status = 'completed' and new.status <> 'completed' then
    insert into public.points_ledger (user_id, delta, reason, session_id, awarded_for_date)
    select l.user_id, -l.delta, 'adjustment', null, l.awarded_for_date
    from public.points_ledger l
    where l.session_id = old.id and l.reason = 'session';

    delete from public.points_ledger where session_id = old.id and reason = 'session';
  end if;

  return null;
end;
$$;

create trigger sessions_award_points
  after insert or update on public.sessions
  for each row execute function public.sessions_award_points();

-- ---------------------------------------------------------------------------
-- Redemption
--
-- One transaction: take the user's lock, read the balance, check the cooldown,
-- write the redemption and the negative ledger row together. A double tapped
-- button cannot overdraw, because the second call waits for the first and then
-- reads the balance the first one left behind.
-- ---------------------------------------------------------------------------
create or replace function public.redeem_reward(p_reward_id uuid)
returns public.redemptions
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user    uuid := auth.uid();
  v_reward  public.rewards;
  v_balance integer;
  v_last    timestamptz;
  v_red     public.redemptions;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select * into v_reward
  from public.rewards
  where id = p_reward_id and user_id = v_user and archived_at is null;

  if v_reward.id is null then
    raise exception 'reward not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(delta), 0) into v_balance
  from public.points_ledger where user_id = v_user;

  if v_balance < v_reward.cost_points then
    raise exception 'not enough points: you have %, this costs %',
      v_balance, v_reward.cost_points
      using errcode = 'P0001', hint = 'insufficient_points';
  end if;

  if v_reward.cooldown_hours is not null then
    select max(redeemed_at) into v_last
    from public.redemptions
    where reward_id = p_reward_id and user_id = v_user;

    if v_last is not null
       and v_last + (v_reward.cooldown_hours * interval '1 hour') > now() then
      raise exception 'this reward is on cooldown until %',
        v_last + (v_reward.cooldown_hours * interval '1 hour')
        using errcode = 'P0001', hint = 'reward_on_cooldown';
    end if;
  end if;

  insert into public.redemptions (user_id, reward_id, points_spent)
  values (v_user, p_reward_id, v_reward.cost_points)
  returning * into v_red;

  insert into public.points_ledger (user_id, delta, reason, redemption_id)
  values (v_user, -v_reward.cost_points, 'redemption', v_red.id);

  return v_red;
end;
$$;

-- When a reward becomes affordable, and how long is left on its cooldown.
create or replace function public.reward_status(p_user uuid default auth.uid())
returns table (
  reward_id        uuid,
  title            text,
  cost_points      integer,
  cooldown_hours   integer,
  affordable       boolean,
  cooldown_until   timestamptz,
  last_redeemed_at timestamptz,
  times_redeemed   integer
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
begin
  if p_user is null or p_user <> auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(sum(delta), 0) into v_balance
  from public.points_ledger where user_id = p_user;

  return query
  select r.id, r.title, r.cost_points, r.cooldown_hours,
         v_balance >= r.cost_points,
         case when r.cooldown_hours is null then null
              else agg.last_at + (r.cooldown_hours * interval '1 hour') end,
         agg.last_at,
         coalesce(agg.n, 0)::integer
  from public.rewards r
  left join lateral (
    select max(x.redeemed_at) as last_at, count(*) as n
    from public.redemptions x
    where x.reward_id = r.id
  ) agg on true
  where r.user_id = p_user and r.archived_at is null
  order by r.cost_points;
end;
$$;

grant select, insert, update, delete on public.rewards to authenticated;
grant select on public.redemptions   to authenticated;
grant select on public.points_ledger to authenticated;

-- Belt and braces alongside the missing policies: even if a policy were added
-- by mistake later, the privilege is not there.
revoke insert, update, delete on public.points_ledger from authenticated, anon;
revoke insert, update, delete on public.redemptions   from authenticated, anon;

grant execute on function public.point_balance(uuid)   to authenticated;
grant execute on function public.redeem_reward(uuid)   to authenticated;
grant execute on function public.reward_status(uuid)   to authenticated;
revoke all on function public.award_session_points(uuid) from public, authenticated, anon;
