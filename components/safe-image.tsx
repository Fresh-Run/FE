/**
 * Remote image that falls back on load failure — fixes the `url ? <Image> :
 * <Fallback>` class (A2, 2026-07-14): the ternary picks Image while the URL
 * is set, then a 403/404/timeout leaves a blank band. SafeImage owns the
 * choice: a URL that failed renders the fallback branch instead.
 *
 * item ⑩-4 (2026-11-21): rides expo-image — memory + DISK cache, transition
 * 0 (a seen photo paints on the first frame of a remount), decoding at the
 * view size (the 2048×1536 "thumbs" no longer decode at full size). The
 * cache key is the storage OBJECT PATH, not the URL: signed URLs re-sign on
 * every list fetch (new token, same bytes), so keying by path keeps the
 * disk hit across refetches and relaunches. `recyclingKey` follows the same
 * key so a recycled list cell never shows the previous row's photo.
 */
import { Image, type ImageProps } from 'expo-image';
import React, { useState } from 'react';

/** Storage object path for a (signed) URL — the cache identity. */
export function imageCacheKey(uri: string): string {
  const q = uri.indexOf('?');
  return q >= 0 ? uri.slice(0, q) : uri;
}

export function SafeImage({ uri, fallback, resizeMode, contentFit, ...img }: Omit<ImageProps, 'source'> & {
  uri: string | null | undefined;
  fallback: React.ReactNode;
  /** RN-Image compat for existing call sites; maps onto contentFit */
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
}) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (!uri || uri === brokenUrl) return <>{fallback}</>;
  const key = imageCacheKey(uri);
  return (
    <Image
      {...img}
      source={{ uri, cacheKey: key }}
      recyclingKey={key}
      contentFit={contentFit ?? (resizeMode === 'stretch' ? 'fill' : resizeMode === 'center' ? 'none' : resizeMode) ?? 'cover'}
      cachePolicy="memory-disk"
      transition={0}
      onError={() => setBrokenUrl(uri)}
    />
  );
}
