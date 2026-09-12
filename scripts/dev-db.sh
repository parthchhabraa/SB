#!/usr/bin/env bash
#
# Throwaway local Postgres for verifying migrations, RLS policies and the SQL
# time functions. This is a disposable test cluster, not a dev backend and not
# anything you should point at real data.
#
# Usage: dev-db.sh up | down | reset | psql | test
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)}"
PGPORT="${PGPORT:-55432}"
PGHOST="${PGHOST:-127.0.0.1}"
DBNAME="${DBNAME:-study_tracker_test}"
export PGHOST PGPORT

# Postgres refuses to run as root. When we are root (containers, CI) the
# cluster runs as the postgres OS user and PGDATA lives somewhere that user
# owns. Otherwise everything stays inside the repo under .pgdata.
if [ "$(id -u)" -eq 0 ] && id -u postgres >/dev/null 2>&1; then
  PGDATA="${PGDATA:-/var/lib/postgresql/study-tracker-test}"
  RUNAS="postgres"
else
  PGDATA="${PGDATA:-$ROOT/.pgdata}"
  RUNAS=""
fi

if [ -z "$PGBIN" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "Postgres server binaries not found. Set PGBIN to the directory holding initdb." >&2
  exit 1
fi

log() { printf '  %s\n' "$*"; }

# Run a command as the cluster owner, passing through the connection env.
pg() {
  if [ -n "$RUNAS" ]; then
    su "$RUNAS" -s /bin/bash -c \
      "PGHOST='$PGHOST' PGPORT='$PGPORT' PGDATA='$PGDATA' $(printf '%q ' "$@")"
  else
    PGDATA="$PGDATA" "$@"
  fi
}

psql_db() { pg "$PGBIN/psql" -U postgres -d "$DBNAME" -v ON_ERROR_STOP=1 "$@"; }

running() { pg "$PGBIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; }

start_cluster() {
  if [ -n "$RUNAS" ]; then
    mkdir -p "$(dirname "$PGDATA")"
    chown "$RUNAS" "$(dirname "$PGDATA")"
  fi
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    log "initdb $PGDATA"
    pg "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust \
      --encoding=UTF8 --locale=C.UTF-8 >/dev/null
  fi
  if running; then
    log "cluster already running on port $PGPORT"
  else
    log "starting cluster on port $PGPORT"
    pg "$PGBIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" \
      -o "-p $PGPORT -k $PGDATA -c listen_addresses=$PGHOST" -w start >/dev/null
  fi
}

stop_cluster() {
  if running; then
    log "stopping cluster"
    pg "$PGBIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null
  else
    log "cluster not running"
  fi
}

create_db() {
  if pg "$PGBIN/psql" -U postgres -d postgres -tAc \
      "select 1 from pg_database where datname='$DBNAME'" | grep -q 1; then
    log "database $DBNAME exists"
  else
    log "creating database $DBNAME"
    pg "$PGBIN/createdb" -U postgres "$DBNAME"
  fi
}

drop_db() {
  log "dropping database $DBNAME"
  pg "$PGBIN/dropdb" -U postgres --if-exists "$DBNAME"
}

apply() {
  shopt -s nullglob
  log "applying supabase shim"
  psql_db -q -f "$ROOT/tests/sql/00_supabase_shim.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    log "applying $(basename "$f")"
    psql_db -q -f "$f"
  done
  log "applying test helpers"
  psql_db -q -f "$ROOT/tests/sql/zz_helpers.sql"
}

run_tests() {
  local failed=0 f out
  shopt -s nullglob
  for f in "$ROOT"/tests/sql/[1-9]*.sql; do
    printf '  %-44s' "$(basename "$f")"
    if out=$(psql_db -q -f "$f" 2>&1); then
      if printf '%s' "$out" | grep -q 'FAIL'; then
        echo "FAIL"
        printf '%s\n' "$out" | grep 'FAIL' | sed 's/^/      /'
        failed=1
      else
        echo "ok"
      fi
    else
      echo "ERROR"
      printf '%s\n' "$out" | tail -20 | sed 's/^/      /'
      failed=1
    fi
  done
  if [ "$failed" -ne 0 ]; then
    echo "SQL tests failed." >&2
    exit 1
  fi
  echo "  all SQL tests passed"
}

case "${1:-up}" in
  up)    start_cluster; create_db; apply ;;
  down)  stop_cluster ;;
  reset) start_cluster; drop_db; create_db; apply ;;
  psql)  start_cluster; pg "$PGBIN/psql" -U postgres -d "$DBNAME" ;;
  test)  start_cluster; drop_db; create_db; apply; run_tests ;;
  *)     echo "usage: dev-db.sh up|down|reset|psql|test" >&2; exit 1 ;;
esac
