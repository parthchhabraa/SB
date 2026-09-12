# Study tracker

Track study time by subject, work toward goals, earn points, and spend them on
rewards you write for yourself. Friends can see totals and who is studying now.

## Running it

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL and anon key
npm run dev
```

Without a backend the app builds and the public pages render, but signing in
needs a Supabase instance (hosted, or self-hosted on your own server).

## Applying the schema

Migrations are plain SQL in `supabase/migrations/`, numbered and forward only.
Apply them in order to your database. Every table has row level security
enabled in the same migration that creates it.

## Verifying the database

There is a throwaway Postgres cluster for testing migrations, policies and the
time functions. It needs Postgres 16 server binaries on the machine, and it
never touches your real database.

```bash
npm run db:up      # initdb a local cluster and apply every migration
npm run test:sql   # rebuild it from scratch and run the SQL suites
npm run db:down
```

The SQL suites cover time accounting (midnight, daylight saving, odd timezone
offsets, long abandoned sessions), the session lifecycle, the points ledger,
and row level security tested adversarially.

```bash
npm test           # unit tests
npm run typecheck
npm run lint
```

After changing a migration, regenerate the database types:

```bash
npm run db:reset && bash scripts/gen-types.sh
```

## How time is counted

Study time is always derived from timestamps, never accumulated by a counter.
A session's elapsed time is `now - started_at - the sum of its pauses`, so a
refresh, a backgrounded tab, or a sleeping laptop cannot make it drift.

Sessions that cross local midnight are split exactly at the boundary, in the
user's own timezone, by one SQL function that every total, streak, heatmap and
leaderboard goes through.

## Points

Balance is `sum(delta)` over `points_ledger`. There is no balance column.
Clients hold no insert, update or delete privilege on the ledger at all, so
points can only be written by the database functions that award them.

Tunable numbers live in `lib/config.ts` and are mirrored into the `app_config`
table for the SQL side.
