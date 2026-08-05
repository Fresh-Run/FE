/**
 * MentionText — comment/reply body with tappable @닉네임 tokens (8/5 build).
 *
 * SERVER TRUTH (probed 2026-08-05, run-comment POST/GET dumped): the comment
 * payload carries NO mention metadata — so this is VISUAL-ONLY linking with
 * TAP-TIME resolution (the sanctioned fallback): the token renders as a link,
 * and the tap resolves it via GET /users/search (ILIKE partial, min 2 chars,
 * blocked users pre-excluded server-side — a mention of someone in a block
 * relation resolves to an honest miss). EXACT nickname equality only — a
 * partial match must never mis-navigate.
 *
 * Render mechanics: nested <Text> spans keep INLINE flow — wrapping is
 * byte-identical to a plain Text (no layout shift; a Pressable here would
 * break the line box). Navigation goes through openProfile — the ONE profile
 * door (self-mention self-routes to 내 프로필 by its standing rule).
 *
 * Known limits (stated): a nickname containing whitespace only matches its
 * first token (the @-grammar has no delimiter) → resolves to a miss; a
 * RENAMED author's old @mention in stale comment text also misses — both
 * land on the honest not-found alert, never a wrong profile.
 */
import React, { useRef } from 'react';
import { Alert, Text, type StyleProp, type TextStyle } from 'react-native';

import { t } from '@/lib/i18n';
import { searchUsers } from '@/lib/profile-api';
import { openProfile } from '@/lib/profile-nav';

// @ + 2–20 non-space/non-@ chars — mirrors the nickname rule (2~20) and the
// search endpoint's min_length=2 (a 1-char token could never resolve anyway).
const MENTION_RE = /@([^\s@]{2,20})/g;

export function MentionText({ content, style, mentionColor }: {
  content: string;
  style?: StyleProp<TextStyle>;
  /** accent for the mention spans — callers pass their token color */
  mentionColor: string;
}) {
  // one resolution in flight per body — rapid double-taps stay single
  const busyRef = useRef(false);

  async function resolve(token: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const rows = await searchUsers(token);
      const hit = rows.find(r => r.nickname === token); // EXACT only
      if (hit) {
        openProfile(hit.user_id, hit.nickname);
      } else {
        Alert.alert(t('cm.mentionGoneT'), t('cm.mentionGoneB'));
      }
    } catch {
      // network / 422(min-length can't occur at ≥2) — same honest miss
      Alert.alert(t('cm.mentionGoneT'), t('cm.mentionGoneB'));
    } finally {
      busyRef.current = false;
    }
  }

  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    const token = m[1];
    parts.push(
      <Text
        key={`${m.index}-${token}`}
        style={{ color: mentionColor, fontWeight: '700' }}
        onPress={() => resolve(token)}
        suppressHighlighting
      >
        {m[0]}
      </Text>,
    );
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));

  return <Text style={style}>{parts}</Text>;
}
