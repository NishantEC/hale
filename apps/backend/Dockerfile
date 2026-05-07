# Base stage
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.2.0 --activate

# Prune stage — generate a partial monorepo for the backend app
FROM base AS pruner
WORKDIR /repo
RUN pnpm install -g turbo
COPY . .
RUN turbo prune --scope=backend --docker

# Builder stage — install deps and build
FROM base AS builder
WORKDIR /repo

COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml

# Hoist deps so Nest's runtime resolution stays simple inside the container
RUN echo "node-linker=hoisted" > .npmrc

RUN pnpm install --frozen-lockfile

COPY --from=pruner /repo/out/full/ .

RUN pnpm turbo run build --filter=backend

# Runner stage — slim image with only what's needed at runtime
FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nestjs
USER nestjs

# Preserve workspace layout so workspace-package resolution still works
COPY --from=builder --chown=nestjs:nodejs /repo/apps/backend/dist ./apps/backend/dist
COPY --from=builder --chown=nestjs:nodejs /repo/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder --chown=nestjs:nodejs /repo/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /repo/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "apps/backend/dist/main"]
