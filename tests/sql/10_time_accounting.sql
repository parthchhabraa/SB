-- Time accounting.
--
-- These are the cases most likely to be silently wrong: midnight, DST, odd
-- offsets, long abandoned sessions, and pauses that straddle a boundary.
\set QUIET on
\pset pager off
set client_min_messages = notice;

do $$
declare
  v_rows integer;
  v_sec  numeric;
  v_d1   numeric;
  v_d2   numeric;
  v_d3   numeric;
begin
  -- -------------------------------------------------------------------------
  -- Splitting at local midnight
  -- -------------------------------------------------------------------------
  select seconds into v_d1 from public.active_slices(
    timestamptz '2025-03-10 18:00:00+00', timestamptz '2025-03-10 19:15:00+00',
    '{}'::tstzmultirange, 'Asia/Kolkata') where local_date = date '2025-03-10';
  select seconds into v_d2 from public.active_slices(
    timestamptz '2025-03-10 18:00:00+00', timestamptz '2025-03-10 19:15:00+00',
    '{}'::tstzmultirange, 'Asia/Kolkata') where local_date = date '2025-03-11';

  perform t.eq('midnight split, day one is 30 min',  v_d1, 1800::numeric);
  perform t.eq('midnight split, day two is 45 min',  v_d2, 2700::numeric);

  -- A session that ends exactly on local midnight must not emit a phantom
  -- second day with zero seconds, which would quietly break a streak.
  select count(*) into v_rows from public.active_slices(
    timestamptz '2025-06-01 23:00:00+00', timestamptz '2025-06-02 00:00:00+00',
    '{}'::tstzmultirange, 'UTC');
  perform t.eq('ending on midnight yields one day', v_rows, 1);

  -- -------------------------------------------------------------------------
  -- Daylight saving. A local day is not always 24 hours, and any
  -- implementation that adds 86400 seconds gets both of these wrong.
  -- -------------------------------------------------------------------------
  select seconds into v_sec from public.active_slices(
    timezone('America/New_York', timestamp '2025-03-09 00:00'),
    timezone('America/New_York', timestamp '2025-03-10 00:00'),
    '{}'::tstzmultirange, 'America/New_York');
  perform t.eq('spring forward day is 23 hours', v_sec, (23 * 3600)::numeric);

  select seconds into v_sec from public.active_slices(
    timezone('America/New_York', timestamp '2025-11-02 00:00'),
    timezone('America/New_York', timestamp '2025-11-03 00:00'),
    '{}'::tstzmultirange, 'America/New_York');
  perform t.eq('fall back day is 25 hours', v_sec, (25 * 3600)::numeric);

  -- Studying through the repeated 01:00 hour on fall-back night: one wall
  -- clock hour passes twice, and both hours are real study time.
  select seconds into v_sec from public.active_slices(
    timestamptz '2025-11-02 04:30:00+00', timestamptz '2025-11-02 06:30:00+00',
    '{}'::tstzmultirange, 'America/New_York');
  perform t.eq('repeated hour counts twice', v_sec, (2 * 3600)::numeric);

  -- -------------------------------------------------------------------------
  -- Offsets that are not whole hours
  -- -------------------------------------------------------------------------
  select seconds into v_d1 from public.active_slices(
    timestamptz '2025-06-01 14:00:00+00', timestamptz '2025-06-02 04:00:00+00',
    '{}'::tstzmultirange, 'Asia/Kathmandu') where local_date = date '2025-06-01';
  perform t.eq('Kathmandu +05:45 first day is 4h15', v_d1, (4 * 3600 + 15 * 60)::numeric);

  select seconds into v_d1 from public.active_slices(
    timestamptz '2025-06-01 17:00:00+00', timestamptz '2025-06-02 01:00:00+00',
    '{}'::tstzmultirange, 'Asia/Kolkata') where local_date = date '2025-06-01';
  perform t.eq('Kolkata +05:30 first day is 1h30', v_d1, (1 * 3600 + 30 * 60)::numeric);

  -- -------------------------------------------------------------------------
  -- Pauses
  -- -------------------------------------------------------------------------
  select seconds into v_d1 from public.active_slices(
    timestamptz '2025-06-01 23:00:00+00', timestamptz '2025-06-02 01:00:00+00',
    tstzmultirange(tstzrange(timestamptz '2025-06-01 23:50:00+00',
                             timestamptz '2025-06-02 00:20:00+00')),
    'UTC') where local_date = date '2025-06-01';
  select seconds into v_d2 from public.active_slices(
    timestamptz '2025-06-01 23:00:00+00', timestamptz '2025-06-02 01:00:00+00',
    tstzmultirange(tstzrange(timestamptz '2025-06-01 23:50:00+00',
                             timestamptz '2025-06-02 00:20:00+00')),
    'UTC') where local_date = date '2025-06-02';
  perform t.eq('pause straddling midnight, day one', v_d1, (50 * 60)::numeric);
  perform t.eq('pause straddling midnight, day two', v_d2, (40 * 60)::numeric);

  -- Several pauses, including overlapping ones, must not double subtract.
  perform t.eq('overlapping pauses subtract once',
    public.active_seconds(
      timestamptz '2025-06-01 10:00:00+00', timestamptz '2025-06-01 12:00:00+00',
      tstzmultirange(
        tstzrange(timestamptz '2025-06-01 10:30:00+00', timestamptz '2025-06-01 11:00:00+00'),
        tstzrange(timestamptz '2025-06-01 10:45:00+00', timestamptz '2025-06-01 11:15:00+00'))),
    (2 * 3600 - 45 * 60)::numeric);

  -- -------------------------------------------------------------------------
  -- Degenerate input
  -- -------------------------------------------------------------------------
  select count(*) into v_rows from public.active_slices(
    timestamptz '2025-06-01 10:00:00+00', timestamptz '2025-06-01 10:00:00+00',
    '{}'::tstzmultirange, 'UTC');
  perform t.eq('zero length session yields no days', v_rows, 0);

  select count(*) into v_rows from public.active_slices(
    timestamptz '2025-06-01 10:00:00+00', timestamptz '2025-06-01 11:00:00+00',
    tstzmultirange(tstzrange(timestamptz '2025-06-01 09:00:00+00',
                             timestamptz '2025-06-01 12:00:00+00')),
    'UTC');
  perform t.eq('fully paused session yields no days', v_rows, 0);

  perform t.eq('end before start is clamped, not negative',
    public.active_seconds(
      timestamptz '2025-06-01 12:00:00+00', timestamptz '2025-06-01 10:00:00+00',
      '{}'::tstzmultirange),
    0::numeric);

  -- -------------------------------------------------------------------------
  -- The abandoned session cap
  -- -------------------------------------------------------------------------
  perform t.eq('a 20 hour run is capped at 12 hours',
    public.session_effective_end(
      timestamptz '2025-06-01 08:00:00+00', null,
      timestamptz '2025-06-02 04:00:00+00', 12),
    timestamptz '2025-06-01 20:00:00+00');

  perform t.eq('a short run is not capped',
    public.session_effective_end(
      timestamptz '2025-06-01 08:00:00+00', null,
      timestamptz '2025-06-01 09:00:00+00', 12),
    timestamptz '2025-06-01 09:00:00+00');

  -- A 14 hour session crosses days; capped at 12 it still splits correctly.
  select seconds into v_d1 from public.active_slices(
    timestamptz '2025-06-01 14:00:00+00',
    public.session_effective_end(timestamptz '2025-06-01 14:00:00+00', null,
                                 timestamptz '2025-06-02 04:00:00+00', 12),
    '{}'::tstzmultirange, 'UTC') where local_date = date '2025-06-01';
  select seconds into v_d2 from public.active_slices(
    timestamptz '2025-06-01 14:00:00+00',
    public.session_effective_end(timestamptz '2025-06-01 14:00:00+00', null,
                                 timestamptz '2025-06-02 04:00:00+00', 12),
    '{}'::tstzmultirange, 'UTC') where local_date = date '2025-06-02';
  perform t.eq('capped 14h run, day one is 10 hours', v_d1, (10 * 3600)::numeric);
  perform t.eq('capped 14h run, day two is 2 hours',  v_d2, (2 * 3600)::numeric);

  -- -------------------------------------------------------------------------
  -- The same instants bucket differently for users in different zones. This is
  -- the property that makes per-user timezone handling worth the trouble.
  -- -------------------------------------------------------------------------
  select seconds into v_d1 from public.active_slices(
    timestamptz '2025-06-01 22:00:00+00', timestamptz '2025-06-01 23:00:00+00',
    '{}'::tstzmultirange, 'UTC') where local_date = date '2025-06-01';
  select seconds into v_d2 from public.active_slices(
    timestamptz '2025-06-01 22:00:00+00', timestamptz '2025-06-01 23:00:00+00',
    '{}'::tstzmultirange, 'Asia/Tokyo') where local_date = date '2025-06-02';
  select seconds into v_d3 from public.active_slices(
    timestamptz '2025-06-01 22:00:00+00', timestamptz '2025-06-01 23:00:00+00',
    '{}'::tstzmultirange, 'America/Los_Angeles') where local_date = date '2025-06-01';
  perform t.eq('same hour lands on 06-01 in UTC',   v_d1, 3600::numeric);
  perform t.eq('same hour lands on 06-02 in Tokyo', v_d2, 3600::numeric);
  perform t.eq('same hour lands on 06-01 in LA',    v_d3, 3600::numeric);
end
$$;
