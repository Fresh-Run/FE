// Run list + detail — migrated to the backend API (2026-07-08; was direct
// Supabase reads, the audit's grandfather exception #1). Signatures and
// consumer contracts unchanged. Auth stays Supabase (architecture rule).
// History cap: /api/runs takes limit only (offset ignored server-side) —
// limit=100 covers current scale; pagination ask logged in TODO.

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export type RunSplit = {
  km: number;             // cumulative km mark (1.0, 2.0, …; partial = total)
  sec: number;            // this split's duration
  elev_gain_m: number | null;
  partial: boolean;       // last split under a full km
};

export type Run = {
  id: string;
  ran_at: string;
  distance_km: number;
  duration_sec: number;
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
  /** First-photo thumb (signed) on list rows */
  photo_thumb?: string | null;
};

// ─── useRuns — full list for the signed-in user ───────────────────────────────

export function useRuns() {
  const [runs, setRuns]           = useState<Run[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [key, setKey]             = useState(0);
  // SWR-lite (2026-07-08): mirrors `runs` so the effect can tell a true
  // first load from a focus-refetch without depending on state.
  const hasDataRef = useRef(false);

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
        const rows = await apiFetch<Run[]>('/api/runs?limit=100');
        if (cancelled) return;
        setRuns(rows); // server returns 최신순 — same order as the legacy read
        hasDataRef.current = rows.length > 0;
      } catch (e: unknown) {
        // Silent-refetch failure keeps the stale list; error state is for
        // the no-data case only.
        if (!cancelled && firstLoad) setError(e instanceof Error ? e.message : '기록을 불러올 수 없어요');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { runs, loading, error, signedOut, refetch };
}

// ─── useRunDetail — single run by id ─────────────────────────────────────────
// Own-only server-side: not-mine/unknown ids come back 404 → the same
// graceful "not found" the legacy PGRST116 path produced.

export function useRunDetail(runId: string | null) {
  const [run, setRun]         = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [key, setKey]         = useState(0);

  useEffect(() => {
    if (!runId) { setLoading(false); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRun(null);

    apiFetch<Run>(`/api/runs/${runId}`)
      .then(row => { if (!cancelled) setRun(row); })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError && e.status === 404
          ? '기록을 찾을 수 없어요'
          : e instanceof Error ? e.message : '기록을 찾을 수 없어요');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [runId, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { run, loading, error, refetch };
}
