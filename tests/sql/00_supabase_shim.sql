-- Mirrors the parts of Supabase's managed schema that the migrations depend on,
-- so the real migration files can run unmodified against a plain Postgres.
-- This file is test scaffolding and is never applied to a real Supabase
-- instance, where all of it already exists.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Matches the shape the migrations actually touch: id, email, raw metadata.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Supabase reads the JWT out of the `request.jwt.claims` GUC. Same here, so
-- tests exercise the real policy expressions rather than a stand-in.
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select auth.jwt() ->> 'role';
$$;

-- Test helper: become a given user for subsequent statements.
create or replace function auth.login_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    false
  );
  execute 'set local role authenticated';
end;
$$;

create or replace function auth.logout() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set local role postgres';
end;
$$;
