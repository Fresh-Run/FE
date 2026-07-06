# TODO

## PAUSED: crew verification desk-test (2026-07-06)

**State:** crew migration work remains **UNCOMMITTED and unverified** — 6 files: `lib/api.ts` (ApiError/apiRequest), `lib/crews-api.ts` (new), `store/join-requests.ts` (new), `hooks/use-crews.ts`, `app/(tabs)/community.tsx`, `app/(community)/crew-detail.tsx`. Entanglement-checked: commits cleanly on its own, independent of item 17 and the tracking instrumentation.

**Test script:** the 10-step phone+Swagger desk-test exists (in chat, 2026-07-06 — covers real-data render, open join, 승인제 신청→승인/거절/취소, badge-fix regression repro, invite-code join, demo5 fixture, failure states). Progress unknown/partial.

**Script expectation updates (2026-07-06 re-verification):** the known-bug caveat is GONE — members POSTing join now 409 "Already a member" (verified), so no phantom-residue warnings apply to members; step 3 (가입됨 badge for test2) is INVALID as written — **test2 is no longer a member**; use demo2/한강질주 (verified member) for the 가입됨/member checks, or re-join test2 first. Pre-flight now mandatory: pull CURRENT member list + request states via API — the seed doc no longer matches reality (test1 = 테스트1).

**⚠️ State chain may be dirty:** a fresh test account may be mid-신청 or already a member on 한강 새벽 러닝 크루 from a partial run. **demo5 must remain the pending fixture** (owner-list screen depends on it).

**Before resuming:** re-check the fresh account's actual state — token as that account → `GET /api/crews/{crewId}/join-requests/me` (and `GET /crews/mine`) — then restart the script from a clean point (탈퇴/신청 취소 as needed).

**Gate: crew files must NOT be committed until this script passes.**

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

