/**
 * FeedCard — the feed's edge-to-edge run card (redesign item 7b, 2026-11-21,
 * canvas "피드 퍼스트 홈" Main.dc.html). Header (avatar 34 · name · "10/30 (금)
 * 18:42 · 성수동") · full-bleed media 290 (photo thumb; map when no photo) ·
 * 88 map thumb overlay (photo cards only) · overlapping stats pill (거리 ·
 * 시간 · 페이스) · footer (♥ count · 댓글 N). Stated divergence from the
 * shared RunCard (profiles keep the bordered card): the board draws the
 * feed full-bleed, no card border, no title line.
 *
 * Behavior carried over verbatim: body/media tap → post; avatar → profile;
 * ♥ toggles (hidden when likes are off — count stays); count → likers sheet;
 * 댓글 → post; crew line (show_crew gate); real map only while viewable
 * (mapLive) and only for plausible tracks.
 */
import { RouteMap } from '@/components/route-map';
import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Avatar } from '@/components/avatar';
import { SafeImage } from '@/components/safe-image';
import { Icon } from '@/components/ui';
import type { UserRun } from '@/hooks/use-user-profile';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { tfIn, useLang, useT } from '@/lib/i18n';
import { distUnit, fmtDist, fmtDuration, fmtMonthDayTime, fmtPaceIn } from '@/lib/run-format';
import { spacing as S, type Tokens, DENSE_MAX_FONT_SCALE } from '@/lib/theme';
import { isPlausibleTrack } from '@/lib/track-plausibility';
import { useRunTrack } from '@/lib/track-cache';
import type { useSettings } from '@/store/use-settings';

const MEDIA_H = 290;
const THUMB = 88;
const PILL_OVERLAP = 30;

