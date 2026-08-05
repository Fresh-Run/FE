// Types mirror the backend RouteRequest / RouteResponse in schemas.py exactly.
// Calls the partner FastAPI backend (EXPO_PUBLIC_API_URL) — see .env.example.

import { t, tf } from '@/lib/i18n';
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
  /** 저장된 routes 행 id (BE v116, 2026-07-29 additive) — 생성 직후 달리기가
      runs.route_id로 그대로 전달. null = 서버 저장 실패 엣지 (코스는 서빙됨). */
  route_id: string | null;
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
  /** 일방통행 도착지 (v2.3 unlock). null → field OMITTED from the body: the
      server's one-way semantics (corridor search + feasibility 422) key on
      end PRESENCE, not prefer_loop — never send end on loop mode. */
  end: Coordinate | null;
  // avoid_from_route_id: not yet surfaced in the creation UI
};

/** v2.3 feasibility gate: |start−end| > target×0.8 → 422 BEFORE credit spend
    (quota unconsumed, Gemini uncalled). min_target_km = d/0.8, 0.1-올림 —
    the guide says to feed it straight into the slider-minimum suggestion. */
export class OneWayTooFarError extends Error {
  minTargetKm: number;
  constructor(message: string, minTargetKm: number) {
    super(message);
    this.minTargetKm = minTargetKm;
  }
}

/** Loop floor gate (지연 batch; staging-probed 2026-07-23): a loop ask (no
    end) below the minimum viable loop → 422 BEFORE credit spend (probe:
    quota unchanged). detail = { error: 'loop_target_too_short', message,
    min_target_km }. The typed error carries the number and the CALLER
    composes copy — the server message is km-only and the client is
    unit-aware (mi mode). */
export class LoopTooShortError extends Error {
  minTargetKm: number;
  constructor(message: string, minTargetKm: number) {
    super(message);
    this.minTargetKm = minTargetKm;
  }
}

/** The server's loop floor, mirrored client-side (probed min_target_km =
    2.0). Drives the loop-mode slider minimum + the AI-banner band clamp so
    the UI stops selling sub-floor loops; the 422 above stays the
    authoritative backstop if the server floor ever drifts. */
export const LOOP_MIN_TARGET_KM = 2.0;
/** 8/5 owner cap (her n-lap ceiling — lap geometry degrades past ~13km
    targets; lift condition = her long-distance server work). ONE pair drives
    course-create (seed clamp · slider · label) AND ai-course-prefs' stepper
    — imported, never copied. BE hard bounds untouched (target le=100,
    default_distance_km le=32.2 — the cap is UX honesty, not a 422 mirror). */
export const MAX_TARGET_KM = 13;
export const MAX_TARGET_MI = 8; // 12.87km — the km cap on a round mi detent

// ─── generate ─────────────────────────────────────────────────────────────────

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

// Generation calls Gemini server-side, so allow a generous ceiling; an
// unreachable server still fails in milliseconds with a connection error.
const TIMEOUT_MS = 45_000;

async function generate(input: RouteInput, signal?: AbortSignal): Promise<GeneratedRoute> {
  if (!API_URL) {
    throw new Error(t('err.config'));
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error(t('err.loginNeeded'));

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
        // presence-keyed (v2.3): included ONLY in one-way mode
        ...(input.end ? { end: input.end } : {}),
      }),
      signal: controller.signal,
    });
  } catch {
    if (signal?.aborted) throw new Error(t('gen.cancelled'));
    if (controller.signal.aborted) throw new Error(t('err.timeout'));
    throw new Error(t('err.serverDown'));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  if (!res.ok) {
    if (res.status === 401) throw new Error(t('err.loginNeeded'));
    if (res.status === 429) {
      // honest quota copy with the real reset time (B8) — this frozen fetch
      // keeps its own error mapping, so the shared formatter is imported.
      let qd: Record<string, unknown> | null = null;
      try { const b = await res.json(); qd = (b?.detail && typeof b.detail === 'object') ? b.detail : null; } catch { /* non-JSON */ }
      throw new Error(quotaExceededMessage(qd));
    }
    if (res.status === 422) {
      // v2.3 one-way feasibility gate — detail is an OBJECT here (unlike the
      // string-detail class below). Other 422s (pydantic validation arrays)
      // fall to the generic face; body read once, branch terminates both ways.
      let d: { error?: unknown; min_target_km?: unknown } | null = null;
      try {
        const body = await res.json();
        d = body?.detail && typeof body.detail === 'object' ? body.detail : null;
      } catch { /* non-JSON 422 */ }
      if (d?.error === 'one_way_end_too_far' && typeof d.min_target_km === 'number') {
        throw new OneWayTooFarError(t('gen.endTooFar'), d.min_target_km);
      }
      if (d?.error === 'loop_target_too_short' && typeof d.min_target_km === 'number') {
        throw new LoopTooShortError(t('gen.loopTooShort'), d.min_target_km);
      }
      throw new Error(t('gen.badInput'));
    }
    if (res.status === 503) {
      // Honest-503 (지연 batch 2026-07-23): route_generation_unavailable =
      // the upstream generator is down/overloaded — the ASK was fine, so the
      // copy carries retry-SAME semantics (vs 502's change-conditions lane).
      // Other 503s (fly gateway) share the transient framing.
      let code: string | null = null;
      try {
        const body = await res.json();
        code = typeof body?.detail?.error === 'string' ? body.detail.error : null;
      } catch { /* non-JSON 503 — generic fallback */ }
      if (code === 'route_generation_unavailable') {
        throw new Error(t('gen.unstable'));
      }
      throw new Error(t('gen.noResponse'));
    }
    if (res.status === 502) {
      // v2.1 계약 (BE routes.py 502 detail.error): route_generation_failed =
      // 생성 전패 반려(미달-only 포함) — 쿼터는 raise 전에 해제되므로 미소모가
      // 항상 참. 다른 502(게이트웨이 등)는 아래 일반 매핑으로 폴백.
      let code: string | null = null;
      try {
        const body = await res.json();
        code = typeof body?.detail?.error === 'string' ? body.detail.error : null;
      } catch { /* non-JSON 502 — generic fallback */ }
      if (code === 'route_generation_failed') {
        throw new Error(t('gen.notFound'));
      }
      throw new Error(t('gen.failed502'));
    }
    let detail: string | null = null;
    try {
      const body = await res.json();
      detail = typeof body?.detail === 'string' ? body.detail : null;
    } catch { /* non-JSON error body */ }
    throw new Error(detail ?? tf('gen.failedN', { s: res.status }));
  }

  return (await res.json()) as GeneratedRoute;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGenerateRoute() {
  return { generate };
}
