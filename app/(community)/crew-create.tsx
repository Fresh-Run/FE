/**
 * 크루 생성 — create-crew form + success modal (bundle: FrCrewCreate +
 * FrCrewCreated). Pushed from the community tab's 크루 생성 button (the
 * free-tier 1-crew gate lives at that button; the server enforces 403
 * premium_required regardless — shown verbatim).
 *
 * Approved deviations: 출발지 = editable text defaulting to the current
 * placeName; 첫 챌린지 block deferred (own item, paired with challenge
 * display); success 초대하기 → 준비 중 (owner-invite UI is its own item).
 */
import Slider from '@react-native-community/slider';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { NumberWheelRow } from '@/components/wheel-sheet';
import { createCrew, issueInviteCode, type Crew, type CrewLevel } from '@/lib/crews-api';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { accentShadow, colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';

export const CREW_COLORS = ['#74E827', '#2F8FE8', '#E8703D', '#A24DE8', '#E8B53D'];
export const SPORTS = ['러닝', '라이딩', '워킹'] as const;
export const LEVELS: CrewLevel[] = ['입문', '중급', '고급', '무관'];
export const DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export type Privacy = '공개' | '승인제' | '비공개';
export const PRIVACY_OPTIONS: [Privacy, string][] = [
  ['공개',   '누구나 바로 가입할 수 있어요'],
  ['승인제', '크루장이 가입 요청을 확인해요'],
  ['비공개', '초대 링크로만 가입 가능해요'],
];

/** 공개 범위 → backend fields (비공개 rejects direct joins server-side;
    invite-code join bypasses policy). */
export function privacyToFields(p: Privacy): { is_public: boolean; join_policy: 'open' | 'approval' } {
  if (p === '승인제') return { is_public: true, join_policy: 'approval' };
  if (p === '비공개') return { is_public: false, join_policy: 'open' };
  return { is_public: true, join_policy: 'open' };
}

// ─── Local form primitives (screen-local per app pattern) ─────────────────────

export function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: S.gutter }}>
      <Text style={st.groupTitle}>{title}</Text>
      {hint ? <Text style={st.groupHint}>{hint}</Text> : null}
      <View style={[st.groupCard, shadows.sm]}>{children}</View>
    </View>
  );
}

export function FieldRow({ label, value, onChange, placeholder, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number;
}) {
  return (
    <View style={st.fieldRow}>
      <Text style={st.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.faint}
        maxLength={maxLength}
        style={st.fieldInput}
      />
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.chip, on && st.chipOn]}>
      <Text style={[st.chipTxt, on && { color: C.accentGrn }]}>{label}</Text>
    </Pressable>
  );
}

export function SelectRow({ label, sub, selected, onSelect }: { label: string; sub: string; selected: boolean; onSelect: () => void }) {
  return (
    <Pressable onPress={onSelect} style={st.selectRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.selectLabel}>{label}</Text>
        <Text style={st.selectSub}>{sub}</Text>
      </View>
      <View style={[st.radioOuter, selected && { borderColor: C.accent }]}>
        {selected && <View style={st.radioInner} />}
      </View>
    </Pressable>
  );
}

// ─── Success modal (bundle: FrCrewCreated) ────────────────────────────────────

