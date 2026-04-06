# Deploy en Vercel

Este monorepo debe quedar conectado a GitHub como dos proyectos de Vercel:

- `scrum-web` con root directory `apps/web`
- `scrum-api` con root directory `apps/api`

## Estructura

- `apps/web` es una SPA Vite.
- `apps/api` es NestJS y se publica como Vercel Function.

## Postgres

Conecta Postgres desde Storage/Marketplace en el proyecto `scrum-api`.

Variables esperadas:

- `DATABASE_URL`: usar el valor de `POSTGRES_PRISMA_URL`
- `DIRECT_URL`: usar el valor de `POSTGRES_URL_NON_POOLING`

El repo también incluye un helper para tomar automáticamente `POSTGRES_PRISMA_URL` y `POSTGRES_URL_NON_POOLING` si `DATABASE_URL` y `DIRECT_URL` no están definidos.

## Configuración de `scrum-api`

- Root Directory: `apps/api`
- El repo ya incluye [apps/api/vercel.json](../apps/api/vercel.json) y `vercel-build`
- No hace falta override manual de build si el proyecto apunta a `apps/api`

Variables:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_TTL`
- `JWT_REFRESH_TTL`
- `WEB_ORIGIN`
- `GITLAB_BASE_URL`
- `GITLAB_CLIENT_ID`
- `GITLAB_CLIENT_SECRET`
- `GITLAB_CALLBACK_URL`

Valores recomendados:

- `WEB_ORIGIN=https://<tu-web>.vercel.app`
- `GITLAB_CALLBACK_URL=https://<tu-api>.vercel.app/api/v1/auth/gitlab/callback`

## Configuración de `scrum-web`

- Root Directory: `apps/web`
- El repo ya incluye [apps/web/vercel.json](../apps/web/vercel.json) y `vercel-build`
- No hace falta override manual de build/output si el proyecto apunta a `apps/web`

Variable:

- `VITE_API_BASE=https://<tu-api>.vercel.app/api/v1`

## GitHub

1. Importa el repo en Vercel.
2. Crea `scrum-api`.
3. Crea `scrum-web`.
4. Deja habilitado GitHub Deployments.
5. Cada push a la rama de producción configurada en Vercel genera un nuevo deploy.

## Migraciones y seed

El build del API corre:

1. `prisma generate`
2. `prisma migrate deploy`
3. `nest build`

El seed no debe correr en cada deploy. Ejecútalo una sola vez contra la base remota:

```bash
pnpm --filter @scrum/api prisma:seed
```

## CLI opcional

En este entorno `vercel` no estaba instalado globalmente. Si quieres usar CLI:

```bash
pnpm dlx vercel
```
