FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --filter @scrum/web... --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @scrum/contracts build
RUN pnpm --filter @scrum/web build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/deploy/web ./dist
EXPOSE 8080
CMD ["serve", "-s", "dist", "-l", "8080"]