function CreatedModal({ crew, onInvite, onLater, onDismiss }: {
  crew: Crew | null; onInvite: () => void; onLater: () => void; onDismiss: () => void;
}) {
  if (!crew) return null;
  const col = crew.color ?? C.accent;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={st.mOverlay} onPress={onDismiss}>
        <Pressable style={st.mCard} onPress={() => {}}>
          <View style={st.mTileWrap}>
            <View style={[st.mTile, { backgroundColor: col, shadowColor: col }]}>
              <Icon name="people" size={34} color="#0D1A06" />
            </View>
          </View>
          <Text style={st.mTitle}>크루가 만들어졌어요!</Text>
          <Text style={st.mSub}>
            <Text style={{ fontWeight: '700', color: C.text }}>{crew.name}</Text> 크루의 크루장이 되었어요. 친구를 초대해 함께 달려보세요.
          </Text>
          <Pressable onPress={onInvite} style={({ pressed }) => [st.mPrimary, accentShadow(C.accent), { opacity: pressed ? 0.9 : 1 }]}>
            <Text style={st.mPrimaryTxt}>크루원 초대하기</Text>
          </Pressable>
          <Pressable onPress={onLater} style={({ pressed }) => [st.mSecondary, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={st.mSecondaryTxt}>나중에 하기</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CrewCreateScreen() {
  const insets = useSafeAreaInsets();
  const { placeName } = useCurrentLocation();

  const [name, setName]       = useState('');
  const [desc, setDesc]       = useState('');
  const [color, setColor]     = useState(CREW_COLORS[0]);
  const [area, setArea]       = useState('');
  const areaTouched           = useRef(false);
  const [radiusKm, setRadiusKm] = useState(3);
  const [sport, setSport]     = useState<string>('러닝');
  const [level, setLevel]     = useState<CrewLevel>('무관');
  const [maxMembers, setMaxMembers] = useState(30);
  const [privacy, setPrivacy] = useState<Privacy>('공개');
  const [days, setDays]       = useState<string[]>([]);
  const [time, setTime]       = useState('');

  const [busy, setBusy]       = useState(false);
  const [created, setCreated] = useState<Crew | null>(null);

  // 출발지 defaults to the current placeName until the user edits it
  useEffect(() => {
    if (!areaTouched.current && placeName) setArea(placeName);
  }, [placeName]);

  const valid = name.trim().length >= 2; // client-side gate — server 422 unreachable

  const toggleDay = (d: string) =>
    setDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]));

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const crew = await createCrew({
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
      setCreated(crew);
    } catch (e: unknown) {
      // 403 premium_required arrives verbatim via ApiError (approved)
      Alert.alert('크루를 만들 수 없어요', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  }

  // Debt batch 2: the 준비-중 stub died — invite codes shipped (S-batch2).
  // The natural "crew made, now invite" moment: issue the code + share sheet.
  async function shareInviteForCreated() {
    if (!created) return;
    try {
      const code = await issueInviteCode(created.id);
      await Share.share({
        message: `FreshRun 크루 '${created.name}'에 초대해요!\n초대 코드: ${code}\n앱 커뮤니티 탭의 '코드로 가입'에서 입력해 주세요.`,
      });
    } catch (e: unknown) {
      Alert.alert('초대 코드 오류', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
    }
  }

  const goDetail = () => {
    const id = created!.id;
    setCreated(null);
    router.replace({ pathname: '/(community)/crew-detail' as any, params: { crewId: id } });
  };

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>크루 생성</Text>
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

        {/* 기본 정보 */}
        <Group title="기본 정보">
          <FieldRow label="크루 이름" value={name} onChange={setName} placeholder="예: 성수 새벽 크루" maxLength={20} />
          <View style={st.divider} />
          <FieldRow label="한 줄 소개" value={desc} onChange={setDesc} placeholder="크루를 한 문장으로 소개해요" maxLength={40} />
        </Group>

        {/* 크루 컬러 */}
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

        {/* 활동 지역 */}
        <Group title="활동 지역" hint="대표 출발지를 중심으로 활동 반경 안의 러너에게 크루가 추천돼요.">
          <View style={st.fieldRow}>
            <View style={st.areaIcon}><Icon name="location" size={18} color={C.accentGrn} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.areaLabel}>대표 출발지</Text>
              <TextInput
                value={area}
                onChangeText={v => { areaTouched.current = true; setArea(v); }}
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

        {/* 주 종목 / 페이스 레벨 */}
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

        {/* 모집 */}
        <Group title="모집">
          <NumberWheelRow label="최대 인원" value={maxMembers} min={5} max={100} step={1} suffix="명" onChange={setMaxMembers} />
        </Group>

        {/* 공개 범위 */}
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

        {/* 정기 러닝 (선택) */}
        <Group title="정기 러닝 (선택)">
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

        {/* 첫 챌린지 — deferred to the challenge item (owner call, TODO.md) */}
      </ScrollView>

      {/* Sticky CTA — gated on name ≥ 2 per design */}
      <View style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <Pressable
          onPress={submit}
          disabled={!valid || busy}
          style={[st.createBtn, valid ? accentShadow(C.accent) : st.createBtnOff]}
        >
          {busy
            ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text style={[st.createTxt, !valid && { color: C.faint }]}>크루 만들기</Text>}
        </Pressable>
      </View>

      <CreatedModal
        crew={created}
        onInvite={shareInviteForCreated}
        onLater={goDetail}
        onDismiss={() => { setCreated(null); router.back(); }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

export const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 12 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  previewWrap: { alignItems: 'center', paddingTop: 16, paddingBottom: 4 },
  previewTile: { width: 76, height: 76, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.33, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  previewName: { fontSize: 16, fontWeight: '700', letterSpacing: -0.4, marginTop: 12 },

  groupTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingTop: S.xl, paddingBottom: S.sm, paddingHorizontal: 4 },
  groupHint:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, paddingHorizontal: 4, paddingBottom: S.sm, marginTop: -4 },
  groupCard:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: S.md },
  divider:    { height: 1, backgroundColor: C.border, marginHorizontal: 4 },

  fieldRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 52 },
  fieldLabel: { width: 76, fontSize: 14, fontWeight: '600', letterSpacing: -0.3, color: C.sub },
  fieldInput: { flex: 1, fontSize: 15, fontWeight: '600', letterSpacing: -0.3, color: C.text, paddingVertical: 10 },

  colorRow:   { flexDirection: 'row', gap: 12, paddingVertical: 16, paddingHorizontal: 16 },
  colorDot:   { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: 'transparent' },
  colorDotOn: { borderColor: C.text },

  areaIcon:  { width: 36, height: 36, borderRadius: 11, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  areaLabel: { fontSize: 12, fontWeight: '600', color: C.faint },

  sliderBlock: { paddingVertical: 10 },
  sliderHead:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 4 },
  sliderValue: { fontSize: 14, fontWeight: '700', color: C.accentGrn, letterSpacing: -0.2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip:    { height: 38, paddingHorizontal: 15, borderRadius: R.pill, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  chipOn:  { backgroundColor: C.accentDim, borderColor: C.accent },
  chipTxt: { fontSize: 13.5, fontWeight: '700', letterSpacing: -0.2, color: C.sub },

  selectRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4 },
  selectLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.3, color: C.text },
  selectSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  radioOuter:  { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioInner:  { width: 12, height: 12, borderRadius: 6, backgroundColor: C.accent },

  daysRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 2 },
  dayCircle:   { width: 38, height: 38, borderRadius: 19, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  dayCircleOn: { backgroundColor: C.accent, borderColor: C.accent },
  dayTxt:      { fontSize: 13.5, fontWeight: '700', color: C.sub },

  footer:       { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: S.gutter, paddingTop: 14, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  createBtn:    { height: 56, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  createBtnOff: { backgroundColor: C.surfaceAlt },
  createTxt:    { fontSize: 16.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },

  // Success modal
  mOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  mCard:        { width: '100%', backgroundColor: C.surface, borderRadius: 24, paddingTop: 28, paddingBottom: 20, paddingHorizontal: 22, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  mTileWrap:    { alignItems: 'center' },
  mTile:        { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  mTitle:       { fontSize: 21, fontWeight: '700', color: C.text, letterSpacing: -0.5, textAlign: 'center', marginTop: 18 },
  mSub:         { fontSize: 14, lineHeight: 21, color: C.sub, textAlign: 'center', letterSpacing: -0.3, marginTop: 8, marginHorizontal: 10 },
  mPrimary:     { height: 52, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  mPrimaryTxt:  { fontSize: 15.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  mSecondary:   { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  mSecondaryTxt:{ fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },
});
