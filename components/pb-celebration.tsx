/**
 * PB 축하 모달 — 새로운 기록 경신 (bundle: FrPersonalBest + FrConfetti).
 * Overlay modal, CTA-only dismissal (backdrop not tappable, per design).
 * Shows the highest-priority record; extra simultaneous records get a
 * "+N개 기록 동시 경신" caption (design has no multi layout — approved call).
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Icon } from '@/components/ui';
import { frHash } from '@/lib/fr-hash';
import type { NewRecord } from '@/lib/runs-api';
import {
  distUnit,
  fmtDist,
  fmtDuration,
  fmtPaceIn,
  paceUnit,
  type Units,
} from '@/lib/run-format';
import { accentShadow, colors as C, radius as R } from '@/lib/theme';

// Priority when one run sets several records (approved: pace > 5k > dist > dur)
const PRIORITY: NewRecord['type'][] = ['best_pace', 'best_5k', 'longest_distance', 'longest_duration'];

const SUBTITLE: Record<NewRecord['type'], string> = {
  best_pace:        '역대 최고 페이스를 달성했어요!',
  best_5k:          '5km 최고 기록을 세웠어요!',
  longest_distance: '가장 먼 거리를 달렸어요!',
  longest_duration: '가장 오래 달렸어요!',
};

/** Per-type value formatting — pace/distance are unit-aware. */
function fmtValue(type: NewRecord['type'], value: number, units: Units): { text: string; caption: string } {
  switch (type) {
    case 'best_pace':        return { text: fmtPaceIn(value, units), caption: paceUnit(units) };
    case 'best_5k':          return { text: fmtDuration(value), caption: '5km' };
    case 'longest_distance': return { text: fmtDist(value, units, 2), caption: distUnit(units) };
    case 'longest_duration': return { text: fmtDuration(value), caption: '시간' };
  }
}

// ─── Confetti (16 seeded falling squares, one-shot — bundle FrConfetti) ───────

const CONFETTI_COLORS = [C.accent, '#3D8BFF', '#E0A52E', '#E0703D', C.accent];

type Bit = { left: number; delay: number; dur: number; size: number; rot: number; color: string };

const BITS: Bit[] = (() => {
  const rnd = frHash('pb-confetti-seed');
  return Array.from({ length: 16 }, (_, i) => ({
    left:  rnd() * 100,
    delay: rnd() * 500,
    dur:   1400 + rnd() * 1100,
    size:  6 + rnd() * 6,
    rot:   rnd() * 360,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  }));
})();

