-- New account bootstrap.
--
-- A new user lands on a usable app rather than an empty one: a profile, three
-- starter subjects, a daily goal, and three example rewards whose copy makes
-- clear they are meant to be edited.

create or replace function public.suggest_handle(p_seed text)
returns text
language plpgsql stable
set search_path = public, pg_temp
as $$
declare
  v_base text;
  v_try  text;
  v_n    integer := 0;
begin
  v_base := lower(regexp_replace(coalesce(p_seed, ''), '[^a-zA-Z0-9_]', '', 'g'));
  v_base := substring(v_base from 1 for 16);
  if char_length(v_base) < 3 then
    v_base := 'student';
  end if;

  v_try := v_base;
  while exists (select 1 from public.profiles where handle = v_try::citext) loop
    v_n := v_n + 1;
    v_try := substring(v_base from 1 for 15) || v_n::text;
    if v_n > 9999 then
      v_try := 'student' || floor(random() * 1000000)::text;
      exit;
    end if;
  end loop;

  return v_try;
end;
$$;

create or replace function public.bootstrap_user(p_user uuid, p_seed text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_subject uuid;
begin
  insert into public.profiles (id, handle, display_name, timezone)
  values (
    p_user,
    public.suggest_handle(p_seed),
    coalesce(nullif(split_part(coalesce(p_seed, ''), '@', 1), ''), 'Student'),
    'UTC'
  )
  on conflict (id) do nothing;

  if not found then
    return;
  end if;

  insert into public.subjects (user_id, name, color, sort_order) values
    (p_user, 'Maths',     'blue',  0),
    (p_user, 'Physics',   'cyan',  1),
    (p_user, 'Chemistry', 'green', 2);

  -- Example rewards. The UI labels these as examples and puts edit in reach,
  -- because a reward someone did not choose themselves does not motivate.
  insert into public.rewards (user_id, title, cost_points, cooldown_hours) values
    (p_user, 'Go out on Friday',        600,  168),
    (p_user, 'One episode',             120,  24),
    (p_user, 'Buy the thing in my cart', 1500, null);

  insert into public.goals (user_id, scope, subject_id, target_minutes, active_from)
  values (p_user, 'daily', null, 120, current_date);
end;
$$;

-- Supabase fires this when GoTrue inserts the auth row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  perform public.bootstrap_user(
    new.id,
    coalesce(new.raw_user_meta_data ->> 'handle', new.email, 'student')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Onboarding writes handle, name, zone and goal together, so a half finished
-- profile cannot exist. The timezone comes from the browser, which is the only
-- thing that actually knows it.
create or replace function public.complete_onboarding(
  p_handle             text,
  p_display_name       text,
  p_timezone           text,
  p_daily_goal_minutes integer
) returns public.profiles
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid := auth.uid();
  v_row public.profiles;
begin
  if v_me is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not public.is_valid_timezone(p_timezone) then
    raise exception 'unrecognised timezone %', p_timezone using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.profiles where handle = p_handle::citext and id <> v_me
  ) then
    raise exception 'the handle % is taken', p_handle
      using errcode = 'P0001', hint = 'handle_taken';
  end if;

  update public.profiles
     set handle = p_handle::citext,
         display_name = p_display_name,
         timezone = p_timezone
   where id = v_me
  returning * into v_row;

  perform public.set_goal('daily', p_daily_goal_minutes, null);

  select * into v_row from public.profiles where id = v_me;
  return v_row;
end;
$$;

grant execute on function public.complete_onboarding(text, text, text, integer) to authenticated;
grant execute on function public.suggest_handle(text) to authenticated;
revoke all on function public.bootstrap_user(uuid, text) from public, authenticated, anon;
