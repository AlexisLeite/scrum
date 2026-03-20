const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000/api/v1";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

let refreshRequest: Promise<void> | null = null;

function normalizeApiError(rawText: string, status: number): string {
  if (!rawText) {
    return `HTTP ${status}`;
  }

  try {
    const parsed = JSON.parse(rawText) as { message?: string | string[]; error?: string };
    if (Array.isArray(parsed.message) && parsed.message.length > 0) {
      return parsed.message.join("; ");
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message;
    }
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }
  } catch {
    return rawText;
  }

  return rawText;
}

async function rawRequest(method: HttpMethod, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function refreshSession(): Promise<void> {
  if (!refreshRequest) {
    refreshRequest = rawRequest("POST", "/auth/refresh")
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(normalizeApiError(text, response.status));
        }
      })
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
}

async function request<T>(method: HttpMethod, path: string, body?: unknown, allowRefresh: boolean = true): Promise<T> {
  const response = await rawRequest(method, path, body);

  if (response.status === 401 && allowRefresh && path !== "/auth/refresh" && path !== "/auth/login" && path !== "/auth/signup") {
    await refreshSession();
    return request<T>(method, path, body, false);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(normalizeApiError(text, response.status));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path)
};
