# TODO

## Frozen — AI 맞춤 코스 path (keep working; no changes without unfreezing)

- `.env.local` `EXPO_PUBLIC_API_URL` is pinned to the Mac's DHCP address (`192.168.219.65`) — first thing to check when generation stops reaching the backend
- 경로 저장 — result screen's notice still promises "다음 업데이트"; saving a generated route is unimplemented
- Generated route `id` (returned by the backend, already typed on `GeneratedRoute`) → `runs.route_id` linking when run saving lands
- Feed seeding from `is_public` routes (item 11, slice 2 — deferred until first slice verified)
- ~~Backend Python shim~~ RESOLVED 2026-07-04: backend now at `~/Documents/FreshRun/backend`, running Python 3.12 (uv-managed) in `.venv.nosync`. Start: `cd ~/Documents/FreshRun/backend && .venv.nosync/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Frontend `GeneratedRoute.polyline` is typed required but the backend's `RouteResponse.polyline` is Optional — runtime-safe (MiniMap guards), fix the type when unfreezing
- Backend `Coordinate` validates Korea-only bounds (lat 33–39, lng 124–132) — generation 422s if device GPS is outside Korea (e.g. iOS simulator default San Francisco location); set simulator location to Seoul when testing
- Optional polish: waypoint markers on MiniMap real-polyline rendering

## Pending verification

- Item 10 (course preview) and item 12 (tracking) design-canvas screenshots never arrived in chat — rule-5 comparison against the canvas is outstanding; verified against bundle JSX only

## Backend follow-ups (partner's repo, read-only — raise with her, don't fix)

- `POST /api/runs` (`RunRequest`) accepts no polyline/path field — free-run GPS geometry can't persist until the contract grows one (matters for tracking slice 3)
- `RouteResponse` has no `id` — needed for `runs.route_id` linking after generation
- Stopgap `.env` lacks `OPENWEATHER_API_KEY` (new in this clone) — `/api/weather` fails until her real values arrive

## Later items (noted)

- Real base map (Kakao via JS-SDK WebView) — considered for the live-tracking screen only. Partner's existing key is REST (server-side only, cannot render maps); a JS key has been requested from her. When it arrives: put it in the app's `.env.local` as `EXPO_PUBLIC_KAKAO_JS_KEY`, and the integration item MUST include registering the platform/origin in her Kakao developers console — unregistered origins fail silently (blank map, no error)
- Background GPS tracking (runs keep recording with the app backgrounded) — requires a dev build (not Expo Go), `expo-location` plugin config + `UIBackgroundModes` + background permission + TaskManager; slice 2 is deliberately foreground-only with straight-line gap bridging
- Wire course-preview's "네, 뛸게요" → tracking with course param + title pill (tracking slice 2)
