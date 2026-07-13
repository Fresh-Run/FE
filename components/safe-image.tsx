/**
 * Remote image that falls back on load failure — fixes the `url ? <Image> :
 * <Fallback>` class (A2, 2026-07-14): the ternary picks Image while the URL
 * is set, so a broken/expired URL or offline load strands the user on a
 * blank band instead of the fallback branch. SafeImage owns the choice:
 * no uri OR failed uri → fallback.
 *
 * URL-keyed broken state (avatar.tsx idiom): a NEW url (re-upload, ?v=
 * cache-bust) retries automatically; the same url stays on fallback for
 * this mount; a TRANSIENT failure retries on next mount because the broken
 * mark dies with the component instance.
 */
import React, { useState } from 'react';
import { Image, type ImageProps } from 'react-native';

export function SafeImage({ uri, fallback, ...img }: Omit<ImageProps, 'source'> & {
  uri: string | null | undefined;
  fallback: React.ReactNode;
}) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (!uri || uri === brokenUrl) return <>{fallback}</>;
  return <Image {...img} source={{ uri }} onError={() => setBrokenUrl(uri)} />;
}