export function FeedCard({ run, units, mapLive, onKudos, kudosOff, onOpen, onAvatarPress, onCountPress }: {
  run: UserRun & { area?: string | null; photo_thumb?: string | null };
  units: ReturnType<typeof useSettings.getState>['settings']['units'];
  mapLive: boolean;
  onKudos: () => void;
  kudosOff?: boolean;
  onOpen?: () => void;
  onAvatarPress?: () => void;
  onCountPress?: () => void;
}) {
  const T = useT();
  const lang = useLang(); // reactive — formatters stay locale-keyed on flips
  const C = useTokens();
  const st = useStyles(makeSt);
  const { width } = useWindowDimensions();
  const { line: cardLine, pending: linePending } = useRunTrack(run.run_id, run.polyline_thumb); // item ⑩-2: every card — the pool renders ahead
  const plausible = isPlausibleTrack(cardLine ?? run.polyline_thumb, run.distance_km);
  // item ⑩-2: RouteMap = snapshot → SVG curtain → (live only on the viewable
  // card) native map fading in once the track is ready. The 88 overlay is
  // snapshot-or-SVG, never MapKit.
  const mapAt = (h: number, r: number, sq: boolean) => (
    <RouteMap id={run.run_id} polyline={plausible ? run.polyline_thumb : null} line={plausible ? cardLine : null} pending={linePending}
      height={h} width={sq ? h : width} borderRadius={r} live={!sq && plausible} priority={mapLive ? 0 : 1} square={sq} />
  );
  const meta = fmtMonthDayTime(new Date(run.ran_at), lang, { weekday: 'short', monthStyle: 'numeric' }) + (run.area ? ` · ${run.area}` : '');

  return (
    <View>
      <View style={st.head}>
        <Pressable onPress={onAvatarPress} disabled={!onAvatarPress} hitSlop={6}>
          <Avatar name={run.nickname} size={34} photoUrl={run.avatar_url} ring={C.border} initialsRatio={0.38} upper />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.name} numberOfLines={1}>{run.nickname}</Text>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.meta} numberOfLines={1}>{meta}</Text>
          {run.crew_name && run.show_crew !== false ? (
            <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.crew} numberOfLines={1}>{tfIn(lang, 'rc.withCrew', { name: run.crew_name })}</Text>
          ) : null}
        </View>
      </View>

      {/* Media: photo thumb (owner: ship the thumb, sharpness judged on
          device) with the route thumb overlaid; no photo → the map fills
          the slot and the overlay is dropped. Tap → post. */}
      <Pressable onPress={onOpen} disabled={!onOpen} style={({ pressed }) => [st.media, { width }, pressed && !!onOpen && { opacity: 0.92 }]}>
        <SafeImage
          uri={run.photo_thumb}
          style={{ width, height: MEDIA_H }}
          resizeMode="cover"
          fallback={<View style={{ width, height: MEDIA_H }}>{mapAt(MEDIA_H, 0, false)}</View>}
        />
        {run.photo_thumb ? (
          <View pointerEvents="none" style={[st.thumb, { borderColor: C.surface }]}>
            {mapAt(THUMB, 11, true)}
          </View>
        ) : null}
        <View pointerEvents="none" style={[st.pill, { backgroundColor: C.surface }]}>
          {([
            [fmtDist(run.distance_km, units, 2), distUnit(units), T('runSave.statDist')],
            [fmtDuration(run.duration_sec), '', T('res.time')],
            [run.avg_pace_sec_per_km != null ? fmtPaceIn(run.avg_pace_sec_per_km, units) : '--', '', T('res.pace')],
          ] as [string, string, string][]).map(([val, unit, label], i) => (
            <View key={i}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statLbl}>{label}</Text>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.statVal}>{val}{unit ? ` ${unit}` : ''}</Text>
            </View>
          ))}
        </View>
      </Pressable>

      <View style={st.footer}>
        {kudosOff ? (
          <Icon name="heart-outline" size={17} color={C.sub} />
        ) : (
          <Pressable onPress={onKudos} hitSlop={{ top: 13, bottom: 13, left: 13, right: 2 }} style={({ pressed }) => pressed ? { opacity: 0.6 } : null} accessibilityRole="button">
            <Icon name={run.my_kudos ? 'heart' : 'heart-outline'} size={17} color={run.my_kudos ? C.neon : C.text} />
          </Pressable>
        )}
        <Pressable onPress={onCountPress} disabled={!onCountPress} hitSlop={{ top: 8, bottom: 8, left: 0, right: 8 }} style={({ pressed }) => pressed && !!onCountPress ? { opacity: 0.6 } : null}>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.kudos}>{run.kudos_count}</Text>
        </Pressable>
        <Pressable onPress={onOpen} disabled={!onOpen} hitSlop={8} style={({ pressed }) => pressed && !!onOpen ? { opacity: 0.6 } : null}>
          <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.comments}>{tfIn(lang, 'fc.comments', { n: run.comment_count })}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  head:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 20, paddingBottom: 10, paddingHorizontal: S.gutter + 2 },
  name:     { fontSize: 13.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  meta:     { fontSize: 10.5, color: C.sub, letterSpacing: -0.1, marginTop: 1 },
  crew:     { fontSize: 11, fontWeight: '600', color: C.accentGrn, letterSpacing: -0.2, marginTop: 2 },
  media:    { height: MEDIA_H, backgroundColor: C.surfaceAlt, marginBottom: PILL_OVERLAP },
  thumb:    { position: 'absolute', right: 12, bottom: 40, width: THUMB, height: THUMB, borderRadius: 14, borderWidth: 2.5, overflow: 'hidden' },
  pill:     { position: 'absolute', left: 16, right: 16, bottom: -PILL_OVERLAP, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between' },
  statLbl:  { fontSize: 9.5, color: C.sub },
  statVal:  { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  footer:   { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 14, paddingBottom: 4, paddingHorizontal: S.gutter + 2 },
  kudos:    { fontSize: 12.5, fontWeight: '700', color: C.text },
  comments: { fontSize: 12.5, color: C.sub },
});
