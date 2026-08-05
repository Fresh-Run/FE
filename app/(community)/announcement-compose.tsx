/**
 * 크루 공지 작성/수정 (M1) — title + body, optional 러닝 일정 (date/time
 * fields + place name; ⚠️ serialized as KST-offset ISO — naive datetimes
 * are a server 422, probed). Edit mode when announcementId param present
 * (prefills from a fetch). owner||admin only — the entry points gate;
 * the server enforces regardless (403).
 *
 * Datetime entry is structured text (YYYY-MM-DD / HH:mm) — a native picker
 * means a new dependency (@react-native-community/datetimepicker), deferred
 * until the surface earns it (parity note).
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlacePickSheet } from '@/components/place-pick-sheet';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { DateWheelRow, TimeWheelRow } from '@/components/wheel-sheet';
import {
  createAnnouncement,
  getAnnouncement,
  toKstIso,
  updateAnnouncement,
  type AnnouncementInput,
} from '@/lib/announcements-api';
import { errorMessage } from '@/lib/error-copy';
import { radius as R, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { t, useT } from '@/lib/i18n';

function partsFromIso(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

export default function AnnouncementComposeScreen() {
  const T = useT();
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { crewId, announcementId } = useLocalSearchParams<{ crewId: string; announcementId?: string }>();
  const editing = !!announcementId;

  const [title, setTitle] = useState('');
  const [body, setBody]   = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [date, setDate]   = useState('');
  const [time, setTime]   = useState('');
  const [place, setPlace] = useState('');
  // 집결 좌표 (#6 map-pick): picked pin rides POST/PATCH as place_lat/lng;
  // the NAME stays hand-editable (the human label; the pin is the location).
  // Geocode-era 공지 (name-only) open with no pin until picked.
  const [placeCoords, setPlaceCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadedForEdit, setLoadedForEdit] = useState(!editing);
  const [submitting, setSubmitting] = useState(false);

  // Edit mode — prefill from the server copy
  useEffect(() => {
    if (!editing || !crewId || !announcementId) return;
    let cancelled = false;
    getAnnouncement(crewId, announcementId)
      .then(a => {
        if (cancelled) return;
        setTitle(a.title);
        setBody(a.body);
        if (a.run_at) {
          const p = partsFromIso(a.run_at);
          setScheduled(true);
          setDate(p.date);
          setTime(p.time);
        }
        setPlace(a.place_name ?? '');
        if (a.place_lat != null && a.place_lng != null) {
          setPlaceCoords({ lat: a.place_lat, lng: a.place_lng }); // edit prefill
        }
        setLoadedForEdit(true);
      })
      .catch(() => {
        Alert.alert(t('annc.loadFailT'), t('annc.loadFailB'));
        router.back();
      });
    return () => { cancelled = true; };
  }, [editing, crewId, announcementId]);

  // 러닝 일정 toggle-on seeds BOTH wheels valid (date = today, time = the
  // canvas 오전 6:30 default) — invalid schedules are inexpressible by
  // construction, so the typed-era validator + its error DIED. (The old
  // "날짜는 2026-07-20 형식으로" message was a Wave B regression in
  // attribution: an untouched 시각 wheel nulled runAtIso and the copy
  // blamed the date.)
  function toggleScheduled(v: boolean) {
    setScheduled(v);
    if (v) {
      if (!date.trim()) {
        const n = new Date();
        setDate(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`);
      }
      if (!time.trim()) setTime('06:30');
    }
  }

  const runAtIso = scheduled ? toKstIso(date, time) : null;
  const canSubmit = title.trim().length > 0 && body.trim().length > 0
    && (!scheduled || runAtIso !== null) && !submitting && loadedForEdit;

  async function submit() {
    if (!canSubmit || !crewId) return;
    setSubmitting(true);
    const input: AnnouncementInput = {
      title: title.trim(),
      body: body.trim(),
      run_at: runAtIso,
      // 2026-07-14 regression fix: the pin used to be GATED ON THE NAME
      // (`place.trim()`) — a picked pin with the text left empty was silently
      // discarded (the owner's exact on-device flow). Name and pin are now
      // independent; either rides alone.
      place_name: scheduled && place.trim() ? place.trim() : null,
      place_lat: scheduled && placeCoords ? placeCoords.lat : null,
      place_lng: scheduled && placeCoords ? placeCoords.lng : null,
      rsvp_closes_at: null,
    };
    try {
      if (editing) await updateAnnouncement(crewId, announcementId!, input);
      else await createAnnouncement(crewId, input);
      router.back();
    } catch (e: unknown) {
      Alert.alert(editing ? t('annc.editFail') : t('annc.postFail'), errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[st.appBar, { marginTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="close" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{editing ? t('annc.editTitle') : t('annc.newTitle')}</Text>
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={[st.submitBtn, !canSubmit && st.submitBtnDisabled]}
        >
          {submitting
            ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text style={[st.submitTxt, !canSubmit && { color: C.faint }]}>{editing ? t('annc.edit') : t('annc.post')}</Text>}
        </Pressable>
      </View>

      {!loadedForEdit ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <TextInput
            value={title}
            onChangeText={t => setTitle(t.slice(0, 100))}
            placeholder={t('annc.titlePh')}
            placeholderTextColor={C.faint}
            style={st.titleInput}
          />
          <TextInput
            value={body}
            onChangeText={t => setBody(t.slice(0, 1000))}
            placeholder={t('annc.bodyPh')}
            placeholderTextColor={C.faint}
            style={st.bodyInput}
            multiline
            textAlignVertical="top"
          />

          {/* 러닝 일정 — optional; creates the RSVP poll server-side */}
          <Pressable onPress={() => toggleScheduled(!scheduled)} style={st.scheduleToggle}>
            <Icon name={scheduled ? 'checkbox' : 'square-outline'} size={19} color={scheduled ? C.accentGrn : C.faint} />
            <View style={{ flex: 1 }}>
              <Text style={st.scheduleToggleTxt}>{t('annc.schedToggle')}</Text>
              <Text style={st.scheduleToggleSub}>{t('annc.schedSub')}</Text>
            </View>
          </Pressable>
          {/* 세션-콜랩스 넛지 (그녀 8/5 계약의 UX 라이더): 공지-기반 스타트가
              대형 크루 동일-일의 클린 스플릿 — 크루장을 공지 시작으로 유도.
              일정 토글 직하 배치 (결정의 순간). ko 하드코드 — census note. */}
          {scheduled && (
            <View style={st.sessionNudge}>
              <Icon name="people-outline" size={12} color={C.accentGrn} />
              <Text style={st.sessionNudgeTxt}>{T('annc.sessionNudge')}</Text>
            </View>
          )}

          {scheduled && (
            <View style={st.scheduleFields}>
              <DateWheelRow label={t('annc.date')} value={date} onChange={setDate} />
              <TimeWheelRow label={t('annc.time')} value={time} onChange={setTime} />
              <View style={st.fieldRow}>
                <Text style={st.fieldLabel}>{t('annc.place')}</Text>
                <TextInput
                  value={place}
                  onChangeText={t => setPlace(t.slice(0, 50))}
                  placeholder={t('annc.placePh')}
                  placeholderTextColor={C.faint}
                  style={st.fieldInput}
                />
                <Pressable onPress={() => setPickerOpen(true)} hitSlop={8} style={st.pinBtn}>
                  <Icon name={placeCoords ? 'location' : 'location-outline'} size={17} color={placeCoords ? C.danger : C.sub} />
                </Pressable>
              </View>
              {placeCoords && (
                <View style={st.pinPreviewWrap}>
                  {/* key= remounts on re-pick — RealMap uses initialRegion,
                      which ignores prop updates (the stale-preview bug) */}
                  <RealMap key={`${placeCoords.lat},${placeCoords.lng}`} height={110} center={placeCoords} marker borderRadius={12} />
                  <View style={st.pinPreviewRow}>
                    <Text style={st.pinPreviewTxt}>{t('annc.pinPreview')}</Text>
                    <Pressable onPress={() => setPlaceCoords(null)} hitSlop={8}>
                      <Text style={st.pinRemoveTxt}>{t('annc.pinRemove')}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              {runAtIso && (
                <Text style={st.fieldPreview}>{t('annc.kst')}</Text>
              )}
            </View>
          )}
        </ScrollView>
      )}

      <PlacePickSheet
        visible={pickerOpen}
        initial={placeCoords}
        onClose={() => setPickerOpen(false)}
        onPick={coords => { setPlaceCoords(coords); setPickerOpen(false); }}
      />
    </KeyboardAvoidingView>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10, gap: 8 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  submitBtn:         { height: 34, paddingHorizontal: 16, borderRadius: R.pill, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  submitTxt:         { fontSize: 13.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  titleInput: { fontSize: 20, fontWeight: '700', color: C.text, letterSpacing: -0.5, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  bodyInput:  { minHeight: 120, fontSize: 14.5, color: C.text, letterSpacing: -0.2, lineHeight: 22, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },

  scheduleToggle:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
  scheduleToggleTxt: { fontSize: 14.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  scheduleToggleSub: { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  sessionNudge:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 2 },
  sessionNudgeTxt: { flex: 1, fontSize: 11.5, color: C.sub, letterSpacing: -0.2, lineHeight: 15 },

  scheduleFields: { gap: 10 },
  fieldRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fieldLabel:  { width: 40, fontSize: 13, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  fieldInput:  { flex: 1, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, paddingHorizontal: 12, fontSize: 14.5, color: C.text },
  pinBtn:         { width: 40, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt },
  pinPreviewWrap: { borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 10 },
  pinPreviewRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.surface },
  pinPreviewTxt:  { fontSize: 11.5, color: C.faint, letterSpacing: -0.2 },
  pinRemoveTxt:   { fontSize: 11.5, fontWeight: '700', color: C.danger, letterSpacing: -0.2 },
  fieldError:  { fontSize: 12, color: C.danger, letterSpacing: -0.2, paddingLeft: 52 },
  fieldPreview:{ fontSize: 12, color: C.faint, letterSpacing: -0.2, paddingLeft: 52 },
});
