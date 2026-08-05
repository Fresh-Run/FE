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
import { t as tx, useT, tfIn, useLang } from '@/lib/i18n';
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
import { useTokens } from '@/hooks/use-tokens';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/error-copy';
import { uploadAvatar } from '@/lib/avatar-api';
import { updateProfile } from '@/lib/profile-api';
import { useLocalProfile } from '@/store/use-local-profile';
import { useStore } from '@/store/use-store';

type Step = 1 | 2 | 3;

export default function OnboardingScreen() {
  const lang = useLang(); // 8/6 back-sweep: render tfIn anchor
  const T = useT();
  const C = useTokens();
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
    if (!t) return tx('onb.nickRequired');
    if (t.length < 2) return tx('onb.nickMin');
    if (t.length > 20) return tx('onb.nickMax');
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
      Alert.alert(tx('onb.photoFailTitle'), tx('onb.photoFailBody'));
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
        setNameError(tx('onb.nickTaken'));
      } else {
        setNameError(errorMessage(e));
        setStep(1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={[styles.root, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
        {/* Step dots + back (steps 2-3 only — step 1 is the hard gate) */}
        <View style={styles.topBar}>
          {step > 1 ? (
            <Pressable onPress={() => setStep((step - 1) as Step)} hitSlop={12} style={styles.backBtn}>
              <Icon name="chevron-back" size={22} color={C.text} />
            </Pressable>
          ) : <View style={styles.backBtn} />}
          <View style={styles.dots}>
            {[1, 2, 3].map(d => (
              <View key={d} style={[styles.dot, { backgroundColor: d === step ? C.accent : C.border }]} />
            ))}
          </View>
          <View style={styles.backBtn} />
        </View>

        {step === 1 && (
          <View style={styles.content}>
            <View style={[styles.iconCircle, { backgroundColor: C.accentDim }]}>
              <Icon name="person" size={36} color={C.accentGrn} />
            </View>
            <View style={styles.heading}>
              <Text variant="headlineLg" weight="700" center>{T('onb.welcome')}</Text>
              <Text variant="bodyMd" color="sub" center>
                {T('onb.nickSub')}
              </Text>
            </View>
            <Input
              label={T('onb.nickname')}
              value={name}
              onChangeText={(v) => { setName(v); setNameError(null); }}
              placeholder={T('onb.nickPlaceholder')}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={nextFromName}
              error={nameError}
            />
            <Text variant="labelSm" color="sub" style={styles.hint}>
              {tfIn(lang, 'onb.counter20', { n: name.trim().length })}
            </Text>
          </View>
        )}

        {step === 2 && (
          <View style={styles.content}>
            <View style={styles.heading}>
              <Text variant="headlineLg" weight="700" center>{T('onb.photoTitle')}</Text>
              <Text variant="bodyMd" color="sub" center>
                {T('onb.photoSub')}
              </Text>
            </View>
            <Pressable onPress={pickPhoto} style={styles.photoWrap}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoEmpty, { backgroundColor: C.surfaceAlt, borderColor: C.border }]}>
                  <Icon name="camera" size={30} color={C.sub} />
                </View>
              )}
              <Text variant="labelSm" color="accentGrn" style={{ textAlign: 'center', marginTop: 12 }}>
                {photoUri ? T('onb.photoRepick') : T('onb.photoPick')}
              </Text>
            </Pressable>
          </View>
        )}

        {step === 3 && (
          <View style={styles.content}>
            <View style={styles.heading}>
              <Text variant="headlineLg" weight="700" center>{T('onb.body')}</Text>
              <Text variant="bodyMd" color="sub" center>
                {T('onb.bodySub')}
              </Text>
            </View>
            <Input
              label={T('onb.height')}
              value={heightCm}
              onChangeText={(v) => setHeightCm(v.replace(/[^0-9.]/g, ''))}
              placeholder="168"
              keyboardType="decimal-pad"
              error={heightValid ? null : T('onb.heightRange')}
            />
            <Input
              label={T('onb.weight')}
              value={weightKg}
              onChangeText={(v) => setWeightKg(v.replace(/[^0-9.]/g, ''))}
              placeholder="62"
              keyboardType="decimal-pad"
              error={weightValid ? null : T('onb.weightRange')}
            />
          </View>
        )}

        <View style={styles.footer}>
          {step === 1 && <Button label={T('onb.next')} onPress={nextFromName} large />}
          {step === 2 && (
            <>
              <Button label={T('onb.next')} onPress={() => setStep(3)} large />
              {!photoUri && (
                <Pressable onPress={() => setStep(3)} hitSlop={8} style={styles.skipBtn}>
                  <Text variant="labelSm" color="sub">{T('onb.later')}</Text>
                </Pressable>
              )}
            </>
          )}
          {step === 3 && (
            <>
              {submitting ? (
                <View style={styles.submittingWrap}><ActivityIndicator color={C.accent} /></View>
              ) : (
                <Button
                  label={T('onb.start')}
                  onPress={submit}
                  large
                  disabled={!heightValid || !weightValid}
                />
              )}
              {heightCm.trim() === '' && weightKg.trim() === '' && !submitting && (
                <Pressable onPress={submit} hitSlop={8} style={styles.skipBtn}>
                  <Text variant="labelSm" color="sub">{T('onb.later')}</Text>
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
