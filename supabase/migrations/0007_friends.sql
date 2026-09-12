-- Friendships, and every friend-facing read.
--
-- Friends never select from sessions or profiles directly. Everything they see
-- is produced by the security definer functions below, which is what makes
-- hide_subjects_from_friends a real privacy control rather than a value the
-- client is trusted to respect.

create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),

  constraint friendships_not_self check (requester_id <> addressee_id)
);

-- One relationship per pair regardless of who asked first, so A to B and B to A
-- cannot both exist and leave the UI showing two contradictory states.
create unique index friendships_unique_pair
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index friendships_requester on public.friendships (requester_id, status);
create index friendships_addressee on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;

-- Both parties can see the row. All writes go through the RPCs below.
create policy friendships_select_party on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql stable parallel safe
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = p_a and f.addressee_id = p_b)
        or (f.requester_id = p_b and f.addressee_id = p_a))
  );
$$;

-- Handle lookup for the add-a-friend flow. Returns the three fields needed to
-- confirm you found the right person and nothing else, so the profiles table
-- never becomes broadly readable.
create or replace function public.find_profile_by_handle(p_handle text)
returns table (
  id                uuid,
  handle            text,
  display_name      text,
  friendship_status text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
  select p.id, p.handle::text, p.display_name,
         coalesce(
           (
             select case
               when f.status = 'accepted' then 'accepted'
               when f.status = 'blocked'  then 'blocked'
               when f.requester_id = v_me then 'outgoing'
               else 'incoming'
             end
             from public.friendships f
             where (f.requester_id = v_me and f.addressee_id = p.id)
                or (f.requester_id = p.id and f.addressee_id = v_me)
           ),
           'none'
         )
  from public.profiles p
  where p.handle = p_handle::citext and p.id <> v_me;
end;
$$;

create or replace function public.send_friend_request(p_handle text)
returns public.friendships
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_me     uuid := auth.uid();
  v_target uuid;
  v_row    public.friendships;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.id into v_target from public.profiles p where p.handle = p_handle::citext;

  if v_target is null then
    raise exception 'no account with the handle %', p_handle
      using errcode = 'P0002', hint = 'handle_not_found';
  end if;

  if v_target = v_me then
    raise exception 'you cannot add yourself' using errcode = 'P0001';
  end if;

  select * into v_row from public.friendships f
  where least(f.requester_id, f.addressee_id) = least(v_me, v_target)
    and greatest(f.requester_id, f.addressee_id) = greatest(v_me, v_target);

  if v_row.id is not null then
    if v_row.status = 'blocked' then
      raise exception 'that request cannot be sent' using errcode = 'P0001';
    end if;
    -- They already asked you: treat sending back as accepting.
    if v_row.status = 'pending' and v_row.addressee_id = v_me then
      update public.friendships set status = 'accepted'
      where id = v_row.id returning * into v_row;
    end if;
    return v_row;
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_me, v_target, 'pending')
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.respond_to_friend_request(
  p_friendship_id uuid,
  p_accept        boolean
) returns public.friendships
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.friendships;
begin
  if p_accept then
    update public.friendships set status = 'accepted'
    where id = p_friendship_id and addressee_id = v_me and status = 'pending'
    returning * into v_row;
  else
    delete from public.friendships
    where id = p_friendship_id and addressee_id = v_me and status = 'pending'
    returning * into v_row;
  end if;

  if v_row.id is null then
    raise exception 'no pending request to respond to' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

create or replace function public.remove_friend(p_friendship_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  delete from public.friendships
  where id = p_friendship_id
    and (requester_id = v_me or addressee_id = v_me)
    and status <> 'blocked';
end;
$$;

create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  delete from public.friendships
  where least(requester_id, addressee_id) = least(v_me, p_user_id)
    and greatest(requester_id, addressee_id) = greatest(v_me, p_user_id);

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_me, p_user_id, 'blocked');
end;
$$;

-- ---------------------------------------------------------------------------
-- Friend-visible reads
-- ---------------------------------------------------------------------------

-- Total study seconds over a named range, measured in that person's own
-- timezone. "Today" means their today, not the server's.
create or replace function public.user_total_seconds(p_user uuid, p_range text)
returns numeric
language plpgsql stable
set search_path = public, pg_temp
as $$
declare
  v_today      date := public.user_today(p_user);
  v_from       date;
  v_live       numeric;
  v_completed  numeric;
