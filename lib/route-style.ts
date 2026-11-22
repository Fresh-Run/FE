// Route line style — item ⑫ (owner-ruled 2026-11-21, canvas RunMap board):
// ONE style for every run/course line: neon over a slightly wider ink casing,
// round caps + joins, the same in both schemes. 5.5 over 9 at full size,
// scaled down for cards and thumbnails. Markers (start · end · current
// position): a neon dot with an ink ring. Nothing else draws a route.
export const ROUTE_NEON = '#C3FF3C';
export const ROUTE_INK = '#121712';
/** Course-to-follow on the in-run map: the same casing, neon dimmed (owner ruling). */
export const ROUTE_NEON_DIM = '#C3FF3C8C'; // 55 %
export const ROUTE_NEON_BEHIND = '#C3FF3C59'; // 35 % — the stretch already run on a course

export type RouteSize = 'full' | 'card' | 'thumb';
export type RouteWidths = { line: number; casing: number; dot: number; ring: number };
const W: Record<RouteSize, RouteWidths> = {
  full:  { line: 5.5, casing: 9,   dot: 8,   ring: 2.5 },
  card:  { line: 4.5, casing: 7.5, dot: 6.5, ring: 2 },
  thumb: { line: 3,   casing: 5,   dot: 4.5, ring: 1.5 },
};
export const routeWidths = (size: RouteSize): RouteWidths => W[size];
/** Size class from the rendered map height (pt). */
export const routeSizeFor = (height: number): RouteSize => (height >= 240 ? 'full' : height >= 120 ? 'card' : 'thumb');
