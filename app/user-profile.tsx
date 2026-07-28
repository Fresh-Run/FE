/**
 * 타인 프로필 (canvas: FrOtherProfile). Reached from any tappable name via
 * lib/profile-nav openProfile() — self lands on 내 프로필 instead.
 *
 * Approved deltas (2026-07-08, no-backend fields): location line + card
 * tags omitted; 💬 omitted (graduates with the thread slice, both
 * surfaces); visibility caption omitted (server sends null on others'
 * rows — 지연 ask logged); 활동 = public_run_count with the 공개 N개
 * framing explaining the number.
 */
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { RunCard } from '@/components/run-card';
import { Icon } from '@/components/ui';
import { ApiError, apiFetch, apiRequest } from '@/lib/api';
import { blockUser } from '@/lib/blocks-api';
import { REPORT_REASONS, reportUser, type ReportReason } from '@/lib/reports-api';
import { radius as R, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useUserProfile, type UserRun } from '@/hooks/use-user-profile';
import { usePendingFollows } from '@/store/pending-follows';
import { useSettings } from '@/store/use-settings';
import { useStore } from '@/store/use-store';
import { t, tf, useT } from '@/lib/i18n';

// Run card — other-user variant: ♥ is a real toggle (my_kudos), no 💬,
// no visibility caption (approved deltas). Card tap → 러닝 포스트 (R3',
// BE 4cd5685 opened non-owner run detail) with entry-payload seeds.

