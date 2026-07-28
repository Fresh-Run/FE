/**
 * Canonical avatar — the #9 consolidation of the 14 per-screen variants
 * (the 8d1e638 pattern): uploaded photo wins over initials; load failure
 * falls back to initials — never a broken image. The grace is URL-keyed
 * (brokenUrl, not a boolean) so a cache-busted or replaced URL retries.
 *
 * DiceBear seed URLs render like any payload photo (payload truth); what
 * counts as a "real" user photo — the management semantics — lives in
 * personal-info, not here.
 *
 * Zero-visual-change consolidation: the style dials (ring/ringWidth,
 * initialsRatio, letterSpacing, upper) carry each call site's exact
 * pre-consolidation pixels. Don't "clean up" a call site to defaults
 * without a visual pass on that screen.
 */
import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { avatarBg } from '@/lib/fr-hash';
import { useT } from '@/lib/i18n';

export function Avatar({ name, size = 40, photoUrl, ring, ringWidth = 2, initialsRatio = 0.42, letterSpacing, upper = false }: {
  /** null/undefined/blank falls back to '러너' */
  name: string | null | undefined;
  size?: number;
  photoUrl?: string | null;
  /** border color, applied to BOTH photo and initials (observed: C.border, C.accent) */
  ring?: string;
  /** only meaningful with ring (observed: 1 / 2 / 2.5) */
  ringWidth?: number;
  /** initials fontSize = round(size × ratio) — observed 0.38 / 0.4 / 0.42 / 0.5 */
  initialsRatio?: number;
  letterSpacing?: number;
  /** the uppercase-initial + '?' fallback idiom (profile-ish surfaces) */
  upper?: boolean;
}) {
  const T = useT(); // reactive anchor (shared everywhere — the fallback initial follows the locale)
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const border = ring ? { borderWidth: ringWidth, borderColor: ring } : null;
  if (photoUrl && photoUrl !== brokenUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        onError={() => setBrokenUrl(photoUrl)}
        style={[{ width: size, height: size, borderRadius: size / 2, flexShrink: 0 }, border]}
      />
    );
  }
  const n = (name ?? '').trim() || T('home.runner');
  return (
    <View style={[
      { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarBg(n), alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      border,
    ]}>
      <Text style={{ fontWeight: '700', fontSize: Math.round(size * initialsRatio), color: '#fff', letterSpacing }}>
        {upper ? (n[0]?.toUpperCase() ?? '?') : n[0]}
      </Text>
    </View>
  );
}
