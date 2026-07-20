/**
 * 회원정보 — the onboarding gate (plan A, owner spec 2026-07-13; built to
 * owner spec — no canvas 회원정보 screen exists, parity note in TODO).
 *
 * Routed by the _layout guard whenever the server has NO profile row:
 * fresh signups AND legacy profile-less accounts (the healing — every
 * server write 404s "Create a profile first" until the row exists).
 *
 * Steps: ① 닉네임 (REQUIRED — the profile row itself; no skip, hard gate)
 *        ② 프로필 사진 (optional, 다음에 하기) — live avatar 3-step cycle
 *        ③ 키·체중 (optional, 다음에 하기) — PATCH /me/profile S2 fields
 *          + weight dual-writes the local kcal store (saved=true)
 * Submit is ONE atomic PATCH (nickname + body fields — nickname is required
 * on every ProfileUpdate, probed 422) + the avatar cycle when a photo was
 * picked. 409 nickname-taken returns to step ① with the inline error.
 */
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AvatarCrop, type CropSource } from '@/components/avatar-crop';
import { Button, Icon, Input, Text } from '@/components/ui';
import { md3 } from '@/lib/theme';
import { ApiError } from '@/lib/api';
import { uploadAvatar } from '@/lib/avatar-api';
import { updateProfile } from '@/lib/profile-api';
import { useLocalProfile } from '@/store/use-local-profile';
import { useStore } from '@/store/use-store';

type Step = 1 | 2 | 3;

