/**
 * (course) — full-screen run flow, presented over the tab bar.
 *
 * Screens that will live here:
 *   create          — AI course preferences + generation
 *   preview         — 코스 미리보기: shared-course preview from a feed card, confirm/cancel
 *   result          — map preview of generated route, start/cancel
 *   tracking        — live run tracking (real GPS, foreground-only)
 *   run-result      — post-run stats + 2-tap feedback, saves via POST /api/runs
 *   run-saved       — save confirmation → records / home
 *   personal-best   — PR celebration overlay
 *   challenge-done  — challenge completion
 */
import { Stack } from 'expo-router';

export default function CourseLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