begin
  if v_today is null then
    return 0;
  end if;

  if p_range = 'today' then
    v_from := v_today;
  elsif p_range = 'week' then
    v_from := v_today - ((extract(isodow from v_today)::integer) - 1);
  elsif p_range = 'all' then
    -- Completed history comes from net_seconds, which the trigger already
    -- derived from timestamps, plus whatever the live session has accrued.
    select coalesce(sum(s.net_seconds), 0) into v_completed
    from public.sessions s
    where s.user_id = p_user and s.status = 'completed';

    select coalesce(sum(
      public.active_seconds(
        s.started_at,
        public.session_effective_end(s.started_at, null, now(),
                                     public.cfg('max_session_hours')),
        public.session_pause_ranges(
          s.id,
          public.session_effective_end(s.started_at, null, now(),
                                       public.cfg('max_session_hours'))
        )
      )
    ), 0) into v_live
    from public.sessions s
    where s.user_id = p_user and s.status in ('running', 'paused');

    return v_completed + v_live;
  else
    raise exception 'unknown range %', p_range using errcode = 'P0001';
  end if;

  return coalesce(
    (select sum(d.seconds) from public.user_day_seconds(p_user, v_from, v_today) d),
    0
  );
end;
$$;

-- Leaderboard over you and your accepted friends.
create or replace function public.friend_leaderboard(p_range text default 'today')
returns table (
  user_id      uuid,
  handle       text,
  display_name text,
  seconds      numeric,
  is_self      boolean,
  is_studying  boolean
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
  with circle as (
    select v_me as uid
    union
    select case when f.requester_id = v_me then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and (f.requester_id = v_me or f.addressee_id = v_me)
  )
  select p.id, p.handle::text, p.display_name,
         public.user_total_seconds(p.id, p_range),
         p.id = v_me,
         exists (
           select 1 from public.sessions s
           where s.user_id = p.id and s.status = 'running'
         )
  from circle c
  join public.profiles p on p.id = c.uid
  order by 4 desc, 3 asc;
end;
$$;

-- Who is studying right now, and what.
--
-- The subject is withheld when that friend has hide_subjects_from_friends set.
-- The decision is made here, server side, so the name never reaches a client
-- that is not allowed to see it.
create or replace function public.friend_activity()
returns table (
  user_id         uuid,
  handle          text,
  display_name    text,
  is_studying     boolean,
  subject_name    text,
  subject_color   text,
  started_at      timestamptz,
  subjects_hidden boolean,
  today_seconds   numeric
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return query
  with circle as (
    select case when f.requester_id = v_me then f.addressee_id else f.requester_id end as uid
    from public.friendships f
    where f.status = 'accepted' and (f.requester_id = v_me or f.addressee_id = v_me)
  )
  select p.id, p.handle::text, p.display_name,
         live.id is not null,
         case when p.hide_subjects_from_friends then null else subj.name end,
         case when p.hide_subjects_from_friends then null else subj.color end,
         live.started_at,
         p.hide_subjects_from_friends,
         public.user_total_seconds(p.id, 'today')
  from circle c
  join public.profiles p on p.id = c.uid
  left join lateral (
    select s.id, s.started_at, s.subject_id
    from public.sessions s
    where s.user_id = p.id and s.status = 'running'
    limit 1
  ) live on true
  left join public.subjects subj on subj.id = live.subject_id
  order by (live.id is not null) desc, p.display_name;
end;
$$;

-- Pending incoming requests, for the friends screen.
create or replace function public.pending_friend_requests()
returns table (
  friendship_id uuid,
  user_id       uuid,
  handle        text,
  display_name  text,
  created_at    timestamptz,
  direction     text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  return query
  select f.id,
         case when f.requester_id = v_me then f.addressee_id else f.requester_id end,
         p.handle::text, p.display_name, f.created_at,
         case when f.requester_id = v_me then 'outgoing' else 'incoming' end
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester_id = v_me then f.addressee_id else f.requester_id end
  where f.status = 'pending' and (f.requester_id = v_me or f.addressee_id = v_me)
  order by f.created_at desc;
end;
$$;

grant select on public.friendships to authenticated;

grant execute on function public.are_friends(uuid, uuid)              to authenticated;
grant execute on function public.find_profile_by_handle(text)         to authenticated;
grant execute on function public.send_friend_request(text)            to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid)                  to authenticated;
grant execute on function public.block_user(uuid)                     to authenticated;
grant execute on function public.friend_leaderboard(text)             to authenticated;
grant execute on function public.friend_activity()                    to authenticated;
grant execute on function public.pending_friend_requests()            to authenticated;
grant execute on function public.user_total_seconds(uuid, text)       to authenticated;
