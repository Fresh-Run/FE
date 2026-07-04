import { Redirect } from 'expo-router';

// Chooser has moved to app/(tabs)/create.tsx — nothing navigates here anymore.
export default function CourseIndex() {
  return <Redirect href={'/(tabs)/create' as never} />;
}
