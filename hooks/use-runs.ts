// Run list + detail — migrated to the backend API (2026-07-08; was direct
// Supabase reads, the audit's grandfather exception #1). Signatures and
// consumer contracts unchanged. Auth stays Supabase (architecture rule).
// History cap: /api/runs takes limit only (offset ignored server-side) —
// Cursor-paged (S-batch2 #9): RUNS_PAGE_SIZE per page, before= for older.

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import { errorMessage } from '@/lib/error-copy';
import { supabase } from '@/lib/supabase';

const RUNS_PAGE_SIZE = 50;

export type RunSplit = {
  km: number;             // cumulative km mark (1.0, 2.0, …; partial = total)
  sec: number;            // this split's ELAPSED duration (pause/stops included)
  /** v88 (2026-07-23 additive, staging-probed): lap MOVING time — Strava-
      style, instantaneous <0.5m/s stretches excluded (her ~8s smoothing
      nuance ledgered). null on pre-v88 runs → fall back to sec. */
  moving_sec?: number | null;
  elev_gain_m: number | null;
  partial: boolean;       // last split under a full km
};

export type Run = {
  /** 8/5 그녀 ② 필드 (개인 리드 라이브): 크루-태그 런의 배지/토글 소스 */
  crew_id?: string | null;
  crew_name?: string | null;
  session_key?: string | null;
  /** 단건 온리 (그녀 ②) — 서버-글로벌, 버바팀 리드, 클라 계산 금지 */
  session_participant_count?: number | null;
  /** 8/8 그녀 (a) 오너-온리 서빙 — edit-run 시드 소스 (시드 갭 사망) */
  show_crew?: boolean | null;
  id: string;
  ran_at: string;
  distance_km: number;
  duration_sec: number;
  /** v88 (2026-07-23 additive): run-level MOVING time (=Σ splits.moving_sec).
      duration_sec pairs as the ELAPSED side (client-reported — caveat: OUR
      tracker's clock freezes on manual pause, so it undercounts paused
      stretches; her contract note ledgered). null on trackless/old runs. */
  moving_sec?: number | null;
  avg_pace_sec_per_km: number | null;
  notes: string | null;
  route_id: string | null;
  // ── R3' additions (BE 4cd5685: 타인 공개범위 내 정제 응답) ──────────────
  /** null on OTHERS' runs (sanitized) — never render for non-own rows */
  visibility?: 'public' | 'followers' | 'private' | null;
  user_id?: string;
  title?: string | null;
  has_track?: boolean;
  kudos_count?: number;
  comment_count?: number;
  /** Viewer's kudos state (BE 111a446, 피드와 동일 계산; own runs always false) */
  my_kudos?: boolean;
  /** Per-km splits on GPS runs (probed shape 2026-07-11); [] on sub-km/trackless */
  splits?: RunSplit[];
  /** Signed URLs, 1h expiry — use response values directly, NEVER cache (계약). Detail responses only. */
  photos?: string[] | null;
  /** v77 (BE 985bc2c, own-run detail only): raw Storage paths PARALLEL to
      photos[] (same order) — what PATCH {photos} consumes. The edit-run
      photo-mutation dependency (probed live 2026-07-22). */
  photo_paths?: string[] | null;
  /** v1.5 pre-render flags — see use-user-profile note. ⚠️ own detail serves
      the RAW flag (not always-true; contract deviation flagged to 지연) —
      consumers must ignore these in own mode. */
  allow_likes?: boolean | null;
  allow_comments?: boolean | null;
  /** First-photo thumb (signed) on list rows */
  photo_thumb?: string | null;
  /** ≤36-pt simplified track on list rows (BE 6baa192; null = trackless) */
  polyline_thumb?: { lat: number; lng: number }[] | null;
  /** Server ±10% recompute flag (guide §148): true = distance_km was
      replaced by the server value (original in distance_km_reported) OR
      verification=suspect. 타인 응답에선 기본값 — own screens only. */
  is_flagged?: boolean;
  distance_km_reported?: number | null;
};

// ─── useRuns — full list for the signed-in user ───────────────────────────────

export function useRuns() {
  const [runs, setRuns]           = useState<Run[]>([]);
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [key, setKey]             = useState(0);
  // SWR-lite (2026-07-08): mirrors `runs` so the effect can tell a true
  // first load from a focus-refetch without depending on state.
  const hasDataRef = useRef(false);
  const runsRef = useRef<Run[]>([]);
  runsRef.current = runs;
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Spinner is reserved for the true no-data case; refetches with data
    // on screen run silently behind the rendered list (no flash).
    const firstLoad = !hasDataRef.current;
    if (firstLoad) setLoading(true);
    setError(null);
    setSignedOut(false);

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setSignedOut(true);
        setRuns([]);
        hasDataRef.current = false;
        setLoading(false);
        return;
      }

      try {
        const rows = await apiFetch<Run[]>(`/api/runs?limit=${RUNS_PAGE_SIZE}`);
        if (cancelled) return;
        // Focus-refetch keeps paged-in older items: fresh first page wins,
        // existing rows beyond it are re-appended (dedup by id).
        setRuns(prev => {
          const seen = new Set(rows.map(r => r.id));
          return [...rows, ...prev.filter(r => !seen.has(r.id))];
        });
        // hasMore only re-arms from the first page when nothing older was
        // already loaded (a short first page after paging just means the
        // page boundary moved, not that history shrank)
        if (runsRef.current.length <= rows.length) setHasMore(rows.length === RUNS_PAGE_SIZE);
        hasDataRef.current = rows.length > 0;
      } catch (e: unknown) {
        // Silent-refetch failure keeps the stale list; error state is for
        // the no-data case only.
        if (!cancelled && firstLoad) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [key]);

  // Cursor pagination (guide §108): before=<last ran_at>, ISO+tz — the '+'
  // MUST be URL-encoded (encodeURIComponent, 정석 per contract); a page
  // shorter than limit means end-of-history.
  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasDataRef.current) return;
    const last = runsRef.current[runsRef.current.length - 1];
    if (!last) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const rows = await apiFetch<Run[]>(
        `/api/runs?limit=${RUNS_PAGE_SIZE}&before=${encodeURIComponent(last.ran_at)}`,
      );
      setRuns(prev => {
        const seen = new Set(prev.map(r => r.id));
        return [...prev, ...rows.filter(r => !seen.has(r.id))];
      });
      setHasMore(rows.length === RUNS_PAGE_SIZE);
    } catch { /* footer retry = scroll again; list stays intact */ }
    finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { runs, loading, loadingMore, hasMore, loadMore, error, signedOut, refetch };
}

// ─── useRunDetail — single run by id ─────────────────────────────────────────
// Own-only server-side: not-mine/unknown ids come back 404 → the same
// graceful "not found" the legacy PGRST116 path produced.

export function useRunDetail(runId: string | null) {
  const [run, setRun]         = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [key, setKey]         = useState(0);

  // SWR-lite (edit-run slice): refetches with data on screen run silently —
  // the spinner and the run-reset are reserved for the true first load.
  const hasDataRef = useRef(false);

  useEffect(() => {
    if (!runId) { setLoading(false); return; }

    let cancelled = false;
    const firstLoad = !hasDataRef.current;
    if (firstLoad) {
      setLoading(true);
      setRun(null);
    }
    setError(null);

    apiFetch<Run>(`/api/runs/${runId}`)
      .then(row => { if (!cancelled) { setRun(row); hasDataRef.current = true; } })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError && e.status === 404
          ? '기록을 찾을 수 없어요'
          : errorMessage(e));
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [runId, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { run, loading, error, refetch };
}
