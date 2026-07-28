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
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!routeId) { setComments([]); setError(null); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);
    getRouteComments(routeId)
      .then(rows => { if (!cancelled) setComments(rows.map(mapComment)); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : t('cm.loadFail')); })
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
      setError(e instanceof Error ? e.message : t('cm.postFail'));
      return false;
    } finally {
      setPosting(false);
    }
  }, [routeId, posting]);

  return { comments, loading, posting, error, post };
}
