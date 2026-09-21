#!/bin/sh
# Runs before nginx starts (the nginx image runs every script of /docker-entrypoint.d):
# writes config.js, which the app reads before it starts, from API_BASE_URL. One image
# then serves any environment (Roadmap IMPROVEMENT-02b, IMPROVEMENT-02c).
set -e

api_base_url="${API_BASE_URL:-}"
# A JavaScript string: a backslash or a quote in the value must not end it.
escaped=$(printf '%s' "$api_base_url" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.__PMHYBRID__ = { apiBaseUrl: "%s" };\n' "$escaped" > /usr/share/nginx/html/config.js
