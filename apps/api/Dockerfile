FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --filter @scrum/api... --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @scrum/api prisma:generate
RUN pnpm --filter @scrum/api build

FROM base AS runtime
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
