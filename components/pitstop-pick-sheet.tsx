/**
 * 경유지 장소 pick — search-result-pick sheet (pitstop_place slice 1, 8/26).
 *
 * The real-POI-only rule: a pitstop must be a NAMED Kakao search result —
 * so this is the start-picker's search idiom in place-pick-sheet's modal
 * shell, deliberately WITHOUT the center-pin (an arbitrary coordinate has
 * no real name to serve).
 *
 * Distance guard (softened 8/27): band = target×0.5 mirrors the server
 * position band. Out-of-band picks are now best-effort-served with
 * target_missed (BE 7199f16 — the 8/26-probed 502 is dead), so far rows
 * stay SELECTABLE and carry an amber may-lengthen warning instead of a
 * disable.
 *
 * Search mechanics = the house transplant (place-pick-sheet S1 verbatim):
 * /api/places Kakao proxy, 400ms debounce, 2-char floor, monotonic
 * stale-guard; null results = quiet idle, [] = empty state. Proximity mode
 * (near=start) so close candidates rank first; radius covers 3× the band
 * so the greyed zone is visible (clamped to the wrapper's 20km ceiling).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { searchPlaces, type Place } from '@/lib/places-api';
import { haversineKm } from '@/lib/run-metrics';
import { distUnit, fmtDist, type Units } from '@/lib/run-format';
import { radius as R, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_MIN_CHARS = 2;

export function PitstopPickSheet({ visible, start, bandKm, units, onClose, onPick }: {
  visible: boolean;
  /** run start point — distance-guard anchor + proximity-search center */
  start: { lat: number; lng: number };
  /** selectable radius (km) = target×0.5; beyond it rows disable */
  bandKm: number;
  units: Units;
  onClose: () => void;
  onPick: (place: Place) => void;
}) {
  const T = useT();
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[] | null>(null);
  const searchSeq = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      searchSeq.current++; // invalidate any in-flight search
      setResults(null);
      return;
    }
    const seq = ++searchSeq.current;
    debounceTimer.current = setTimeout(() => {
      searchPlaces(q, {
        near: start,
        radiusM: Math.min(20000, Math.max(3000, Math.round(bandKm * 3000))),
        limit: 15,
      })
        .then(rows => { if (searchSeq.current === seq) setResults(rows); })
        .catch(() => { if (searchSeq.current === seq) setResults([]); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [query, visible, start, bandKm]);

  function close() {
    setQuery('');
    setResults(null);
    Keyboard.dismiss();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[st.root, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={st.header}>
          <Text variant="bodyLg" weight="700">{T('pit.pickTitle')}</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={close} hitSlop={10} accessibilityLabel={T('pit.closeA11y')}>
            <Icon name="close" size={22} color={C.text} />
          </Pressable>
        </View>

        {/* Search */}
        <View style={st.searchBox}>
          <Icon name="search" size={16} color={C.faint} />
          <TextInput
            style={st.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={T('pit.searchPh')}
            placeholderTextColor={C.faint}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Icon name="close-circle" size={16} color={C.faint} />
            </Pressable>
          )}
        </View>

        {/* Results */}
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + S.lg }}>
          {results !== null && results.length === 0 && (
            <Text variant="bodyMd" color="sub" style={st.emptyTxt}>{T('pit.noResults')}</Text>
          )}
          {(results ?? []).map((p, i) => {
            const dKm = haversineKm(start, p.coordinate);
            // 8/27 guard softening: far rows are SELECTABLE — the server now
            // best-effort-serves out-of-band picks with target_missed (BE
            // 7199f16; the 502 path is gone). The amber hint stays as an
            // honest warning, not a block.
            const far = dKm > bandKm;
            return (
              <Pressable
                key={`${p.name}-${i}`}
                onPress={() => { onPick(p); close(); }}
                style={({ pressed }) => [st.row, pressed && { opacity: 0.7 }]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyMd" weight="600" numberOfLines={1}>{p.name}</Text>
                  {p.address ? (
                    <Text variant="labelSm" color="sub" numberOfLines={1}>{p.address}</Text>
                  ) : null}
                  {far && (
                    <Text variant="labelSm" style={{ color: C.sun }}>{T('pit.tooFar')}</Text>
                  )}
                </View>
                <Text variant="labelSm" color="sub">
                  {`${fmtDist(dKm, units, 1)}${distUnit(units)}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.bg },
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: S.md },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: S.gutter, marginBottom: S.sm,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text, letterSpacing: -0.2, paddingVertical: 0 },
  emptyTxt:  { textAlign: 'center', paddingVertical: S.xl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: S.gutter, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border,
  },
});
