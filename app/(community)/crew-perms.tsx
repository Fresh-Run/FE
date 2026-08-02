/**
 * 운영진 권한 설정 — per-admin permission set (canvas FrCrewPerms,
 * community-screen.jsx; server v2 BE 28a5c25, guide §207). Reached from
 * 크루원 screen's per-member sheet (권한 설정 row, admin targets only —
 * member 대상은 서버 422라 문 자체가 없음).
 *
 * Canvas parity: canvas draws 7 keys — invite/crewRun are 범위 밖
 * (CREW_PERMISSIONS_V2_DESIGN "박제 금지"), so the 5 server keys render.
 * Layout follows the canvas: target identity card → 일반 권한 card →
 * 주의가 필요한 권한 card (danger border + 주의 chips + caution copy) →
 * sticky batch 저장 (diff-only PATCH; flash 저장됨 then pop).
 *
 * Delegation ceiling (§3, probed): toggles the viewer cannot change render
 * DISABLED-WITH-REASON, never hidden — an admin should see the shape of
 * powers that exist. owner edits all 5; a manage_admins admin cannot touch
 * the 주의 pair (owner-grant-only) nor keys they don't hold. Self-editing
 * is unreachable (the sheet never offers self), so the server's self-revoke
 * 403 has no UI door. Server 403s remain the real enforcement.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/error-copy';
import { t, tf, type StringKey } from '@/lib/i18n';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/ui';
import { Toggle } from '@/components/toggle';
import {
  getCrewMembers,
  updateMemberPermissions,
  type CrewMember,
  type CrewPermissions,
} from '@/lib/crews-api';
import { supabase } from '@/lib/supabase';
import { accentShadow, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';

// Canvas FR_PERM_DEFS, scoped to the 5 server keys (labels/descs verbatim
// where the canvas has them; edit_crew desc trimmed of 공개 범위 — that is
// owner-only 크루 정보 편집 territory the server key does cover, keep full).
const PERM_DEFS: { key: keyof CrewPermissions; label: string; desc: string; danger: boolean }[] = [
  { key: 'announcements', label: 'crw.pAnn',   desc: 'crw.pAnnD',   danger: false },
  { key: 'challenges',    label: 'crw.pCh',    desc: 'crw.pChD',    danger: false },
  { key: 'edit_crew',     label: 'crw.pEdit',  desc: 'crw.pEditD',  danger: false },
  { key: 'kick_members',  label: 'crw.pKick',  desc: 'crw.pKickD',            danger: true },
  { key: 'manage_admins', label: 'crw.pAdmin', desc: 'crw.pAdminD', danger: true },
];

// Toggle — shared house component now (components/toggle.tsx, 2026-07-23):
// the 4th local variant retired; its disabled prop moved into the shared one.

export default function CrewPermsScreen() {
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { crewId, userId } = useLocalSearchParams<{ crewId: string; userId: string }>();

  const [target, setTarget] = useState<CrewMember | null>(null);
  const [me, setMe]         = useState<CrewMember | null>(null);
  const [failed, setFailed] = useState(false);
  const [perms, setPerms]   = useState<CrewPermissions | null>(null);
  const serverPerms = useRef<CrewPermissions | null>(null);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash]   = useState(false);

  const load = useCallback(() => {
    if (!crewId || !userId) return;
    setFailed(false);
    Promise.all([supabase.auth.getUser(), getCrewMembers(crewId)])
      .then(([{ data: { user } }, members]) => {
        const t = members.find(m => m.user_id === userId) ?? null;
        setTarget(t);
        setMe(members.find(m => m.user_id === user?.id) ?? null);
        if (t?.permissions) {
          serverPerms.current = t.permissions;
          setPerms(t.permissions);
        }
      })
      .catch(() => setFailed(true));
  }, [crewId, userId]);
  useEffect(() => { load(); }, [load]);

  const iAmOwner = me?.role === 'owner';

  /** Delegation ceiling → why THIS viewer can't flip THIS key (null = can). */
  function lockReason(d: (typeof PERM_DEFS)[number]): string | null {
    if (iAmOwner) return null;
    if (d.danger) return t('crw.lockOwnerOnly');
    if (!me?.permissions?.[d.key]) return t('crw.lockDelegation');
    return null;
  }

  async function save() {
    if (!crewId || !userId || !perms || !serverPerms.current || saving) return;
    const patch: Partial<CrewPermissions> = {};
    for (const { key } of PERM_DEFS) {
      if (perms[key] !== serverPerms.current[key]) patch[key] = perms[key];
    }
    if (Object.keys(patch).length === 0) { router.back(); return; }
    setSaving(true);
    try {
      await updateMemberPermissions(crewId, userId, patch); // diff-only (§3 ceiling)
      serverPerms.current = perms;
      setFlash(true);
      setTimeout(() => router.back(), 700);
    } catch (e: unknown) {
      Alert.alert(t('runSave.saveFailTitle'), errorMessage(e));
      load(); // server truth wins back
    } finally {
      setSaving(false);
    }
  }

  const Row = ({ d }: { d: (typeof PERM_DEFS)[number] }) => {
    const reason = lockReason(d);
    return (
      <View style={st.permRow}>
        <View style={[st.permIcon, { backgroundColor: d.danger ? C.danger + '1A' : C.accentDim }]}>
          <Icon name={d.danger ? 'shield-outline' : 'checkmark'} size={17} color={d.danger ? C.danger : C.accentGrn} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={st.permLbl}>{t(d.label as StringKey)}</Text>
            {d.danger && <View style={st.cautionChip}><Text style={st.cautionChipTxt}>{t('crw.caution')}</Text></View>}
          </View>
          <Text style={st.permDesc}>{t(d.desc as StringKey)}</Text>
          {reason && <Text style={st.permLock}>{reason}</Text>}
        </View>
        <Toggle
          on={!!perms?.[d.key]}
          disabled={!!reason || saving}
          onChange={() => setPerms(p => p ? { ...p, [d.key]: !p[d.key] } : p)}
        />
      </View>
    );
  };

  const safe = PERM_DEFS.filter(d => !d.danger);
  const danger = PERM_DEFS.filter(d => d.danger);
  const notFound = failed || (target !== null && (target.role !== 'admin' || !perms));

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle}>{t('crw.permsTitle')}</Text>
        <View style={{ width: 36 }} />
      </View>

      {target === null && !failed ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : notFound ? (
        // demoted mid-flight / kicked / fetch failed — the canvas empty state
        <View style={st.centered}><Text style={st.emptyTxt}>{t('crw.adminNotFound')}</Text></View>
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: S.gutter, paddingBottom: 24 }}>
            {/* target identity (canvas card) */}
            <View style={st.idCard}>
              <Avatar name={target!.nickname} size={48} photoUrl={target!.avatar_url} ring={C.accent} initialsRatio={0.38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={st.idName} numberOfLines={1}>{target!.nickname}</Text>
                  <View style={st.adminBadge}><Text style={st.adminBadgeTxt}>{t('crw.roleAdmin')}</Text></View>
                </View>
                <Text style={st.idSub}>{tf('crw.thisChKm', { km: (target!.challenge_km ?? 0).toFixed(1) })}</Text>
              </View>
            </View>

            <Text style={st.sectionTitle}>{t('crw.permsGeneral')}</Text>
            <View style={st.permCard}>
              {safe.map((d, i) => (
                <React.Fragment key={d.key}>
                  {i > 0 && <View style={st.permDivider} />}
                  <Row d={d} />
                </React.Fragment>
              ))}
            </View>

            <Text style={[st.sectionTitle, { color: C.danger }]}>{t('crw.permsDanger')}</Text>
            <View style={[st.permCard, { borderWidth: 1.5, borderColor: C.danger + '44' }]}>
              {danger.map((d, i) => (
                <React.Fragment key={d.key}>
                  {i > 0 && <View style={st.permDivider} />}
                  <Row d={d} />
                </React.Fragment>
              ))}
            </View>
            <Text style={st.cautionCopy}>
              {t('crw.permsDangerNote')}
            </Text>
          </ScrollView>

          {/* sticky save (canvas: flash 저장됨 → pop) */}
          <View style={[st.saveBar, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <Pressable
              onPress={save}
              disabled={saving || flash}
              style={[st.saveBtn, flash ? { backgroundColor: C.surfaceAlt } : accentShadow(C.accent)]}
            >
              {saving ? (
                <ActivityIndicator size="small" color={C.accentText} />
              ) : flash ? (
                <>
                  <Icon name="checkmark" size={18} color={C.accentGrn} />
                  <Text style={[st.saveTxt, { color: C.accentGrn }]}>{t('crw.saved')}</Text>
                </>
              ) : (
                <Text style={st.saveTxt}>{t('runSave.save')}</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.gutter, paddingVertical: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  centered:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTxt:    { fontSize: 14, color: C.faint, letterSpacing: -0.2 },

  idCard: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 15 },
  idName: { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4, flexShrink: 1 },
  idSub:  { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, marginTop: 3, fontVariant: ['tabular-nums'] },
  adminBadge:    { backgroundColor: C.accentDim, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, flexShrink: 0 },
  adminBadgeTxt: { fontSize: 10, fontWeight: '800', color: C.accentGrn, letterSpacing: 0.2 },

  sectionTitle: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, color: C.faint, textTransform: 'uppercase', paddingHorizontal: 4, paddingTop: 22, paddingBottom: 4 },
  permCard:    { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  permDivider: { height: 1, backgroundColor: C.border, marginHorizontal: -16 },
  permRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  permIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  permLbl:  { fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  permDesc: { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },
  permLock: { fontSize: 11, color: C.sub, letterSpacing: -0.2, marginTop: 3, fontWeight: '600' },
  cautionChip:    { backgroundColor: C.danger + '1A', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  cautionChipTxt: { fontSize: 9.5, fontWeight: '800', color: C.danger, letterSpacing: 0.2 },
  cautionCopy: { fontSize: 12, lineHeight: 18, color: C.faint, letterSpacing: -0.2, marginTop: 9, paddingHorizontal: 4 },

  saveBar: { flexShrink: 0, paddingHorizontal: S.gutter, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  saveBtn: { height: 56, borderRadius: 16, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  saveTxt: { fontSize: 16.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },

});
