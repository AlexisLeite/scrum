# Scrum Platform

Monorepo implementation of a Scrum sprint management application.

## Stack
- Backend: Node.js + TypeScript + NestJS + Prisma + PostgreSQL
- Frontend: React + TypeScript + MobX + controller-oriented architecture
- Contracts: Shared TypeScript DTO package
- Runtime: Docker Compose for `postgres`, `api`, `web`

## Implemented Features
- Local auth (`signup`, `login`, `refresh`, `logout`) and profile update endpoints.
- GitLab OAuth start + callback with account linking by GitLab ID/email.
- Role-based guards with agile roles (`platform_admin`, `product_owner`, `scrum_master`, `team_member`, `viewer`).
- Teams CRUD + member assignment endpoints.
- Products CRUD + member assignment + configurable workflow columns.
- Product backlog stories CRUD + ranking endpoint.
- Tasks CRUD + status changes + assignee/sprint assignment.
- Sprints CRUD + start/complete actions + sprint board endpoint.
- Indicators endpoints for burnup/burndown and velocity by team/user.
- React routes/views for login/signup/profile/admin/teams/products/backlog/tasks/sprint management/sprint execution/indicators.
- Admin role management view (`/admin`) to change user roles.

## Repository Layout
- `apps/api`: NestJS API + Prisma schema
- `apps/web`: React web client
- `packages/contracts`: Shared DTO and type contracts
- `packages/ui`: Shared UI package placeholder

## Local Setup
1. Copy `.env.example` to `.env` and adjust values.
2. Start Postgres: `docker compose up -d postgres`
3. Install dependencies: `pnpm install`
4. Generate Prisma client: `pnpm --filter @scrum/api prisma:generate`
5. Push schema: `pnpm --filter @scrum/api prisma:push`
6. Seed default users: `pnpm --filter @scrum/api prisma:seed`
7. Start apps: `pnpm dev`

## Default Seed Users
- `admin@scrum.local` / `admin1234` (`platform_admin`)
- `owner@scrum.local` / `owner1234` (`product_owner`)
- `scrum@scrum.local` / `scrum1234` (`scrum_master`)
- `member@scrum.local` / `member1234` (`team_member`)

## Validation
- Typecheck: `pnpm typecheck`
- Build: `pnpm build`

## Current Gaps
- Indicator calculations are functional but simplified for v1.
- E2E/integration tests and observability hardening are not yet implemented.
