const API_BASE = (() => {
  const configuredBase = import.meta.env.VITE_API_BASE;
  if (configuredBase) {
    return configuredBase;
  }

  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:5444/api/v1`;
  }

  throw new Error("Missing VITE_API_BASE in production");
})();

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RequestPayload =
  | {
      json?: unknown;
      body?: BodyInit | null;
      headers?: HeadersInit;
    }
  | undefined;

let refreshRequest: Promise<void> | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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

async function rawRequest(method: HttpMethod, path: string, payload?: RequestPayload): Promise<Response> {
  const headers = new Headers(payload?.headers);
  const hasJsonBody = payload && Object.prototype.hasOwnProperty.call(payload, "json");
  if (hasJsonBody) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers,
    body: hasJsonBody ? JSON.stringify(payload?.json) : payload?.body
  });
}

async function refreshSession(): Promise<void> {
  if (!refreshRequest) {
    refreshRequest = rawRequest("POST", "/auth/refresh")
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new ApiError(normalizeApiError(text, response.status), response.status);
        }
      })
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(normalizeApiError(text, response.status), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function request<T>(method: HttpMethod, path: string, body?: unknown, allowRefresh: boolean = true): Promise<T> {
  const response = await rawRequest(method, path, { json: body });

  if (response.status === 401 && allowRefresh && path !== "/auth/refresh" && path !== "/auth/login" && path !== "/auth/signup") {
    await refreshSession();
    return request<T>(method, path, body, false);
  }

  return parseResponse<T>(response);
}

async function requestForm<T>(method: HttpMethod, path: string, formData: FormData, allowRefresh: boolean = true): Promise<T> {
  const response = await rawRequest(method, path, { body: formData });

  if (response.status === 401 && allowRefresh && path !== "/auth/refresh" && path !== "/auth/login" && path !== "/auth/signup") {
    await refreshSession();
    return requestForm<T>(method, path, formData, false);
  }

  return parseResponse<T>(response);
}

export const apiClient = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  postForm: <T>(path: string, formData: FormData) => requestForm<T>("POST", path, formData),
  del: <T>(path: string) => request<T>("DELETE", path),
  refreshSession
};
