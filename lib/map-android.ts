/**
 * Android map code-half (2026-10-09, Android slice ③). Two react-native-maps
 * props that exist ONLY on the Google provider, applied ONLY on Android:
 *
 *  - `liteMode` (@platform Android: Supported · iOS: Not supported) — a static
 *    bitmap render of the map. The Android twin of iOS `cacheEnabled`
 *    (@platform iOS only), which already freezes every thumb-class card to a
 *    snapshot. Without it every feed card would mount a live GoogleMap (the
 *    audit's perf class). Applied where cacheEnabled is: thumb-class, i.e.
 *    non-interactive AND cache !== false. Hero/detail/interactive maps keep
 *    the full map — lite mode has no gestures, no camera animation, no
 *    My-Location layer, so it is wrong for anything a finger or a live fix
 *    touches.
 *  - `customMapStyle` (@platform Android: Supported · iOS: Google Maps only,
 *    i.e. a no-op on our Apple-Maps iOS) — the Android dark map. iOS gets its
 *    dark map from `userInterfaceStyle` (@platform iOS Apple Maps only),
 *    which Android ignores; this is the symmetric half.
 *
 * `androidMapProps()` returns `{}` off Android, so iOS render output is
 * byte-identical to before: no new keys reach the native view. The real
 * Google Maps API key is config-only (app.json android.config.googleMaps,
 * dummy slot from slice ①) — nothing here changes when it lands.
 */
import { Platform } from 'react-native';
import type { MapStyleElement, MapViewProps } from 'react-native-maps';

/** Standard Google dark grammar tuned to the app's dark tokens (bg #0E0F12 ·
    surface #15171C · border #24282F · sub #9A9EA5 · faint #6A6F77): dark
    surfaces, dimmed roads, muted labels, POI + transit hidden (the Apple-dark
    look the iOS cards show). Light scheme = Google default, no JSON. */
export const MAP_DARK_STYLE: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#15171C' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9A9EA5' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0E0F12' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#24282F' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#B5B9C0' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#121A14' }, { visibility: 'on' }] },
  { featureType: 'poi.park', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#24282F' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1A1D22' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#6A6F77' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#2A2E36' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#33383F' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1A1D22' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#9A9EA5' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0A0D14' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4F5560' }] },
];

type AndroidMapProps = Pick<MapViewProps, 'liteMode' | 'customMapStyle'>;

/** Android-only MapView props; `{}` everywhere else (iOS byte-identical). */
export function androidMapProps(resolved: 'light' | 'dark', opts: { lite: boolean }): AndroidMapProps {
  if (Platform.OS !== 'android') return {};
  return {
    ...(opts.lite ? { liteMode: true } : {}),
    ...(resolved === 'dark' ? { customMapStyle: MAP_DARK_STYLE } : {}),
  };
}
