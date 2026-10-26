#!/bin/sh
# Backs up one database of a Postgres container with pg_dump (custom format) into a
# folder, and keeps only the newest N dumps of that database (Roadmap TASK-52).
#
#   backup-postgres.sh --container NAME --database NAME --dir FOLDER [--keep N]
#
# The same values can come from PG_CONTAINER, PG_DATABASE, BACKUP_DIR and BACKUP_KEEP
# (default 14). The dump is named <database>-<UTC date>T<UTC time>Z.dump, so the names
# sort in the order they were made.
#
# The dump runs *inside* the container (`docker exec`), connecting over its local
# socket as the user the container was created with, so no password is needed and none
# is ever put on a command line or printed. The container must be running; the folder
# must exist (it is not created, so a wrong path never silently fills the wrong disk).
#
# A dump is written under a temporary name, read back with `pg_restore --list`, and only
# then renamed and the older ones pruned: a failed run leaves the previous backups as
# they were, and a half-written file is never taken for a backup.
set -eu
LC_ALL=C
export LC_ALL

die() {
  printf 'backup-postgres: %s\n' "$*" >&2
  exit 1
}

container=${PG_CONTAINER:-}
database=${PG_DATABASE:-}
folder=${BACKUP_DIR:-}
keep=${BACKUP_KEEP:-14}

while [ $# -gt 0 ]; do
  case $1 in
    --container | --database | --dir | --keep)
      [ $# -ge 2 ] || die "$1 needs a value"
      case $1 in
        --container) container=$2 ;;
        --database) database=$2 ;;
        --dir) folder=$2 ;;
        --keep) keep=$2 ;;
      esac
      shift 2
      ;;
    *) die "unknown argument '$1' (use --container, --database, --dir and --keep)" ;;
  esac
done

[ -n "$container" ] || die "no container given (--container NAME)"
[ -n "$database" ] || die "no database given (--database NAME)"
[ -n "$folder" ] || die "no folder given (--dir FOLDER)"
case $database in
  *[!A-Za-z0-9_]*) die "the database name '$database' may only hold letters, digits and underscores" ;;
esac
case $keep in
  '' | *[!0-9]*) die "--keep must be a whole number of at least 1, not '$keep'" ;;
esac
[ "$keep" -ge 1 ] || die "--keep must be at least 1: keeping none would delete the backup just made"
[ -d "$folder" ] || die "the folder '$folder' does not exist (create it first, on a disk other than the database's)"
[ -w "$folder" ] || die "the folder '$folder' is not writable"
command -v docker >/dev/null 2>&1 || die "docker is not installed or not on the PATH"
running=$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null) ||
  die "there is no container named '$container'"
[ "$running" = true ] || die "the container '$container' is not running"

# psql inside the container, as its own superuser, over the local socket. -w never asks for
# a password; the SQL comes from stdin so a variable can be quoted as a string or an identifier.
psql_in() {
  docker exec -i "$container" sh -c 'exec psql -w -X -qAt -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" "$@"' sh "$@"
}

found=$(printf "SELECT 1 FROM pg_database WHERE datname = :'name';\n" |
  psql_in -d postgres -v "name=$database") ||
  die "could not ask the container '$container' which databases it has"
[ "$found" = 1 ] || die "the container '$container' has no database named '$database'"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
target=$folder/$database-$stamp.dump
partial=$target.partial
[ ! -e "$target" ] || die "'$target' already exists (a backup of this second was made)"

cleanup() {
  rm -f -- "$partial"
}
trap cleanup EXIT
trap 'exit 1' INT TERM HUP

umask 077
docker exec "$container" sh -c 'exec pg_dump -w -Fc -U "${POSTGRES_USER:-postgres}" "$1"' sh "$database" >"$partial" ||
  die "pg_dump of '$database' failed"
[ -s "$partial" ] || die "pg_dump of '$database' wrote nothing"
docker exec -i "$container" pg_restore --list <"$partial" >/dev/null ||
  die "the dump of '$database' cannot be read back, so it was not kept"
mv -- "$partial" "$target"

# The names sort by time, so the oldest come first. Only files named like this script's own
# dumps of this database are ever counted or deleted.
set -- "$folder/$database"-[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z.dump
total=$#
removed=0
excess=$((total - keep))
if [ "$excess" -gt 0 ]; then
  for old in "$@"; do
    [ "$removed" -lt "$excess" ] || break
    rm -f -- "$old"
    removed=$((removed + 1))
  done
fi

bytes=$(wc -c <"$target" | tr -d ' ')
printf 'backup-postgres: wrote %s (%s bytes), checked that it reads back; kept the newest %s, removed %s older\n' \
  "$target" "$bytes" "$((total - removed))" "$removed"
