/**
 * 크루 공지 상세 (M1, +design-wave A meeting-point map) — body + 러닝 일정
 * card + RSVP 3-state poll (server contract: going/not_going/maybe, re-vote
 * overwrites; canvas's 2-option poll adapted per the approved decision) +
 * going_members roster. 수정/삭제 = owner||admin — role computed HERE from
 * the members list (server truth) so the notification deep-link path gets
 * full function without param threading.
 *
 * Meeting-point map: server coords win (place_lat/lng — composer sends
 * none yet, map-pick is its own slice); otherwise the place STRING geocodes
 * best-effort via the Apple path (the ⓑ precedent). Geocode failure →
 * text-only rows, honestly. "지도 앱에서 보기" opens the OS maps app.
 */
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import {
  deleteAnnouncement,
  getAnnouncement,
  rsvpAnnouncement,
  type AnnouncementDetail,
  type RsvpStatus,
} from '@/lib/announcements-api';
import { getCrewMembers } from '@/lib/crews-api';
import { fmtWhen , fmtMonthDayTime } from '@/lib/run-format';
import { supabase } from '@/lib/supabase';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { getLang, t, useLang, tfIn } from '@/lib/i18n';

const RSVP_OPTS: { value: RsvpStatus; label: string }[] = [
  { value: 'going',     label: 'annd.going' },
  { value: 'maybe',     label: 'annd.maybe' },
  { value: 'not_going', label: 'annd.notGoing' },
];

// 8/6 consolidation: delegated to lib/run-format's fmtMonthDayTime (short-
// weekday shape preserved: `Mon D (일) HH:mm` / `M월 D일 (일) HH:mm`).
function fmtRunAt(iso: string): string {
  return fmtMonthDayTime(new Date(iso), getLang(), { weekday: 'short' });
}

