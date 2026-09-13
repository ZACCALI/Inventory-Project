/**
 * Centralized API service wrapper.
 * Handles authentication errors, JSON parsing, and error formatting.
 */

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ApiResponse<T = any> {
  data: T | null;
  error: string | null;
  status: number;
  ok: boolean;
}

async function handleResponse<T>(res: Response): Promise<ApiResponse<T>> {
  if (res.status === 401) {
    // Return the error to the caller — do NOT hard-redirect here.
    // A transient 401 from any background request (prefetch, notifications, etc.)
    // must not eject an otherwise authenticated user. The AppShell auth guard
    // and NextAuth session are the authoritative sources for auth redirects.
    return { data: null, error: 'Authentication required. Please sign in.', status: 401, ok: false };
  }

  if (res.status === 403) {
    return { data: null, error: 'Access denied. You do not have permission for this action.', status: 403, ok: false };
  }

  try {
    const data = await res.json();
    if (!res.ok) {
      return { data: null, error: data.error || `Request failed (${res.status})`, status: res.status, ok: false };
    }
    return { data, error: null, status: res.status, ok: true };
  } catch {
    if (!res.ok) {
      return { data: null, error: `Request failed (${res.status})`, status: res.status, ok: false };
    }
    return { data: null, error: null, status: res.status, ok: true };
  }
}

export const api = {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get<T = any>(url: string, options?: ApiOptions): Promise<ApiResponse<T>> {
    const { headers, ...restOptions } = options || {};
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { ...headers as Record<string, string> },
      ...restOptions
    });
    return handleResponse<T>(res);
  },

 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async post<T = any>(url: string, body: any, options?: ApiOptions): Promise<ApiResponse<T>> {
    const { headers, ...restOptions } = options || {};
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...headers as Record<string, string> },
      body: JSON.stringify(body),
      ...restOptions,
    });
    return handleResponse<T>(res);
  },

 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async put<T = any>(url: string, body: any, options?: ApiOptions): Promise<ApiResponse<T>> {
    const { headers, ...restOptions } = options || {};
    const res = await fetch(url, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...headers as Record<string, string> },
      body: JSON.stringify(body),
      ...restOptions,
    });
    return handleResponse<T>(res);
  },

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  async del<T = any>(url: string, options?: ApiOptions): Promise<ApiResponse<T>> {
    const { headers, ...restOptions } = options || {};
    const res = await fetch(url, {
      method: 'DELETE',
      credentials: 'include',
      headers: { ...headers as Record<string, string> },
      ...restOptions
    });
    return handleResponse<T>(res);
  },
};

export default api;
