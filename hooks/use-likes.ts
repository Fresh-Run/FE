import { useCallback, useState } from 'react';

/**
 * Local-state like toggle for activities.
 *
 * Interface contract (unchanged when wiring to Supabase):
 *   isLiked(activityId)  → boolean
 *   toggle(activityId)   → void   (optimistic; no return value)
 *
 * TO SWAP IN SUPABASE:
 *   1. Accept the signed-in userId as a param.
 *   2. On mount, query `run_likes` for all activityIds the user has liked
 *      and seed `liked` from that result.
 *   3. In `toggle`, also call:
 *        liked → supabase.from('run_likes').delete().match({ activity_id, user_id })
 *        !liked → supabase.from('run_likes').insert({ activity_id, user_id })
 *      The optimistic setState stays as-is; add a rollback on error.
 */
export function useLikes() {
  const [liked, setLiked] = useState<ReadonlySet<string>>(new Set());

  const isLiked = useCallback(
    (activityId: string) => liked.has(activityId),
    [liked],
  );

  const toggle = useCallback((activityId: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) {
        next.delete(activityId);
      } else {
        next.add(activityId);
      }
      return next;
    });
  }, []);

  return { isLiked, toggle } as const;
}
