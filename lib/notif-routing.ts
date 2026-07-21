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
    case 'pb_achieved':
      // Slice B (지연 진단 + owner repro, ruled 2026-07-21): all three land
      // on the SOCIAL run detail (run-post) — the kudos/comment you were
      // notified about must be visible at the landing. The old 활동-상세
      // route was the misroute (its analytics view shows neither).
      // own='1': these types only ever target MY run, and run-post derives
      // own-mode from the param (the detail payload has no is_mine).
      if (!n.target_id) return null;
      return () => router.push({ pathname: '/run-post' as any, params: { runId: n.target_id!, own: '1' } });
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
      // per the guide's deep-link table. Legacy rows (pre-07-08, null
      // payload): land on the crew list — an honest imperfect landing beats
      // a dead tap (owner ruling, Slice B 2026-07-21).
      const crewId = n.payload?.crew_id;
      if (!crewId) return () => router.push('/(tabs)/community' as any);
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
