#!/bin/sh
# Tests backup-postgres.sh and restore-check.sh against a Postgres container of their own
# (Roadmap TASK-52): it starts a throwaway one, runs every case, and removes it, so it
# touches no database that exists. Needs docker and the postgres image.
#
#   sh deploy/backup/test.sh        (or: pnpm test:backup)
#
# Prints one line per case, "ok - ..." or "not ok - ...", then a total; exits 1 if any failed.
set -eu
LC_ALL=C
unset PG_CONTAINER PG_DATABASE BACKUP_DIR BACKUP_KEEP
export LC_ALL

here=$(cd "$(dirname "$0")" && pwd)
backup_script=$here/backup-postgres.sh
check_script=$here/restore-check.sh
image=${PG_TEST_IMAGE:-postgres:17-alpine}
container=pmhybrid-backup-test-$$
work=$(mktemp -d)
log=$work/all-output.log
: >"$log"
passed=0
failed=0

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
  rm -rf -- "$work"
}
trap cleanup EXIT
trap 'exit 1' INT TERM HUP

# A password of its own, handed to docker through the environment, not the command line.
secret="Bk$(date +%s)x$$z$(awk 'BEGIN { srand(); printf "%d", rand() * 1000000000 }')"
POSTGRES_PASSWORD=$secret docker run -d --rm --name "$container" \
  -e POSTGRES_PASSWORD -e POSTGRES_USER=pmhybrid -e POSTGRES_DB=app "$image" >/dev/null

# The real server (the one on TCP) is up only after the image's first, temporary one is gone.
tries=0
until docker exec "$container" pg_isready -h 127.0.0.1 -U pmhybrid -d app -q; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] || {
    echo 'the test container did not become ready' >&2
    exit 1
  }
  sleep 1
done

sql() {
  printf '%s\n' "$1" | docker exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U pmhybrid -d "${2:-app}"
}

sql "CREATE TABLE item (id int PRIMARY KEY, label text);
INSERT INTO item SELECT g, 'row ' || g FROM generate_series(1, 25) g;
CREATE TABLE note (id serial PRIMARY KEY, body text);
INSERT INTO note (body) VALUES ('a'), ('b');
CREATE TABLE unused (id int);" >/dev/null

# A copy of the seeded database under another name, so a case that changes it changes nothing else.
copy_of_app() {
  sql "CREATE DATABASE $1 TEMPLATE app" postgres >/dev/null
}

new_folder() {
  mktemp -d "$work/folder.XXXXXX"
}

ok() {
  passed=$((passed + 1))
  printf 'ok - %s\n' "$1"
}

not_ok() {
  failed=$((failed + 1))
  printf 'not ok - %s\n' "$1"
  printf '%s\n' "$out" | sed 's/^/    # /'
}

# run <command...>: the output (both streams) goes to $out, the exit status to $code.
run() {
  set +e
  out=$("$@" 2>&1)
  code=$?
  set -e
  printf '%s\n' "$out" >>"$log"
}

backup() { run sh "$backup_script" --container "$container" "$@"; }
check() { run sh "$check_script" --container "$container" "$@"; }

succeeded() { if [ "$code" -eq 0 ]; then ok "$1"; else not_ok "$1"; fi; }
failed_run() { if [ "$code" -ne 0 ]; then ok "$1"; else not_ok "$1"; fi; }
said() { if printf '%s\n' "$out" | grep -q -- "$2"; then ok "$1"; else not_ok "$1"; fi; }
is() { if [ "$2" = "$3" ]; then ok "$1"; else out="expected '$3', got '$2'" not_ok "$1"; fi; }

dumps_in() { ls "$1" | grep -c '^app-[0-9]\{8\}T[0-9]\{6\}Z\.dump$' || true; }
live_counts() { sql "SELECT (SELECT count(*) FROM item)::text || '/' || (SELECT count(*) FROM note)::text"; }
scratch_databases() { sql "SELECT count(*) FROM pg_database WHERE datname LIKE 'restorecheck%'" postgres; }

# ---- backup-postgres.sh ----

folder=$(new_folder)
backup --database app --dir "$folder"
succeeded 'a backup of a running database succeeds'
is 'a backup writes one dump named after the database and the UTC time' "$(dumps_in "$folder")" 1
is 'a backup leaves no half-written file behind' "$(ls "$folder" | grep -c '\.partial$' || true)" 0

folder=$(new_folder)
for stamp in 20200101T000000Z 20200102T000000Z 20200103T000000Z 20200104T000000Z; do : >"$folder/app-$stamp.dump"; done
: >"$folder/other-20200101T000000Z.dump"
: >"$folder/notes.txt"
backup --database app --dir "$folder" --keep 3
is 'a backup keeps only the newest N dumps' "$(dumps_in "$folder")" 3
is 'a backup removes the oldest first' "$(ls "$folder" | grep -c '^app-2020010[12]' || true)" 0
is 'a backup keeps the dumps just under the limit' "$(ls "$folder" | grep -c '^app-2020010[34]' || true)" 2
is 'a backup leaves alone another database dump and any other file' "$(ls "$folder" | grep -c '^other-\|^notes\.txt$' || true)" 2

folder=$(new_folder)
backup --database nosuchdatabase --dir "$folder"
failed_run 'a backup of a database the container does not have fails'
said 'a backup of a missing database says which one' "no database named 'nosuchdatabase'"
is 'a failed backup writes nothing' "$(ls -A "$folder" | wc -l | tr -d ' ')" 0

