/**
 * 크루 생성 — create-crew form + success modal (bundle: FrCrewCreate +
 * FrCrewCreated). Pushed from the community tab's 크루 생성 button (the
 * free-tier 1-crew gate lives at that button; the server enforces 403
 * premium_required regardless — shown verbatim).
 *
 * Approved deviations: 출발지 = editable text defaulting to the current
 * placeName; 첫 챌린지 block deferred (own item, paired with challenge
 * display); success 초대하기 → user-search INVITE picker (2026-07-20 slice —
 * the share lane lives inside the picker's 링크로 초대 row).
 */
import { SeededSlider } from '@/components/seeded-slider';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/error-copy';
import { t, type StringKey, tfIn, useLang } from '@/lib/i18n';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { Toggle } from '@/components/toggle';
import { NumberWheelRow } from '@/components/wheel-sheet';
import { createChallenge, dateToKstIsoDay, kstDateStr } from '@/lib/challenges-api';
import { createCrew, CREW_TAG_GROUPS, CREW_TAG_MAX, tagLabel, type Crew, type CrewLevel } from '@/lib/crews-api';
import { regionName } from '@/lib/korea-regions';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { accentShadow, radius as R, shadows, spacing as S, type Tokens, DENSE_MAX_FONT_SCALE} from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { takePendingCrewRegion } from '@/store/pending-crew-region';

export const CREW_COLORS = ['#74E827', '#2F8FE8', '#E8703D', '#A24DE8', '#E8B53D'];
export const SPORTS = ['러닝', '라이딩', '워킹'] as const; // SERVER values — display via SPORT_KEY
const SPORT_KEY = { '러닝': 'crw.sportRun', '라이딩': 'crw.sportRide', '워킹': 'crw.sportWalk' } as const;
export const LEVELS: CrewLevel[] = ['입문', '중급', '고급', '무관']; // SERVER values
const LEVEL_KEY = { '입문': 'crw.lvBeginner', '중급': 'crw.lvMid', '고급': 'crw.lvAdv', '무관': 'crw.lvAny' } as const;
export const DAYS = ['월', '화', '수', '목', '금', '토', '일'] as const; // SERVER values
const DAY_KEY = { '월': 'dayS.mon', '화': 'dayS.tue', '수': 'dayS.wed', '목': 'dayS.thu', '금': 'dayS.fri', '토': 'dayS.sat', '일': 'dayS.sun' } as const;

export type Privacy = '공개' | '승인제' | '비공개';
// internal enum values (mapped to is_public/join_policy at send) — display via keys
export const PRIVACY_OPTIONS: [Privacy, StringKey, StringKey][] = [
  ['공개',   'crw.pubOpen',     'crw.pubOpenSub'],
  ['승인제', 'crw.pubApproval', 'crw.pubApprovalSub'],
  ['비공개', 'crw.pubPrivate',  'crw.pubPrivateSub'],
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
  const st = useStyles(makeSt);
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
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <View style={st.fieldRow}>
      <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.fieldLabel}>{label}</Text>
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
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <Pressable onPress={onPress} style={[st.chip, on && st.chipOn]}>
      <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.chipTxt, on && { color: C.accentGrn }]}>{label}</Text>
    </Pressable>
  );
}

export function SelectRow({ label, sub, selected, onSelect }: { label: string; sub: string; selected: boolean; onSelect: () => void }) {
  const C = useTokens();
  const st = useStyles(makeSt);
  return (
    <Pressable onPress={onSelect} style={st.selectRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.selectLabel}>{label}</Text>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.selectSub}>{sub}</Text>
      </View>
      <View style={[st.radioOuter, selected && { borderColor: C.accent }]}>
        {selected && <View style={st.radioInner} />}
      </View>
    </Pressable>
  );
}

// ─── 둘러보기 discovery — region row + tags picker (shared with crew-edit) ─────

