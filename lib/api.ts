// Authenticated client for the FreshRun backend (EXPO_PUBLIC_API_URL).
// Error mapping follows the pattern established in use-generate-route.ts
// (which stays frozen and keeps its own copy).

import { quotaExceededMessage } from '@/lib/quota-message';
import { supabase } from '@/lib/supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const DEFAULT_TIMEOUT_MS = 15_000;

// Shared in-flight token refresh (B8): a burst of concurrent 401s must NOT
// stampede supabase.refreshSession() — refresh-token rotation means parallel
// refreshes invalidate each other. The first 401 starts the refresh; the rest
// await the SAME promise; it's nulled on settle so a later genuine expiry can
// refresh again. Returns true when a valid session was recovered.
let refreshInFlight: Promise<boolean> | null = null;
function refreshSessionOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = supabase.auth.refreshSession()
      .then(({ data, error }) => !error && !!data.session)
      .catch(() => false)
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
};

/** Error with the HTTP status and the backend's structured error code
    (guide §5: detail may be a string or `{error, message, ...}`). */
export class ApiError extends Error {
  status: number;      // 0 = network / timeout (no response)
  code: string | null; // e.g. 'already_requested', 'rsvp_closed'
  /** Full structured detail body when the server sent one — for errors
      that carry payload beyond {error, message} (e.g. crew_owner's
      crew_ids on DELETE /me). */
  detail: Record<string, unknown> | null;
  constructor(message: string, status: number, code: string | null = null, detail: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

/** Like apiFetch, but exposes the HTTP status — for endpoints that branch
    on it (e.g. crew join: 200 joined vs 202 request pending). */
export async function apiRequest<T>(path: string, opts: ApiOptions = {}, _retried = false): Promise<{ status: number; data: T }> {
  if (!API_URL) {
    throw new ApiError('백엔드 주소가 설정되지 않았어요. .env.local의 EXPO_PUBLIC_API_URL을 확인해 주세요.', 0, 'config');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  // getSession lives INSIDE the deadline: offline, an expired-token refresh
  // inside it can stall past the fetch's own abort guard (the airplane-mode
  // "alert only after reconnect" bug, 2026-07-26) — the whole request now
  // shares one clock.
  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];
  try {
    session = await Promise.race([
      supabase.auth.getSession().then(r => r.data.session),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true })),
    ]);
  } catch {
    clearTimeout(timer);
    throw new ApiError('요청 시간이 초과됐어요. 다시 시도해 주세요.', 0, 'timeout');
  }
  if (!session) {
    clearTimeout(timer);
    // stale storage → one refresh may recover a valid session; else genuine logout
    if (!_retried && await refreshSessionOnce()) return apiRequest<T>(path, opts, true);
    throw new ApiError('로그인이 필요해요', 401, null);
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) throw new ApiError('요청 시간이 초과됐어요. 다시 시도해 주세요.', 0, 'timeout');
    throw new ApiError('서버에 연결할 수 없어요. 백엔드 서버가 실행 중인지 확인해 주세요.', 0, 'network');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message: string | null = null;
    let code: string | null = null;
    let detail: Record<string, unknown> | null = null;
    try {
      const body = await res.json();
      // §5 (deployed 7/31, shape confirmed 8/3): body.error_code is the ONLY
      // guaranteed location — top-level, sibling of detail. detail.error is
      // internal shape kept as a non-contractual tolerance fallback. Pulled
      // forward from G's transport adoption by the reply slice (its two new
      // codes ride top-level); G's wholesale errorMessage(e) stays G's.
      if (typeof body?.error_code === 'string') code = body.error_code;
      if (typeof body?.detail === 'string') {
        message = body.detail;
      } else if (body?.detail && typeof body.detail === 'object') {
        detail = body.detail as Record<string, unknown>;
        code = code ?? (typeof body.detail.error === 'string' ? body.detail.error : null);
        message = typeof body.detail.message === 'string' ? body.detail.message : null;
      }
    } catch { /* non-JSON error body */ }
    // 401 = stale access token (expired in transit / clock skew): refresh
    // ONCE and retry with the fresh token. Second 401 (or refresh fail) =
    // genuine logout, thrown honestly. Timer already cleared by the fetch's
    // finally, so the recursion gets its own clock.
    if (res.status === 401 && !_retried && await refreshSessionOnce()) {
      return apiRequest<T>(path, opts, true);
    }
    if (res.status === 401) throw new ApiError('로그인이 필요해요', 401, code, detail);
    // 429 quota — honest copy from the structured detail (never generic here)
    if (res.status === 429) throw new ApiError(message ?? quotaExceededMessage(detail), 429, code ?? 'quota_exceeded', detail);
    throw new ApiError(message ?? `요청에 실패했어요 (${res.status})`, res.status, code, detail);
  }

  // Empty-2xx-safe parse (⑥ fix, 2026-07-14): FastAPI returns bodyless
  // successes beyond 204 — the follow POST's 202 is `Response(status_code=202)`
  // with content-length 0, and `res.json()` on an empty body THROWS, turning a
  // succeeded request into the generic failure alert. text() → parse only when
  // non-empty fixes the whole class; non-empty bodies parse exactly as before.
  const text = res.status === 204 ? '' : await res.text();
  const data = (text.trim() ? JSON.parse(text) : undefined) as T;
  return { status: res.status, data };
}

export async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  return (await apiRequest<T>(path, opts)).data;
}
