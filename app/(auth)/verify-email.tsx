import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { t, useT } from '@/lib/i18n';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Text } from '@/components/ui';
import { useTokens } from '@/hooks/use-tokens';
import { supabase } from '@/lib/supabase';

/** Email-confirmation parking screen (gates on 지연's SMTP + Confirm-email
    flip). Two doors in: sign-in bounced with email_not_confirmed
    (reason=login) and post-signup with no session yet (reason=signup) —
    same screen, reason picks the heading. The user re-enters via sign-in
    after tapping the mail link; no session ever exists here. */
export default function VerifyEmailScreen() {
  const T = useT();
  const C = useTokens();
  const { email, reason } = useLocalSearchParams<{ email: string; reason: string }>();

  const [resending, setResending] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sent' | 'failed'>('idle');

  async function handleResend() {
    if (!email || resending) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setResending(false);
    setResendState(error ? 'failed' : 'sent');
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Icon name="chevron-back" size={24} color={C.text} />
        </Pressable>
      </View>

      <View style={styles.content}>
        {/* Heading */}
        <View style={styles.heading}>
          <Text variant="headlineLg" weight="700">
            {T(reason === 'login' ? 'auth.verifyNeedTitle' : 'auth.verifyCheckTitle')}
          </Text>
          {email ? (
            <Text variant="bodyMd" weight="600">{email}</Text>
          ) : null}
          <Text variant="bodyMd" color="sub">
            {T('auth.verifyBody')}
          </Text>
        </View>

        {/* Resend */}
        <Button
          label={T('auth.resend')}
          onPress={handleResend}
          loading={resending}
          disabled={!email}
          large
        />
        {resendState !== 'idle' && (
          <Text variant="bodyMd" color="sub" style={styles.resendNote}>
            {resendState === 'sent' ? t('auth.resendSent') : t('auth.resendFail')}
          </Text>
        )}

        {/* Back to sign-in */}
        <Pressable onPress={() => router.replace('/(auth)/sign-in')} style={styles.switchLink}>
          <Text variant="bodyMd" color="accentGrn" weight="600">
            {T('auth.otherAccount')}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:       { flex: 1 },
  topBar:     { paddingHorizontal: 12, paddingVertical: 8 },
  backBtn:    { padding: 4, alignSelf: 'flex-start' },
  content:    { flex: 1, paddingHorizontal: 24, paddingTop: 16, gap: 24 },
  heading:    { gap: 6 },
  resendNote: { textAlign: 'center', marginTop: -12 },
  switchLink: { alignItems: 'center', paddingVertical: 8 },
});