export default function UserProfileScreen() {
  const T = useT(); // reactive anchor — stack-mounted beneath 설정
  const C = useTokens();
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { uid, nickname: nickParam } = useLocalSearchParams<{ uid: string; nickname?: string }>();
  const units = useSettings(s => s.settings.units);
  const { profile, identity, runs, loading, error, refetch } = useUserProfile(uid ?? null);

  // Optimistic overlays — follow state + per-run kudos.
  // v2 (팔로우 승인제): the profile payload carries no pending marker
  // (지연 ask: is_requested), so 요청됨 persists via the device-local
  // pending-follows cache (owner ruling 2026-07-13) and the server's 409
  // follow_request_pending stays the fallback corrector.
  const [followOverlay, setFollowOverlay] = useState<'following' | 'requested' | 'none' | null>(null);
  const [kudosOverlay, setKudosOverlay]   = useState<Record<string, { on: boolean; delta: number }>>({});
  const pendingIds = usePendingFollows(st_ => st_.ids);
  useEffect(() => { usePendingFollows.getState().hydrate(); }, []);

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  // approve-detection: server says following → any cached pending is stale
  useEffect(() => {
    if (profile?.is_following && pendingIds[profile.user_id]) {
      usePendingFollows.getState().remove(profile.user_id);
    }
  }, [profile?.is_following, profile?.user_id, pendingIds]);

  const followState: 'following' | 'requested' | 'none' =
    followOverlay
    ?? (profile?.is_following ? 'following'
      : profile && pendingIds[profile.user_id] ? 'requested'
      : 'none');

  // polyline_thumb slice — feed viewability pattern (stable refs, 25%)
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 25 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: { key: string }[] }) => {
      setLiveIds(new Set(viewableItems.map(v => v.key)));
    },
  ).current;

  function toggleFollow() {
    if (!profile) return;
    const prev = followState;
    if (prev === 'requested') {
      // 요청됨 → 취소 (DELETE /follow-request, idempotent-204 probed)
      setFollowOverlay('none');
      usePendingFollows.getState().remove(profile.user_id);
      apiFetch<void>(`/api/users/${profile.user_id}/follow-request`, { method: 'DELETE' })
        .catch(() => {
          setFollowOverlay(prev);
          usePendingFollows.getState().add(profile.user_id);
          Alert.alert(t('up.fail'), t('up.cancelReqFail'));
        });
      return;
    }
    if (prev === 'following') {
      setFollowOverlay('none');
      apiFetch<void>(`/api/users/${profile.user_id}/follow`, { method: 'DELETE' })
        .then(() => refetch())
        .catch(() => {
          setFollowOverlay(prev);
          Alert.alert(t('up.fail'), t('up.followFail'));
        });
      return;
    }
    // 팔로우: 200/204 = followed (open account) · 202 = 승인 대기 (approval
    // account, probed) · 409 follow_request_pending = already pending
    setFollowOverlay('following');
    apiRequest<void>(`/api/users/${profile.user_id}/follow`, { method: 'POST' })
      .then(({ status }) => {
        if (status === 202) {
          setFollowOverlay('requested');
          usePendingFollows.getState().add(profile.user_id); // survives re-entry
          return;
        }
        // 200/204 = followed instantly — any cached pending was stale
        usePendingFollows.getState().remove(profile.user_id);
        refetch(); // follower count + followers-only/locked runs change
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'follow_request_pending') {
          setFollowOverlay('requested'); // server knew better — adopt + persist
          usePendingFollows.getState().add(profile.user_id);
          return;
        }
        setFollowOverlay(prev);
        Alert.alert(t('up.fail'), t('up.followFail'));
      });
  }

  // v1.5 피드 설정 강제 — HIDE-first (owner bar): affordances must not be
  // offered on disabled targets. No side-effect-free discovery exists
  // server-side (probed: enforcement sits BEHIND existence checks — no-op
  // DELETEs return 204/404 with flags on or off), so until 지연's payload
  // flags land (URGENT ask), the first 403 is the detector and conversion
  // is SILENT: all hearts flip to count-only, no message — never explain,
  // just don't offer. State dies with the screen; the 403 catch stays
  // permanently as the race safety net behind her future pre-render flags.
  const [likesOff403, setLikesOff403] = useState(false);
  // pre-render seed (her flags): false OR null (locked) = no affordances;
  // absent (stale payload) = show — the 403 net stays underneath for races
  const likesOff = likesOff403
    || (profile != null && (profile.allow_likes === false || profile.allow_likes === null));
  function toggleKudos(run: UserRun) {
    if (likesOff) return;
    const cur = kudosOverlay[run.run_id]?.on ?? run.my_kudos;
    const next = !cur;
    setKudosOverlay(p => ({ ...p, [run.run_id]: { on: next, delta: (next ? 1 : 0) - (run.my_kudos ? 1 : 0) } }));
    apiFetch<void>(`/api/runs/${run.run_id}/kudos`, { method: next ? 'POST' : 'DELETE' })
      .catch((e: unknown) => {
        setKudosOverlay(p => ({ ...p, [run.run_id]: { on: run.my_kudos, delta: 0 } }));
        if (e instanceof ApiError && e.code === 'likes_disabled') {
          setLikesOff403(true); // silent race net — flags said on, server said off
        }
      });
  }

  const title = profile?.nickname ?? nickParam ?? T('up.profileFallback');

  // ⋯ overflow — keyed off the ROUTE uid, not the fetched payload: self never
  // lands on this screen by construction (openProfile routes my uid to 내
  // 프로필), so any uid here is presumptively not mine. FAIL OPEN: unknown
  // identity (session not hydrated) still shows the ⋯ — its only job is
  // cosmetic self-hiding; the server enforces self-block (400, probed).
  // Gating on `profile` was the on-device bug (2026-07-14): the cached-
  // identity loading view + error/hung fetches kept profile null → the ⋯
  // never mounted. Block must not require a loaded payload — a profile that
  // errors must still be blockable. 차단 후 프로필은 나에게 404 → back out.
  const myId = useStore(s => s.session?.user.id);
  const isSelf = !!myId && !!uid && uid === myId;
  const [menuOpen, setMenuOpen] = useState(false);
  // 신고 flow lives INSIDE the same sheet (menu → reason picker). Report ≠
  // block — independent rows. UX RULE (hers, law): 204 AND 404 both render
  // 신고가 접수되었어요 — the reporter never learns target state.
  const [sheetView, setSheetView] = useState<'menu' | 'report'>('menu');
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDetail, setReportDetail] = useState('');
  const [reportBusy, setReportBusy] = useState(false);

  function closeSheet() {
    setMenuOpen(false);
    setSheetView('menu'); setReportReason(null); setReportDetail(''); setReportBusy(false);
  }

  function submitReport() {
    if (!uid || !reportReason || reportBusy) return;
    setReportBusy(true);
    reportUser(uid, reportReason, reportDetail)
      .then(() => {
        closeSheet();
        // no toast primitive in the app — Alert is the house pattern
        Alert.alert(t('up.reported'), t('up.reportedSub'));
      })
      .catch((e: unknown) => {
        setReportBusy(false);
        Alert.alert(t('up.reportFail'), e instanceof Error ? e.message : t('auth.tryLater'));
      });
  }

  function confirmBlock() {
    if (!uid) return;
    closeSheet();
    const who = profile?.nickname ?? nickParam ?? t('up.thisUser');
    Alert.alert(
      tf('up.blockAsk', { name: who }),
      t('up.blockSub'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('up.block'), style: 'destructive',
          onPress: () => {
            blockUser(uid)
              .then(() => router.back()) // profile now 404s to me — bounce out
              .catch((e: unknown) => Alert.alert(t('up.blockFail'), e instanceof Error ? e.message : t('auth.tryLater')));
          },
        },
      ],
    );
  }

  const header = profile && (
    <View>
      {/* Identity — border ring (own profile keeps the accent ring) */}
      <View style={st.identity}>
        <Avatar name={profile.nickname} size={76} photoUrl={profile.avatar_url} ring={C.border} initialsRatio={0.38} upper />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={st.name} numberOfLines={1}>{profile.nickname}</Text>
          {profile.bio ? <Text style={st.bioTxt} numberOfLines={1}>{profile.bio}</Text> : null}
        </View>
      </View>

      {/* Counts — 팔로잉/팔로워 → that user's follow lists */}
      <View style={st.countsRow}>
        {([
          [profile.following_count, T('fl.tabFollowing'), 'following'],
          [profile.follower_count,  T('fl.tabFollowers'), 'followers'],
          [profile.public_run_count, T('pf.activity'),  null],
        ] as [number, string, string | null][]).map(([n, label, tabParam]) => (
          <Pressable
            key={label}
            disabled={!tabParam}
            onPress={() => router.push({ pathname: '/follow-list' as any, params: { tab: tabParam!, uid: profile.user_id, name: profile.nickname } })}
            style={st.countCell}
          >
            <Text style={st.countNum}>{n}</Text>
            <Text style={st.countLabel}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Follow-state button (canvas: replaces edit/share) */}
      <View style={{ paddingHorizontal: S.gutter, paddingTop: 14 }}>
        <Pressable
          onPress={toggleFollow}
          style={({ pressed }) => [
            st.followBtn,
            followState !== 'none' ? st.followBtnOutlined : st.followBtnFilled,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={followState !== 'none' ? st.followTxtOutlined : st.followTxtFilled}>
            {followState === 'following' ? T('fr.following') : followState === 'requested' ? T('up.requestedCancel') : T('fr.follow')}
          </Text>
        </Pressable>
      </View>

      {!profile?.locked && (
        <View style={st.sectionHead}>
          <Text style={st.sectionTitle}>{T('up.postedRuns')}</Text>
          <Text style={st.sectionCount}>{tf('up.publicN', { n: runs.length })}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.appBarBtn}>
          <Icon name="chevron-back" size={22} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle} numberOfLines={1}>{title}</Text>
        {!isSelf ? (
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={12} style={st.appBarBtn}>
            <Icon name="ellipsis-horizontal" size={20} color={C.text} />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {loading ? (
        identity ? (
          /* #8 render split: cached identity paints the header instantly
             (lock-served fields only — leak-free); the spinner confines to
             the body below. Counts/CTA/runs always arrive fresh. */
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: S.gutter, paddingTop: 20 }}>
              <Avatar name={identity.nickname} size={76} photoUrl={identity.avatar_url} ring={C.border} initialsRatio={0.38} upper />
              <Text style={st.name} numberOfLines={1}>{identity.nickname}</Text>
            </View>
            <View style={[st.centered, { paddingTop: 60 }]}>
              <ActivityIndicator size="large" color={C.accent} />
            </View>
          </View>
        ) : (
          <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
        )
      ) : error || !profile ? (
        <View style={st.centered}>
          <Icon name="warning-outline" size={36} color={C.faint} />
          <Text style={st.stateTxt}>{error ?? T('pf.loadFail')}</Text>
          <Pressable onPress={refetch} style={st.retryBtn}><Text style={st.retryTxt}>{T('common.retry')}</Text></Pressable>
        </View>
      ) : (
        <FlatList
          data={runs}
          keyExtractor={r => r.run_id}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
          ListHeaderComponent={header}
          renderItem={({ item }) => {
            const ov = kudosOverlay[item.run_id];
            const shown: UserRun = ov
              ? { ...item, my_kudos: ov.on, kudos_count: item.kudos_count + ov.delta }
              : item;
            return (
              <View style={{ paddingHorizontal: S.gutter }}>
                <RunCard
                  run={shown}
                  units={units}
                  mapLive={liveIds.has(item.run_id)}
                  onKudos={() => toggleKudos(item)}
                  kudosOff={likesOff}
                  // Own rows keep no tap here (내 프로필/기록 → activity is
                  // the own-run analysis path); others → 러닝 포스트
                  onOpen={!shown.is_mine ? () => router.push({
                    pathname: '/run-post' as never,
                    params: {
                      runId: shown.run_id,
                      nickname: shown.nickname,
                      avatarUrl: shown.avatar_url ?? '',
                      myKudos: shown.my_kudos ? '1' : '0',
                      kudosCount: String(shown.kudos_count),
                    },
                  }) : undefined}
                />
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
          ListEmptyComponent={profile.locked ? (
            // 비공개 프로필 v1 (⑪, canvas locked state): identity + counts
            // stay above; the lock box replaces runs. 팔로우 unlocks —
            // refetch returns locked:false + the runs per server truth.
            <View style={[st.lockBox]}>
              <View style={st.lockCircle}>
                <Icon name="lock-closed-outline" size={24} color={C.faint} />
              </View>
              <Text style={st.lockTitle}>{T('up.lockTitle')}</Text>
              <Text style={st.lockSub}>
                {tf('up.lockSub', { name: profile.nickname })}
              </Text>
            </View>
          ) : (
            <View style={st.centered}>
              <Icon name="walk-outline" size={36} color={C.faint} />
              <Text style={st.stateTxt}>{T('up.noPublicRuns')}</Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 36 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ⋯ overflow sheet (app idiom: crew-members). 신고하기 (non-destructive,
          above) + 차단하기 (destructive) — independent affordances. The report
          flow swaps the sheet content to the reason picker (v1 user-only;
          run/comment target_type wiring point = lib/reports-api). */}
      <Modal visible={menuOpen} transparent animationType="slide" onRequestClose={closeSheet}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={st.sheetOverlay} onPress={closeSheet}>
          <Pressable style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} onPress={() => {}}>
            <View style={st.sheetHandleRow}><View style={st.sheetHandle} /></View>
            {sheetView === 'menu' ? (
              <>
                <Pressable onPress={() => setSheetView('report')} style={({ pressed }) => [st.sheetRow, pressed && { opacity: 0.7 }]}>
                  <Icon name="flag-outline" size={19} color={C.text} />
                  <Text style={st.sheetRowTxt}>{T('up.report')}</Text>
                </Pressable>
                <View style={st.sheetDivider} />
                <Pressable onPress={confirmBlock} style={({ pressed }) => [st.sheetRow, pressed && { opacity: 0.7 }]}>
                  <Icon name="ban-outline" size={19} color={C.danger} />
                  <Text style={[st.sheetRowTxt, { color: C.danger }]}>{T('up.block')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={st.sheetTitle}>{T('up.report')}</Text>
                {REPORT_REASONS.map(r => {
                  const on = reportReason === r.value;
                  return (
                    <Pressable key={r.value} onPress={() => setReportReason(r.value)} style={({ pressed }) => [st.reasonRow, pressed && { opacity: 0.7 }]}>
                      <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={19} color={on ? C.accentGrn : C.faint} />
                      <Text style={[st.sheetRowTxt, on && { fontWeight: '700' }]}>{r.label}</Text>
                    </Pressable>
                  );
                })}
                {/* detail — ALWAYS visible, optional (composer's "(선택)" idiom;
                    a 기타-only reveal would hide context for other reasons) */}
                <TextInput
                  value={reportDetail}
                  onChangeText={t => setReportDetail(t.slice(0, 500))}
                  placeholder={T('up.reportDetailPh')}
                  placeholderTextColor={C.faint}
                  multiline
                  style={st.reportInput}
                />
                <Pressable
                  onPress={submitReport}
                  disabled={!reportReason || reportBusy}
                  style={[st.reportSubmit, !reportReason && { backgroundColor: C.surfaceAlt }]}
                >
                  {reportBusy
                    ? <ActivityIndicator size="small" color={C.accentText} />
                    : <Text style={[st.reportSubmitTxt, !reportReason && { color: C.faint }]}>{T('up.reportSubmit')}</Text>}
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // ⋯ overflow sheet (mirrors crew-members)
  sheetOverlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet:          { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: S.gutter },
  sheetHandleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  sheetHandle:    { width: 38, height: 5, borderRadius: 99, backgroundColor: C.border },
  sheetRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 4 },
  sheetRowTxt:    { fontSize: 15, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  sheetDivider:   { height: 1, backgroundColor: C.border },
  sheetTitle:     { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4, paddingVertical: 10, textAlign: 'center' },
  reasonRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  reportInput:    { minHeight: 64, maxHeight: 120, borderWidth: 1, borderColor: C.border, borderRadius: 12, backgroundColor: C.surfaceAlt, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text, letterSpacing: -0.2, textAlignVertical: 'top', marginTop: 6 },
  reportSubmit:   { height: 50, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  reportSubmitTxt:{ fontSize: 15, fontWeight: '700', color: C.accentText, letterSpacing: -0.3 },

  // 비공개 프로필 lock box (canvas: dashed rounded, lock circle, follow hint)
  lockBox:    { marginHorizontal: S.gutter, marginTop: 18, alignItems: 'center', gap: 13, backgroundColor: C.surfaceAlt, borderWidth: 1, borderStyle: 'dashed', borderColor: C.border, borderRadius: 20, paddingVertical: 36, paddingHorizontal: 24 },
  lockCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  lockTitle:  { fontSize: 15.5, fontWeight: '700', color: C.text, letterSpacing: -0.4 },
  lockSub:    { fontSize: 13, lineHeight: 20, color: C.sub, letterSpacing: -0.2, textAlign: 'center', maxWidth: 240, marginTop: -6 },

  appBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.md, paddingVertical: 10 },
  appBarBtn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },

  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: S.gutter, paddingTop: 20 },
  name:     { fontSize: 22, fontWeight: '700', letterSpacing: -0.6, color: C.text },
  bioTxt:   { fontSize: 13, color: C.sub, letterSpacing: -0.2, marginTop: 4 },

  countsRow:  { flexDirection: 'row', gap: 22, paddingHorizontal: S.gutter, paddingTop: 16 },
  countCell:  { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  countNum:   { fontSize: 16, fontWeight: '800', color: C.text, letterSpacing: -0.3 },
  countLabel: { fontSize: 12.5, color: C.faint, letterSpacing: -0.2 },

  followBtn:         { height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  followBtnFilled:   { backgroundColor: C.accent, shadowColor: C.accent, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  followBtnOutlined: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  followTxtFilled:   { fontSize: 14, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },
  followTxtOutlined: { fontSize: 14, fontWeight: '700', color: C.sub, letterSpacing: -0.2 },

  sectionHead:  { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: S.gutter, paddingTop: 24, paddingBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: C.text },
  sectionCount: { fontSize: 12.5, color: C.faint, letterSpacing: -0.2 },



  centered: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  stateTxt: { fontSize: 14, fontWeight: '600', color: C.faint, letterSpacing: -0.2 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: R.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  retryTxt: { fontSize: 14, fontWeight: '700', color: C.text },
});
