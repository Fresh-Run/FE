// Shared deep-link routing for a notification TAP — one source of truth for
// both the in-app 알림 center (notifications.tsx) and a remote push tap
// (lib/push.ts). Extracted 2026-07-15 (BUILD #1 ②) so the two paths can never
// drift on the "degrade to inert, never fake-nav or crash" contract.
import { router } from 'expo-router';

import type { AppNotification } from '@/lib/notifications-api';
import { openProfile } from '@/lib/profile-nav';

/** The only fields a tap needs. AppNotification satisfies this structurally,
    and a push's `content.data` is coerced into it. A remote push carries no
    actor_nickname (BE sends type/target_id/target_type/payload only) → the
    profile screen fetches the name itself, so undefined degrades cleanly. */
export type DeepLinkTarget = Pick<AppNotification, 'type' | 'target_id' | 'payload' | 'actor_nickname'>;

/** Where a tap navigates; null = truthful interim (mark-read only).
    Defensive on missing ids by contract (지연): old rows / thin push payloads
    may lack the id a type needs — degrade to inert, never fake-nav or crash. */
export function deepLink(n: DeepLinkTarget): (() => void) | null {
  switch (n.type) {
    case 'run_kudoed':
    case 'run_commented': // target_type "run", target_id = run id (probed)
      if (!n.target_id) return null;
      return () => router.push({ pathname: '/(records)/activity' as any, params: { runId: n.target_id! } });
    case 'pb_achieved':
      // self-targeted → own-run 활동 상세 (same home as run_kudoed/commented;
      // own runs analyse in 기록 tab, not the social post). target_id = run_id.
      if (!n.target_id) return null;
      return () => router.push({ pathname: '/(records)/activity' as any, params: { runId: n.target_id! } });
    case 'crew_invited':
      // preview→join screen (payload.invite_code; the crew's shared code).
      // No invite record to accept/decline server-side — the code IS the invite.
      if (!n.payload?.invite_code) return null;
      return () => router.push({
        pathname: '/(community)/crew-invite' as any,
        params: { code: n.payload!.invite_code!, crewName: n.payload?.crew_name ?? '' },
      });
    case 'crew_joined':
    case 'join_requested':
    case 'join_approved':
      if (!n.target_id) return null;
      return () => router.push({ pathname: '/(community)/crew-detail' as any, params: { crewId: n.target_id! } });
    case 'follow_requested':
      // 수락/거절 lives on the inbox — the list is the target (null payload)
      return () => router.push('/follow-requests' as any);
    case 'user_followed':
    case 'follow_request_approved':
      // target_id = the actor's uid (followed 07-08 / approver 07-14, both
      // probed) → the actor's profile. Never self.
      if (!n.target_id) return null;
      return () => openProfile(n.target_id, n.actor_nickname);
    case 'crew_announcement': {
      // routes to the real 공지 detail — payload.crew_id + target_id(=공지 id),
      // per the guide's deep-link table. Old rows (payload:null) stay inert.
      const crewId = n.payload?.crew_id;
      if (!crewId) return null;
      if (n.target_id) {
        return () => router.push({
          pathname: '/(community)/announcement-detail' as any,
          params: { crewId, announcementId: n.target_id },
        });
      }
      return () => router.push({ pathname: '/(community)/crew-detail' as any, params: { crewId } });
    }
    default:
      return null;
  }
}
