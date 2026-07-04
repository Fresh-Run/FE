/**
 * (records) — detail screens pushed from the 기록 tab.
 *
 * Screens that will live here:
 *   activity        — single run detail (map replay, split stats, feedback)
 *   monthly         — monthly insight (summary, trends, calendar)
 */
import { Stack } from 'expo-router';

export default function RecordsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
