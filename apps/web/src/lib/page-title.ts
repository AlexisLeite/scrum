const APP_TITLE = "Scrum Platform";

function normalizeTitle(title: string | null | undefined): string | null {
  const value = title?.trim();
  return value ? value : null;
}

export function formatPageTitle(title: string | null | undefined): string {
  const normalizedTitle = normalizeTitle(title);
  return normalizedTitle ? `${normalizedTitle} | ${APP_TITLE}` : APP_TITLE;
}

export function resolvePathPageTitle(pathname: string): string {
  if (pathname === "/login") {
    return "Login";
  }

  if (pathname.startsWith("/auth/gitlab/callback")) {
    return "Autenticando";
  }

  if (pathname.startsWith("/focused")) {
    return "Focused";
  }

  if (pathname.startsWith("/settings")) {
    return "Settings";
  }

  if (pathname.startsWith("/administration/users")) {
    return "Usuarios";
  }

  if (pathname.startsWith("/administration/products")) {
    return "Productos";
  }

  if (pathname.startsWith("/administration/roles")) {
    return "Roles";
  }

  if (pathname.startsWith("/administration/backups")) {
    return "Backups";
  }

  if (pathname.startsWith("/administration")) {
    return "Administracion";
  }

  if (/^\/products\/[^/]+\/tasks\/[^/]+\/definition$/.test(pathname)) {
    return "Definicion de tarea";
  }

  if (/^\/products\/[^/]+\/sprints\/[^/]+\/board$/.test(pathname)) {
    return "Ejecucion de sprint";
  }

  if (/^\/products\/[^/]+\/sprints\/[^/]+\/definition$/.test(pathname)) {
    return "Planificar sprint";
  }

  if (/^\/products\/[^/]+\/sprints$/.test(pathname)) {
    return "Planificar sprint";
  }

  if (/^\/products\/[^/]+\/backlog\/stories\/[^/]+\/definition$/.test(pathname)) {
    return "Definicion de historia";
  }

  if (/^\/products\/[^/]+\/backlog\/stories\/[^/]+\/tasks$/.test(pathname)) {
    return "Tareas de historia";
  }

  if (/^\/products\/[^/]+\/backlog$/.test(pathname)) {
    return "Backlog";
  }

  if (/^\/products\/[^/]+\/metrics$/.test(pathname)) {
    return "Metricas";
  }

  if (/^\/products\/[^/]+\/definition$/.test(pathname)) {
    return "Definicion de producto";
  }

  if (/^\/products\/[^/]+\/overview$/.test(pathname)) {
    return "Resumen";
  }

  if (/^\/products\/[^/]+$/.test(pathname)) {
    return "Workspace";
  }

  return "";
}
