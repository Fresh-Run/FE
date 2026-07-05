// Authenticated client for the FreshRun backend (EXPO_PUBLIC_API_URL).
// Error mapping follows the pattern established in use-generate-route.ts
// (which stays frozen and keeps its own copy).

import { supabase } from '@/lib/supabase';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const DEFAULT_TIMEOUT_MS = 15_000;

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  timeoutMs?: number;
};

export async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  if (!API_URL) {
    throw new Error('백엔드 주소가 설정되지 않았어요. .env.local의 EXPO_PUBLIC_API_URL을 확인해 주세요.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인이 필요해요');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

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
    if (controller.signal.aborted) throw new Error('요청 시간이 초과됐어요. 다시 시도해 주세요.');
    throw new Error('서버에 연결할 수 없어요. 백엔드 서버가 실행 중인지 확인해 주세요.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error('로그인이 필요해요');
    let detail: string | null = null;
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : null;
    } catch { /* non-JSON error body */ }
    throw new Error(detail ?? `요청에 실패했어요 (${res.status})`);
  }

  return (await res.json()) as T;
}
