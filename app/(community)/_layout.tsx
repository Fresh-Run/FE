/**
 * (community) — crew and challenge screens, pushed from the 커뮤니티 tab.
 *
 * Screens that will live here:
 *   crew-detail     — crew profile, member list, feed
 *   crew-create     — create a new crew (name, description, visibility)
 *   crew-manage     — admin manage members / settings
 *   crew-notices    — crew notice board
 *   crew-invite     — invite link / QR
 *   crew-requests   — pending join requests (admin)
 *   challenge-create — create a crew challenge
 */
import { Stack } from 'expo-router';

export default function CommunityLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
