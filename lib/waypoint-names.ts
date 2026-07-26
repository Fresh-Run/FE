/**
 * Waypoint label-shape helpers (pure — no RN imports, desk-provable).
 *
 * Her 2026-07-22 neutral-label contract: server waypoint names are order
 * markers ("출발"/"지점 N"/"복귀"/"도착", en "Start"/"Point N"/"Return"/
 * "Finish") except pitstops, which carry real Kakao-resolved names. The
 * FILL targets ONLY the placeholder class — "지점 N"/"Point N". The
 * functional labels (출발/복귀/도착) say something true about the course
 * and stay; pitstop names are real and stay (guide: 그대로 표시).
 */

/** true = a server placeholder eligible for reverse-geocode fill */
export function isNeutralWaypointName(name: string): boolean {
  return /^(지점|Point)\s*\d+$/.test(name.trim());
}

/** cache key — 5 decimals ≈ 1m; one resolve per coordinate, ever */
export function waypointCacheKey(c: { lat: number; lng: number }): string {
  return `${c.lat.toFixed(5)},${c.lng.toFixed(5)}`;
}

/**
 * Pick a chip-worthy label from an Apple reverse-geocode row. Most-local
 * meaningful field wins (동 > street > subregion); city-only is rejected —
 * every waypoint reading "인천" is noise, and the honest floor (지점 N)
 * beats a wrong-grain name. null = keep the server label.
 */
export function labelFromGeocode(geo: {
  district?: string | null; street?: string | null;
  subregion?: string | null;
} | null | undefined): string | null {
  if (!geo) return null;
  const label = geo.district ?? geo.street ?? geo.subregion ?? null;
  return label && label.trim().length > 0 ? label.trim() : null;
}
