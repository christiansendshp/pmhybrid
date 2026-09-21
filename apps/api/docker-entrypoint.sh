#!/bin/sh
# Start of the API container (Roadmap IMPROVEMENT-02c): bring the database
# schema up to date, write the access model and, on a first start, the first
# administrator, then run the server. Set RUN_MIGRATIONS=false where a separate
# job migrates the database.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  ./node_modules/.bin/prisma migrate deploy
  node dist/bootstrap/bootstrap.js
fi

exec node dist/main
