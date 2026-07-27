/**
 * 크루 편집 — canvas FrCrewEdit (crew-create.jsx): the create form pre-filled,
 * PATCH on save, plus the owner-only 위험 구역 danger card → 크루 해체 confirm
 * modal. The modal is the SHARED CrewDeleteModal (components/crew-delete-modal),
 * reused by crew-admin's owner 크루 해체하기 slot — one modal, both surfaces.
 *
 * Contract: PATCH = edit_crew-permission admins OR owner since v2 (BE
 * 28a5c25 — the 07-15 owner-only probe superseded); DELETE stays owner-only.
 * The 위험 구역 renders only for owner (the `owner` param from crew-admin,
 * the sole entry; server enforces deep regardless).
 * DELETE cascades WITH members — no empty-first/transfer-first requirement:
 * memberships·공지·RSVP die with the crew (BE delete_crew docstring; crew-
 * targeted notifications cleaned, M10), members' RUNS survive (runs
 * reference users). The dialog copy states exactly that. Form primitives,
 * constants, and styles are shared imports from crew-create (no duplication).
 */
import Slider from '@react-native-community/slider';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
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

import { CrewDeleteModal } from '@/components/crew-delete-modal';
import { PlacePickSheet } from '@/components/place-pick-sheet';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { NumberWheelRow } from '@/components/wheel-sheet';
import {
  getCrew,
  mapCrew,
  updateCrew,
  type Crew,
  type CrewLevel,
} from '@/lib/crews-api';
import { accentShadow, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { takePendingCrewRegion } from '@/store/pending-crew-region';

import {
  Chip,
  CREW_COLORS,
  DAYS,
  FieldRow,
  Group,
  LEVELS,
  PRIVACY_OPTIONS,
  privacyToFields,
  RegionRow,
  SelectRow,
  SPORTS,
  makeSt,
  TagPicker,
  type Privacy,
} from './crew-create';
import { CREW_TAG_MAX } from '@/lib/crews-api';

/** Inverse of privacyToFields — seed the 3-way selector from server fields. */
function fieldsToPrivacy(isPublic: boolean, joinPolicy: 'open' | 'approval'): Privacy {
  if (!isPublic) return '비공개';
  if (joinPolicy === 'approval') return '승인제';
  return '공개';
}

export default function CrewEditScreen() {
  const C = useTokens();
  const est = useStyles(makeEst);
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { crewId, owner } = useLocalSearchParams<{ crewId: string; owner?: string }>();
  // absent param (stale deep link) fails CLOSED — delete is the dangerous door
  const isOwner = owner !== '0' && owner !== undefined;

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
  // 둘러보기 backfill — seeded from server truth; re-picking a region
  // forward-geocodes to coords (best-effort). tags = 13-item vocabulary, ≤5.
  const [sido, setSido]       = useState<string | null>(null);
  const [sigungu, setSigungu] = useState<string | null>(null);
  const [regionCoord, setRegionCoord] = useState<{ lat: number; lng: number } | null>(null);

  // ── 집결 장소 — LIVE 2026-07-14 (지연 deploy pinged + probed: set/clear/
  // bbox-422 verified on staging; gate = the crew PATCH gate itself, owner +
  // edit_crew — this screen's entry gate, no extra key). Pair rule: place is
  // SET only when name AND pin both exist (save sends the trio); anything
  // less → explicit nulls ×3 (clear) — a typed name without a pin does NOT
  // ride (stated: the pin is what the card's map promises).
  const [meetName, setMeetName]   = useState('');
  const [meetCoords, setMeetCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [meetSheetOpen, setMeetSheetOpen] = useState(false);
  const [tags, setTags]       = useState<string[]>([]);
  const toggleTag = (t: string) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : (prev.length >= CREW_TAG_MAX ? prev : [...prev, t]));

  const [busy, setBusy]           = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
        setSido(c.sido);
        setSigungu(c.sigungu);
        setTags(c.tags ?? []);
        setMeetName(c.meet_place_name ?? '');
        setMeetCoords(c.meet_lat != null && c.meet_lng != null ? { lat: c.meet_lat, lng: c.meet_lng } : null);
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [crewId]);

  // Region-picker return (target=form) → set + forward-geocode to coords.
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
        tags, // [] clears; state is never null (deselect-all emits [], not null)
        // 둘러보기 지역 — the 4 whitelisted null-clear fields (지연 exclude_none
        // fix). No region → send explicit null for ALL FOUR together (server
        // deletes only these; omitting lat/lng would orphan stale coords).
        // Region set → sido/sigungu round-trip; lat/lng only when re-picked
        // this session (omitted = server keeps the existing coord).
        ...(sido == null
          ? { sido: null, sigungu: null, lat: null, lng: null }
          : { sido, sigungu, ...(regionCoord ? { lat: regionCoord.lat, lng: regionCoord.lng } : {}) }),
        // 집결 장소 — pair rule: name+pin → set trio; else explicit nulls (clear)
        ...(meetName.trim() && meetCoords
          ? { meet_place_name: meetName.trim(), meet_lat: meetCoords.lat, meet_lng: meetCoords.lng }
          : { meet_place_name: null, meet_lat: null, meet_lng: null }),
      });
      router.back(); // crew-detail refetches on focus
    } catch (e: unknown) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
    } finally {
      setBusy(false);
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
    <KeyboardAvoidingView style={[st.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
            <Icon name="people" size={34} color={C.accentText} />
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

        <Group title="활동 지역" hint="지역을 정하면 둘러보기에서 그 지역 러너에게 크루가 보여요.">
          {/* 시/도·구/군 — backfill for location-less crews (the decay fix);
              × unsets it (지역 해제 — clears all 4 region fields on save) */}
          <RegionRow
            sido={sido} sigungu={sigungu}
            onPress={() => router.push({ pathname: '/region-picker' as never, params: { target: 'form' } })}
            onClear={() => { setSido(null); setSigungu(null); setRegionCoord(null); }}
          />
          {/* 집결 장소 — name + map pin (공지 composer's picker); × clears
              (지역 row idiom). Saved only when BOTH name and pin exist. */}
          <View style={st.divider} />
          <View style={st.fieldRow}>
            <View style={st.areaIcon}><Icon name="flag-outline" size={18} color={C.accentGrn} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={st.areaLabel}>집결 장소</Text>
              <TextInput
                value={meetName}
                onChangeText={setMeetName}
                placeholder="예: 서울숲 공원 정문"
                placeholderTextColor={C.faint}
                style={[st.fieldInput, { paddingVertical: 4 }]}
              />
            </View>
            {(meetName.length > 0 || meetCoords) && (
              <Pressable
                onPress={() => { setMeetName(''); setMeetCoords(null); }}
                hitSlop={10}
                accessibilityLabel="집결 장소 해제"
                style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt }}
              >
                <Icon name="close" size={15} color={C.faint} />
              </Pressable>
            )}
          </View>
          {/* …and gets a DEDICATED full-width row instead (2026-07-14 fix:
              the in-row pin sat between the TextInput's touch surface and
              the ×'s overlapping hitSlop — taps never reached it. Big
              target, zero adjacency; composer's pin-preview idiom below). */}
          <Pressable
            onPress={() => setMeetSheetOpen(true)}
            style={({ pressed }) => [est.meetPickRow, pressed && { opacity: 0.7 }]}
          >
            <Icon name={meetCoords ? 'location' : 'map-outline'} size={17} color={meetCoords ? C.danger : C.accentGrn} />
            <Text style={[est.meetPickTxt, meetCoords != null && { color: C.text }]}>
              {meetCoords ? '핀 지정됨 — 지도에서 수정' : '지도에서 위치 선택'}
            </Text>
            <Icon name="chevron-forward" size={15} color={C.faint} />
          </Pressable>
          {meetCoords && (
            /* key= remounts on re-pick — RealMap uses initialRegion, which
               ignores prop updates (the composer's stale-preview fix) */
            <View style={est.meetPreview}>
              <RealMap key={`${meetCoords.lat},${meetCoords.lng}`} height={110} center={meetCoords} marker borderRadius={12} />
            </View>
          )}
          <View style={st.divider} />
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

        {/* 태그 (둘러보기 필터·카드) — 13-item vocabulary, ≤5 */}
        <TagPicker selected={tags} onToggle={toggleTag} />

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
            {PRIVACY_OPTIONS.map(([lbl, lk, sk], i) => (
              <React.Fragment key={lbl}>
                {i > 0 && <View style={st.divider} />}
                <SelectRow label={t(lk)} sub={t(sk)} selected={privacy === lbl} onSelect={() => setPrivacy(lbl)} />
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

        {/* ── 위험 구역 (canvas danger zone) — owner-only under v2 (edit_crew
               admins edit but never delete; server enforces deep) ── */}
        {isOwner && (
          <View style={{ paddingHorizontal: S.gutter, paddingTop: 24 }}>
            <Text style={est.dangerTitle}>위험 구역</Text>
            <Pressable onPress={() => setDeleteOpen(true)} style={({ pressed }) => [est.dangerCard, pressed && { opacity: 0.8 }]}>
              <View style={est.dangerIcon}>
                <Icon name="trash-outline" size={18} color={C.danger} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={est.dangerLbl}>크루 해체</Text>
                <Text style={est.dangerSub}>크루원들과 함께 크루가 사라져요</Text>
              </View>
            </Pressable>
          </View>
        )}
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
      {/* 집결 장소 pin picker — the 공지 composer's PlacePickSheet verbatim */}
      <PlacePickSheet
        visible={meetSheetOpen}
        initial={meetCoords}
        onClose={() => setMeetSheetOpen(false)}
        onPick={c2 => { setMeetCoords(c2); setMeetSheetOpen(false); }}
      />
      <CrewDeleteModal
        visible={deleteOpen}
        crewId={crewId!}
        crewName={crew.name}
        memberCount={crew.member_count}
        onClose={() => setDeleteOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

// Edit-only styles (form styles come from crew-create's shared st)
const makeEst = (C: Tokens) => StyleSheet.create({
  meetPickRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 12, paddingHorizontal: 4 },
  meetPickTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: C.accentGrn, letterSpacing: -0.3 },
  meetPreview: { marginBottom: 10, borderRadius: 12, overflow: 'hidden' },

  rootPlain: { flex: 1, backgroundColor: C.bg },
  centered:  { paddingTop: 80, alignItems: 'center', gap: 12 },
  stateTxt:  { fontSize: 14, color: C.sub, letterSpacing: -0.2 },

  dangerTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.danger, textTransform: 'uppercase', paddingHorizontal: 4, paddingBottom: 8, paddingTop: 0 },
  dangerCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.danger + '44', borderRadius: 16, padding: 14 },
  dangerIcon:  { width: 36, height: 36, borderRadius: 11, backgroundColor: C.danger + '1A', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dangerLbl:   { fontSize: 14.5, fontWeight: '700', color: C.danger, letterSpacing: -0.3 },
  dangerSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
});
