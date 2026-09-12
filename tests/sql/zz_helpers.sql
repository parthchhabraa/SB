-- Test helpers. Applied after the migrations, since some of these reference
-- application tables and SQL function bodies are parsed at creation time.

-- ---------------------------------------------------------------------------
-- Assertion helpers. The runner treats any line containing FAIL as a failure.
-- ---------------------------------------------------------------------------
create schema if not exists t;

create or replace function t.ok(p_label text, p_ok boolean, p_detail text default '')
returns void language plpgsql as $$
begin
  if p_ok then
    raise notice 'ok    %', p_label;
  else
    raise notice 'FAIL  % %', p_label, p_detail;
  end if;
end;
$$;

create or replace function t.eq(p_label text, p_actual anyelement, p_expected anyelement)
returns void language plpgsql as $$
begin
  if p_actual is not distinct from p_expected then
    raise notice 'ok    %', p_label;
  else
    raise notice 'FAIL  % (got %, wanted %)', p_label, p_actual, p_expected;
  end if;
end;
$$;

-- Asserts that a statement is rejected. Used heavily by the RLS suite, where
-- the thing being verified is that something is NOT possible.
create or replace function t.raises(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise notice 'FAIL  % (expected an error, statement succeeded)', p_label;
exception
  when others then
    raise notice 'ok    % (rejected: %)', p_label, substring(sqlerrm from 1 for 60);
end;
$$;

-- Creates an auth user plus everything bootstrap_user seeds, and returns the id.
create or replace function t.make_user(p_handle text, p_tz text default 'UTC')
returns uuid language plpgsql as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (v_id, p_handle || '@example.test');
  update public.profiles
     set handle = p_handle::citext, display_name = p_handle, timezone = p_tz
   where id = v_id;
  return v_id;
end;
$$;

-- Inserts a completed session at explicit times, bypassing the RPCs, so tests
-- can place study time anywhere on the calendar.
create or replace function t.past_session(
  p_user uuid, p_subject uuid, p_start timestamptz, p_end timestamptz
) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.sessions (user_id, subject_id, status, started_at, ended_at)
  values (p_user, p_subject, 'completed', p_start, p_end)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function t.first_subject(p_user uuid)
returns uuid language sql stable as $$
  select id from public.subjects where user_id = p_user order by sort_order limit 1;
$$;

-- Tests run as the authenticated role for most of their work, so the helper
-- schema has to be reachable from there.
grant usage on schema t to authenticated, anon;
grant execute on all functions in schema t to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.login_as(uuid), auth.logout() to authenticated, anon;

-- A manual session placed at explicit times. Goes in directly rather than
-- through add_manual_session, which refuses future times and so cannot be used
-- to build a deterministic fixture day.
create or replace function t.past_manual_session(
  p_user uuid, p_subject uuid, p_start timestamptz, p_end timestamptz
) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into public.sessions (user_id, subject_id, status, started_at, ended_at, is_manual)
  values (p_user, p_subject, 'completed', p_start, p_end, true)
  returning id into v_id;
  return v_id;
end;
$$;

-- Points earned from study time alone, excluding goal and streak bonuses.
create or replace function t.session_points(p_user uuid)
returns integer language sql stable as $$
  select coalesce(sum(delta), 0)::integer
  from public.points_ledger
  where user_id = p_user and reason = 'session';
$$;

grant execute on all functions in schema t to authenticated, anon;