folder=$(new_folder)
for stamp in 20200101T000000Z 20200102T000000Z; do : >"$folder/app-$stamp.dump"; done
backup --database nosuchdatabase --dir "$folder" --keep 1
is 'a failed backup deletes none of the older ones' "$(dumps_in "$folder")" 2

folder=$(new_folder)
run sh "$backup_script" --container "no-such-container-$$" --database app --dir "$folder"
failed_run 'a backup without the container fails'
said 'a backup without the container says so' "no container named"

backup --database app --dir "$work/does-not-exist"
failed_run 'a backup into a folder that does not exist fails'
said 'a backup into a missing folder says so' 'does not exist'

run sh "$backup_script" --container "$container" --dir "$folder"
failed_run 'a backup without a database fails'

backup --database app
failed_run 'a backup without a folder fails'

folder=$(new_folder)
backup --database app --dir "$folder" --keep 0
failed_run 'a backup that keeps none fails, rather than deleting what it just made'
is 'a backup with an invalid limit writes nothing' "$(ls -A "$folder" | wc -l | tr -d ' ')" 0

backup --database app --dir "$folder" --keep many
failed_run 'a backup whose limit is not a number fails'

backup --database 'app;drop' --dir "$folder"
failed_run 'a backup refuses a database name with anything but letters, digits and underscores'

# ---- restore-check.sh ----

folder=$(new_folder)
backup --database app --dir "$folder"
before=$(live_counts)
check --database app --dir "$folder" --strict
succeeded 'a restore check of an untouched database passes even with --strict'
said 'a restore check says how many tables it compared' 'compared 3 table'
said 'a restore check lists the rows of a table in the live copy and the restored one' 'item .*live *25 .*restored *25 .*ok'
is 'a restore check leaves no scratch database' "$(scratch_databases)" 0
is 'a restore check changes nothing in the live database' "$(live_counts)" "$before"

copy_of_app drifted
folder=$(new_folder)
run sh "$backup_script" --container "$container" --database drifted --dir "$folder"
sql "INSERT INTO note (body) VALUES ('after the dump')" drifted >/dev/null
check --database drifted --dir "$folder"
succeeded 'a restore check accepts rows written since the dump'
said 'a restore check names the table that differs' 'note .*differs'
check --database drifted --dir "$folder" --strict
failed_run 'a restore check fails on a difference when asked to be strict'
is 'a restore check that failed leaves no scratch database either' "$(scratch_databases)" 0

copy_of_app schemaonly
folder=$(new_folder)
docker exec "$container" pg_dump -w -Fc --schema-only -U pmhybrid schemaonly >"$folder/schemaonly-20300101T000000Z.dump"
check --database schemaonly --dir "$folder"
failed_run 'a restore check fails on a dump with no rows of a database that has some'
said 'a restore check says the dump holds no rows' 'holds no rows'

folder=$(new_folder)
backup --database app --dir "$folder"
head -c 300 "$folder"/app-*.dump >"$work/truncated.dump"
mv "$work/truncated.dump" "$folder/app-20300101T000000Z.dump"
check --database app --dir "$folder"
failed_run 'a restore check fails on a truncated dump'
said 'a restore check says the backup cannot be restored' 'cannot be restored'
is 'a restore check of a broken dump leaves no scratch database' "$(scratch_databases)" 0

folder=$(new_folder)
backup --database app --dir "$folder"
check --database app --dir "$folder" --file "$(ls "$folder"/app-*.dump)"
succeeded 'a restore check can be pointed at one dump'

folder=$(new_folder)
check --database app --dir "$folder"
failed_run 'a restore check with no backup in the folder fails'
said 'a restore check with no backup says so' 'no backup of'

run sh "$check_script" --container "no-such-container-$$" --database app --dir "$folder"
failed_run 'a restore check without the container fails'

check --database nosuchdatabase --dir "$folder"
failed_run 'a restore check of a database the container does not have fails'

# ---- restoring for real, as docs/deployment.md says (the same flags, aimed at a copy) ----

copy_of_app damaged
folder=$(new_folder)
run sh "$backup_script" --container "$container" --database damaged --dir "$folder"
sql 'DELETE FROM item' damaged >/dev/null
restore_into() {
  docker exec -i "$container" sh -c 'exec pg_restore -w --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$1"' sh "$1" <"$2"
}
run restore_into damaged "$(ls "$folder"/damaged-*.dump)"
succeeded 'the restore command of the deployment guide runs on a database that has data'
is 'the restore command of the deployment guide brings back the rows deleted since the dump' "$(sql 'SELECT count(*) FROM item' damaged)" 25

sql 'CREATE DATABASE brandnew' postgres >/dev/null
run restore_into brandnew "$(ls "$folder"/damaged-*.dump)"
succeeded 'the restore command of the deployment guide runs on an empty database'
is 'the restore command of the deployment guide fills an empty database' "$(sql 'SELECT count(*) FROM item' brandnew)" 25

# ---- the password ----

if grep -F -q -- "$secret" "$log"; then
  out='the password was printed'
  not_ok 'the password appears in no output of any script'
else
  ok 'the password appears in no output of any script'
fi

if grep -q 'PASSWORD\|PGPASS' "$backup_script" "$check_script"; then
  out=$(grep -n 'PASSWORD\|PGPASS' "$backup_script" "$check_script")
  not_ok 'neither script reads or builds a password'
else
  ok 'neither script reads or builds a password'
fi

is 'no scratch database is left in the container at the end' "$(scratch_databases)" 0

printf '%s passed, %s failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