export default function OnboardingScreen() {
  const { colors } = md3;
  const setDisplayName    = useStore((s) => s.setDisplayName);
  const setPhotoUrl       = useStore((s) => s.setPhotoUrl);
  const markProfileCreated = useStore((s) => s.markProfileCreated);
  const session = useStore((s) => s.session);

  const [step, setStep] = useState<Step>(1);

  // ① 닉네임
  const emailPrefix = session?.user?.email?.split('@')[0] ?? '';
  const [name, setName]   = useState(emailPrefix);
  const [nameError, setNameError] = useState<string | null>(null);

  // ② 사진 (optional)
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // ③ 키·체중 (optional) — text entry, numeric
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');

  const [submitting, setSubmitting] = useState(false);

  function validateName(): string | null {
    const t = name.trim();
    if (!t) return '닉네임을 입력해 주세요.';
    if (t.length < 2) return '닉네임은 2자 이상이어야 합니다.';
    if (t.length > 20) return '닉네임은 20자 이하로 설정해 주세요.';
    return null;
  }

  function nextFromName() {
    const err = validateName();
    if (err) { setNameError(err); return; }
    Keyboard.dismiss();
    setStep(2);
  }

  // 사진 위치 조정 step between pick and preview (components/avatar-crop)
  const [cropSrc, setCropSrc] = useState<CropSource | null>(null);

  async function pickPhoto() {
    // NO allowsEditing (perf fix, same as 개인 정보): allowsEditing=true
    // forces the legacy UIImagePickerController (~4s present); without it
    // PHPicker presents fast, permissionless. Framing happens in our own
    // 사진 위치 조정 step (crop restoration, owner veto 2026-07-14).
    // Guarded: presentation failure surfaces instead of silently rejecting.
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.8,
      });
      if (!res.canceled && res.assets[0]) {
        const a = res.assets[0];
        setCropSrc({ uri: a.uri, width: a.width, height: a.height });
      }
    } catch {
      Alert.alert('사진 선택 실패', '사진 선택 화면을 열지 못했어요. 다시 시도해 주세요.');
    }
  }

  const h = Number(heightCm), w = Number(weightKg);
  const heightValid = heightCm.trim() === '' || (h >= 100 && h <= 250);
  const weightValid = weightKg.trim() === '' || (w >= 20 && w <= 300);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    const nickname = name.trim();
    try {
      // Atomic create/update — first PATCH creates the profile row
      await updateProfile({
        nickname,
        weight_kg: weightKg.trim() !== '' && weightValid ? w : null,
        height_cm: heightCm.trim() !== '' && heightValid ? h : null,
      });

      // Photo — best-effort after the row exists; failure never blocks the gate
      if (photoUri) {
        try {
          const url = await uploadAvatar(photoUri);
          await updateProfile({ nickname, avatar_url: url });
          // Write-through so 홈/개인 정보 paint the photo immediately —
          // no profile re-fetch happens between gate release and next hydrate
          setPhotoUrl(url);
        } catch { /* avatar can be retried from 개인 정보 later */ }
      }

      // kcal store: the first PATCH above IS server truth now (S2) — a
      // forced re-hydrate pulls it into the per-user cache (saved lights
      // when weight landed); no second PATCH, nothing can block the gate
      await useLocalProfile.getState().hydrate(true).catch(() => {});

      setDisplayName(nickname);
      markProfileCreated(); // guard releases to (tabs)
      router.replace('/(tabs)');
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 409) {
        setStep(1);
        setNameError('이미 사용 중인 닉네임이에요.');
      } else {
        setNameError(e instanceof Error ? e.message : '저장에 실패했어요. 다시 시도해 주세요.');
        setStep(1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        {/* Step dots + back (steps 2-3 only — step 1 is the hard gate) */}
        <View style={styles.topBar}>
          {step > 1 ? (
            <Pressable onPress={() => setStep((step - 1) as Step)} hitSlop={12} style={styles.backBtn}>
              <Icon name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
          ) : <View style={styles.backBtn} />}
          <View style={styles.dots}>
            {[1, 2, 3].map(d => (
              <View key={d} style={[styles.dot, { backgroundColor: d === step ? colors.primary : colors.surfaceContainerHigh }]} />
            ))}
          </View>
          <View style={styles.backBtn} />
        </View>

        {step === 1 && (
          <View style={styles.content}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
              <Icon name="person" size={36} color={colors.onPrimaryContainer} />
            </View>
            <View style={styles.heading}>
              <Text variant="headlineLg" weight="700" center>환영합니다! 👋</Text>
              <Text variant="bodyMd" color="onSurfaceVariant" center>
                앱에서 사용할 닉네임을 설정해 주세요.{'\n'}나중에 언제든지 변경할 수 있습니다.
              </Text>
            </View>
            <Input
              label="닉네임"
              value={name}
              onChangeText={(v) => { setName(v); setNameError(null); }}
              placeholder="예: 달리는 춘식이"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={nextFromName}
              error={nameError}
            />
            <Text variant="labelSm" color="onSurfaceVariant" style={styles.hint}>
              {name.trim().length} / 20자
            </Text>
          </View>
        )}

        {step === 2 && (
          <View style={styles.content}>
            <View style={styles.heading}>
              <Text variant="headlineLg" weight="700" center>프로필 사진</Text>
              <Text variant="bodyMd" color="onSurfaceVariant" center>
                다른 러너에게 보여질 사진이에요. (선택)
              </Text>
            </View>
            <Pressable onPress={pickPhoto} style={styles.photoWrap}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoEmpty, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.surfaceContainerHigh }]}>
                  <Icon name="camera" size={30} color={colors.onSurfaceVariant} />
                </View>
              )}
              <Text variant="labelSm" color="primary" style={{ textAlign: 'center', marginTop: 12 }}>
                {photoUri ? '다시 선택' : '사진 선택'}
              </Text>
            </Pressable>
          </View>
        )}

        {step === 3 && (
          <View style={styles.content}>
            <View style={styles.heading}>
              <Text variant="headlineLg" weight="700" center>키 · 체중</Text>
              <Text variant="bodyMd" color="onSurfaceVariant" center>
                키·체중을 입력하면 칼로리 추정과 러닝 분석이{'\n'}더 정확해져요 · 프로필에 공개되지 않아요
              </Text>
            </View>
            <Input
              label="키 (cm)"
              value={heightCm}
              onChangeText={(v) => setHeightCm(v.replace(/[^0-9.]/g, ''))}
              placeholder="168"
              keyboardType="decimal-pad"
              error={heightValid ? null : '100~250cm 범위로 입력해 주세요'}
            />
            <Input
              label="체중 (kg)"
              value={weightKg}
              onChangeText={(v) => setWeightKg(v.replace(/[^0-9.]/g, ''))}
              placeholder="62"
              keyboardType="decimal-pad"
              error={weightValid ? null : '20~300kg 범위로 입력해 주세요'}
            />
          </View>
        )}

        <View style={styles.footer}>
          {step === 1 && <Button label="다음" onPress={nextFromName} large />}
          {step === 2 && (
            <>
              <Button label="다음" onPress={() => setStep(3)} large />
              {!photoUri && (
                <Pressable onPress={() => setStep(3)} hitSlop={8} style={styles.skipBtn}>
                  <Text variant="labelSm" color="onSurfaceVariant">다음에 하기</Text>
                </Pressable>
              )}
            </>
          )}
          {step === 3 && (
            <>
              {submitting ? (
                <View style={styles.submittingWrap}><ActivityIndicator color={colors.primary} /></View>
              ) : (
                <Button
                  label="FreshRun 시작하기"
                  onPress={submit}
                  large
                  disabled={!heightValid || !weightValid}
                />
              )}
              {heightCm.trim() === '' && weightKg.trim() === '' && !submitting && (
                <Pressable onPress={submit} hitSlop={8} style={styles.skipBtn}>
                  <Text variant="labelSm" color="onSurfaceVariant">다음에 하기</Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* 사진 위치 조정 — cropped square becomes the preview + upload source */}
        <AvatarCrop
          src={cropSrc}
          onClose={() => setCropSrc(null)}
          onConfirm={(uri) => { setCropSrc(null); setPhotoUri(uri); }}
          onRetake={pickPhoto}
        />
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  topBar:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  dots:    { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 7 },
  dot:     { width: 8, height: 8, borderRadius: 4 },

  content:    { flex: 1, paddingHorizontal: 24, paddingTop: 32, gap: 24 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  heading:    { gap: 10 },
  hint:       { textAlign: 'right' },

  photoWrap:  { alignSelf: 'center', alignItems: 'center' },
  photo:      { width: 132, height: 132, borderRadius: 66 },
  photoEmpty: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },

  footer:        { paddingHorizontal: 24, paddingBottom: 16, gap: 4 },
  skipBtn:       { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  submittingWrap:{ height: 54, alignItems: 'center', justifyContent: 'center' },
});
