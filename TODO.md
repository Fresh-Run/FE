# TODO

## PAUSED: tracking-filter under-credit bug (2026-07-06)

**Symptom:** 100+ real meters walked outdoors → filtered distance < 10m → "너무 짧은 러닝은 저장되지 않아요". The GPS filters are eating real distance.

**STATUS**
- Instrumentation is LIVE in `hooks/use-run-tracker.ts`, marked `DEBUG(short-run)`: every GPS fix prints one Metro line with its decision label (`ACCEPT` / `REJECT accuracy>25` / `REJECT speed>7` / `SKIP stationary — ANCHOR MOVED` / `SKIP jitter<5 — anchor held`) plus a running `accepted=` vs `raw=` tally (raw = naive sum over all fixes, gates ignored).
- Zero logic changes; typecheck + lint clean.
- **UNCOMMITTED WIP** — not phone-verified, do not commit yet. (Note: items 16 crew migration + badge fix and 17 코스 러닝 are also uncommitted, pending their own verification; last commit is `3679f51` feed v1.)

**BLOCKED ON** (the one action that unblocks everything)
- A calibrated outdoor walk: KNOWN measured distance, 150–300m, normal pace, phone carried naturally. Reload the app first so the instrumented build is live. Paste the full `[track]` Metro log block into chat.
- Capture 3 numbers: real measured distance / what the app screen credited / final `accepted=` and `raw=` from the last log line.

