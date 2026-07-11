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

import { Icon } from '@/components/ui';
import {
  createAnnouncement,
  getAnnouncement,
  toKstIso,
  updateAnnouncement,
  type AnnouncementInput,
} from '@/lib/announcements-api';
import { colors as C, radius as R, spacing as S } from '@/lib/theme';

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
  const insets = useSafeAreaInsets();
  const { crewId, announcementId } = useLocalSearchParams<{ crewId: string; announcementId?: string }>();
  const editing = !!announcementId;

  const [title, setTitle] = useState('');
  const [body, setBody]   = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [date, setDate]   = useState('');
  const [time, setTime]   = useState('');
  const [place, setPlace] = useState('');
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
        setLoadedForEdit(true);
      })
      .catch(() => {
        Alert.alert('불러오기 실패', '공지를 불러오지 못했어요.');
        router.back();
      });
    return () => { cancelled = true; };
  }, [editing, crewId, announcementId]);

  const runAtIso = scheduled ? toKstIso(date, time) : null;
  const scheduleInvalid = scheduled && (date.trim() !== '' || time.trim() !== '') && runAtIso === null;
  const canSubmit = title.trim().length > 0 && body.trim().length > 0
    && (!scheduled || runAtIso !== null) && !submitting && loadedForEdit;

  async function submit() {
    if (!canSubmit || !crewId) return;
    setSubmitting(true);
    const input: AnnouncementInput = {
      title: title.trim(),
      body: body.trim(),
      run_at: runAtIso,
      place_name: scheduled && place.trim() ? place.trim() : null,
      place_lat: null,
      place_lng: null,
      rsvp_closes_at: null,
    };
    try {
      if (editing) await updateAnnouncement(crewId, announcementId!, input);
      else await createAnnouncement(crewId, input);
      router.back();
    } catch (e: unknown) {
      Alert.alert(editing ? '수정 실패' : '작성 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
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
        <Text style={st.appBarTitle}>{editing ? '공지 수정' : '공지 작성'}</Text>
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={[st.submitBtn, !canSubmit && st.submitBtnDisabled]}
        >
          {submitting
            ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text style={[st.submitTxt, !canSubmit && { color: C.faint }]}>{editing ? '수정' : '게시'}</Text>}
        </Pressable>
      </View>

      {!loadedForEdit ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.gutter, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <TextInput
            value={title}
            onChangeText={t => setTitle(t.slice(0, 100))}
            placeholder="공지 제목"
            placeholderTextColor={C.faint}
            style={st.titleInput}
          />
          <TextInput
            value={body}
            onChangeText={t => setBody(t.slice(0, 1000))}
            placeholder="공지를 적어주세요"
            placeholderTextColor={C.faint}
            style={st.bodyInput}
            multiline
            textAlignVertical="top"
          />

          {/* 러닝 일정 — optional; creates the RSVP poll server-side */}
          <Pressable onPress={() => setScheduled(v => !v)} style={st.scheduleToggle}>
            <Icon name={scheduled ? 'checkbox' : 'square-outline'} size={19} color={scheduled ? C.accentGrn : C.faint} />
            <View style={{ flex: 1 }}>
              <Text style={st.scheduleToggleTxt}>러닝 일정 추가</Text>
              <Text style={st.scheduleToggleSub}>일정을 넣으면 크루원 참석 투표가 열려요</Text>
            </View>
          </Pressable>

          {scheduled && (
            <View style={st.scheduleFields}>
              <View style={st.fieldRow}>
                <Text style={st.fieldLabel}>날짜</Text>
                <TextInput
                  value={date}
                  onChangeText={setDate}
                  placeholder="2026-07-20"
                  placeholderTextColor={C.faint}
                  style={st.fieldInput}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                />
              </View>
              <View style={st.fieldRow}>
                <Text style={st.fieldLabel}>시각</Text>
                <TextInput
                  value={time}
                  onChangeText={setTime}
                  placeholder="20:00"
                  placeholderTextColor={C.faint}
                  style={st.fieldInput}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                />
              </View>
              <View style={st.fieldRow}>
                <Text style={st.fieldLabel}>장소</Text>
                <TextInput
                  value={place}
                  onChangeText={t => setPlace(t.slice(0, 50))}
                  placeholder="서울숲 입구 (선택)"
                  placeholderTextColor={C.faint}
                  style={st.fieldInput}
                />
              </View>
              {scheduleInvalid && (
                <Text style={st.fieldError}>날짜는 2026-07-20, 시각은 20:00 형식으로 입력해 주세요</Text>
              )}
              {runAtIso && (
                <Text style={st.fieldPreview}>한국 시간 기준으로 저장돼요</Text>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
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

  scheduleFields: { gap: 10 },
  fieldRow:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fieldLabel:  { width: 40, fontSize: 13, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  fieldInput:  { flex: 1, height: 44, borderRadius: R.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt, paddingHorizontal: 12, fontSize: 14.5, color: C.text },
  fieldError:  { fontSize: 12, color: C.danger, letterSpacing: -0.2, paddingLeft: 52 },
  fieldPreview:{ fontSize: 12, color: C.faint, letterSpacing: -0.2, paddingLeft: 52 },
});
