// THE ROUTING RULE — every tappable name/avatar routes through here.
// Self-check: my own uid lands on 내 프로필, never the other-user screen.
import { router } from 'expo-router';

import { useStore } from '@/store/use-store';

export function openProfile(uid: string | null | undefined, nickname?: string | null): void {
  if (!uid) return;
  const myUid = useStore.getState().session?.user.id;
  if (uid === myUid) {
    router.push('/my-profile' as any);
    return;
  }
  router.push({ pathname: '/user-profile' as any, params: { uid, ...(nickname ? { nickname } : {}) } });
}