**DIAGNOSIS FRAME** (don't re-derive)
- `raw ≈ real` but `accepted` tiny → filters are the culprit; the label counts name the guilty gate.
- `raw` ALSO way short → problem is upstream of the gates (fix delivery/throttling) — fix lives elsewhere.
- Ranked suspects: (1) `SKIP stationary — ANCHOR MOVED` — the only gate that DESTROYS distance instead of deferring; fires when OS speed flickers < 0.5 m/s mid-walk. (2) A wall of `REJECT accuracy>25` if urban accuracy sits 20–40m. (3) `SKIP jitter` should be harmless (anchor held, distance defers) — log confirms whether deferred segments actually get credited later.

**SEQUENCED FOLLOW-UPS** (only AFTER a real 100m+ walk reliably credits ~100m)
- Raise `MIN_SAVE_KM` 0.01 → 0.05 (50m floor) in `app/(course)/run-result.tsx`.
- Copy update IF any user-facing copy mentions a distance (current copy doesn't — verify before touching).
- Remove all `DEBUG(short-run)` instrumentation.

## Frozen — AI 맞춤 코스 path (keep working; no changes without unfreezing)

- `.env.local` `EXPO_PUBLIC_API_URL` is pinned to the Mac's DHCP address (`192.168.219.65`) — first thing to check when generation stops reaching the backend
- 경로 저장 — result screen's notice still promises "다음 업데이트"; saving a generated route is unimplemented
- Generated route `id` (returned by the backend, already typed on `GeneratedRoute`) → `runs.route_id` linking when run saving lands
- ~~Feed seeding from `is_public` routes~~ SUPERSEDED 2026-07-05 by feed v1 (home feed on `GET /feed` + `/routes/nearby`)
- ~~Backend Python shim~~ RESOLVED 2026-07-04: backend now at `~/Documents/FreshRun/backend`, running Python 3.12 (uv-managed) in `.venv.nosync`. Start: `cd ~/Documents/FreshRun/backend && .venv.nosync/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Frontend `GeneratedRoute.polyline` is typed required but the backend's `RouteResponse.polyline` is Optional — runtime-safe (MiniMap guards), fix the type when unfreezing
- Backend `Coordinate` validates Korea-only bounds (lat 33–39, lng 124–132) — generation 422s if device GPS is outside Korea (e.g. iOS simulator default San Francisco location); set simulator location to Seoul when testing
- Optional polish: waypoint markers on MiniMap real-polyline rendering

## Pending verification

- Item 10 (course preview) and item 12 (tracking) design-canvas screenshots never arrived in chat — rule-5 comparison against the canvas is outstanding; verified against bundle JSX only

## Backend follow-ups (partner's repo, read-only — raise with her, don't fix)

- `POST /api/runs` (`RunRequest`) accepts no polyline/path field (still true as of backend `846dc26`) — she's adding one; the recorded path is kept client-side (`store/pending-run.ts`) with a marked `SEAM (path upload)` in `lib/runs-api.ts` ready for the contract change
- `RouteResponse` has no `id` — needed for `runs.route_id` linking after generation
- Stopgap `.env` lacks `OPENWEATHER_API_KEY` (new in this clone) — `/api/weather` fails until her real values arrive
- `PublicRouteResponse` has no `is_bookmarked` flag — feed v1 works around it with one `GET /routes/bookmarked?limit=100` per feed load (stale icons possible past 100 bookmarks); a response flag like `is_liked` would remove the extra call
- `GET /routes/{id}` is owner-only, even for public routes — blocks id-based course-preview fetch; feed v1 works around it with an in-memory handoff (`store/pending-course.ts`)

## Next named item

- ~~Community crew hooks → backend API migration~~ DONE 2026-07-05 (item 16): all crew reads/writes via `/api/crews/*`, approval flow + invite-code join shipped, interim guard and direct-insert mutations removed.

## Crew follow-ups (from item 16)

- **Backend ask (forwarded 2026-07-05): member join must 409** — `POST /crews/{id}/join` currently lets existing members create real pending requests on approval crews (guide contract says 409 이미 멤버). Our 가입됨 badge blocks it UI-side meanwhile.
- **Backend ask (forwarded 2026-07-05): `GET /me/join-requests`** (all my requests, one call) — Stage B: hydrate `store/join-requests.ts` once per browse load for cross-session truthful badges. `hydrate()` is already in the store waiting.

- Owner-side invite code UI (issue/rotate/share) — no bundle design exists; owners can rotate via Swagger meanwhile. Waiting on canvas design.
- Invite-code entry sheet + row are invented UI — canvas design to follow; flag visual mismatches then (user note, 2026-07-05).
- `CrewMemberResponse` has no `avatar_url` — member list uses initials avatars; raise with partner if photos matter.

## Small improvements from API_GUIDE.md (2026-07-05)

- `lib/api.ts`: guide §2 recommends 401 → `supabase.auth.refreshSession()` + one retry before failing — our wrapper doesn't do this yet
- Error handling: guide §5 says `detail` may be a structured object (`{error, message, ...}`), and 429 quota errors carry `{limit, used, remaining, reset_at}` — our mappers only read string `detail`
- Home feed v1 target per guide §4: `GET /feed` (course feed, `PublicRouteResponse[]` with `like_count`/`is_liked`/`comment_count`/`polyline`); run activity feed (`/feed/activities` + kudos) is the agreed v2

## Later items (noted)

- Course-run polish: draw the live GPS trail *and* the course shape together on the tracking map (MiniMap renders one path today); AI-generated courses can't start a tracked run until `RouteResponse` gains an `id` (existing backend ask) — create-flow "시작하기" stays frozen until then

- Real base map (Kakao via JS-SDK WebView) — considered for the live-tracking screen only. Partner's existing key is REST (server-side only, cannot render maps); a JS key has been requested from her. When it arrives: put it in the app's `.env.local` as `EXPO_PUBLIC_KAKAO_JS_KEY`, and the integration item MUST include registering the platform/origin in her Kakao developers console — unregistered origins fail silently (blank map, no error)
- Background GPS tracking (runs keep recording with the app backgrounded) — requires a dev build (not Expo Go), `expo-location` plugin config + `UIBackgroundModes` + background permission + TaskManager; slice 2 is deliberately foreground-only with straight-line gap bridging
- Wire course-preview's "네, 뛸게요" → tracking with course param + title pill (tracking slice 2)
