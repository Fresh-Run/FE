// Route comments — backed by GET/POST /api/routes/{id}/comments.
// (Replaced the pre-feed-v1 local-state stub; the sheet's read interface
// is unchanged: comments[], post, loading.)

import { useCallback, useEffect, useState } from 'react';

import { getRouteComments, postRouteComment, type RouteComment } from '@/lib/routes-api';
import { t } from '@/lib/i18n';

export type CommentView = {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
};

function mapComment(row: RouteComment): CommentView {
  return {
    id: row.id,
    authorId: row.user_id ?? null,
    authorName: row.nickname ?? t('home.runner'),
    body: row.content,
    createdAt: row.created_at,
  };
}

export function useRouteComments(routeId: string | null) {
  const [comments, setComments] = useState<CommentView[]>([]);
  const [loading, setLoading]   = useState(false);
  const [posting, setPosting]   = useState(false);
  // Reactive-t rider (G, 8/8): the RAW error is stored, never a resolved
  // string — consumers render errorMessageIn(useLang(), error) so a
  // language flip re-resolves (the 7/28 ledgered stale-locale class).
  // NOTE (dead-code find, on the ledger): this hook currently has ZERO
  // consumers — course-post grew its own machinery (boolean loadError,
  // already render-keyed). Converted anyway so any future consumer
  // inherits the fixed class.
  const [error, setError]       = useState<unknown>(null);

  useEffect(() => {
    if (!routeId) { setComments([]); setError(null); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);
    getRouteComments(routeId)
      .then(rows => { if (!cancelled) setComments(rows.map(mapComment)); })
      .catch((e: unknown) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [routeId]);

  /** Posts a comment; resolves true on success (caller bumps the card count). */
  const post = useCallback(async (body: string): Promise<boolean> => {
    if (!routeId || posting) return false;
    setPosting(true);
    setError(null);
    try {
      const row = await postRouteComment(routeId, body);
      setComments(prev => [...prev, mapComment(row)]);
      return true;
    } catch (e: unknown) {
      setError(e);
      return false;
    } finally {
      setPosting(false);
    }
  }, [routeId, posting]);

  return { comments, loading, posting, error, post };
}
