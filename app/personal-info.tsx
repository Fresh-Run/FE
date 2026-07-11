/**
 * 개인 정보 — personal info edit screen (bundle: FrPersonalInfo).
 * Pushed from the profile tab's identity card.
 *
 * Persistence split (owner override, 2026-07-06):
 *   이름        → server (PATCH /me/profile, 409 dup → inline error)
 *   이메일      → display-only (Supabase Auth identity; accepted deviation)
 *   출생 연도/체중/키/성별 → device-local (store/use-local-profile) until
 *   지연's schema fields land — TODO(S2) swaps the storage target only.
 * Avatar pencil → LIVE (onboarding-gate slice shipped the upload cycle):
 *   picker → uploadAvatar 3-step → PATCH avatar_url → store write-through.
 */
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { uploadAvatar } from '@/lib/avatar-api';
import { avatarBg } from '@/lib/fr-hash';
import { updateNickname, updateProfile } from '@/lib/profile-api';
import { accentShadow, colors as C, radius as R, shadows, spacing as S } from '@/lib/theme';
import { useLocalProfile, type Gender } from '@/store/use-local-profile';
import { useStore } from '@/store/use-store';

const GENDERS: Gender[] = ['여성', '남성', '선택 안 함'];

// ─── Row primitives (bundle: FrField / FrStepperRow / FrSelectRow) ────────────

function FieldRow({
  label, value, onChange, placeholder, keyboardType, editable = true, error,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; keyboardType?: 'number-pad' | 'email-address';
  editable?: boolean; error?: string | null;
}) {
  return (
    <View style={st.fieldRow}>
      <Text style={st.fieldLabel}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.faint}
          keyboardType={keyboardType}
          editable={editable}
          style={[st.fieldInput, !editable && { color: C.faint }]}
        />
        {error ? <Text style={st.fieldError}>{error}</Text> : null}
      </View>
    </View>
  );
}

function StepperRow({
  label, value, min, max, step, suffix, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  suffix: string; onChange: (v: number) => void;
}) {
  const bump = (dir: 1 | -1) => {
    const next = Math.round((value + dir * step) * 10) / 10;
    onChange(Math.min(max, Math.max(min, next)));
  };
  const display = Number.isInteger(step) ? String(value) : value.toFixed(1);
  return (
    <View style={st.stepperRow}>
      <Text style={st.fieldLabel}>{label}</Text>
      <View style={st.stepperCtrls}>
        <Pressable onPress={() => bump(-1)} hitSlop={6} style={st.stepBtn}>
          <Icon name="remove" size={16} color={C.text} />
        </Pressable>
        <Text style={st.stepValue}>{display}{suffix}</Text>
        <Pressable onPress={() => bump(1)} hitSlop={6} style={st.stepBtn}>
          <Icon name="add" size={16} color={C.text} />
        </Pressable>
      </View>
    </View>
  );
}

