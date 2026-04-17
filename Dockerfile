# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm db:generate
RUN pnpm --filter @draftorbit/shared build \
 && pnpm --filter @draftorbit/db build \
 && pnpm --filter @draftorbit/api build \
 && pnpm --filter @draftorbit/worker build \
 && pnpm --filter @draftorbit/web build

FROM node:20-alpine AS runtime

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV NODE_ENV=production

RUN corepack enable

WORKDIR /app
COPY --from=base /app ./

FROM runtime AS api
EXPOSE 4000
CMD ["sh", "-c", "pnpm db:generate && pnpm db:migrate && if [ \"${RUN_DB_SEED_ON_START:-true}\" = \"true\" ]; then pnpm db:seed; fi && pnpm --filter @draftorbit/api start"]

FROM runtime AS worker
CMD ["sh", "-c", "pnpm db:generate && pnpm db:migrate && pnpm --filter @draftorbit/worker start"]

FROM runtime AS web
EXPOSE 3000
CMD ["pnpm", "--filter", "@draftorbit/web", "start"]

# Render 默认使用 Dockerfile 最后一阶段。
# 该阶段用于生产 API + Worker 同机启动（Web 仍在 Vercel）。
FROM runtime AS render_api_worker
EXPOSE 10000
CMD ["sh", "-c", "pnpm db:generate && pnpm db:migrate && if [ \"${RUN_DB_SEED_ON_START:-true}\" = \"true\" ]; then pnpm db:seed; fi; pnpm --filter @draftorbit/worker start & exec pnpm --filter @draftorbit/api start"]
