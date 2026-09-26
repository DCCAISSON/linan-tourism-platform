FROM node:22.23.2-bookworm-slim

WORKDIR /workspace
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/miniapp/package.json apps/miniapp/package.json
COPY packages/contracts/package.json packages/contracts/package.json

COPY apps/api apps/api
COPY apps/admin apps/admin
COPY packages/contracts packages/contracts
RUN corepack pnpm install --frozen-lockfile

ARG VITE_API_BASE_URL=https://api.linantravel.cn
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN corepack pnpm --filter @linan/contracts build \
  && corepack pnpm --filter @linan/api build \
  && corepack pnpm --filter @linan/admin build
