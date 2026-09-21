# syntax=docker/dockerfile:1

FROM node:22-slim AS base
WORKDIR /app
RUN corepack enable

# ---------------------------------------------------------------------------
# deps: install once, reused by both the build and the pruned production stage
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: type-check-free build (vite + esbuild) of client and server
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN pnpm run build

# ---------------------------------------------------------------------------
# runtime: production-only dependencies + built artifacts
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

EXPOSE 3000
CMD ["node", "dist/index.js"]
