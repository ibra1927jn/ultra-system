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
