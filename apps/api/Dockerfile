# syntax=docker/dockerfile:1
#
# The API image (Roadmap IMPROVEMENT-02c). The build context is the repository
# root, because the API depends on packages/shared-types:
#
#   docker build -f apps/api/Dockerfile -t pmhybrid-api .

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-alpine AS base
# openssl: the Prisma engine on alpine needs it. corepack: the pnpm this repository is
# pinned to (package.json "packageManager").
RUN apk add --no-cache openssl && corepack enable
WORKDIR /repo

# ---- build: every dependency, compile shared-types and the API ----
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
# The root prepare script installs git hooks, which need husky, a dev tool that is not
# here and that an image has no use for.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));delete p.scripts.prepare;fs.writeFileSync('package.json',JSON.stringify(p,null,2))"
# The lockfile is committed and was checked when it was made; re-checking every entry
# against the registry (pnpm 11's supply-chain step) costs minutes and, on a slow network,
# fails the build.
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --filter api...
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
RUN pnpm --filter @pmhybrid/shared-types build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api build

# ---- runtime: production dependencies and the compiled output only ----
FROM base AS runtime
ENV NODE_ENV=production
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
# The root prepare script installs git hooks, which need husky, a dev tool that is not
# here and that an image has no use for.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));delete p.scripts.prepare;fs.writeFileSync('package.json',JSON.stringify(p,null,2))"
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --trust-lockfile --prod --filter api...
COPY --from=build /repo/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
COPY apps/api/prisma/migrations apps/api/prisma/migrations
COPY apps/api/docker-entrypoint.sh apps/api/docker-entrypoint.sh
WORKDIR /repo/apps/api
RUN ./node_modules/.bin/prisma generate \
 && chmod +x docker-entrypoint.sh
# Nothing under /repo is written at run time, so it stays owned by root and readable
# (a recursive chown here would copy every file into a new layer).
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
