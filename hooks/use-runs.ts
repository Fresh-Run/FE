import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type Run = {
  id: string;
  ran_at: string;
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  notes: string | null;
  route_id: string | null;
};

const RUN_SELECT = 'id, ran_at, distance_km, duration_sec, avg_pace_sec_per_km, notes, route_id';

// ─── useRuns — full list for the signed-in user ───────────────────────────────

export function useRuns() {
  const [runs, setRuns]           = useState<Run[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [key, setKey]             = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSignedOut(false);

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setSignedOut(true);
        setRuns([]);
        setLoading(false);
        return;
      }

      const { data, error: err } = await supabase
        .from('runs')
        .select(RUN_SELECT)
        .eq('user_id', user.id)
        .order('ran_at', { ascending: false });

      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setRuns((data ?? []) as Run[]);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { runs, loading, error, signedOut, refetch };
}

// ─── useRunDetail — single run by id ─────────────────────────────────────────
// No auth gate: RLS handles unauthorized access. If the row returns null
// (PGRST116) or any other error, we surface it as "not found" gracefully.

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

    supabase
      .from('runs')
      .select(RUN_SELECT)
      .eq('id', runId)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) {
          setError(err?.message ?? '기록을 찾을 수 없어요');
          setLoading(false);
          return;
        }
        setRun(data as Run);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [runId, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { run, loading, error, refetch };
}
