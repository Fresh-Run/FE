/**
 * 스크린샷 → 공유 카드 오퍼 (composer slice 3, build 8 alive) — the
 * discoverable-delight door, never the only path (the header share buttons
 * remain the primary doors). iOS screenshot notification via
 * expo-screen-capture's addScreenshotListener (no permission needed on iOS).
 * A quiet chip offers the composer for ~6s; tap → composer; ignore → gone.
 * Mount ONLY on own-run screens (the door list's own-runs-only scope).
 */
import { addScreenshotListener } from 'expo-screen-capture';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Icon } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { shadows, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

const OFFER_MS = 6000;

export function ScreenshotShareOffer({ runId }: { runId: string }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const T = useT(); // junction component — rendered by run-post AND activity
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = addScreenshotListener(() => {
      setVisible(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setVisible(false), OFFER_MS);
    });
    return () => {
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!visible) return null;
  return (
    <Pressable
      onPress={() => {
        setVisible(false);
        router.push({ pathname: '/share-card' as never, params: { runId } });
      }}
      style={({ pressed }) => [st.chip, shadows.md, pressed && { opacity: 0.85 }]}
    >
      <Icon name="sparkles" size={14} color={C.accent} />
      <Text style={st.txt}>{T('sso.offer')}</Text>
    </Pressable>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  chip: {
    position: 'absolute', bottom: 28, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 11,
  },
  txt: { fontSize: 13, fontWeight: '700', color: C.text, letterSpacing: -0.2 },
});