- One-time unfreeze 2026-07-06 (owner design change, canvas to follow): the distance slider is now UNIT-NATIVE — km 1–30 / mi 0.5–20 (mi floor = smallest mi step above the server's gt=0; 20mi=32.19km fits the verified le=100 bound, no widen-ask needed). Payload stays km (`distanceKm` state is km-internal; unit switches preserve physical distance). Form re-frozen after this change.

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

## OWNER OVERRIDE: 개인 정보 local-only fields (2026-07-06)

- The 개인 정보 screen ships FULL per design (owner decision), but 출생 연도/체중/키/성별 are **device-local only** (`store/use-local-profile.ts`, AsyncStorage) — the backend profile schema lacked them at build time.
- **S2 now FULLY UNBLOCKED** (BE `01c6bc5`, verified 2026-07-06): `birth_year` (1920–2026), `weight_kg` (20–300), `height_cm` (100–250), `gender` on ProfileResponse/ProfileUpdate. Swap the storage target to `PATCH /me/profile` (UI reads the store shape, shouldn't change) + one-time migration of locally-saved values. Notes: **gender label mapping 여성→`female` / 남성→`male` / 선택 안 함→`undisclosed`**; her bounds are a superset of our steppers (30–150kg / 120–220cm) — no UI change needed.
- **Avatar upload now UNBLOCKED too**: `POST /api/me/avatar/upload-url` (Storage signed-URL pattern). Pencil's 준비 중 can become real — needs an image picker (likely `expo-image-picker`, new dep) + upload flow; own small item.
- Live-canvas verification of this screen still blocked — DesignSync `list_projects` returns empty for this account (project likely owned by 지연 / not design-system type).

## Backend follow-ups (partner's repo, read-only — raise with her, don't fix)

- ~~Nickname 409~~ **RESOLVED — constraint applied and enforced** (verified 2026-07-06 on running `3f64aba`): real-duplicate probe (`{"nickname":"테스트1"}` as test2) → **409 "Nickname already taken"**. Earlier "still broken" re-probes were **false positives from world drift**: test1 had been renamed 테스트1 during phone verification, so my probe value 한강크루장 was no longer a duplicate (200 was correct). The ORIGINAL 2026-07-05 report was true at the time (rename genuinely succeeded pre-migration); `2026-07-06_profiles_nickname_unique.sql` fixed it. **개인 정보 inline 409 message is now LIVE.**
- ~~승인제 member-join 202~~ **RESOLVED — real members get 409** (verified 2026-07-06: join as demo2/한강질주, a verified current member → **409 "Already a member"** ×2). My re-probes used test2, who is **no longer a crew member** (left during phone verification) — a non-member getting 202+pending is correct behavior. 가입됨 badge stays (correct UX, no longer a bug shield).
- **⚠️ Demo world has drifted from DEMO_ACCOUNTS.md** (from phone sessions + probes): test1 nickname = 테스트1 (not 한강크루장); test2 = NOT a crew member (5 members remain); I deleted two of test2's legitimately-created pending requests during earlier "residue cleanup" under the stale member assumption (disclosed). **Always verify current state via API before probing — never trust the seed doc.** Re-running `seed_demo_data.py` is idempotent-additive but won't undo renames/leaves.

- ~~`POST /api/runs` path field~~ **LANDED** (BE `3779905`, verified 2026-07-06): `gps_track: Optional[list[GpsPoint]]` where `GpsPoint = {lat, lng, t: epoch ms, acc?: m ("강력 권장"), alt?}` — server pipeline owns validation (filters, splits, anti-cheat; out-of-bbox points silently dropped). **Wiring wants `t` + `acc` retention in the tracker's path buffer** (today we keep lat/lng only) — small `use-run-tracker` change that RIDES THE WALK CHAIN (filter fix first; don't upload known-broken tracks to a validating server). Then `SEAM (path upload)` in `lib/runs-api.ts` connects directly.
- `RouteResponse` has no `id` — needed for `runs.route_id` linking after generation
- ~~`OPENWEATHER_API_KEY` missing~~ **RESOLVED 2026-07-06** — key added to backend `.env` (owner), server restarted, `GET /api/weather` verified live with real Seoul data (200, full guide shape incl. `running_index.personalized`). **Weather integration (retire `weather-mock.ts`: home strip, weather-detail, chooser temp) is now fully unblocked** — S/M item, needs plan approval.
- `PublicRouteResponse` has no `is_bookmarked` flag — feed v1 works around it with one `GET /routes/bookmarked?limit=100` per feed load (stale icons possible past 100 bookmarks); a response flag like `is_liked` would remove the extra call
- `GET /routes/{id}` is owner-only, even for public routes — blocks id-based course-preview fetch; feed v1 works around it with an in-memory handoff (`store/pending-course.ts`)

## Next named item

- ~~Community crew hooks → backend API migration~~ DONE 2026-07-05 (item 16): all crew reads/writes via `/api/crews/*`, approval flow + invite-code join shipped, interim guard and direct-insert mutations removed.

## Crew follow-ups (from item 16)

- **Member-join 409 fix: PARTIAL as of BE `ccac76b` (2026-07-06)** — guide now claims race-proof 409-first, and open-crew `join_crew` checks membership, but the **승인제 request path still returns 202 + creates a phantom for members** (reproduced live as test2, phantoms cleaned). Re-report to her with repro: token as test2 → `POST /crews/{한강crewId}/join` → expect 409, got 202. Our 가입됨 badge guard stays necessary.
- **`GET /me/join-requests` SHIPPED** (BE has `test_my_join_requests_integration.py`) — Stage B unblocked: hydrate `store/join-requests.ts` once per browse load for cross-session truthful badges. `hydrate()` is already in the store waiting. Verify exact path/shape in Swagger before wiring.
- New premium endpoints landed 2026-07-06 (future items): `POST /routes/{id}/coach-script` (오디오 코치, premium, 403 premium_required for free), `GET /me/insights/monthly` (월간 인사이트, premium).

- Owner-side invite code UI (issue/rotate/share) — no bundle design exists; owners can rotate via Swagger meanwhile. Waiting on canvas design.
- Invite-code entry sheet + row are invented UI — canvas design to follow; flag visual mismatches then (user note, 2026-07-05).
- `CrewMemberResponse` has no `avatar_url` — member list uses initials avatars; raise with partner if photos matter.

## Small improvements from API_GUIDE.md (2026-07-05)

- `lib/api.ts`: guide §2 recommends 401 → `supabase.auth.refreshSession()` + one retry before failing — our wrapper doesn't do this yet
- Error handling: guide §5 says `detail` may be a structured object (`{error, message, ...}`), and 429 quota errors carry `{limit, used, remaining, reset_at}` — our mappers only read string `detail`
- Home feed v1 target per guide §4: `GET /feed` (course feed, `PublicRouteResponse[]` with `like_count`/`is_liked`/`comment_count`/`polyline`); run activity feed (`/feed/activities` + kudos) is the agreed v2

## T2 — 다크 렌더링 sweep (named, sized — approved for TODO 2026-07-06)

Converge the two theme systems (`lib/theme` → themed hook backed by `contexts/theme`, fed by the persisted `settings.theme` instead of the device scheme), restructure ~20 module-scope StyleSheets into theme-aware factories, triage 113 color literals (audit 2026-07-06: worst files index.tsx 19, crew-detail 15, tracking 11; maps/scrims are dark-by-design and stay), wire the status bar to the setting. **Size: units sweep ×3–4. Schedule after crew/item-17 verification debt clears.** Until then the theme picker (T1) is persist-only with an in-UI notice.

## Later items (noted)

- Course-run polish: draw the live GPS trail *and* the course shape together on the tracking map (MiniMap renders one path today); AI-generated courses can't start a tracked run until `RouteResponse` gains an `id` (existing backend ask) — create-flow "시작하기" stays frozen until then

- Real base map (Kakao via JS-SDK WebView) — considered for the live-tracking screen only. Partner's existing key is REST (server-side only, cannot render maps); a JS key has been requested from her. When it arrives: put it in the app's `.env.local` as `EXPO_PUBLIC_KAKAO_JS_KEY`, and the integration item MUST include registering the platform/origin in her Kakao developers console — unregistered origins fail silently (blank map, no error)
- Background GPS tracking (runs keep recording with the app backgrounded) — requires a dev build (not Expo Go), `expo-location` plugin config + `UIBackgroundModes` + background permission + TaskManager; slice 2 is deliberately foreground-only with straight-line gap bridging
- Wire course-preview's "네, 뛸게요" → tracking with course param + title pill (tracking slice 2)