function Confetti() {
  const progress = useRef(BITS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const anims = progress.map((v, i) =>
      Animated.timing(v, {
        toValue: 1,
        duration: BITS[i].dur,
        delay: BITS[i].delay,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    );
    Animated.parallel(anims).start();
  }, [progress]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {BITS.map((b, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            top: -16,
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            borderRadius: 2,
            backgroundColor: b.color,
            opacity: progress[i].interpolate({ inputRange: [0, 0.85, 1], outputRange: [0.9, 0.9, 0] }),
            transform: [
              { translateY: progress[i].interpolate({ inputRange: [0, 1], outputRange: [0, 640] }) },
              { rotate: progress[i].interpolate({ inputRange: [0, 1], outputRange: [`${b.rot}deg`, `${b.rot + 220}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function PbCelebration({
  records, units, onClose,
}: {
  records: NewRecord[] | null;
  units: Units;
  onClose: () => void;
}) {
  const pop = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    if (!records) return;
    pop.setValue(0.8);
    Animated.timing(pop, { toValue: 1, duration: 340, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }).start();
  }, [records, pop]);

  if (!records || records.length === 0) return null;

  const sorted = [...records].sort((a, b) => PRIORITY.indexOf(a.type) - PRIORITY.indexOf(b.type));
  const main = sorted[0];
  const extra = sorted.length - 1;
  const prev = fmtValue(main.type, main.previous, units);
  const cur  = fmtValue(main.type, main.current, units);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.overlay}>
        <Confetti />
        <Animated.View style={[st.card, { transform: [{ scale: pop }] }]}>
          {/* Medal */}
          <View style={st.medalWrap}>
            <View style={[st.medalGlow, accentShadow(C.accent)]}>
              <Icon name="medal" size={46} color={C.accentText} />
            </View>
          </View>

          <Text style={st.title}>새로운 기록 경신!</Text>
          <Text style={st.subtitle}>{SUBTITLE[main.type]}</Text>
          {extra > 0 && <Text style={st.extraCaption}>+{extra}개 기록 동시 경신</Text>}

          {/* 이전 / 현재 comparison */}
          <View style={st.compareRow}>
            <View style={st.prevPanel}>
              <Text style={st.panelLabel}>이전</Text>
              <Text style={st.prevValue}>{prev.text}</Text>
              <Text style={st.panelCaption}>{prev.caption}</Text>
            </View>
            <View style={st.curPanel}>
              <View style={st.bestTag}><Text style={st.bestTagTxt}>BEST</Text></View>
              <Text style={[st.panelLabel, { color: C.accentGrn }]}>현재</Text>
              <View style={st.curValueRow}>
                <Text style={st.curValue}>{cur.text}</Text>
                <Icon name="trending-up" size={16} color={C.accentGrn} />
              </View>
              <Text style={st.panelCaption}>{cur.caption}</Text>
            </View>
          </View>

          {/* Improvement chip */}
          <View style={st.chipRow}>
            <View style={st.chip}>
              <Icon name="flash" size={14} color={C.accentGrn} />
              <Text style={st.chipTxt}>{main.improvement_pct}% 향상</Text>
            </View>
          </View>

          {/* CTA dismisses — run-result IS the record detail here (approved) */}
          <Pressable onPress={onClose} style={({ pressed }) => [st.primaryBtn, accentShadow(C.accent), { opacity: pressed ? 0.9 : 1 }]}>
            <Text style={st.primaryTxt}>기록 자세히 보기</Text>
          </Pressable>
          {/* Text share via RN Share (debt batch 1) — the button was a
              준비-중 lie; the designed share CARD stays on the design-
              session docket, this is the honest interim. */}
          <Pressable
            onPress={() => Share.share({
              message: `FreshRun 새 기록! ${SUBTITLE[main.type]}\n${cur.text}${cur.caption ? ` ${cur.caption}` : ''} (이전 ${prev.text}, ${main.improvement_pct}% 향상)`,
            }).catch(() => {})}
            style={({ pressed }) => [st.shareBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <Icon name="share-outline" size={17} color={C.sub} />
            <Text style={st.shareTxt}>성과 공유하기</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 18 },
  card:    { backgroundColor: C.surface, borderRadius: 26, paddingTop: 30, paddingBottom: 22, paddingHorizontal: 22, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 12 },

  medalWrap: { alignItems: 'center' },
  medalGlow: { width: 100, height: 100, borderRadius: 50, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },

  title:        { fontSize: 24, fontWeight: '700', letterSpacing: -0.7, color: C.accentGrn, textAlign: 'center', marginTop: 18 },
  subtitle:     { fontSize: 14, lineHeight: 21, color: C.sub, textAlign: 'center', letterSpacing: -0.3, marginTop: 8, marginHorizontal: 14 },
  extraCaption: { fontSize: 12.5, fontWeight: '700', color: C.accentGrn, textAlign: 'center', marginTop: 6 },

  compareRow: { flexDirection: 'row', marginTop: 20, borderWidth: 1, borderColor: C.border, borderRadius: 16, overflow: 'hidden' },
  prevPanel:  { flex: 1, backgroundColor: C.surfaceAlt, paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center' },
  curPanel:   { flex: 1, backgroundColor: C.accentDim, paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center', position: 'relative' },
  panelLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3, color: C.faint, textTransform: 'uppercase' },
  prevValue:  { fontSize: 24, fontWeight: '700', letterSpacing: -0.8, color: C.sub, marginTop: 6, fontVariant: ['tabular-nums'] },
  curValueRow:{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  curValue:   { fontSize: 24, fontWeight: '700', letterSpacing: -0.8, color: C.accentGrn, fontVariant: ['tabular-nums'] },
  panelCaption: { fontSize: 11, color: C.faint, marginTop: 1 },
  bestTag:    { position: 'absolute', top: 8, right: 8, backgroundColor: C.accent, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  bestTagTxt: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4, color: C.accentText },

  chipRow: { alignItems: 'center', marginTop: 14 },
  chip:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accentDim, borderRadius: R.pill, paddingHorizontal: 14, paddingVertical: 7 },
  chipTxt: { fontSize: 13, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  primaryBtn: { height: 52, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  primaryTxt: { fontSize: 16, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  shareBtn:   { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
  shareTxt:   { fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },
});