export default function AnnouncementDetailScreen() {
  const C = useTokens();
  const lang = useLang(); // compiler-visible locale for the date/title formatters (2026-08-03 formatter-cache fix)
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { crewId, announcementId } = useLocalSearchParams<{ crewId: string; announcementId: string }>();

  const [ann, setAnn]         = useState<AnnouncementDetail | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [voting, setVoting]   = useState(false);
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lng: number } | null>(null);

  const load = useCallback(() => {
    if (!crewId || !announcementId) return;
    getAnnouncement(crewId, announcementId)
      .then(setAnn)
      .catch(() => setError(t('annd.loadFail')));
  }, [crewId, announcementId]);
  useEffect(() => { load(); }, [load]);

  // 집결 장소 geocode — only when the server serves no coords. Free-string
  // geocoding can miss or mislocate; failure/empty → geoCoords stays null
  // and the card renders text-only (never a wrong-looking guess... the
  // geocoder's best hit is still a best guess — the lat/lng upgrade rides
  // the composer map-pick slice).
  useEffect(() => {
    if (!ann?.place_name || (ann.place_lat != null && ann.place_lng != null)) return;
    let cancelled = false;
    Location.geocodeAsync(ann.place_name)
      .then(rs => {
        if (!cancelled && rs[0]) setGeoCoords({ lat: rs[0].latitude, lng: rs[0].longitude });
      })
      .catch(() => { /* offline/unknown place — text-only card */ });
    return () => { cancelled = true; };
  }, [ann?.place_name, ann?.place_lat, ann?.place_lng]);

  // server coords win over the geocoder's guess
  const meetCoords = ann?.place_lat != null && ann?.place_lng != null
    ? { lat: ann.place_lat, lng: ann.place_lng }
    : geoCoords;

  function openInMaps() {
    if (!meetCoords) return;
    const q = encodeURIComponent(ann?.place_name ?? t('meet.name'));
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${meetCoords.lat},${meetCoords.lng}&q=${q}`
      : `geo:${meetCoords.lat},${meetCoords.lng}?q=${meetCoords.lat},${meetCoords.lng}(${q})`;
    Linking.openURL(url).catch(() => { /* no maps handler — silently keep the in-app map */ });
  }

  // Role from server truth — enables 수정/삭제 on the deep-link path too.
  // Focus-retry (debt batch 1): a transient failure here silently stripped
  // the owner's 수정/삭제 for the visit — refocus now re-derives the role.
  useFocusEffect(useCallback(() => {
    if (!crewId) return;
    let cancelled = false;
    (async () => {
      const [{ data: { user } }, members] = await Promise.all([
        supabase.auth.getUser(),
        getCrewMembers(crewId),
      ]);
      if (cancelled) return;
      // v2 (guide §207): 공지 CRUD keys off the announcements permission
      // (owner arrives all-true synthesized), not the role pair.
      setCanManage(!!members.find(m => m.user_id === user?.id)?.permissions?.announcements);
    })().catch(() => { /* refocus retries; buttons appear then */ });
    return () => { cancelled = true; };
  }, [crewId]));

  async function vote(status: RsvpStatus) {
    if (!ann || voting || !ann.rsvp_open) return;
    setVoting(true);
    try {
      await rsvpAnnouncement(crewId!, ann.id, status);
      load(); // counts + roster need server truth after an overwrite vote
    } catch {
      Alert.alert(t('annd.voteFailT'), t('annd.voteFailB'));
    } finally {
      setVoting(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('annd.delAsk'), t('annd.delSub'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: () => deleteAnnouncement(crewId!, announcementId!)
          .then(() => router.back())
          .catch(() => Alert.alert(t('annd.delFailT'), t('auth.tryLater'))),
      },
    ]);
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.iconBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{t('annd.title')}</Text>
        {canManage && ann ? (
          <View style={{ flexDirection: 'row' }}>
            <Pressable
              onPress={() => router.push({
                pathname: '/(community)/announcement-compose' as never,
                params: { crewId: crewId!, announcementId: ann.id },
              })}
              hitSlop={6}
              style={st.iconBtn}
            >
              <Icon name="create-outline" size={19} color={C.text} />
            </Pressable>
            <Pressable onPress={confirmDelete} hitSlop={6} style={st.iconBtn}>
              <Icon name="trash-outline" size={18} color={C.danger} />
            </Pressable>
          </View>
        ) : <View style={{ width: 36 }} />}
      </View>

      {error ? (
        <Text style={st.stateTxt}>{error}</Text>
      ) : !ann ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }}>
          <Text style={st.title}>{ann.title}</Text>
          <View style={st.metaRow}>
            <Avatar name={ann.author_nickname ?? t('ann.leaderFallback')} photoUrl={ann.author_avatar_url} size={20} initialsRatio={0.5} />
            <Text style={st.meta}>{ann.author_nickname ?? t('ann.leaderFallback')} · {fmtWhen(ann.created_at, lang)}</Text>
          </View>
          <Text style={st.body}>{ann.body}</Text>

          {/* 러닝 일정 — only when scheduled */}
          {ann.run_at ? (
            <View style={[st.scheduleCard, shadows.sm]}>
              <View style={st.scheduleRow}>
                <Icon name="calendar-outline" size={15} color={C.accentGrn} />
                <Text style={st.scheduleTxt}>{fmtRunAt(ann.run_at)}</Text>
              </View>
              {ann.place_name && !meetCoords ? (
                // honest fallback — geocode missed (or is still in flight)
                <View style={st.scheduleRow}>
                  <Icon name="location-outline" size={15} color={C.accentGrn} />
                  <Text style={st.scheduleTxt}>{ann.place_name}</Text>
                </View>
              ) : null}
              {meetCoords ? (
                // 집결 장소 card — renders whenever the 공지 carries coords
                // (2026-07-14 regression fix: the old `place_name &&` gate hid
                // pin-only 공지). Row tap → full in-app map (the convention);
                // 지도 앱에서 보기 stays as the inline external choice.
                <View style={st.meetCard}>
                  <RealMap height={150} center={meetCoords} marker borderRadius={0} />
                  <Pressable
                    onPress={() => router.push({
                      pathname: '/(community)/meet-map' as never,
                      params: { name: ann.place_name ?? '', lat: String(meetCoords.lat), lng: String(meetCoords.lng) },
                    })}
                    style={({ pressed }) => [st.meetRow, pressed && { opacity: 0.7 }]}
                  >
                    <View style={st.meetPin}><Icon name="location" size={17} color={C.danger} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.meetName} numberOfLines={1}>{ann.place_name ?? t('meet.name')}</Text>
                      {ann.run_at != null && (
                        <Text style={st.meetSub} numberOfLines={1}>{tfIn(lang, 'annd.meetAt', { when: fmtRunAt(ann.run_at) })}</Text>
                      )}
                    </View>
                    <Pressable onPress={openInMaps} hitSlop={10}>
                      <Text style={st.meetOpenTxt}>{t('meet.openMaps')}</Text>
                    </Pressable>
                  </Pressable>
                </View>
              ) : null}

              {/* RSVP — 3-state, re-vote overwrites */}
              <View style={st.rsvpRow}>
                {RSVP_OPTS.map(o => {
                  const mine = ann.my_rsvp === o.value;
                  const count = ann.rsvp[o.value];
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => vote(o.value)}
                      disabled={voting || !ann.rsvp_open}
                      style={({ pressed }) => [
                        st.rsvpBtn,
                        mine && st.rsvpBtnMine,
                        !ann.rsvp_open && { opacity: 0.55 },
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Text style={[st.rsvpLabel, mine && { color: C.accentGrn }]}>{t(o.label as import('@/lib/i18n').StringKey)}</Text>
                      <Text style={[st.rsvpCount, mine && { color: C.accentGrn }]}>{count}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {!ann.rsvp_open && <Text style={st.closedTxt}>{t('annd.voteClosed')}</Text>}

              {/* 참석 roster */}
              {ann.going_members.length > 0 && (
                <View style={st.rosterWrap}>
                  <Text style={st.rosterHead}>{tfIn(lang, 'annd.goingN', { n: ann.going_members.length })}</Text>
                  <View style={st.rosterRow}>
                    {ann.going_members.map(m => {
                      const name = m.nickname ?? t('home.runner');
                      return (
                        <View key={m.user_id} style={st.rosterChip}>
                          {/* payload carries no avatar_url — initials-only (payload truth) */}
                          <Avatar name={name} size={22} initialsRatio={0.45} />
                          <Text style={st.rosterName} numberOfLines={1}>{name}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  iconBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  centered: { paddingTop: 70, alignItems: 'center' },
  stateTxt: { textAlign: 'center', paddingTop: 60, fontSize: 14, color: C.faint },

  title: { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  meta:  { fontSize: 12, color: C.faint, letterSpacing: -0.2 },
  body:  { fontSize: 14.5, color: C.sub, letterSpacing: -0.2, lineHeight: 22, marginTop: 14 },

  scheduleCard: { marginTop: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, padding: 14, gap: 10 },
  scheduleRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scheduleTxt:  { fontSize: 14, fontWeight: '600', color: C.text, letterSpacing: -0.3 },

  // 집결 장소 card (design-wave A — canvas light map + info row)
  meetCard:    { borderRadius: R.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden', backgroundColor: C.surface },
  meetRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 15 },
  meetPin:     { width: 36, height: 36, borderRadius: 11, backgroundColor: C.danger + '1A', alignItems: 'center', justifyContent: 'center' },
  meetName:    { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  meetSub:     { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  meetOpenTxt: { fontSize: 12.5, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  rsvpRow:     { flexDirection: 'row', gap: 8, marginTop: 4 },
  rsvpBtn:     { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: R.md, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceAlt },
  rsvpBtnMine: { borderColor: C.accent, backgroundColor: C.accentDim },
  rsvpLabel:   { fontSize: 13.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },
  rsvpCount:   { fontSize: 12, fontWeight: '600', color: C.faint, marginTop: 2 },
  closedTxt:   { fontSize: 11.5, color: C.faint, letterSpacing: -0.2, textAlign: 'center' },

  rosterWrap: { marginTop: 4 },
  rosterHead: { fontSize: 12.5, fontWeight: '700', color: C.text, letterSpacing: -0.2, marginBottom: 8 },
  rosterRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rosterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surfaceAlt, borderRadius: R.pill, paddingVertical: 4, paddingLeft: 4, paddingRight: 10, maxWidth: 140 },
  rosterName:      { fontSize: 12, fontWeight: '600', color: C.sub, letterSpacing: -0.2, flexShrink: 1 },
});
