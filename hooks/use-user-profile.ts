// 타인 프로필 — parallel fetch of the public profile + visibility-filtered
// runs (server filters by viewer; the 공개 framing is honest here).
// Shapes staging-probed 2026-07-08.
//
// 비공개 프로필 v1 (⑪): the profile response carries `locked` — **GATE IS
// LIVE (re-probed 2026-08-08, 감사 #4-M: non-follower on a private account
// gets locked=true)**. Locked runs GET serves 200 + EMPTY LIST, not the
// once-documented 404 (drift caught same probe) — the runs fetch stays
// NON-FATAL either way: it degrades to [] and only the profile fetch drives
// the screen's error state.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { t } from '@/lib/i18n';
import { errorMessage } from '@/lib/error-copy';

// identity-only cache (#8 correction): nickname/avatar are lock-served to
// every viewer — the ONLY leak-free cacheable subset. Target-keyed (not
// viewer-keyed): the fields are identical for all viewers by her contract.
// Counts/bio/runs/flags are NEVER cached (all change under lock).
const identKey = (uid: string) => `@fr_uident:${uid}`;
export type CachedIdentity = { nickname: string; avatar_url: string | null };

export type UserProfile = {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string | null;
  tier: string;
  follower_count: number;   // NOT zeroed when locked (probed 8/8 — real counts served; her stated contract said zeroed → flagged to 지연, 감사 #4-M)
  following_count: number;  // NOT zeroed when locked (same 8/8 probe)
  is_following: boolean;
  is_followed_by: boolean;
  public_run_count: number; // NOT zeroed when locked (same 8/8 probe)
  /** Additive (지연 2026-07-16, probed both states): true count of the
      user's followers-only runs. Locked profiles ALWAYS 0 — existence
      hidden, leak-verified server-side (no titles/dates/tracks). Feeds the
      "팔로우하면 N개 더 볼 수 있어요" CTA; render only when > 0. */
  followers_run_count: number;
  visibility: 'public' | 'followers' | 'private';
  locked: boolean;          // true = non-follower viewing a gated account
  /** v1.5 pre-render flags (지연 deploy, probed 2026-07-13): false = the
      owner disabled it; null = locked account (no affordances either way);
      absent (stale payload) = show + let the 403 net catch races. */
  allow_likes?: boolean | null;
  allow_comments?: boolean | null;
};

export type UserRun = {
  run_id: string;
  user_id: string;
  nickname: string;
  /** 8/5 크루 배너 (K1 피드 캐스트 공유) — null/absent = 무배너, 이유 추론 금지 */
  crew_name?: string | null;
  /** 8/8 그녀 (a): 오너-온리 서빙 (추론-공격 내로잉) — own rows carry the
      real bool; others' rows null/absent (never infer from the null).
      The own-view honesty gate keys on this. */
  show_crew?: boolean | null;
  avatar_url: string | null; // served (probed 2026-07-13, avatar sweep)
  ran_at: string;
  title: string | null;
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  kudos_count: number;
  my_kudos: boolean;
  comment_count: number;
  is_mine: boolean;
  polyline_thumb: { lat: number; lng: number }[] | null; // BE 6baa192, ≤36pt
};

export function useUserProfile(uid: string | null) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [identity, setIdentity] = useState<CachedIdentity | null>(null);
  const [runs, setRuns]       = useState<UserRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [key, setKey]         = useState(0);

  useEffect(() => {
    if (!uid) { setLoading(false); setError(t('prof.loadFail')); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // instant identity paint (header only — the body stays fresh-loading)
    AsyncStorage.getItem(identKey(uid))
      .then(raw => { if (raw && !cancelled) setIdentity(JSON.parse(raw)); })
      .catch(() => {});
    Promise.all([
      apiFetch<UserProfile>(`/api/users/${uid}/profile`),
      // non-fatal: locked accounts serve 200 + [] (probed 8/8; the old
      // 404-by-contract claim drifted); any runs hiccup degrades to an
      // empty list instead of killing the profile
      apiFetch<UserRun[]>(`/api/users/${uid}/runs?limit=50`).catch(() => [] as UserRun[]),
    ])
      .then(([p, r]) => {
        if (cancelled) return;
        setProfile(p);
        setRuns(r);
        // write on EVERY payload shape — locked responses serve both fields
        AsyncStorage.setItem(identKey(uid), JSON.stringify({ nickname: p.nickname, avatar_url: p.avatar_url })).catch(() => {});
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid, key]);

  const refetch = useCallback(() => setKey(k => k + 1), []);
  return { profile, identity, runs, loading, error, refetch };
}
