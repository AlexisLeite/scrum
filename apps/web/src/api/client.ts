const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3000/api/v1";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

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

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

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
