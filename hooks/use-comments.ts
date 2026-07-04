import { useCallback, useEffect, useState } from 'react';

export type LocalComment = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

/**
 * Local-state comment list for a single activity.
 *
 * Interface contract (unchanged when wiring to Supabase):
 *   comments   → LocalComment[]  (seed + locally posted)
 *   post(body, authorName) → void  (optimistic append)
 *   loading    → boolean  (always false locally; meaningful after Supabase swap)
 *
 * TO SWAP IN SUPABASE:
 *   1. On activityId change, query:
 *        SELECT rc.id, rc.body, rc.created_at, p.display_name
 *        FROM run_comments rc JOIN profiles p ON p.id = rc.user_id
 *        WHERE rc.activity_id = activityId ORDER BY rc.created_at ASC
 *      Replace `seedComments` arg with the query result.
 *   2. In `post`, after the optimistic push also call:
 *        supabase.from('run_comments').insert({ activity_id, user_id, body })
 *      Rollback on error by filtering out the optimistic item by id.
 *   3. Set `loading` to true during the initial fetch, false after.
 */
export function useComments(
  activityId: string | null,
  seedComments: LocalComment[] = [],
) {
  const [extra, setExtra] = useState<LocalComment[]>([]);

  // Clear locally-posted comments when navigating to a different activity.
  useEffect(() => { setExtra([]); }, [activityId]);

  const post = useCallback((body: string, authorName: string) => {
    const optimistic: LocalComment = {
      id: `local-${Date.now()}`,
      authorName,
      body,
      createdAt: new Date().toISOString(),
    };
    setExtra((prev) => [...prev, optimistic]);
  }, []);

  const comments: LocalComment[] = [...seedComments, ...extra];

  return { comments, post, loading: false } as const;
}
