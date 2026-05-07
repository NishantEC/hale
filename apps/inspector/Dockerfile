# Base stage
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.2.0 --activate

# Prune stage
FROM base AS pruner
WORKDIR /repo
RUN pnpm install -g turbo
COPY . .
RUN turbo prune --scope=inspector --docker

# Builder stage
FROM base AS builder
WORKDIR /repo

COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN echo "node-linker=hoisted" > .npmrc
RUN pnpm install --frozen-lockfile

COPY --from=pruner /repo/out/full/ .

# Vite bakes env vars at build-time
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm turbo run build --filter=inspector

# Runner — static site over nginx on port 8080 (Cloud Run requirement)
FROM nginx:alpine AS runner

COPY --from=builder /repo/apps/inspector/dist /usr/share/nginx/html
COPY apps/inspector/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
