#!/bin/sh
# Proves that the newest backup of a database can be restored (Roadmap TASK-52): restores
# it into a scratch database of the same container, compares the number of rows of every
# table with the live database, says what it found, and drops the scratch database.
#
#   restore-check.sh --container NAME --database NAME --dir FOLDER [--file DUMP] [--strict]
#
# The same values can come from PG_CONTAINER, PG_DATABASE and BACKUP_DIR. --file checks that
# dump instead of the newest one in the folder.
#
# The live database is only read (SELECT count(*)). Everything that is created or dropped
# is the scratch database, always named restorecheck_<time>_<pid>, and it is dropped
# whatever happens, then looked for again: if it is still there the script says so and
# fails. It needs room for a second copy of the database in the container.
#
# Rows written to the live database after the dump are expected, so by default a count
# that differs is reported but is not a failure. These are failures: the restore itself
# reporting an error, a table of the live database missing from the dump, and a dump
# holding no rows at all although the database has some (a dump of the schema only).
# --strict makes every difference a failure; use it where nothing is writing.
#
# As in backup-postgres.sh, nothing here needs a password: psql and pg_restore run inside
# the container over its local socket, and nothing secret is on a command line or printed.
set -eu
LC_ALL=C
export LC_ALL

die() {
  printf 'restore-check: %s\n' "$*" >&2
  exit 1
}

container=${PG_CONTAINER:-}
database=${PG_DATABASE:-}
folder=${BACKUP_DIR:-}
dump=
strict=0

while [ $# -gt 0 ]; do
  case $1 in
    --strict)
      strict=1
      shift
      ;;
    --container | --database | --dir | --file)
      [ $# -ge 2 ] || die "$1 needs a value"
      case $1 in
        --container) container=$2 ;;
        --database) database=$2 ;;
        --dir) folder=$2 ;;
        --file) dump=$2 ;;
      esac
      shift 2
      ;;
    *) die "unknown argument '$1' (use --container, --database, --dir, --file and --strict)" ;;
  esac
done

[ -n "$container" ] || die "no container given (--container NAME)"
[ -n "$database" ] || die "no database given (--database NAME)"
case $database in
  *[!A-Za-z0-9_]*) die "the database name '$database' may only hold letters, digits and underscores" ;;
esac
command -v docker >/dev/null 2>&1 || die "docker is not installed or not on the PATH"
running=$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null) ||
  die "there is no container named '$container'"
[ "$running" = true ] || die "the container '$container' is not running"

if [ -z "$dump" ]; then
  [ -n "$folder" ] || die "no folder given (--dir FOLDER)"
  [ -d "$folder" ] || die "the folder '$folder' does not exist"
  set -- "$folder/$database"-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z.dump
  [ -e "$1" ] || die "there is no backup of '$database' in '$folder'"
  for dump in "$@"; do :; done
fi
[ -f "$dump" ] || die "the dump '$dump' does not exist"
[ -s "$dump" ] || die "the dump '$dump' is empty"

psql_in() {
  docker exec -i "$container" sh -c 'exec psql -w -X -qAt -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" "$@"' sh "$@"
}

# The live database must exist before anything is created next to it.
found=$(printf "SELECT 1 FROM pg_database WHERE datname = :'name';\n" |
  psql_in -d postgres -v "name=$database") ||
  die "could not ask the container '$container' which databases it has"
[ "$found" = 1 ] || die "the container '$container' has no database named '$database'"

scratch=restorecheck_$(date -u +%s)_$$
work=$(mktemp -d)
created=0

# Drops the scratch database and looks for it again; returns 1 if it is still there.
drop_scratch() {
  if ! printf 'DROP DATABASE IF EXISTS :"name" WITH (FORCE);\n' | psql_in -d postgres -v "name=$scratch" >/dev/null 2>&1; then
    printf 'restore-check: could not drop the scratch database %s: drop it by hand\n' "$scratch" >&2
    return 1
  fi
  left=$(printf "SELECT count(*) FROM pg_database WHERE datname = :'name';\n" | psql_in -d postgres -v "name=$scratch" 2>/dev/null || echo unknown)
  if [ "$left" != 0 ]; then
    printf 'restore-check: the scratch database %s is still there: drop it by hand\n' "$scratch" >&2
    return 1
  fi
  created=0
}

# Whatever ends the script, the scratch database goes with it.
cleanup() {
  status=$?
  trap - EXIT
  rm -rf -- "$work"
  if [ "$created" = 1 ]; then
    drop_scratch || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' INT TERM HUP

# One "table|rows" line for each table of the public schema, sorted by name.
count_rows() {
  rows=$(printf "%s\n" "SELECT string_agg(format('SELECT %L AS t, count(*) AS n FROM %I.%I', tablename, schemaname, tablename), ' UNION ALL ' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public' \\gexec" |
    psql_in -d "$1") || return 1
  if [ -n "$rows" ]; then
    printf '%s\n' "$rows" | sort
  fi
}

printf 'restore-check: restoring %s into the scratch database %s\n' "$dump" "$scratch"
printf 'CREATE DATABASE :"name";\n' | psql_in -d postgres -v "name=$scratch" >/dev/null ||
  die "could not create the scratch database"
created=1

docker exec -i "$container" sh -c 'exec pg_restore -w --no-owner --no-privileges --exit-on-error -U "${POSTGRES_USER:-postgres}" -d "$1"' sh "$scratch" <"$dump" ||
  die "pg_restore of '$dump' failed: this backup cannot be restored"

count_rows "$database" >"$work/live" || die "could not count the rows of '$database'"
count_rows "$scratch" >"$work/restored" || die "could not count the rows of the restored copy"

awk -F'|' -v strict="$strict" '
  NR == FNR { live[$1] = $2; names[$1] = 1; next }
  { restored[$1] = $2; names[$1] = 1 }
  END {
    bad = 0; differs = 0; liveRows = 0; restoredRows = 0; tables = 0
    for (name in names) {
      tables++
      if (!(name in restored)) { verdict[name] = "MISSING from the dump"; bad++ }
      else if (!(name in live)) { verdict[name] = "only in the dump"; differs++ }
      else if (live[name] != restored[name]) { verdict[name] = "differs"; differs++ }
      else verdict[name] = "ok"
      liveRows += live[name]; restoredRows += restored[name]
    }
    for (name in names) {
      printf "  %-40s live %9s   restored %9s   %s\n", name, (name in live ? live[name] : "-"), (name in restored ? restored[name] : "-"), verdict[name] | "sort"
    }
    close("sort")
    if (restoredRows == 0 && liveRows > 0) { print "restore-check: the dump holds no rows although the database has " liveRows; bad++ }
    if (strict && differs > 0) { print "restore-check: " differs " table(s) differ and --strict is on"; bad++ }
    print "restore-check: compared " tables " table(s): " restoredRows " row(s) restored, " liveRows " in the live database, " differs " differing"
    if (!strict && differs > 0) print "restore-check: a table that differs is rows written (or deleted) since the dump; --strict makes it a failure"
    exit bad > 0 ? 1 : 0
  }' "$work/live" "$work/restored" || die "the restored copy does not match the database (see above)"

drop_scratch || exit 1
printf 'restore-check: OK - the backup restores; the scratch database %s is dropped\n' "$scratch"
