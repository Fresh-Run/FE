/**
 * 크루 채팅 v1+v1.5+v3.5 — the room (canvas: crew-chat.jsx FrCrewChat).
 * Renders the 3-type contract (guide §219, probed): text bubbles · system
 * banners (FE-assembled copy from the render key, 공지 deep-link, reactable
 * but delete-proof) · run_share frozen-snapshot cards (카톡 선례 — survive
 * the original's deletion/privating; tap re-evaluates → friendly 404).
 * Unknown future types render content as plain text or hide quietly (v2
 * guard). v3.5 (guide §220): blocked:true rows — server-gutted content/
 * identity → "가려진 메시지" placeholder BEFORE the type switch (system·
 * run_share arrive gutted too, probed); reactions tally kept, "+" hidden
 * (new reacts 404), own-chip removal still 204.
 * Share entry: composer + → own public/followers runs (private ABSENT —
 * hide-first). Transport = POLLING (guide §214: 20s focused-only + refetch
 * on focus/send).
 *
 * Honesty mechanics: optimistic send renders immediately as 전송 중; failure
 * flips to a tappable 전송 실패 · 다시 시도 row (the sacred-flow standard) —
 * a failed bubble never silently disappears. Reactions toggle optimistically
 * and the next poll corrects any drift. Deletes render the server's soft
 * state ("삭제된 메시지예요"), never a gap. Manager-delete follows the
 * server rule (본인 or 운영진; others 403) — the affordance shows only for
 * own messages, or any message when the role param says owner/admin (the
 * server still enforces on the deep path).
 *
 * Read marking: POST /read on focus and after polls that land new messages
 * while the user is IN the room — the crew-detail badge clears on return
 * (its focus-refetch).
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

import { MiniMap } from '@/components/mini-map';
import { RealMap } from '@/components/real-map';
import { Icon } from '@/components/ui';
import {
  CHAT_EMOJIS,
  CHAT_PAGE,
  deleteMessage,
  getUnread,
  listMessages,
  markRead,
  reactMessage,
  sendMessage,
  setMute,
  shareRun,
  unreactMessage,
  type ChatEmoji,
  type ChatMessage,
  type RunSharePayload,
} from '@/lib/chat-api';
import { Avatar } from '@/components/avatar';
import { errorMessage } from '@/lib/error-copy';
import { openProfile } from '@/lib/profile-nav';
import { apiFetch } from '@/lib/api';
import { distUnit, fmtDist, fmtDuration, fmtPaceIn, fmtWhen, paceUnit } from '@/lib/run-format';
import type { SavedRun } from '@/lib/runs-api';
import { supabase } from '@/lib/supabase';
import { radius as R, shadows, spacing as S, type Tokens } from '@/lib/theme';
import { useStyles, useTokens } from '@/hooks/use-tokens';
import { useSettings } from '@/store/use-settings';
import { t, tf, useLang } from '@/lib/i18n';

const POLL_MS = 20_000; // guide §214: 20~30s while the room is active

type PendingSend = { tempId: string; content: string; failed: boolean };
// pending sends ride the DATA array (newest-first, ahead of server rows) —
// header/empty components in an inverted list flip differently across RN
// versions, so nothing textual lives in them.
type ChatRow = ChatMessage | (PendingSend & { kind: 'pending' });
const isPending = (r: ChatRow): r is PendingSend & { kind: 'pending' } => 'kind' in r;

// Pressable idiom (sender tap → profile) stays local; the render is canonical.
function SenderAvatar({ name, photoUrl, onPress }: { name: string; photoUrl: string | null; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <Avatar name={name} size={30} photoUrl={photoUrl} initialsRatio={0.4} />
    </Pressable>
  );
}

export default function CrewChatScreen() {
  const C = useTokens();
  const lang = useLang(); // compiler-visible locale for the date formatters (2026-08-03 formatter-cache fix)
  const st = useStyles(makeSt);
  const insets = useSafeAreaInsets();
  const { crewId, crewName, memberCount, role } = useLocalSearchParams<{
    crewId: string; crewName?: string; memberCount?: string; role?: string;
  }>();
  // Deliberately ROLE-based, not permission-keyed: chat delete is her v2
  // carve-out (본인 or 운영진 — "not a key"; guide §207 keeps it off the set).
  const canManage = role === 'owner' || role === 'admin';
  const units = useSettings(st_ => st_.settings.units);

  const [messages, setMessages] = useState<ChatMessage[] | null>(null); // newest-first
  const [pending, setPending]   = useState<PendingSend[]>([]);
  const [draft, setDraft]       = useState('');
  const [muted, setMuted]       = useState(false);
  const [toast, setToast]       = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [sheetFor, setSheetFor]   = useState<ChatMessage | null>(null);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [shareRuns, setShareRuns] = useState<SavedRun[] | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);

  const endReachedRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMyUid(user?.id ?? null));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  }

  /** Fresh head merge — newest CHAT_PAGE re-fetched, older tail preserved. */
  const refreshHead = useCallback(async (opts?: { markReadOnNew?: boolean }) => {
    if (!crewId) return;
    try {
      const head = await listMessages(crewId);
      setMessages(prev => {
        if (!prev) return head;
        const headIds = new Set(head.map(m => m.id));
        const merged = [...head, ...prev.filter(m => !headIds.has(m.id))];
        if (opts?.markReadOnNew && head[0] && head[0].id !== prev[0]?.id) {
          markRead(crewId).catch(() => {});
        }
        return merged;
      });
    } catch { /* poll miss — next tick retries; the room keeps last data */ }
  }, [crewId]);

  // Focus lifecycle: initial load + mark-read + mute state, then the poll.
  useFocusEffect(useCallback(() => {
    if (!crewId) return;
    refreshHead();
    markRead(crewId).catch(() => {});
    getUnread(crewId).then(u => setMuted(u.muted)).catch(() => {});
    const t = setInterval(() => refreshHead({ markReadOnNew: true }), POLL_MS);
    return () => clearInterval(t);
  }, [crewId, refreshHead]));

  async function loadOlder() {
    if (!crewId || !messages || messages.length === 0 || loadingOlder || endReachedRef.current) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[messages.length - 1].created_at;
      const page = await listMessages(crewId, oldest);
      if (page.length < CHAT_PAGE) endReachedRef.current = true;
      setMessages(prev => {
        const known = new Set((prev ?? []).map(m => m.id));
        return [...(prev ?? []), ...page.filter(m => !known.has(m.id))];
      });
    } catch { /* scroll retries naturally */ } finally {
      setLoadingOlder(false);
    }
  }

  async function send(contentArg?: string, retryTempId?: string) {
    if (!crewId) return;
    const content = (contentArg ?? draft).trim();
    if (!content) return;
    const tempId = retryTempId ?? `tmp-${Date.now()}`;
    if (retryTempId) {
      setPending(p => p.map(x => x.tempId === tempId ? { ...x, failed: false } : x));
    } else {
      setPending(p => [{ tempId, content, failed: false }, ...p]);
      setDraft('');
    }
    try {
      const saved = await sendMessage(crewId, content);
      setPending(p => p.filter(x => x.tempId !== tempId));
      setMessages(prev => prev && !prev.some(m => m.id === saved.id) ? [saved, ...prev] : prev);
      markRead(crewId).catch(() => {});
    } catch {
      setPending(p => p.map(x => x.tempId === tempId ? { ...x, failed: true } : x));
    }
  }

  // ── 기록 카드 공유 (v1.5): + → own eligible runs (public·followers ONLY —
  // private runs are ABSENT from the picker, hide-first, not disabled) ──
  async function openSharePicker() {
    setSharePickerOpen(true);
    setShareRuns(null);
    try {
      const rows = await apiFetch<SavedRun[]>('/api/runs?limit=20');
      setShareRuns(rows.filter(r => r.visibility !== 'private'));
    } catch {
      setShareRuns([]);
    }
  }

  async function shareRunToChat(runId: string) {
    if (!crewId || sharingId) return;
    setSharingId(runId);
    try {
      const msg = await shareRun(crewId, runId); // caption = the follow-up text people type anyway
      setMessages(prev => prev && !prev.some(m => m.id === msg.id) ? [msg, ...prev] : prev);
      setSharePickerOpen(false);
    } catch (e: unknown) {
      Alert.alert(t('chat.shareFail'), errorMessage(e));
    } finally {
      setSharingId(null);
    }
  }

  async function toggleReact(m: ChatMessage, emoji: ChatEmoji) {
    if (!crewId) return;
    setPickerFor(null);
    const mine = m.my_reactions.includes(emoji);
    // optimistic — the next poll corrects any drift
    setMessages(prev => prev?.map(x => {
      if (x.id !== m.id) return x;
      const count = Math.max(0, (x.reactions[emoji] ?? 0) + (mine ? -1 : 1));
      const reactions = { ...x.reactions, [emoji]: count };
      if (count === 0) delete reactions[emoji];
      return {
        ...x,
        reactions,
        my_reactions: mine ? x.my_reactions.filter(e => e !== emoji) : [...x.my_reactions, emoji],
      };
    }) ?? null);
    try {
      await (mine ? unreactMessage(crewId, m.id, emoji) : reactMessage(crewId, m.id, emoji));
    } catch {
      refreshHead(); // server truth wins back
    }
  }

  function confirmDelete(m: ChatMessage) {
    setSheetFor(null);
    Alert.alert(t('chat.delAsk'), t('chat.delSub'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'), style: 'destructive',
        onPress: async () => {
          try {
            await deleteMessage(crewId!, m.id);
            setMessages(prev => prev?.map(x => x.id === m.id ? { ...x, deleted: true, content: null } : x) ?? null);
          } catch (e: unknown) {
            Alert.alert(t('annd.delFailT'), errorMessage(e));
          }
        },
      },
    ]);
  }

  async function toggleMute() {
    if (!crewId) return;
    const next = !muted;
    setMuted(next);
    try {
      await setMute(crewId, next);
      showToast(next ? t('chat.mutedOn') : t('chat.mutedOff'));
    } catch {
      setMuted(!next);
      showToast(t('chat.changeFail'));
    }
  }

  function ReactionChips({ m }: { m: ChatMessage }) {
    const entries = Object.entries(m.reactions).filter(([, n]) => n > 0);
    if (m.deleted) return null;
    // v3.5: blocked rows keep the tally (count-distortion rule) but lose the
    // "+" affordance — new reacts are a server 404 (hide-first precedent).
    // Existing chips stay tappable: removing my own reaction is 204 (probed);
    // a doomed add quietly reverts via toggleReact's refreshHead.
    if (m.blocked && entries.length === 0) return null;
    return (
      <View style={st.reactRow}>
        {entries.map(([e, n]) => {
          const mine = m.my_reactions.includes(e);
          return (
            <Pressable
              key={e}
              onPress={() => toggleReact(m, e as ChatEmoji)}
              style={[st.reactChip, mine && st.reactChipMine]}
              hitSlop={4}
            >
              <Text style={st.reactChipTxt}>{e} {n}</Text>
            </Pressable>
          );
        })}
        {!m.blocked && (
          <Pressable
            onPress={() => setPickerFor(pickerFor === m.id ? null : m.id)}
            style={st.reactAdd}
            hitSlop={6}
          >
            <Text style={st.reactAddTxt}>+</Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderMessage({ item: row }: { item: ChatRow }) {
    if (isPending(row)) {
      return (
        <Pressable
          onPress={row.failed ? () => send(row.content, row.tempId) : undefined}
          style={[st.msgRow, st.msgRowMine]}
        >
          <View style={[st.msgCol, { alignItems: 'flex-end' }]}>
            <View style={[st.bubble, st.bubbleMine, { opacity: row.failed ? 0.9 : 0.55 }]}>
              <Text style={[st.bubbleTxt, { color: C.accentText }]}>{row.content}</Text>
            </View>
            <Text style={[st.pendingTxt, row.failed && { color: C.danger, fontWeight: '700' }]}>
              {row.failed ? t('chat.sendFailRow') : t('chat.sending')}
            </Text>
          </View>
        </Pressable>
      );
    }
    const m = row;
    // ── v3.5 blocked (guide §220, probed): server nulls content·payload·
    // identity for blocked-relationship senders — system and run_share rows
    // arrive gutted too (probed), so this check MUST precede the type
    // switch or the forward-guard eats them. Quiet placeholder in the
    // deleted-message idiom; identity stays hidden (no profile tap — the
    // blocked profile is a 404 은닉); manager long-press delete survives
    // for moderation. Deleted wins below (universal truth for everyone).
    if (m.blocked && !m.deleted) {
      const canModDelete = m.type !== 'system' && canManage;
      return (
        <View style={st.msgRow}>
          <Avatar name={null} size={30} initialsRatio={0.4} />
          <View style={st.msgCol}>
            <Text style={st.senderLine}>
              {t('chat.hiddenUser')} <Text style={st.whenTxt}>· {fmtWhen(m.created_at, lang)}</Text>
            </Text>
            <Pressable
              onLongPress={canModDelete ? () => setSheetFor(m) : undefined}
              delayLongPress={400}
              style={[st.bubble, st.bubbleOther, st.bubbleDeleted]}
            >
              <Text style={st.deletedTxt}>{t('chat.hiddenMsg')}</Text>
            </Pressable>
            <ReactionChips m={m} />
          </View>
        </View>
      );
    }
    // ── system: centered banner, FE-assembled copy from the render key
    // (guide §219 — copy changes need no server deploy); 공지 deep-link;
    // reactable, delete impossible for everyone (403) ──────────────────
    if (m.type === 'system' && !m.deleted) {
      const title = typeof m.payload?.title === 'string' ? m.payload.title : null;
      const annId = typeof m.payload?.announcement_id === 'string' ? m.payload.announcement_id : null;
      const copy = m.content === 'announcement'
        ? t('chat.sysNewAnn')
        : t('chat.sysNews'); // unknown render keys degrade gracefully
      return (
        <View style={st.sysWrap}>
          <Pressable
            onPress={annId && crewId ? () => router.push({
              pathname: '/(community)/announcement-detail' as never,
              params: { crewId, announcementId: annId },
            }) : undefined}
            style={({ pressed }) => [st.sysCard, pressed && !!annId && { opacity: 0.8 }]}
          >
            <View style={st.sysHead}>
              <Icon name="megaphone-outline" size={13} color={C.accentGrn} />
              <Text style={st.sysTag}>{t('annd.title')}</Text>
              <Text style={st.sysWhen}>{fmtWhen(m.created_at, lang)}</Text>
            </View>
            <Text style={st.sysTitle} numberOfLines={2}>{title ?? copy}</Text>
            <Text style={st.sysSub}>{m.sender_nickname ?? t('chat.sysAdminFallback')} · {copy}</Text>
          </Pressable>
          <ReactionChips m={m} />
        </View>
      );
    }
    const mine = m.sender_id != null && m.sender_id === myUid;
    const name = m.sender_nickname ?? t('home.runner');
    // system is delete-proof by contract; run_share/text follow the v1 rule
    const canDelete = !m.deleted && m.type !== 'system' && (mine || canManage);

    // ── run_share: the frozen-snapshot card (카톡 선례 — survives the
    // original's deletion/privating; tap re-evaluates → friendly 404) ──
    if (m.type === 'run_share' && !m.deleted && m.payload) {
      const rp = m.payload as unknown as RunSharePayload;
      const line = Array.isArray(rp.polyline_thumb) && rp.polyline_thumb.length >= 2 ? rp.polyline_thumb : null;
      return (
        <View style={[st.msgRow, mine && st.msgRowMine]}>
          {!mine && (
            <SenderAvatar
              name={name}
              photoUrl={m.sender_avatar_url}
              onPress={m.sender_id ? () => openProfile(m.sender_id!, name) : undefined}
            />
          )}
          <View style={[st.msgCol, mine && { alignItems: 'flex-end' }]}>
            {!mine && (
              <Text style={st.senderLine}>
                {name} <Text style={st.whenTxt}>· {fmtWhen(m.created_at, lang)}</Text>
              </Text>
            )}
            {m.content ? (
              <View style={[st.bubble, mine ? st.bubbleMine : st.bubbleOther, { marginBottom: 5 }]}>
                <Text style={[st.bubbleTxt, mine && { color: C.accentText }]}>{m.content}</Text>
              </View>
            ) : null}
            <Pressable
              onPress={() => router.push({
                pathname: '/run-post' as never,
                params: {
                  runId: rp.run_id,
                  nickname: name,
                  avatarUrl: m.sender_avatar_url ?? '',
                  ...(mine ? { own: '1' } : {}),
                },
              })}
              onLongPress={canDelete ? () => setSheetFor(m) : undefined}
              delayLongPress={400}
              style={({ pressed }) => [st.runCard, pressed && { opacity: 0.85 }]}
            >
              {line && line.length >= 2
                ? <RealMap height={92} borderRadius={0} polyline={line} />
                : <MiniMap seed={rp.run_id} height={92} borderRadius={0} />}
              <View style={st.runCardBody}>
                <Text style={st.runCardTitle} numberOfLines={1}>{rp.title ?? t('chat.runFallback')}</Text>
                <View style={st.runCardStats}>
                  <Text style={st.runCardKm}>{fmtDist(rp.distance_km, units, 2)}{distUnit(units)}</Text>
                  <Text style={st.runCardStat}>{fmtDuration(rp.duration_sec)}</Text>
                  {rp.avg_pace_sec_per_km != null && (
                    <Text style={st.runCardStat}>{fmtPaceIn(rp.avg_pace_sec_per_km, units)}{paceUnit(units)}</Text>
                  )}
                </View>
              </View>
            </Pressable>
            <ReactionChips m={m} />
            {pickerFor === m.id && (
              <View style={[st.picker, shadows.sm]}>
                {CHAT_EMOJIS.map(e => (
                  <Pressable key={e} onPress={() => toggleReact(m, e)} hitSlop={6}>
                    <Text style={st.pickerEmoji}>{e}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      );
    }

    // ── forward-guard: tomorrow's types render content as plain text or
    // hide quietly — the renderer must not crash on her v2 contract ──
    if (m.type !== 'text' && !m.content && !m.deleted) return null;
    const bubble = m.deleted
      ? <Text style={st.deletedTxt}>{t('chat.deletedMsg')}</Text>
      : <Text style={[st.bubbleTxt, mine && { color: C.accentText }]}>{m.content}</Text>;

    return (
      <View style={[st.msgRow, mine && st.msgRowMine]}>
        {!mine && (
          <SenderAvatar
            name={name}
            photoUrl={m.sender_avatar_url}
            onPress={m.sender_id ? () => openProfile(m.sender_id!, name) : undefined}
          />
        )}
        <View style={[st.msgCol, mine && { alignItems: 'flex-end' }]}>
          {!mine && (
            <Text style={st.senderLine}>
              {name} <Text style={st.whenTxt}>· {fmtWhen(m.created_at, lang)}</Text>
            </Text>
          )}
          <Pressable
            onLongPress={canDelete ? () => setSheetFor(m) : undefined}
            delayLongPress={400}
            style={[st.bubble, mine ? st.bubbleMine : st.bubbleOther, m.deleted && st.bubbleDeleted]}
          >
            {bubble}
          </Pressable>
          <ReactionChips m={m} />
          {pickerFor === m.id && (
            <View style={[st.picker, shadows.sm]}>
              {CHAT_EMOJIS.map(e => (
                <Pressable key={e} onPress={() => toggleReact(m, e)} hitSlop={6}>
                  <Text style={st.pickerEmoji}>{e}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      // +18: appBar's paddingVertical 8 puts content at insets.top+26 —
      // the fix1 top-cutoff pattern (KAV-루트 4형제 sweep, ruled 8/5)
      style={[st.root, { paddingTop: insets.top + 18 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── App bar: back · crew name · mute bell · member count ── */}
      <View style={st.appBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={st.backBtn}>
          <Icon name="arrow-back" size={20} color={C.text} />
        </Pressable>
        <Text style={st.appBarTitle} numberOfLines={1}>{crewName ?? t('chat.title')}</Text>
        <Pressable onPress={toggleMute} hitSlop={8} style={[st.bellBtn, !muted && { backgroundColor: C.accentDim }]}>
          <Icon name={muted ? 'notifications-off-outline' : 'notifications-outline'} size={16} color={muted ? C.faint : C.accentGrn} />
        </Pressable>
        {memberCount ? <Text style={st.memberCount}>{tf('crw.nMembers', { n: memberCount })}</Text> : null}
      </View>

      {toast && <View style={st.toast}><Text style={st.toastTxt}>{toast}</Text></View>}

      {messages === null ? (
        <View style={st.centered}><ActivityIndicator size="large" color={C.accent} /></View>
      ) : (
        <View style={{ flex: 1 }}>
          <FlatList
            inverted
            data={[...pending.map(p => ({ ...p, kind: 'pending' as const })), ...messages] as ChatRow[]}
            keyExtractor={r => (isPending(r) ? r.tempId : r.id)}
            renderItem={renderMessage}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingOlder
              ? <ActivityIndicator size="small" color={C.faint} style={{ paddingVertical: 12 }} />
              : null}
            contentContainerStyle={{ paddingHorizontal: S.lg, paddingVertical: 12, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
          {messages.length === 0 && pending.length === 0 && (
            <View style={st.emptyWrap} pointerEvents="none">
              <Text style={st.emptyTxt}>{t('chat.empty')}</Text>
            </View>
          )}
        </View>
      )}

      {/* ── Composer — + shares a run card (v1.5) ── */}
      <View style={[st.composer, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
        <Pressable onPress={openSharePicker} hitSlop={8} style={st.shareBtn}>
          <Icon name="add" size={22} color={C.sub} />
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={v => setDraft(v.slice(0, 2000))}
          placeholder={t('chat.inputPh')}
          placeholderTextColor={C.faint}
          style={st.input}
          multiline
        />
        <Pressable
          onPress={() => send()}
          disabled={!draft.trim()}
          style={[st.sendBtn, !draft.trim() && st.sendBtnOff]}
        >
          <Text style={[st.sendTxt, !draft.trim() && { color: C.faint }]}>{t('chat.send')}</Text>
        </Pressable>
      </View>

      {/* ── 기록 공유 picker (own public·followers runs; private absent) ── */}
      <Modal visible={sharePickerOpen} transparent animationType="slide" onRequestClose={() => setSharePickerOpen(false)}>
        <Pressable style={st.sheetOverlay} onPress={() => setSharePickerOpen(false)}>
          <Pressable style={[st.sheet, { maxHeight: '68%', paddingBottom: Math.max(insets.bottom, 12) + 8 }]} onPress={() => {}}>
            <View style={st.sheetHandleRow}><View style={st.sheetHandle} /></View>
            <Text style={st.shareTitle}>{t('chat.shareRun')}</Text>
            {shareRuns === null ? (
              <ActivityIndicator size="small" color={C.accent} style={{ paddingVertical: 24 }} />
            ) : shareRuns.length === 0 ? (
              <Text style={st.shareEmpty}>{t('chat.shareEmpty')}</Text>
            ) : (
              <FlatList
                data={shareRuns}
                keyExtractor={r => r.id}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => shareRunToChat(item.id)}
                    disabled={!!sharingId}
                    style={({ pressed }) => [st.shareRow, pressed && { opacity: 0.7 }]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={st.shareRowTitle} numberOfLines={1}>{item.title ?? t('chat.runTitleFallback')}</Text>
                      <Text style={st.shareRowSub}>
                        {fmtWhen(item.ran_at, lang)} · {fmtDist(item.distance_km, units, 2)}{distUnit(units)}
                      </Text>
                    </View>
                    {sharingId === item.id
                      ? <ActivityIndicator size="small" color={C.faint} />
                      : <Icon name="paper-plane-outline" size={17} color={C.accentGrn} />}
                  </Pressable>
                )}
                ItemSeparatorComponent={() => <View style={st.sheetDivider} />}
                showsVerticalScrollIndicator={false}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Long-press delete sheet ── */}
      <Modal visible={!!sheetFor} transparent animationType="slide" onRequestClose={() => setSheetFor(null)}>
        <Pressable style={st.sheetOverlay} onPress={() => setSheetFor(null)}>
          <Pressable style={[st.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]} onPress={() => {}}>
            <View style={st.sheetHandleRow}><View style={st.sheetHandle} /></View>
            <Pressable
              onPress={() => confirmDelete(sheetFor!)}
              style={({ pressed }) => [st.sheetRow, pressed && { opacity: 0.7 }]}
            >
              <Icon name="trash-outline" size={19} color={C.danger} />
              <Text style={[st.sheetRowTxt, { color: C.danger }]}>{t('chat.delMsg')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const makeSt = (C: Tokens) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  appBar:      { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: S.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  appBarTitle: { flex: 1, fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: C.text },
  bellBtn:     { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  memberCount: { fontSize: 12.5, fontWeight: '700', color: C.faint },

  toast:    { position: 'absolute', top: 110, alignSelf: 'center', zIndex: 96, backgroundColor: 'rgba(20,22,18,0.88)', borderRadius: R.pill, paddingHorizontal: 16, paddingVertical: 8 },
  toastTxt: { fontSize: 12.5, fontWeight: '600', color: '#fff', letterSpacing: -0.2 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  msgRow:     { flexDirection: 'row', gap: 9, marginVertical: 7, maxWidth: '86%', alignSelf: 'flex-start' },
  msgRowMine: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  msgCol:     { minWidth: 0, alignItems: 'flex-start' },

  senderLine: { fontSize: 11.5, fontWeight: '700', color: C.sub, letterSpacing: -0.2, marginBottom: 4 },
  whenTxt:    { fontWeight: '500', color: C.faint },

  bubble:        { paddingHorizontal: 13, paddingVertical: 9 },
  bubbleOther:   { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderTopLeftRadius: 4, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  bubbleMine:    { backgroundColor: C.accent, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  bubbleDeleted: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  bubbleTxt:     { fontSize: 13.5, lineHeight: 19, color: C.text, letterSpacing: -0.2 },
  deletedTxt:    { fontSize: 12.5, color: C.faint, letterSpacing: -0.2, fontStyle: 'italic' },

  pendingTxt: { fontSize: 10.5, color: C.faint, letterSpacing: -0.2, marginTop: 3 },

  reactRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' },
  reactChip:     { flexDirection: 'row', alignItems: 'center', height: 24, paddingHorizontal: 8, borderRadius: R.pill, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  reactChipMine: { borderColor: C.accent, backgroundColor: C.accentDim },
  reactChipTxt:  { fontSize: 11.5, fontWeight: '700', color: C.sub },
  reactAdd:      { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  reactAddTxt:   { fontSize: 12, color: C.faint, fontWeight: '700', lineHeight: 14 },

  picker:      { flexDirection: 'row', gap: 10, marginTop: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 },
  pickerEmoji: { fontSize: 18 },

  emptyWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  emptyTxt:  { fontSize: 13.5, color: C.faint, letterSpacing: -0.2 },

  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9, paddingHorizontal: S.lg, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface },
  input:    { flex: 1, minHeight: 42, maxHeight: 110, borderRadius: 21, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceAlt, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 14, color: C.text, letterSpacing: -0.2 },
  sendBtn:    { height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  sendBtnOff: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  sendTxt:    { fontSize: 13.5, fontWeight: '700', color: C.accentText, letterSpacing: -0.2 },

  // v1.5 — system banner (canvas notice idiom)
  sysWrap:  { alignSelf: 'center', width: '92%', alignItems: 'center', marginVertical: 7 },
  sysCard:  { width: '100%', backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accent + '44', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11 },
  sysHead:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sysTag:   { fontSize: 11, fontWeight: '800', letterSpacing: 0.3, color: C.accentGrn },
  sysWhen:  { marginLeft: 'auto', fontSize: 10.5, color: C.faint },
  sysTitle: { fontSize: 13.5, fontWeight: '700', lineHeight: 19, color: C.text, letterSpacing: -0.2, marginTop: 6 },
  sysSub:   { fontSize: 11.5, color: C.accentGrn, letterSpacing: -0.2, marginTop: 3 },

  // v1.5 — run_share card (canvas run-kind idiom)
  runCard:      { width: 230, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  runCardBody:  { paddingHorizontal: 12, paddingVertical: 9 },
  runCardTitle: { fontSize: 12.5, fontWeight: '700', color: C.text, letterSpacing: -0.3 },
  runCardStats: { flexDirection: 'row', gap: 10, marginTop: 4 },
  runCardKm:    { fontSize: 12, fontWeight: '700', color: C.accentGrn, fontVariant: ['tabular-nums'] },
  runCardStat:  { fontSize: 12, fontWeight: '600', color: C.sub, fontVariant: ['tabular-nums'] },

  // v1.5 — share entry
  shareBtn:      { width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  shareTitle:    { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.4, paddingVertical: 10, textAlign: 'center' },
  shareEmpty:    { fontSize: 13, color: C.faint, letterSpacing: -0.2, textAlign: 'center', paddingVertical: 26 },
  shareRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 4 },
  shareRowTitle: { fontSize: 14.5, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
  shareRowSub:   { fontSize: 12, color: C.faint, letterSpacing: -0.2, marginTop: 2 },

  sheetOverlay:   { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet:          { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: S.gutter },
  sheetHandleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 8 },
  sheetHandle:    { width: 38, height: 5, borderRadius: 99, backgroundColor: C.border },
  sheetDivider:   { height: 1, backgroundColor: C.border },
  sheetRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 4 },
  sheetRowTxt:    { fontSize: 15, fontWeight: '600', color: C.text, letterSpacing: -0.3 },
});
