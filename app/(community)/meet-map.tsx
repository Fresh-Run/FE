/**
 * 집결 장소 — full-screen in-app map view (owner correction 2026-07-14).
 * Convention: every comparable surface (공지 상세 map, course detail) goes
 * tap → big in-app map; 지도 앱에서 보기 is a button INSIDE this view —
 * external nav is a choice, not the only option.
 *
 * IN-PLACE EDITING (owner ruling, same day — convention: cover/icon edit
 * lives ON the surface via the 커버 변경 chip, not buried in 크루 수정):
 * one view for everyone; holders of the crew-PATCH gate (owner + edit_crew —
 * the cover chip's exact gate, passed as canEdit from crew-detail) get a
 * 위치 수정 pill. Editing REUSES PlacePickSheet pushed OVER the view (stated
 * choice: the sheet already owns the whole editor — center-pin drag, 주소
 * 검색 autocomplete, 현재 위치, bbox guard — proven on two hosts; re-
 * implementing its internals here would be duplication). Pick → a draft bar
 * appears (name input + 취소/저장); 저장 PATCHes the trio (pair rule: 저장
 * disabled until the name is non-empty — no silent clear from this editor),
 * then display mode updates and crew-detail behind refreshes on focus.
 * The 크루 수정 row stays — this is the fast path, not a move.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlacePickSheet } from '@/components/place-pick-sheet';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import { updateCrew } from '@/lib/crews-api';
import { accentShadow, radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

export default function MeetMapScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const params = useLocalSearchParams<{ name?: string; lat: string; lng: string; crewId?: string; canEdit?: string; mode?: string }>();
  // mode='user' (뛰러 가기 location card): the live blue dot IS the subject —
  // no red pin, no 지도 앱에서 보기 (external nav to yourself is decoration),
  // no edit chip. One point-map screen, param-varied (stated: cleaner than a
  // third screen — route-map stays the ROUTE variant).
  const userMode = params.mode === 'user';

  // Display state — seeded from params, updated in place after a save
  const [place, setPlace] = useState(() => ({
    name: params.name?.trim() || '집결 장소',
    coords: { lat: Number(params.lat), lng: Number(params.lng) },
  }));
  const valid = Number.isFinite(place.coords.lat) && Number.isFinite(place.coords.lng);
  const canEdit = params.canEdit === '1' && !!params.crewId; // server enforces deep regardless

  // Edit flow: 위치 수정 → sheet → draft (new pin + editable name) → 저장/취소
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftCoords, setDraftCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = draftCoords !== null;

  function startEdit() {
    setDraftName(params.name?.trim() ?? (place.name === '집결 장소' ? '' : place.name));
    setSheetOpen(true);
  }

  async function saveDraft() {
    if (!params.crewId || !draftCoords || !draftName.trim() || saving) return;
    setSaving(true);
    try {
      await updateCrew(params.crewId, {
        meet_place_name: draftName.trim(),
        meet_lat: draftCoords.lat,
        meet_lng: draftCoords.lng,
      });
      setPlace({ name: draftName.trim(), coords: draftCoords });
      setDraftCoords(null); // back to display mode; crew-detail refetches on focus
    } catch (e: unknown) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  }

  const shownCoords = draftCoords ?? place.coords;

  return (
    <View style={st.root}>
      {valid && (
        <RealMap
          key={`${shownCoords.lat},${shownCoords.lng}`} // initialRegion ignores updates — remount on change
          height={winH}
          center={shownCoords}
          marker={!userMode}
          showsUser={userMode}
          interactive
          cache={false}
          borderRadius={0}
        />
      )}

      {/* header over the map — back + place name pill */}
      <View style={[st.topBar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.roundBtn}>
          <Icon name="chevron-back" size={20} color={C.text} />
        </Pressable>
        <View style={st.titlePill}>
          <Icon name={userMode ? 'locate' : 'location'} size={14} color={userMode ? C.accentGrn : C.danger} />
          <Text style={st.titleTxt} numberOfLines={1}>{editing ? '집결 장소 수정' : place.name}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* bottom bar — display: 지도 앱에서 보기 (+ admin 위치 수정 pill) ·
          edit: name input + 취소/저장 */}
      {!userMode && (
      <View style={[st.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} pointerEvents="box-none">
        {/* ④ keyboard sweep: the bar is absolute-bottom, so 'padding' can't
            lift it — 'position' shifts the edit card above the keyboard
            (the autoFocus name input was fully covered before) */}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined} pointerEvents="box-none">
        {editing ? (
          <View style={[st.editCard, shadows.md]}>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              placeholder="집결 장소 이름 (예: 서울숲 공원 정문)"
              placeholderTextColor={C.faint}
              style={st.editInput}
              autoFocus
            />
            {!draftName.trim() && <Text style={st.editHint}>이름을 입력해야 저장할 수 있어요</Text>}
            <View style={st.editBtnRow}>
              <Pressable onPress={() => setDraftCoords(null)} disabled={saving} style={st.cancelBtn}>
                <Text style={st.cancelTxt}>취소</Text>
              </Pressable>
              <Pressable
                onPress={saveDraft}
                disabled={!draftName.trim() || saving}
                style={[st.saveBtn, !draftName.trim() && { backgroundColor: C.surfaceAlt }]}
              >
                {saving
                  ? <ActivityIndicator size="small" color={C.accentText} />
                  : <Text style={[st.saveTxt, !draftName.trim() && { color: C.faint }]}>저장</Text>}
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={st.actionRow}>
            <Pressable onPress={valid ? () => {
              const q = encodeURIComponent(place.name);
              const url = Platform.OS === 'ios'
                ? `http://maps.apple.com/?ll=${place.coords.lat},${place.coords.lng}&q=${q}`
                : `geo:${place.coords.lat},${place.coords.lng}?q=${place.coords.lat},${place.coords.lng}(${q})`;
              Linking.openURL(url).catch(() => { /* no maps handler — this view IS the map */ });
            } : undefined} style={({ pressed }) => [st.openBtn, accentShadow(C.accent), pressed && { opacity: 0.88 }]}>
              <Icon name="navigate-outline" size={17} color={C.accentText} />
              <Text style={st.openTxt}>지도 앱에서 보기</Text>
            </Pressable>
            {canEdit && (
              <Pressable onPress={startEdit} style={({ pressed }) => [st.editChip, pressed && { opacity: 0.75 }]}>
                <Icon name="pencil" size={13} color="#fff" />
                <Text style={st.editChipTxt}>위치 수정</Text>
              </Pressable>
            )}
          </View>
        )}
        </KeyboardAvoidingView>
      </View>

      )}

      {/* the editor itself — PlacePickSheet pushed over the view (reused verbatim) */}
      <PlacePickSheet
        visible={sheetOpen}
        initial={valid ? place.coords : null}
        onClose={() => setSheetOpen(false)}
        onPick={c => { setDraftCoords(c); setSheetOpen(false); }}
      />
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topBar:   { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.lg, gap: 8, zIndex: 2 },
  roundBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', ...shadows.md },
  titlePill:{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, ...shadows.md },
  titleTxt: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: C.text, letterSpacing: -0.3 },

  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.gutter, zIndex: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  openBtn:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 15, backgroundColor: C.accent },
  openTxt:   { fontSize: 15, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
  // 위치 수정 — the 커버 변경 chip idiom (dark translucent pill)
  editChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: R.pill, paddingHorizontal: 14, height: 40 },
  editChipTxt: { fontSize: 12.5, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },

  editCard:  { backgroundColor: C.surface, borderRadius: 18, padding: 14, gap: 10 },
  editInput: { fontSize: 15, fontWeight: '600', color: C.text, letterSpacing: -0.3, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: C.surfaceAlt },
  editHint:  { fontSize: 11.5, fontWeight: '600', color: C.danger, letterSpacing: -0.2 },
  editBtnRow:{ flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, height: 46, borderRadius: 13, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  cancelTxt: { fontSize: 14.5, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },
  saveBtn:   { flex: 1.4, height: 46, borderRadius: 13, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  saveTxt:   { fontSize: 14.5, fontWeight: '800', color: C.accentText, letterSpacing: -0.3 },
});