function SelectRow({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <Pressable onPress={onSelect} style={st.selectRow}>
      <Text style={[st.fieldLabel, { flex: 1 }, selected && { color: C.text }]}>{label}</Text>
      <View style={[st.radioOuter, selected && { borderColor: C.accent }]}>
        {selected && <View style={st.radioInner} />}
      </View>
    </Pressable>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  return (
    <View style={{ paddingHorizontal: S.gutter }}>
      <Text style={st.groupTitle}>{title}</Text>
      {hint ? <Text style={st.groupHint}>{hint}</Text> : null}
      <View style={[st.groupCard, shadows.sm]}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < items.length - 1 && <View style={st.divider} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PersonalInfoScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ nickname?: string }>();
  const session = useStore(s => s.session);
  const setDisplayName = useStore(s => s.setDisplayName);
  const photoUrl = useStore(s => s.photoUrl);
  const setPhotoUrl = useStore(s => s.setPhotoUrl);

  const email = session?.user.email ?? '—';
  const originalName = params.nickname ?? '';

  // Local (device-persisted) fields — TODO(S2): server-backed when schema lands
  const local = useLocalProfile(s => s.fields);
  const hydrated = useLocalProfile(s => s.hydrated);
  useEffect(() => { useLocalProfile.getState().hydrate(); }, []);

  const [name, setName]         = useState(originalName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [birthYear, setBirthYear] = useState(local.birthYear);
  const [weightKg, setWeightKg]   = useState(local.weightKg);
  const [heightCm, setHeightCm]   = useState(local.heightCm);
  const [gender, setGender]       = useState<Gender>(local.gender);

  // Adopt hydrated local values once (hydrate resolves after first render)
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (!hydrated || adoptedRef.current) return;
    adoptedRef.current = true;
    setBirthYear(local.birthYear);
    setWeightKg(local.weightKg);
    setHeightCm(local.heightCm);
    setGender(local.gender);
  }, [hydrated, local]);

  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Stale-URL grace: failed photo load falls back to initials, not a broken image
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  async function changePhoto() {
    if (uploadingPhoto) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (res.canceled || !res.assets[0]) return;
    setUploadingPhoto(true);
    try {
      const url = await uploadAvatar(res.assets[0].uri);
      // nickname is required on every ProfileUpdate (422 without) — carry
      // the SERVER's current name, not the unsaved field edit
      await updateProfile({ nickname: originalName, avatar_url: url });
      setPhotoUrl(url); // write-through: 홈/프로필 paint it immediately
    } catch (e: unknown) {
      Alert.alert('사진 업로드 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (saving) return;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 20) {
      setNameError('이름은 2~20자로 입력해 주세요');
      return;
    }
    if (birthYear && birthYear.length !== 4) {
      Alert.alert('출생 연도', '출생 연도는 4자리로 입력해 주세요.');
      return;
    }
    setSaving(true);
    setNameError(null);
    try {
      // 이름 → server (only when changed)
      if (trimmed !== originalName) {
        await updateNickname(trimmed);
        setDisplayName(trimmed); // greeting/comments use the store name
      }
      // 출생 연도/체중/키/성별 → device-local until S2
      await useLocalProfile.getState().save({ birthYear, weightKg, heightCm, gender });
      setSavedFlash(true);
      flashTimer.current = setTimeout(() => setSavedFlash(false), 1600);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        setNameError('이미 사용 중인 닉네임이에요');
      } else {
        Alert.alert('저장 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해 주세요');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      {/* ── App bar ── */}
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>개인 정보</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Avatar + pencil (live upload — onboarding-gate slice) ── */}
        <View style={st.avatarWrap}>
          <View style={{ position: 'relative' }}>
            {photoUrl && photoUrl !== brokenUrl ? (
              <Image
                source={{ uri: photoUrl }}
                onError={() => setBrokenUrl(photoUrl)}
                style={st.avatar}
              />
            ) : (
              <View style={[st.avatar, { backgroundColor: avatarBg(name || '러너'), alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={st.avatarTxt}>{(name.trim() || '러').trim()[0].toUpperCase()}</Text>
              </View>
            )}
            {uploadingPhoto && (
              <View style={[st.avatar, st.avatarBusy]}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            <Pressable onPress={changePhoto} hitSlop={8} style={st.pencilBadge}>
              <Icon name="pencil" size={13} color={C.accentText} />
            </Pressable>
          </View>
        </View>

        {/* ── 기본 정보 ── */}
        <Group title="기본 정보">
          <FieldRow label="이름" value={name} onChange={v => { setName(v); setNameError(null); }} placeholder="이름" error={nameError} />
          <FieldRow label="이메일" value={email} editable={false} />
          <FieldRow
            label="출생 연도"
            value={birthYear}
            onChange={v => setBirthYear(v.replace(/\D/g, '').slice(0, 4))}
            placeholder="예: 1995"
            keyboardType="number-pad"
          />
        </Group>

        {/* ── 신체 정보 ── */}
        <Group title="신체 정보" hint="신체 정보는 칼로리와 페이스 추정의 정확도를 높여요.">
          <StepperRow label="체중" value={weightKg} min={30} max={150} step={0.5} suffix=" kg" onChange={setWeightKg} />
          <StepperRow label="키" value={heightCm} min={120} max={220} step={1} suffix=" cm" onChange={setHeightCm} />
        </Group>

        {/* ── 성별 ── */}
        <Group title="성별">
          {GENDERS.map(g => (
            <SelectRow key={g} label={g} selected={gender === g} onSelect={() => setGender(g)} />
          ))}
        </Group>
      </ScrollView>

      {/* ── Save bar (bundle: FrSaveBar — 저장 + saved flash) ── */}
      <View style={[st.saveBar, { paddingBottom: Math.max(insets.bottom, S.lg) + S.sm }]}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            st.saveBtn,
            savedFlash ? st.saveBtnDone : accentShadow(C.accent),
            { opacity: pressed || saving ? 0.85 : 1 },
          ]}
        >
          {saving
            ? <ActivityIndicator size="small" color={C.accentText} />
            : savedFlash
              ? (
                <>
                  <Icon name="checkmark" size={18} color={C.accentGrn} />
                  <Text style={[st.saveTxt, { color: C.accentGrn }]}>저장됨</Text>
                </>
              )
              : <Text style={st.saveTxt}>저장</Text>}
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 12 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  avatarWrap:  { alignItems: 'center', paddingTop: 14, paddingBottom: 4 },
  avatar:      { width: 84, height: 84, borderRadius: 42, borderWidth: 2.5, borderColor: C.accent },
  avatarBusy:  { position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  avatarTxt:   { fontSize: 34, fontWeight: '700', color: '#fff', letterSpacing: -0.5 },
  pencilBadge: { position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: C.accent, borderWidth: 2.5, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' },

  groupTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingTop: S.xl, paddingBottom: S.sm, paddingHorizontal: 4 },
  groupHint:  { fontSize: 12, color: C.faint, letterSpacing: -0.2, paddingHorizontal: 4, paddingBottom: S.sm, marginTop: -4 },
  groupCard:  { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.xl, paddingHorizontal: S.md },
  divider:    { height: 1, backgroundColor: C.border, marginHorizontal: 4 },

  fieldRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, minHeight: 52 },
  fieldLabel: { width: 76, fontSize: 14, fontWeight: '600', letterSpacing: -0.3, color: C.sub },
  fieldInput: { fontSize: 15, fontWeight: '600', letterSpacing: -0.3, color: C.text, paddingVertical: 10 },
  fieldError: { fontSize: 12, color: C.danger, letterSpacing: -0.2, marginTop: -6, paddingBottom: 8 },

  stepperRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  stepperCtrls: { flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 'auto' },
  stepBtn:      { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  stepValue:    { minWidth: 74, textAlign: 'center', fontSize: 15, fontWeight: '700', letterSpacing: -0.3, color: C.text, fontVariant: ['tabular-nums'] },

  selectRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.accent },

  saveBar:    { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: S.gutter, paddingTop: S.md, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  saveBtn:    { height: 54, borderRadius: R.lg, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  saveBtnDone:{ backgroundColor: C.accentDim, borderWidth: 1.5, borderColor: C.accent },
  saveTxt:    { fontSize: 16, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },
});
