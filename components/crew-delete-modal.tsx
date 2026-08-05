/**
 * 크루 삭제(해체) 확인 모달 — extracted from crew-edit so BOTH surfaces reuse
 * ONE modal (crew-edit's 위험 구역 danger card + crew-admin's owner 크루 해체하기
 * slot). Honest consequences: member count, cascade (공지·챌린지·참석), and the
 * survival note (크루원들의 러닝 기록은 남아요).
 *
 * The 양도 alternative lives HERE (owner ruling 2026-07-13): an owner who wants
 * OUT but not to destroy the crew needs to find 양도 exactly when they're
 * staring at the 해체 modal — a tap-through to 크루원 관리 (where 크루장 양도
 * lives). This is where the Tier 0 "양도 먼저" guidance moved to.
 */
import { router } from 'expo-router';
import React, { useState } from 'react';
import { errorMessage } from '@/lib/error-copy';
import { t, tfIn, getLang } from '@/lib/i18n';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { deleteCrew } from '@/lib/crews-api';
import { radius as R, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

export function CrewDeleteModal({ visible, crewId, crewName, memberCount, onClose }: {
  visible: boolean;
  crewId: string;
  crewName: string;
  memberCount: number;
  onClose: () => void;
}) {
  const C = useTokens();
  const st = useStyles(makeSt);
  const [deleting, setDeleting] = useState(false);

  async function doDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteCrew(crewId);
      onClose();
      // The crew (and this stack's screens for it) no longer exist
      router.dismissAll?.();
      router.replace('/(tabs)/community' as never);
    } catch (e: unknown) {
      setDeleting(false);
      Alert.alert(t('crw.deleteFail'), errorMessage(e));
    }
  }

  function goTransfer() {
    if (deleting) return;
    onClose();
    router.push({ pathname: '/(community)/crew-members' as never, params: { crewId } });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !deleting && onClose()}>
      <View style={st.root}>
        <Pressable style={st.backdrop} onPress={() => !deleting && onClose()} />
        <View style={st.card}>
          <View style={st.iconWrap}>
            <Icon name="trash-outline" size={26} color={C.danger} />
          </View>
          <Text style={st.title}>{t('crw.disbandAsk')}</Text>
          <Text style={st.body}>
            <Text style={{ fontWeight: '700', color: C.text }}>{crewName}</Text>
            {tfIn(getLang(), 'crw.disbandBody', { n: memberCount })}
          </Text>

          {/* 양도 alternative — for an owner who wants out but not to destroy it */}
          <Pressable onPress={goTransfer} disabled={deleting} style={({ pressed }) => [st.transferRow, pressed && { opacity: 0.7 }]}>
            <Icon name="swap-horizontal-outline" size={16} color={C.accentGrn} />
            <Text style={st.transferTxt}>{t('crw.transferHint')}</Text>
            <Icon name="chevron-forward" size={14} color={C.faint} />
          </Pressable>

          <Pressable onPress={doDelete} disabled={deleting} style={st.deleteBtn}>
            {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.deleteTxt}>{t('crw.disbandGo')}</Text>}
          </Pressable>
          <Pressable onPress={() => !deleting && onClose()} style={st.cancelBtn}>
            <Text style={st.cancelTxt}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  card:     { width: '100%', backgroundColor: C.surface, borderRadius: 22, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 18 },
  iconWrap: { alignSelf: 'center', width: 54, height: 54, borderRadius: R.pill, backgroundColor: C.danger + '1A', alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 19, fontWeight: '700', color: C.text, letterSpacing: -0.5, textAlign: 'center', marginTop: 16 },
  body:     { fontSize: 13.5, lineHeight: 20, color: C.sub, textAlign: 'center', letterSpacing: -0.3, marginTop: 8, marginHorizontal: 8 },

  transferRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '33', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, marginTop: 16 },
  transferTxt: { flex: 1, fontSize: 12.5, fontWeight: '600', color: C.accentGrn, letterSpacing: -0.2, lineHeight: 17 },

  deleteBtn: { height: 52, borderRadius: 14, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  deleteTxt: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  cancelBtn: { height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: C.sub, letterSpacing: -0.3 },
});
