# syntax=docker/dockerfile:1
#
# The web image (Roadmap IMPROVEMENT-02c): the Angular build served by nginx. The
# build context is the repository root, because the app depends on
# packages/shared-types:
#
#   docker build -f apps/web/Dockerfile -t pmhybrid-web .
#
# Run it with API_BASE_URL set to where the API is reachable from the browser.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/web/package.json apps/web/
# The root prepare script installs git hooks, which need husky, a dev tool that is not
# here and that an image has no use for.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));delete p.scripts.prepare;fs.writeFileSync('package.json',JSON.stringify(p,null,2))"
# The lockfile is committed and was checked when it was made; see apps/api/Dockerfile.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --filter web...
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web
RUN pnpm --filter @pmhybrid/shared-types build \
 && pnpm --filter web build

FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.d/40-pmhybrid-config.sh
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/40-pmhybrid-config.sh
# nginx-unprivileged would avoid root; this keeps the stock image and its entrypoint,
# and listens on an unprivileged port.
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
