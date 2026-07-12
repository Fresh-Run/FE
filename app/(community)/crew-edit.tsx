/**
 * 크루 편집 — canvas FrCrewEdit (crew-create.jsx): the create form pre-filled,
 * PATCH on save, plus the owner-only 위험 구역 danger card → 크루 삭제 confirm
 * modal (canvas FrCrewDelete, centered, run-save modal precedent).
 *
 * Contract (probed 2026-07-15): PATCH/DELETE owner-only (non-owner 403 ×2).
 * DELETE cascades WITH members — no empty-first/transfer-first requirement:
 * memberships·공지·RSVP die with the crew (BE delete_crew docstring; crew-
 * targeted notifications cleaned, M10), members' RUNS survive (runs
 * reference users). The dialog copy states exactly that. Form primitives,
 * constants, and styles are shared imports from crew-create (no duplication).
 */
import Slider from '@react-native-community/slider';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { NumberWheelRow } from '@/components/wheel-sheet';
import {
  deleteCrew,
  getCrew,
  mapCrew,
  updateCrew,
  type Crew,
  type CrewLevel,
} from '@/lib/crews-api';
import { accentShadow, colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

import {
  Chip,
  CREW_COLORS,
  DAYS,
  FieldRow,
  Group,
  LEVELS,
  PRIVACY_OPTIONS,
  privacyToFields,
  SelectRow,
  SPORTS,
  st,
  type Privacy,
} from './crew-create';

/** Inverse of privacyToFields — seed the 3-way selector from server fields. */
function fieldsToPrivacy(isPublic: boolean, joinPolicy: 'open' | 'approval'): Privacy {
  if (!isPublic) return '비공개';
  if (joinPolicy === 'approval') return '승인제';
  return '공개';
}

export default function CrewEditScreen() {
  const insets = useSafeAreaInsets();
  const { crewId } = useLocalSearchParams<{ crewId: string }>();

  const [crew, setCrew] = useState<Crew | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [name, setName]       = useState('');
  const [desc, setDesc]       = useState('');
  const [color, setColor]     = useState(CREW_COLORS[0]);
  const [area, setArea]       = useState('');
  const [radiusKm, setRadiusKm] = useState(3);
  const [sport, setSport]     = useState<string>('러닝');
  const [level, setLevel]     = useState<CrewLevel>('무관');
  const [maxMembers, setMaxMembers] = useState(30);
  const [privacy, setPrivacy] = useState<Privacy>('공개');
  const [days, setDays]       = useState<string[]>([]);
  const [time, setTime]       = useState('');

  const [busy, setBusy]           = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting]     = useState(false);

  // Pre-fill from server truth (edit must not seed from a stale list row)
  useEffect(() => {
    if (!crewId) return;
    let cancelled = false;
    getCrew(crewId)
      .then(row => {
        if (cancelled) return;
        const c = mapCrew(row, 'owner'); // getCrew returns the raw ServerCrew
        setCrew(c);
        setName(c.name);
        setDesc(c.description ?? '');
        setColor(c.color ?? CREW_COLORS[0]);
        setArea(c.area ?? '');
        setRadiusKm(c.radius_km ?? 3);
        setSport(c.sport ?? '러닝');
        setLevel(c.level ?? '무관');
        setMaxMembers(c.max_members ?? 30);
        setPrivacy(fieldsToPrivacy(c.is_public, c.join_policy));
        setDays(c.active_days ?? []);
        setTime(c.active_time ?? '');
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [crewId]);

  const valid = name.trim().length >= 2;
  const toggleDay = (d: string) =>
    setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));

  async function save() {
    if (!valid || busy || !crewId) return;
    setBusy(true);
    try {
      await updateCrew(crewId, {
        name: name.trim(),
        description: desc.trim() || null,
        area: area.trim() || null,
        radius_km: radiusKm,
        sport,
        level,
        max_members: maxMembers,
        ...privacyToFields(privacy),
        active_days: days,
        active_time: time.trim() || null,
        color,
      });
      router.back(); // crew-detail refetches on focus
    } catch (e: unknown) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (deleting || !crewId) return;
    setDeleting(true);
    try {
      await deleteCrew(crewId);
      setDeleteOpen(false);
      // The crew (and this stack's screens for it) no longer exist
      router.dismissAll?.();
      router.replace('/(tabs)/community' as any);
    } catch (e: unknown) {
      setDeleting(false);
      Alert.alert('삭제 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
    }
  }

  if (loadError) {
    return (
      <View style={[est.rootPlain, { paddingTop: insets.top }]}>
        <View style={est.centered}>
          <Icon name="warning-outline" size={34} color={C.faint} />
          <Text style={est.stateTxt}>크루를 불러올 수 없어요</Text>
        </View>
      </View>
    );
  }
  if (!crew) {
    return (
      <View style={[est.rootPlain, { paddingTop: insets.top }]}>
        <View style={est.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      </View>
    );
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>크루 편집</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        {/* Identity preview */}
        <View style={st.previewWrap}>
          <View style={[st.previewTile, { backgroundColor: color, shadowColor: color }]}>
            <Icon name="people" size={34} color="#0D1A06" />
          </View>
          <Text style={[st.previewName, { color: name.trim() ? C.text : C.faint }]}>
            {name.trim() || '크루 이름'}
          </Text>
        </View>

        <Group title="기본 정보">
          <FieldRow label="크루 이름" value={name} onChange={setName} placeholder="예: 성수 새벽 크루" maxLength={20} />
          <View style={st.divider} />
          <FieldRow label="한 줄 소개" value={desc} onChange={setDesc} placeholder="크루를 한 문장으로 소개해요" maxLength={40} />
        </Group>

        <View style={{ paddingHorizontal: S.gutter }}>
          <Text style={st.groupTitle}>크루 컬러</Text>
          <View style={[st.groupCard, shadows.sm, st.colorRow]}>
            {CREW_COLORS.map(col => (
              <Pressable
                key={col}
                onPress={() => setColor(col)}
                style={[st.colorDot, { backgroundColor: col }, color === col && st.colorDotOn]}
              />
            ))}
          </View>
        </View>

        <Group title="활동 지역" hint="대표 출발지를 중심으로 활동 반경 안의 러너에게 크루가 추천돼요.">
          <View style={st.fieldRow}>
            <View style={st.areaIcon}><Icon name="location" size={18} color={C.accentGrn} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.areaLabel}>대표 출발지</Text>
              <TextInput
                value={area}
                onChangeText={setArea}
                placeholder="예: 성수동 서울숲"
                placeholderTextColor={C.faint}
                style={[st.fieldInput, { paddingVertical: 4 }]}
              />
            </View>
          </View>
          <View style={st.divider} />
          <View style={st.sliderBlock}>
            <View style={st.sliderHead}>
              <Text style={st.fieldLabel}>활동 반경</Text>
              <Text style={st.sliderValue}>{radiusKm} km</Text>
            </View>
            <Slider
              minimumValue={1}
              maximumValue={20}
              step={1}
              value={radiusKm}
              onValueChange={setRadiusKm}
              minimumTrackTintColor={C.accent}
              maximumTrackTintColor={C.border}
              thumbTintColor={C.accent}
            />
          </View>
        </Group>

        <View style={{ paddingHorizontal: S.gutter }}>
          <Text style={st.groupTitle}>주 종목</Text>
          <View style={st.chipRow}>
            {SPORTS.map(s => <Chip key={s} label={s} on={sport === s} onPress={() => setSport(s)} />)}
          </View>
          <Text style={st.groupTitle}>페이스 레벨</Text>
          <View style={st.chipRow}>
            {LEVELS.map(l => <Chip key={l} label={l} on={level === l} onPress={() => setLevel(l)} />)}
          </View>
        </View>

        <Group title="모집">
          <NumberWheelRow label="최대 인원" value={maxMembers} min={5} max={100} step={1} suffix="명" onChange={setMaxMembers} />
        </Group>

        <View style={{ paddingHorizontal: S.gutter }}>
          <Text style={st.groupTitle}>공개 범위</Text>
          <View style={[st.groupCard, shadows.sm]}>
            {PRIVACY_OPTIONS.map(([lbl, sub], i) => (
              <React.Fragment key={lbl}>
                {i > 0 && <View style={st.divider} />}
                <SelectRow label={lbl} sub={sub} selected={privacy === lbl} onSelect={() => setPrivacy(lbl)} />
              </React.Fragment>
            ))}
          </View>
        </View>

        <Group title="정기 러닝">
          <View style={st.daysRow}>
            {DAYS.map(d => {
              const on = days.includes(d);
              return (
                <Pressable key={d} onPress={() => toggleDay(d)} style={[st.dayCircle, on && st.dayCircleOn]}>
                  <Text style={[st.dayTxt, on && { color: C.accentText }]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={st.divider} />
          <FieldRow label="시간" value={time} onChange={setTime} placeholder="예: 오전 6:30" maxLength={20} />
        </Group>

        {/* ── 위험 구역 (canvas danger zone) ── */}
        <View style={{ paddingHorizontal: S.gutter, paddingTop: 24 }}>
          <Text style={est.dangerTitle}>위험 구역</Text>
          <Pressable onPress={() => setDeleteOpen(true)} style={({ pressed }) => [est.dangerCard, pressed && { opacity: 0.8 }]}>
            <View style={est.dangerIcon}>
              <Icon name="trash-outline" size={18} color={C.danger} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={est.dangerLbl}>크루 삭제</Text>
              <Text style={est.dangerSub}>크루와 공지·챌린지가 사라져요</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* Sticky save CTA */}
      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <Pressable
          onPress={save}
          disabled={!valid || busy}
          style={[st.createBtn, valid ? accentShadow(C.accent) : st.createBtnOff]}
        >
          {busy
            ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text style={[st.createTxt, !valid && { color: C.faint }]}>변경사항 저장</Text>}
        </Pressable>
      </View>

      {/* 크루 삭제 confirm — canvas FrCrewDelete (centered modal); copy states
          the PROBED consequences: cascade with members, runs survive. */}
      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteOpen(false)}>
        <View style={est.modalRoot}>
          <Pressable style={est.modalBackdrop} onPress={() => !deleting && setDeleteOpen(false)} />
          <View style={est.modalCard}>
            <View style={est.modalIconWrap}>
              <Icon name="trash-outline" size={26} color={C.danger} />
            </View>
            <Text style={est.modalTitle}>크루를 삭제할까요?</Text>
            <Text style={est.modalBody}>
              <Text style={{ fontWeight: '700', color: C.text }}>{crew.name}</Text>
              {' 크루가 크루원 '}{crew.member_count}{'명과 함께 즉시 삭제되고, 공지·챌린지·참석 기록도 사라져요. 크루원들의 러닝 기록은 남아요. 되돌릴 수 없어요.'}
            </Text>
            <Pressable onPress={doDelete} disabled={deleting} style={est.modalDeleteBtn}>
              {deleting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={est.modalDeleteTxt}>삭제하기</Text>}
            </Pressable>
            <Pressable onPress={() => !deleting && setDeleteOpen(false)} style={est.modalCancelBtn}>
              <Text style={est.modalCancelTxt}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Edit-only styles (form styles come from crew-create's shared st)
const est = StyleSheet.create({
  rootPlain: { flex: 1, backgroundColor: C.bg },
  centered:  { paddingTop: 80, alignItems: 'center', gap: 12 },
  stateTxt:  { fontSize: 14, color: C.sub, letterSpacing: -0.2 },

  dangerTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.danger, textTransform: 'uppercase', paddingHorizontal: 4, paddingBottom: 8, paddingTop: 0 },
  dangerCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.danger + '44', borderRadius: 16, padding: 14 },
  dangerIcon:  { width: 36, height: 36, borderRadius: 11, backgroundColor: C.danger + '1A', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dangerLbl:   { fontSize: 14.5, fontWeight: '700', color: C.danger, letterSpacing: -0.3 },
  dangerSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  modalRoot:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard:     { width: '100%', backgroundColor: C.surface, borderRadius: 22, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18 },
  modalIconWrap: { alignSelf: 'center', width: 54, height: 54, borderRadius: R.pill, backgroundColor: C.danger + '1A', alignItems: 'center', justifyContent: 'center' },
  modalTitle:    { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.5, textAlign: 'center', marginTop: 16 },
  modalBody:     { fontSize: 13.5, lineHeight: 20, color: C.sub, textAlign: 'center', letterSpacing: -0.3, marginTop: 8, marginHorizontal: 8 },
  modalDeleteBtn: { height: 52, borderRadius: 14, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  modalDeleteTxt: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  modalCancelBtn: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  modalCancelTxt: { fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },
});
