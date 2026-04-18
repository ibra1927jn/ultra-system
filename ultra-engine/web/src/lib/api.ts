import type { ZodSchema } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Debounce del redirect para evitar que 10 queries paralelas en paralelo
// dispare 10 location.href consecutivos (algunos navegadores lo loggean
// como loop). Una vez redirigido, ignora llamadas posteriores.
let redirecting = false;
function redirectToLogin(): void {
  if (redirecting) return;
  redirecting = true;
  if (typeof window !== 'undefined') {
    window.location.href = '/login.html';
  }
}

type FetchOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

// Cookie JWT auth — credentials:'include' envía la cookie del dominio
// actual. No tocar el flujo de requireAuth del backend.
export async function apiFetch<T>(
  path: string,
  schema: ZodSchema<T>,
  opts: FetchOptions = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : path;
  const init: RequestInit = {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  };
  if (opts.signal) init.signal = opts.signal;
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    // Sesión expirada → redirige a login.html (excepto si el propio login
    // falla, ese caso lo maneja el formulario legacy).
    if (res.status === 401 && !url.includes('/api/auth/login')) {
      redirectToLogin();
    }
    throw new ApiError(`HTTP ${res.status}`, res.status, url);
  }
  const json = (await res.json()) as unknown;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      `Schema mismatch: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
      200,
      url,
    );
  }
  return parsed.data;
}
