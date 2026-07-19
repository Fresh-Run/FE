// Types mirror the backend RouteRequest / RouteResponse in schemas.py exactly.
// Calls the partner FastAPI backend (EXPO_PUBLIC_API_URL) — see .env.example.

import { quotaExceededMessage } from '@/lib/quota-message';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Coordinate = { lat: number; lng: number };

export type Waypoint = {
  name: string;
  coordinate: Coordinate;
  is_pitstop: boolean;
  description: string | null;
};

export type GeneratedRoute = {
  id?: string; // routes row id — for linking runs.route_id once tracking exists
  summary: string;
  total_distance_km: number;
  estimated_duration_min: number | null;
  waypoints: Waypoint[];
  polyline: Coordinate[]; // raw path geometry for map preview
  /** ±500m 보장 (BE 2026-07-14): true면 목표 ±0.5km를 4회 시도에도 못 맞춘
      최선 후보 — 오차는 total_distance_km − 요청 target으로 클라이언트가 계산. */
  target_missed?: boolean;
  /** 초기 반경으로 실패해 탐색 반경을 넓혀 찾은 결과. */
  radius_expanded?: boolean;
};

export type RouteInput = {
  start: Coordinate;         // device GPS, Seoul fallback, or manual pick (C1)
  target_distance_km: number;
  pitstop_keyword: string | null;
  notes: string | null;      // 회피 hints only (분위기 removed 2026-07-16, owner ruling)
  // Per-request override of settings.ai_course.avoid_hills — the guide's
  // body > 내 설정 priority; false counts as an explicit value server-side.
  avoid_hills: boolean;
  // end: omitted → backend treats as loop
  // avoid_from_route_id: not yet surfaced in the creation UI
};

// ─── generate ─────────────────────────────────────────────────────────────────

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

// Generation calls Gemini server-side, so allow a generous ceiling; an
// unreachable server still fails in milliseconds with a connection error.
const TIMEOUT_MS = 45_000;

async function generate(input: RouteInput, signal?: AbortSignal): Promise<GeneratedRoute> {
  if (!API_URL) {
    throw new Error('백엔드 주소가 설정되지 않았어요. .env.local의 EXPO_PUBLIC_API_URL을 확인해 주세요.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('로그인이 필요해요');

  // One controller drives fetch; aborted by either the timeout or the caller.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/routes/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        start: input.start,
        target_distance_km: input.target_distance_km,
        pitstop_keyword: input.pitstop_keyword,
        notes: input.notes,
        avoid_hills: input.avoid_hills,
      }),
      signal: controller.signal,
    });
  } catch {
    if (signal?.aborted) throw new Error('생성이 취소됐어요');
    if (controller.signal.aborted) throw new Error('요청 시간이 초과됐어요. 다시 시도해 주세요.');
    throw new Error('서버에 연결할 수 없어요. 백엔드 서버가 실행 중인지 확인해 주세요.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error('로그인이 필요해요');
    if (res.status === 429) {
      // honest quota copy with the real reset time (B8) — this frozen fetch
      // keeps its own error mapping, so the shared formatter is imported.
      let qd: Record<string, unknown> | null = null;
      try { const b = await res.json(); qd = (b?.detail && typeof b.detail === 'object') ? b.detail : null; } catch { /* non-JSON */ }
      throw new Error(quotaExceededMessage(qd));
    }
    let detail: string | null = null;
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : null;
    } catch { /* non-JSON error body */ }
    throw new Error(detail ?? `코스 생성에 실패했어요 (${res.status})`);
  }

  return (await res.json()) as GeneratedRoute;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGenerateRoute() {
  return { generate };
}