// onClear (optional): when a region is set, shows a quiet × to unset it. Only
// crew-edit passes it — the region-null-clear is now server-supported (지연
// exclude_none fix, staging 2026-07-13); crew-create never needs unset.
export function RegionRow({ sido, sigungu, onPress, onClear }: {
  sido: string | null; sigungu: string | null; onPress: () => void; onClear?: () => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const label = sido ? (sigungu ? `${regionName(sido)} ${regionName(sigungu)}` : regionName(sido)) : t('crw.areaPick');
  return (
    <Pressable onPress={onPress} style={st.regionRow}>
      <View style={st.areaIcon}><Icon name="map-outline" size={18} color={C.accentGrn} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.areaLabel}>{t('crw.areaRegion')}</Text>
        <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={[st.regionValue, !sido && { color: C.faint }]} numberOfLines={1}>{label}</Text>
      </View>
      {onClear && sido ? (
        <Pressable onPress={onClear} hitSlop={10} style={st.regionClear} accessibilityLabel={t('crw.areaClear')}>
          <Icon name="close" size={15} color={C.faint} />
        </Pressable>
      ) : (
        <Icon name="chevron-forward" size={16} color={C.faint} />
      )}
    </Pressable>
  );
}

/** 13-item server vocabulary, grouped; ≤5 enforced by the caller's onToggle. */
export function TagPicker({ selected, onToggle }: { selected: string[]; onToggle: (tag: string) => void }) {
  const st = useStyles(makeSt);
  return (
    <View style={{ paddingHorizontal: S.gutter }}>
      <View style={st.tagHead}>
        <Text style={st.groupTitle}>{t('crw.tags')}</Text>
        <Text style={st.tagCount}>{selected.length}/{CREW_TAG_MAX}</Text>
      </View>
      {CREW_TAG_GROUPS.map(g => (
        <View key={g.label} style={{ marginTop: 6 }}>
          <Text style={st.tagGroupLabel}>{t(g.label)}</Text>
          <View style={st.chipRow}>
            {g.tags.map(tag => <Chip key={tag} label={tagLabel(tag)} on={selected.includes(tag)} onPress={() => onToggle(tag)} />)}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Success modal (bundle: FrCrewCreated) ────────────────────────────────────

function CreatedModal({ crew, onInvite, onLater, onDismiss }: {
  crew: Crew | null; onInvite: () => void; onLater: () => void; onDismiss: () => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  if (!crew) return null;
  const col = crew.color ?? C.accent;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={st.mOverlay} onPress={onDismiss}>
        <Pressable style={st.mCard} onPress={() => {}}>
          <View style={st.mTileWrap}>
            <View style={[st.mTile, { backgroundColor: col, shadowColor: col }]}>
              <Icon name="people" size={34} color={C.accentText} />
            </View>
          </View>
          <Text style={st.mTitle}>{t('crw.created')}</Text>
          <Text style={st.mSub}>
            {t('crw.createdSub.before')}<Text style={{ fontWeight: '700', color: C.text }}>{crew.name}</Text>{t('crw.createdSub.after')}
          </Text>
          <Pressable onPress={onInvite} style={({ pressed }) => [st.mPrimary, accentShadow(C.accent), { opacity: pressed ? 0.9 : 1 }]}>
            <Text style={st.mPrimaryTxt}>{t('crw.invite')}</Text>
          </Pressable>
          <Pressable onPress={onLater} style={({ pressed }) => [st.mSecondary, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={st.mSecondaryTxt}>{t('crw.mLater')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CrewCreateScreen() {
  const lang = useLang(); // 8/6 back-sweep: render tfIn anchor
  const C = useTokens();
  const st = useStyles(makeSt);
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
  // 첫 챌린지 (선택) — canvas has a toggle + goal/period wheels. Default OFF
  // (canvas prototype shows ON; owner lean = collapsed — a crew creation must
  // not silently queue a challenge POST the creator didn't opt into). Chained
  // AFTER the crew POST; a challenge failure NEVER rolls back the crew.
  const [challengeOn, setChallengeOn]       = useState(false);
  const [challengeGoalKm, setChallengeGoalKm] = useState(50);   // canvas default
  const [challengePeriod, setChallengePeriod] = useState(7);
  const [privacy, setPrivacy] = useState<Privacy>('공개');
  const [days, setDays]       = useState<string[]>([]);
  const [time, setTime]       = useState('');
  // 둘러보기 discovery — sido/sigungu make the crew findable in the region
  // filter (the decay fix); regionCoord (best-effort forward-geocode) adds
  // distance sort; tags = 13-item vocabulary, ≤5.
  const [sido, setSido]       = useState<string | null>(null);
  const [sigungu, setSigungu] = useState<string | null>(null);
  const [regionCoord, setRegionCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [tags, setTags]       = useState<string[]>([]);
  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : (prev.length >= CREW_TAG_MAX ? prev : [...prev, t]));

  // On return from the region-picker (target=form), consume the pick and
  // forward-geocode it to coords (best-effort — a resolved region gives the
  // crew a distance_km; a failed geocode still filters by sido/sigungu).
  useFocusEffect(useCallback(() => {
    const r = takePendingCrewRegion();
    if (!r) return;
    setSido(r.sido);
    setSigungu(r.sigungu);
    setRegionCoord(null);
    Location.geocodeAsync([r.sido, r.sigungu].filter(Boolean).join(' '))
      .then(g => { if (g[0]) setRegionCoord({ lat: g[0].latitude, lng: g[0].longitude }); })
      .catch(() => { /* offline/failed — sido/sigungu still make it findable */ });
  }, []));

  const [busy, setBusy]       = useState(false);
  const [footerH, setFooterH] = useState(0); // measured overlay-CTA height (bottom-pad fix)
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
        // 둘러보기 discovery (all optional; omitted when unset)
        ...(sido ? { sido, sigungu } : {}),
        ...(regionCoord ? { lat: regionCoord.lat, lng: regionCoord.lng } : {}),
        ...(tags.length ? { tags } : {}),
      });
      // 첫 챌린지 chain — crew already exists; NEVER roll it back. A challenge
      // failure lands the user in the (real) crew with an honest note; the
      // crew-detail challenge section then shows its create-CTA to retry.
      if (challengeOn) {
        try {
          await createChallenge(crew.id, {
            title: t('crw.firstChallenge'),
            goal_km: challengeGoalKm,
            starts_at: dateToKstIsoDay(kstDateStr(0), 'start')!,
            ends_at: dateToKstIsoDay(kstDateStr(challengePeriod - 1), 'end')!,
          });
        } catch {
          Alert.alert(t('crw.challengeSavedFailTitle'), t('crw.challengeSavedFailBody'));
        }
      }
      setCreated(crew);
    } catch (e: unknown) {
      // 403 premium_required arrives verbatim via ApiError (approved)
      Alert.alert(t('crw.createFailTitle'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // 크루원 초대하기 → the in-app picker (2026-07-20 discoverability slice).
  // The old direct share sheet RELOCATED into the picker's 링크로 초대 row —
  // both lanes stay live. Land on crew-detail first (replace) so back from
  // the picker exits to the crew, not the spent create form.
  function inviteForCreated() {
    const { id, name } = created!;
    setCreated(null);
    router.replace({ pathname: '/(community)/crew-detail' as any, params: { crewId: id } });
    router.push({ pathname: '/(community)/user-search' as never, params: { crewId: id, crewName: name } });
  }

  const goDetail = () => {
    const id = created!.id;
    setCreated(null);
    router.replace({ pathname: '/(community)/crew-detail' as any, params: { crewId: id } });
  };

  return (
    // +14: appBar's paddingVertical 12 puts content at insets.top+26 —
    // the fix1 top-cutoff pattern (run-save/edit-run parity; KAV-루트
    // 4형제 sweep, ruled 8/5)
    <KeyboardAvoidingView style={[st.root, { paddingTop: insets.top + 14 }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{t('crw.title')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* bottom pad = MEASURED footer + breathing (en clip fix 7/31): the
          old 110 was tuned to the ko one-line challenge summary — an en wrap
          (or any future copy/date growth) clipped against the overlay CTA.
          Measuring clears ANY wrap height, forever. 110 = pre-measure frame. */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: (footerH || 110) + 24 }} keyboardShouldPersistTaps="handled">
        {/* Identity preview */}
        <View style={st.previewWrap}>
          <View style={[st.previewTile, { backgroundColor: color, shadowColor: color }]}>
            <Icon name="people" size={34} color={C.accentText} />
          </View>
          <Text style={[st.previewName, { color: name.trim() ? C.text : C.faint }]}>
            {name.trim() || t('crw.nameFallback')}
          </Text>
        </View>

        {/* 기본 정보 */}
        <Group title={t('crw.gBasic')}>
          <FieldRow label={t('crw.name')} value={name} onChange={setName} placeholder={t('crw.namePh')} maxLength={20} />
          <View style={st.divider} />
          <FieldRow label={t('crw.desc')} value={desc} onChange={setDesc} placeholder={t('crw.descPh')} maxLength={40} />
        </Group>

        {/* 크루 컬러 */}
        <View style={{ paddingHorizontal: S.gutter }}>
          <Text style={st.groupTitle}>{t('crw.color')}</Text>
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
        <Group title={t('crw.gArea')} hint={t('crw.gAreaHint')}>
          {/* 시/도·구/군 — the region filter's key (the decay fix) */}
          <RegionRow sido={sido} sigungu={sigungu} onPress={() => router.push({ pathname: '/region-picker' as never, params: { target: 'form' } })} />
          <View style={st.divider} />
          <View style={st.fieldRow}>
            <View style={st.areaIcon}><Icon name="location" size={18} color={C.accentGrn} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.areaLabel}>{t('crw.homeBase')}</Text>
              <TextInput
                value={area}
                onChangeText={v => { areaTouched.current = true; setArea(v); }}
                placeholder={t('crw.homeBasePh')}
                placeholderTextColor={C.faint}
                style={[st.fieldInput, { paddingVertical: 4 }]}
              />
            </View>
          </View>
          <View style={st.divider} />
          <View style={st.sliderBlock}>
            <View style={st.sliderHead}>
              <Text maxFontSizeMultiplier={DENSE_MAX_FONT_SCALE} style={st.fieldLabel}>{t('crw.radius')}</Text>
              <Text style={st.sliderValue}>{radiusKm} km</Text>
            </View>
            <SeededSlider
              siteId="crew-create-radius"
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

        {/* 태그 (둘러보기 필터·카드) — 13-item vocabulary, ≤5 */}
        <TagPicker selected={tags} onToggle={toggleTag} />

        {/* 주 종목 / 페이스 레벨 */}
        <View style={{ paddingHorizontal: S.gutter }}>
          <Text style={st.groupTitle}>{t('crw.sport')}</Text>
          <View style={st.chipRow}>
            {SPORTS.map(s => <Chip key={s} label={t(SPORT_KEY[s])} on={sport === s} onPress={() => setSport(s)} />)}
          </View>
          <Text style={st.groupTitle}>{t('crw.level')}</Text>
          <View style={st.chipRow}>
            {LEVELS.map(l => <Chip key={l} label={t(LEVEL_KEY[l])} on={level === l} onPress={() => setLevel(l)} />)}
          </View>
        </View>

        {/* 모집 */}
        <Group title={t('crw.gRecruit')}>
          <NumberWheelRow label={t('crw.maxMembers')} value={maxMembers} min={5} max={100} step={1} suffix={t('unit.people')} onChange={setMaxMembers} />
        </Group>

        {/* 공개 범위 */}
        <View style={{ paddingHorizontal: S.gutter }}>
          <Text style={st.groupTitle}>{t('runSave.visibility')}</Text>
          <View style={[st.groupCard, shadows.sm]}>
            {PRIVACY_OPTIONS.map(([lbl, lk, sk], i) => (
              <React.Fragment key={lbl}>
                {i > 0 && <View style={st.divider} />}
                <SelectRow label={t(lk)} sub={t(sk)} selected={privacy === lbl} onSelect={() => setPrivacy(lbl)} />
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* 정기 러닝 (선택) */}
        <Group title={t('crw.gRegular')}>
          <View style={st.daysRow}>
            {DAYS.map(d => {
              const on = days.includes(d);
              return (
                <Pressable key={d} onPress={() => toggleDay(d)} style={[st.dayCircle, on && st.dayCircleOn]}>
                  <Text style={[st.dayTxt, on && { color: C.accentText }]}>{t(DAY_KEY[d])}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={st.divider} />
          <FieldRow label={t('res.time')} value={time} onChange={setTime} placeholder={t('crw.timePh')} maxLength={20} />
        </Group>

        {/* 첫 챌린지 (선택) — optional; chained after the crew POST (B7) */}
        <Group title={t('crw.gChallenge')}>
          <View style={st.challengeToggleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.challengeToggleLabel}>{t('crw.chToggle')}</Text>
              <Text style={st.challengeToggleSub}>{t('crw.chToggleSub')}</Text>
            </View>
            <Toggle on={challengeOn} onChange={setChallengeOn} />
          </View>
          {challengeOn && (
            <>
              <View style={st.divider} />
              <NumberWheelRow label={t('crt.targetDist')} value={challengeGoalKm} min={5} max={100} step={1} suffix="km" onChange={setChallengeGoalKm} />
              <View style={st.divider} />
              <NumberWheelRow label={t('crw.chPeriod')} value={challengePeriod} min={3} max={60} step={1} suffix={t('unit.days')} onChange={setChallengePeriod} />
              <Text style={st.challengePreview}>{tfIn(lang, 'crw.chPreview', { n: challengePeriod, date: kstDateStr(challengePeriod - 1) })}</Text>
            </>
          )}
        </Group>
      </ScrollView>

      {/* Sticky CTA — gated on name ≥ 2 per design */}
      <View onLayout={e => setFooterH(e.nativeEvent.layout.height)} style={[st.footer, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
        <Pressable
          onPress={submit}
          disabled={!valid || busy}
          style={[st.createBtn, valid ? accentShadow(C.accent) : st.createBtnOff]}
        >
          {busy
            ? <ActivityIndicator size="small" color={C.accentText} />
            : <Text style={[st.createTxt, !valid && { color: C.faint }]}>{t('crw.create')}</Text>}
        </Pressable>
      </View>

      <CreatedModal
        crew={created}
        onInvite={inviteForCreated}
        onLater={goDetail}
        onDismiss={() => { setCreated(null); router.back(); }}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// Shared with crew-edit (imports makeSt) — factory since the dark-mode batch.
export const makeSt = (C: Tokens) => StyleSheet.create({
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
  regionRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4 },
  regionValue: { fontSize: 15, fontWeight: '600', color: C.text, letterSpacing: -0.3, marginTop: 2 },
  regionClear: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt, flexShrink: 0 },
  tagHead:     { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  tagCount:    { fontSize: 12.5, fontWeight: '700', color: C.faint },
  tagGroupLabel: { fontSize: 12, fontWeight: '600', color: C.faint, letterSpacing: -0.2, marginBottom: 8 },

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

  challengeToggleRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  challengeToggleLabel: { fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  challengeToggleSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  challengePreview:     { fontSize: 12, color: C.accentGrn, letterSpacing: -0.2, fontWeight: '600', paddingTop: 10, paddingLeft: 2 },
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
