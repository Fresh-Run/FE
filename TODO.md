# TODO

## THE OUTDOOR SESSION — five payloads, one outing (owner-sequenced 2026-07-07)

Simulator declined (no Xcode) — everything below verifies outdoors on the real device, in this order. **(a)+(b) must complete before (c)/(d)/(e) can trust their distances** — the walk portion comes first.

**PRE-FLIGHT: app points at staging (`https://freshrun-api.fly.dev`, swapped 2026-07-07) — the old 0a–0c LAN dance (uvicorn restart / IP-drift sed / phone-Safari check) is OBSOLETE; staging is reachable from anywhere on cell data.** Only remaining pre-check: one `curl https://freshrun-api.fly.dev/health` before leaving (fly outage ≠ impossible), and confirm 지연's latest "스테이징 반영됨" covers the BE hash the payloads assume.

- **(a) Calibrated walk** — 150–300m known distance, normal pace, phone carried naturally; instrumented build live; capture the `[track]` Metro log block + 3 numbers (real / app-credited / final `accepted=`/`raw=`) → filter-bug diagnosis per the frame below. **Additions (owner, 2026-07-08):** (a-1) capture ground truth via a SECOND tracking app running simultaneously (or a measured known-length course) and record app-vs-actual; (a-2) the walk MUST complete the full save flow (not just tracking) so the backend `run_tracks` table records raw-vs-kept point counts — enables LAYER ATTRIBUTION: client GPS filter vs backend filter, each layer's in/out counts compared independently. **CORRECTION (2026-07-08, evidence: 탄생기념런 saved with `has_track: false`): a-2 has an unbuilt dependency — the client never sends `gps_track` (tracker buffers lat/lng only; the runs-api SEAM is unconnected). The gps_track upload slice MUST land before the outing or a-2 silently no-ops again.**
- **(b) Filter fix** — from (a)'s log: fix the guilty gate(s), raise `MIN_SAVE_KM` 0.01 → 0.05, strip `DEBUG(short-run)`; re-walk to confirm ~100m credits ~100m.
- **(c) Item-17 코스 러닝 E2E** — feed → preview → 네 뛸게요 (copy) → course pill/map tracking → save; verify `route_id` set on the run and `copy_count` bumped.
- **(d) PB modal visual** — pre-seed via Swagger BEFORE heading out: fresh account + one short posted run (low baseline) so the real outdoor run triggers `new_records` → modal (confetti, comparison card, +N caption, CTA-dismiss, 공유 준비 중).
- **(e) Units save-integrity** — run with 단위=mi → verify the stored `distance_km` is the true km (GET /runs), display mi everywhere.
- **러닝 저장 delta calls (owner, 2026-07-08):** 7-bucket `timeTitle` KEPT — canvas will be updated to match code (don't re-flag as drift); title cap 30 applied; custom centered discard modal applied; confirm-on-back KEPT (documented deviation, no-silent-loss).
- **(f) 러닝 저장 outdoor half** — map card VISIBLE with the real path; save with typed title + 팔로워만 → `GET /runs` shows title/notes/visibility; 수고했어요 renders the saved title; PB modal + feedback intact post-save. *(Indoor half VERIFIED 2026-07-07, 6/6: compose routing, crash-recovery both paths, too-short gating, ‹-discard-confirm, sheet, old screen unreachable. Build style-matched to canvas screenshots; timeTitle 새벽 04:00–06:59 shipped.)*

**Commit boundaries after the session:** PB modal + item-17 set (9 files incl. `components/pb-celebration.tsx`) commit together; `use-run-tracker.ts` commits after the (b) DEBUG strip. Then the tree is clean.

**Xcode/simulator: declined for now** — revisit when dev builds become necessary (HealthKit, IAP, Maestro E2E).

## ITEM (queued, post-item-17-commit): 러닝 저장 + 수고했어요 redesign implementation

Canvas redesign 2026-07-07 (owner + backend decisions included). **Source of truth = the LIVE canvas (FreshRun App.html) as of 2026-07-07 — re-read both screens at planning time, do NOT build from this note.** Decisions that aren't obvious from pixels:

- **러닝 저장 (FrRunSave):** editable title is the hero, placeholder auto-suggests by time of day (새벽/아침/저녁/야간 러닝); 공개 범위 is now one row → bottom-sheet picker (전체 공개/팔로워만/비공개); route-map preview card between date row and photo row, reusing the feed-card map style, HIDDEN when distance < 0.3km or no route points; photo add = compact button (UI-only this pass unless probed otherwise); no Sync/Health row.
- **수고했어요:** the 4 platform share buttons are GONE — single 공유하기 (secondary) button → iOS native share sheet; NO mood-feedback section; NO AI insight card (owner+backend decision — coach-script, if ever built, lives elsewhere); record preview = 구간 페이스 bar chart with 평균 baseline + ⚡최고 구간 highlight, comparison rows (평균 페이스 vs 30일, 이번 주 누적 — data source likely /me/stats, PROBE at build time), conditional highlight chips (hidden when none) and conditional 고도 row.
- Both screens live in item-17 territory (run-saved/run-result) → build queues behind the item-17 commit; recon must live-probe /me/stats shape, per-point tracker data (splits/elevation feasibility), and whether POST /runs accepts title/memo/visibility fields.

## 내 프로필 (own-view) — BUILT 2026-07-07, honest-interim notes

- **New ask for 지연: `location` field on profiles** — canvas shows "서울 성수동" under the name; no backend source. Interim: `bio` renders there (omit when empty).
- Run cards are a reduced feed-style subset — canvas shows per-run area/tags; own-runs have no backend source for those. ~~♥ counts/공개 태그~~ **BUILT 2026-07-07** (♥ slice): `kudos_count` footer + likers sheet + visibility caption (공개 게시물/팔로워 공개/비공개), riding `GET /runs` (kudos_count landed BE `0c60601`).
- **Kudos-sheet scoping note (own-profile build 2026-07-07):** the canvas likers sheet also designs a heart TOGGLE, a self-row with 나 badge + accent ring, and row subtext — all inapplicable own-profile (self-kudos = 400, no subtext source). Those variants apply when the sheet grows into **other-user profile / activity feed** contexts (my_kudos exists there); extract KudosSheet from my-profile.tsx into a shared component at that point.
- ~~Gear icon routes to the 프로필 tab~~ **OBSOLETE 2026-07-08** — gear → 설정 hub (`/settings`) since `cc2839f`, matching the canvas (`settingsHub`).
- **Optional 지연 ask (follow-list, 2026-07-08):** `FollowUserItem` rows carry no bio/location — the canvas's row sub-line ("주 4회 · 서울 마포구") ships omitted (name-only rows) until a `bio` field lands on the row shape.
- **Card social counts DEFERRED — batch ask for 지연 (2026-07-07):** add `kudos_count` (+`comment_count` when run-comments ship) to `GET /runs` rows. Probed: `/runs` has no counts; `/feed/activities` has `kudos_count` for own runs but is interleaved + offset-only → unbounded paging = disguised N+1, rejected per rule. When the field lands: ♥+count / 💬+count left-aligned on the card footer, 💬 tap → activity detail (no comment sheet on this screen).
- **Visibility follow-up — UNBLOCKED (BE `2af3715`, 2026-07-07):** `visibility` now exists on runs and `GET /users/{id}/runs` filters it. Queue: 공개 게시물/팔로워만 corner tag bottom-right per canvas; 비공개 runs excluded from 내 프로필's list (switch its data source to the filtered endpoint or filter client-side) but retained in 기록; section can adopt the 공개 N개 framing.
- ~~지연 ask: legacy-run visibility backfill~~ **RESOLVED (지연 확인, 2026-07-07): visibility is never null** — legacy rows are `'followers'` server-side. Code branches on the explicit value directly (no null guard: `VIS_CAPTION` in my-profile.tsx, typed union on `MyRun`).

## ITEM (queued, premium family, AFTER the walk-fix): 오디오 코치 TTS

Backend serves text cues; sound is frontend via expo-speech reading `cue.text`. Triggers per API_GUIDE coach-script section: start (run start) / distance_km (GPS cumulative reached) / waypoint (within 50m of coords) / finish. Speaker button on tracking = TTS mute toggle. Real-time stat readouts (현재 페이스 등) are computed LOCALLY, cadence from settings `audio_coach.cue_interval_km` — not server script. Wires the P1 음성 안내 toggle (persist-only today) to real behavior.

**Sequencing:** lives in tracking/use-run-tracker = walk-gated territory, and distance-triggered cues depend on the distance filter being FIXED — **hard dependency on the outdoor session's payload (a)+(b)**. 지연's own priority: premium wrap-up, not urgent.

**Recon must:** probe the coach-script endpoint shape live, check expo-speech works in Expo Go (it should — it's in our compatibility list), and read the API_GUIDE timing section.

## ITEM (queued): 공개 프로필 screen

The home-header profile avatar (next to the bell) is now pressable → user profile: avatar/name/location, 팔로잉·팔로워·활동 counts, 프로필 편집 + 프로필 공유 buttons, and 게시한 러닝 (a feed of the user's PUBLIC runs, with 공개 N개 count and 공개 게시물 tags). **Source of truth = live canvas; re-read at planning.** Notes:

- This is the frontend of the strategy-scan item "public profiles + follow/unfollow + follower lists" — backend marked ready (profiles/follow endpoints per her Notion); recon must live-probe those endpoints.
- Depends on run visibility (전체 공개/팔로워만/비공개) existing on runs — same POST /runs contract question already pending with 지연.
- Own-profile vs other-user variant + follower-list screens: check canvas state at recon time; may be partially undesigned.
- Entry point edit touches `app/(tabs)/index.tsx` header (committed territory).

## ~~PAUSED: crew verification desk-test~~ DONE 2026-07-07 (10-step passed, crew set committed `33c9b54`)

*(Ghost cleanup 2026-07-08: the stale "UNCOMMITTED" state block that lived here described the pre-verification world — all six crew files committed 2026-07-07. Surviving facts: demo5 remains the pending-request fixture; world-drift rule stands — always pull current member/request state via API before crew probing.)*

## BENCHED: cold-start lands on 뛰러 가기 (owner call 2026-07-07)

Dev-annoyance, not user-facing-broken — every screen works once past the landing. **Two fixes failed:** (1) `initialRouteName="index"` on the Tabs navigator (committed `a158356`, since reverted — `app/(tabs)/_layout.tsx` now carries the uncommitted removal); (2) `HomeAnchorGuard` one-shot replace at root (never committed, removed) — its home check read `pathname === '/'`, which is exactly the blind spot below.

**Prime suspect (static evidence, unconvicted):** `app/(course)/index.tsx` — committed leftover (`1f85f07`) rendering `<Redirect href='/(tabs)/create'>` ("chooser has moved" note). As an index route it competes for URL `/` against `(tabs)/index`; if `/` resolves there, the Redirect lands on 뛰러 가기. Explains the always-create symptom (hardcoded target), fix-1 failure (root-level resolution precedes tab initialRouteName), and fix-2 failure (its pathname reads `/`, fooling the guard's home check).

**Instrumentation is LIVE (`DEBUG(nav)`, inert):** root `_layout.tsx` (NavProbe: getInitialURL + 5s nav-state listener + AuthGuard branch logs), `(course)/index.tsx` (RENDER line = the conviction), mount logs in `(tabs)/index`, `(tabs)/create`, `(course)/create`, `(course)/tracking`, recovery check. **Next diagnostic step costs nothing: any cold-open with Metro visible → read the `[nav]` block.** Expected conviction pattern: `RENDER (course)/index` → `nav-state → (tabs) → create` → `MOUNT (tabs)/create`.

**Strip/commit bookkeeping:** DEBUG(nav) lines follow the tracker-instrumentation convention — do NOT commit; strip with the eventual fix. Files carrying them: gated set (`(tabs)/index.tsx`, `(course)/tracking.tsx`, `pending-run-recovery.tsx` — strip rides item-17) + newly-dirty committed-territory files (`app/_layout.tsx`, `(tabs)/create.tsx`, `(course)/create.tsx`, `(course)/index.tsx`) + the fix-1 revert (`(tabs)/_layout.tsx`). None of these commit until the bug item resumes.

## PAUSED: tracking-filter under-credit bug (2026-07-06)

**Symptom:** 100+ real meters walked outdoors → filtered distance < 10m → "너무 짧은 러닝은 저장되지 않아요". The GPS filters are eating real distance.

**STATUS**
- Instrumentation is LIVE in `hooks/use-run-tracker.ts`, marked `DEBUG(short-run)`: every GPS fix prints one Metro line with its decision label (`ACCEPT` / `REJECT accuracy>25` / `REJECT speed>7` / `SKIP stationary — ANCHOR MOVED` / `SKIP jitter<5 — anchor held`) plus a running `accepted=` vs `raw=` tally (raw = naive sum over all fixes, gates ignored).
- Zero logic changes; typecheck + lint clean.
- **UNCOMMITTED WIP** — not phone-verified, do not commit yet. (Note: items 16 crew migration + badge fix and 17 코스 러닝 are also uncommitted, pending their own verification; last commit is `3679f51` feed v1.)

**BLOCKED ON** (the one action that unblocks everything)
- A calibrated outdoor walk: KNOWN measured distance, 150–300m, normal pace, phone carried naturally. Reload the app first so the instrumented build is live. Paste the full `[track]` Metro log block into chat.
- Capture 3 numbers: real measured distance / what the app screen credited / final `accepted=` and `raw=` from the last log line.

**DRIVE-TEST OBSERVATIONS (2026-07-08 ~21:15 KST, two phones same car, published bundles — no Metro):**
- test1 phone: 1.72km/6:28 saved; test2 phone (지연): 1.93km/6:50 — **~0.21km (~11%) two-phone divergence in-vehicle**; live distance visibly erratic while driving (expected: driving speed sits at/over the `speed>7` gate, segments drop non-deterministically per phone's fix timing).
- Both rows `has_track: false` + `title: null` — **published bundles predate the gated gps_track + compose code; "야간 러닝" on the device was the client timeTitle DISPLAY fallback, not a stored title.** Compose-screen absence on published bundles = gate artifact, NOT a bug (committed tracking routes directly to 수고했어요; run-save.tsx is untracked at HEAD).
- Caveat for the diagnosis frame: in-vehicle data is OUT OF ENVELOPE for the walking-filter diagnosis (stationary/speed gates behave differently at driving speeds) — do not use tonight's numbers as (a) evidence; Friday's calibrated walk stands.

**DIAGNOSIS FRAME** (don't re-derive)
- `raw ≈ real` but `accepted` tiny → filters are the culprit; the label counts name the guilty gate.
- `raw` ALSO way short → problem is upstream of the gates (fix delivery/throttling) — fix lives elsewhere.
- Ranked suspects: (1) `SKIP stationary — ANCHOR MOVED` — the only gate that DESTROYS distance instead of deferring; fires when OS speed flickers < 0.5 m/s mid-walk. (2) A wall of `REJECT accuracy>25` if urban accuracy sits 20–40m. (3) `SKIP jitter` should be harmless (anchor held, distance defers) — log confirms whether deferred segments actually get credited later. (4) **NEW, observed live 2026-07-08 (배선확인 walk, fix #13): `REJECT speed>7` discretization artifact** — a walking-pace fix rejected at a computed 8.0 m/s because dM=8.0m over dt=1.0s (integer-second dt + segment distance ≫ instantaneous speed); watch for it clustering at short-dt fixes.
- **Capture caveat (2026-07-08):** uploaded `GpsPoint` has NO `speed` field — the OS-speed-driven gates (suspects 1 and the speed>7 reject) CANNOT be reconstructed from the server-side track; per-gate blame requires the live `[track]` Metro log (phone-hotspot tether).

**SEQUENCED FOLLOW-UPS** (only AFTER a real 100m+ walk reliably credits ~100m)
- Raise `MIN_SAVE_KM` 0.01 → 0.05 (50m floor) in `app/(course)/run-result.tsx`.
- Copy update IF any user-facing copy mentions a distance (current copy doesn't — verify before touching).
- Remove all `DEBUG(short-run)` instrumentation.

## Frozen — AI 맞춤 코스 path (keep working; no changes without unfreezing)

- One-time unfreeze 2026-07-06 (owner design change, canvas to follow): the distance slider is now UNIT-NATIVE — km 1–30 / mi 0.5–20 (mi floor = smallest mi step above the server's gt=0; 20mi=32.19km fits the verified le=100 bound, no widen-ask needed). Payload stays km (`distanceKm` state is km-internal; unit switches preserve physical distance). Form re-frozen after this change.

- ~~`.env.local` pinned to a LAN IP~~ **OBSOLETE 2026-07-08** — `EXPO_PUBLIC_API_URL` points at staging (`freshrun-api.fly.dev`) since the 07-07 cutover; the LAN-IP-drift failure class is gone
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

- ~~지연 ask: run comments~~ **SHE'S SHIPPING IT (announced 2026-07-07):** list/create/delete + `comment_count` batched on run rows, visibility-gated. → see "Blocked on 스테이징 반영됨" below.
- ~~지연 ask: `DELETE /notifications/{id}`~~ **LANDED 2026-07-07** (204, list 54→53 verified) — swipe-to-delete built same day. She also shipped unrequested `DELETE /notifications` clear-all (probed on demo5: 204, list emptied) — unwired, see design question in the UNBLOCKED section.
- ~~지연 ask: `crew_announcement` crew_id~~ **SHE'S SHIPPING IT (announced 2026-07-07)** + a full deep-link-id audit across all notification types. Contract per her: OLD rows lack `crew_id` → app degrades those to non-tappable (defensive wiring shipped in the 알림 센터 slice — new rows become tappable automatically). → see "Blocked on 스테이징 반영됨" below.

## ~~Blocked on 스테이징 반영됨~~ UNBLOCKED 2026-07-07 (deploy announced + probe-verified; shapes captured)

1. **프로필 💬 slice — UNBLOCKED, queued behind its canvas design pass.** Probed live: `GET/POST /runs/{id}/comments` + `DELETE /runs/{id}/comments/{comment_id}` (POST 201 → `{id, run_id, user_id, nickname, content, created_at}`; GET → same-shape array; DELETE 204; round-trip left world clean). `comment_count` live on `GET /runs` rows (0 on all current seed runs) and bumps immediately on POST (0→1→deleted→0 verified). Still to probe at build time: `comment_count` on `/users/{id}/runs` + `/feed/activities`, visibility gating (403/404/filtered). **Thread UI has NO canvas design — Claude Design pass first** (likers-sheet pattern).
2. **Notification deep-link upgrades — crew_announcement DONE (swipe slice); rest still gated.** Reality vs the announcement: new rows carry the crew id **nested in `payload.crew_id`** (NOT top-level); **old rows have `payload: null` and their `target_id` is an ANNOUNCEMENT id — the announced "target_id fallback for old rows" is contradicted by staging** (probed on demo3's 4 old rows; navigating with those ids would break crew-detail). Wired: `payload?.crew_id` → crew-detail, old rows stay inert. **지연 note owed:** either backfill old rows' payload or drop the fallback claim from the guide. Route-family graduation still needs the owner-GET social fields / public single-route GET (ask open); user_followed needs the other-user profile screen (its `target_id` = actor uid, confirmed — graduates for free when that screen ships).
3. **NEW discovery, unrequested surface:** crew announcements CRUD + RSVP (`GET/POST /crews/{id}/announcements`, `GET/PATCH/DELETE …/{announcement_id}`, `PUT …/rsvp`; POST requires `{title, body}`) — a whole feature family with no app surface and no canvas design yet. Logged for a future crew item.
4. **DELETE /notifications (clear-all) — exists, deliberately unwired (owner design question):** no 모두 지우기 affordance in any 시안. Owner decides if/where it lives (e.g. app-bar overflow, ✓-long-press, or nowhere); wiring is trivial once designed.
- **지연 ask extension (2026-07-07): owner `GET /routes/{id}` lacks social fields** — response has no `like_count`/`comment_count`/`owner_nickname`/`start_lat`/`start_lng`/`is_mine` (probed on staging), so route_liked/route_commented notifications can't deep-link to course preview without fabricating the very counts the notification is about. Extends the existing "`GET /routes/{id}` owner-only" ask: a single-route GET with the `PublicRouteResponse` shape solves both. Until then those rows are non-tappable.
- **Bell badge deferred with item-17** (owner call 2026-07-07): `index.tsx` is item-17-dirty; the hardcoded dot + existing `/notifications` push stay as-is until that commit lands, then a micro-slice makes the dot truthful (`GET /notifications/unread-count` on mount/focus, dot iff count>0). The push starts working the moment the route exists (this slice).
- **EAS Update PoC RESOLVED (2026-07-07): Expo Go path works** — 지연 opened the published update in plain Expo Go (member account, sdkVersion runtime). Standing workflow now in CLAUDE.md §EAS publish rules; dev-build fallback (decision #5) not needed for this purpose, remains the door for keep-awake/background-GPS/HealthKit.
- ~~Staging URL incoming~~ **LANDED 2026-07-07: `https://freshrun-api.fly.dev`** (same Supabase project — accounts/tokens/seed identical; verified: health 200 `environment: production`, test1 token works, kudos + PATCH /runs markers present = `0c60601`-era code). `.env.local` swapped; outdoor pre-flight 0a–0c deleted. **Protocol: 지연 announces "스테이징 반영됨" on deploys; drift checks now compare against her fly deploy** (see CLAUDE.md gate rule 5). Local uvicorn stays available for offline dev only. **Latency trade (honest): staging /health ≈ 120–130ms warm (~510ms first hit after idle — fly cold start) vs localhost ~5ms — sluggishness in testing is the region/cold-start, not an app bug.**
- ~~Nickname 409~~ **RESOLVED — constraint applied and enforced** (verified 2026-07-06 on running `3f64aba`): real-duplicate probe (`{"nickname":"테스트1"}` as test2) → **409 "Nickname already taken"**. Earlier "still broken" re-probes were **false positives from world drift**: test1 had been renamed 테스트1 during phone verification, so my probe value 한강크루장 was no longer a duplicate (200 was correct). The ORIGINAL 2026-07-05 report was true at the time (rename genuinely succeeded pre-migration); `2026-07-06_profiles_nickname_unique.sql` fixed it. **개인 정보 inline 409 message is now LIVE.**
- ~~승인제 member-join 202~~ **RESOLVED — real members get 409** (verified 2026-07-06: join as demo2/한강질주, a verified current member → **409 "Already a member"** ×2). My re-probes used test2, who is **no longer a crew member** (left during phone verification) — a non-member getting 202+pending is correct behavior. 가입됨 badge stays (correct UX, no longer a bug shield).
- **⚠️ Demo world has drifted from DEMO_ACCOUNTS.md** (from phone sessions + probes): test1 nickname = 테스트1 (not 한강크루장); test2 = NOT a crew member (5 members remain); I deleted two of test2's legitimately-created pending requests during earlier "residue cleanup" under the stale member assumption (disclosed). **Always verify current state via API before probing — never trust the seed doc.** Re-running `seed_demo_data.py` is idempotent-additive but won't undo renames/leaves.

- ~~`POST /api/runs` path field~~ **LANDED** (BE `3779905`, verified 2026-07-06): `gps_track: Optional[list[GpsPoint]]` where `GpsPoint = {lat, lng, t: epoch ms, acc?: m ("강력 권장"), alt?}` — server pipeline owns validation (filters, splits, anti-cheat; out-of-bbox points silently dropped). **Wiring wants `t` + `acc` retention in the tracker's path buffer** (today we keep lat/lng only) — small `use-run-tracker` change that RIDES THE WALK CHAIN (filter fix first; don't upload known-broken tracks to a validating server). Then `SEAM (path upload)` in `lib/runs-api.ts` connects directly.
- `RouteResponse` has no `id` — needed for `runs.route_id` linking after generation
- ~~`OPENWEATHER_API_KEY` missing~~ **RESOLVED 2026-07-06** — key added to backend `.env` (owner), server restarted, `GET /api/weather` verified live with real Seoul data (200, full guide shape incl. `running_index.personalized`). **Weather integration (retire `weather-mock.ts`: home strip, weather-detail, chooser temp) is now fully unblocked** — S/M item, needs plan approval.
- **지연 ask (soft, 2026-07-08): `GET /runs` pagination** — limit-only today (offset ignored); what's the limit ceiling, and is offset/cursor planned? The Supabase→API migration capped the 기록 tab at `limit=100`; histories beyond that truncate until pagination exists.
- `PublicRouteResponse` has no `is_bookmarked` flag — feed v1 works around it with one `GET /routes/bookmarked?limit=100` per feed load (stale icons possible past 100 bookmarks); a response flag like `is_liked` would remove the extra call
- `GET /routes/{id}` is owner-only, even for public routes — blocks id-based course-preview fetch; feed v1 works around it with an in-memory handoff (`store/pending-course.ts`)

## Next named item

- ~~Community crew hooks → backend API migration~~ DONE 2026-07-05 (item 16): all crew reads/writes via `/api/crews/*`, approval flow + invite-code join shipped, interim guard and direct-insert mutations removed.

## Crew follow-ups (from item 16)

- **Member-join 409 fix: PARTIAL as of BE `ccac76b` (2026-07-06)** — guide now claims race-proof 409-first, and open-crew `join_crew` checks membership, but the **승인제 request path still returns 202 + creates a phantom for members** (reproduced live as test2, phantoms cleaned). Re-report to her with repro: token as test2 → `POST /crews/{한강crewId}/join` → expect 409, got 202. Our 가입됨 badge guard stays necessary.
- **`GET /me/join-requests` SHIPPED** (BE has `test_my_join_requests_integration.py`) — Stage B unblocked: hydrate `store/join-requests.ts` once per browse load for cross-session truthful badges. `hydrate()` is already in the store waiting. Verify exact path/shape in Swagger before wiring.
- New premium endpoints landed 2026-07-06 (future items): `POST /routes/{id}/coach-script` (오디오 코치, premium, 403 premium_required for free), `GET /me/insights/monthly` (월간 인사이트, premium).
- **Design decision (owner+backend, 2026-07-07): AI feedback/coach-insight card is REMOVED from the 수고했어요 screen (run-result)** — never build it there. If/when coach-script ships, it lives on activity detail or its own surface, not the completion screen. (Nothing to remove app-side — the card was never built.)

- Owner-side invite code UI (issue/rotate/share) — **correction 2026-07-07: a bundle design DOES exist** (`FrCrewInvite`, crew-create.jsx:380); earlier "no design" note was wrong. Buildable as its own item; the create-success modal's 초대하기 CTA (준비 중 for now) is its entry point.
- **첫 챌린지 at crew creation — deferred (owner call 2026-07-07)**: pair with the challenge-display item (crew-detail renders no challenges yet; `POST /crews/{id}/challenges` exists). The design's 첫 챌린지 form block joins that item.
- Invite-code entry sheet + row are invented UI — canvas design to follow; flag visual mismatches then (user note, 2026-07-05).
- `CrewMemberResponse` has no `avatar_url` — member list uses initials avatars; raise with partner if photos matter.

## Small improvements from API_GUIDE.md (2026-07-05)

- `lib/api.ts`: guide §2 recommends 401 → `supabase.auth.refreshSession()` + one retry before failing — our wrapper doesn't do this yet
- Error handling: guide §5 says `detail` may be a structured object (`{error, message, ...}`), and 429 quota errors carry `{limit, used, remaining, reset_at}` — our mappers only read string `detail`
- Home feed v1 target per guide §4: `GET /feed` (course feed, `PublicRouteResponse[]` with `like_count`/`is_liked`/`comment_count`/`polyline`); run activity feed (`/feed/activities` + kudos) is the agreed v2

## Canvas parity list — design-side corrections owed (code is right; don't re-flag as drift)

- **timeTitle 7-bucket** — canvas run-save suggestion fn is 5-bucket; owner KEPT code's 7 buckets (새벽 04:00–06:59 … 야간 21:00–03:59), canvas to be updated (also noted in the 러닝 저장 delta calls above).
- **햅틱 피드백 sub-label (설정 hub)** — canvas says "목표 달성 시 진동", which mis-describes live behavior (haptics fire on button interactions — hold-stop — not goal events). Shipped as "버튼 조작 시 진동" (owner, 2026-07-07); canvas copy to be corrected.
- **💬 omission (내 프로필 card footer)** — app-side interim, NOT a canvas correction: canvas footer shows 💬 + count, but run comments don't exist server-side (지연 ask logged). Shipping a dead 💬 would violate the honesty rule; add it (canvas-verbatim) when her comments API lands.
- **FrNotifications refresh owed (canvas)** — the canvas notifications screen is a pre-contract concept (AI recommendation / friend-request 수락·거절 / XP achievement / live session / premium rows) and matches none of the real 9 types. App shipped 2026-07-07 in the canvas SHELL (app bar + ✓ read-all + card anatomy) with owner-approved type→copy/icon mapping + unread treatment (accent dot + faint tint), **plus the canvas tab pattern over four REAL-type tabs (owner calls): 전체 · 팔로우 (user_followed — follows, NOT friend-requests; the concept's 수락/거절 buttons stay fiction) · 소셜 (run_kudoed/route_liked/route_commented) · 크루 (crew_joined/join_requested/join_approved/crew_announcement); challenge_completed + unknown types 전체-only until a 시스템 tab earns members.** Canvas refresh should carry these four tabs; on refresh, re-conform the app rows.

## 타인 프로필 + tappable names — BUILT 2026-07-08 (slice a), riders recorded

- **Riders in item-17-gated `index.tsx` (commit with the walk gate): TWO, not one** — owner message said "lone (b) rider" (course comments) but feed-card authors live in the same gated file; both wired via `openProfile`, both ride. Everything else (likers sheet, follow-list, notification actors + user_followed graduation, crew members, 저장된 코스 owners) is committed-territory.
- **Parity/interim notes:** 활동 count = `public_run_count` with the 공개 N개 framing explaining it; visibility caption omitted on other-user cards (server sends `visibility: null` on others' rows — **지연 ask: populate it for viewable rows**); 💬 omitted (graduates with the thread slice on BOTH profile surfaces); location line + card tags omitted (standing no-backend fields).
- user_followed notification rows now navigate (chevron appeared automatically via deepLink).

## ~~OPEN DECISION~~ RESOLVED: 저장된 코스 entry = canvas position (owner ruling 2026-07-08)

Entry wired as the 뛰러 가기 chooser bottom card (`create.tsx` — the dead placeholder row went live: push + filled/outline icon + first-2-titles sub + count pill, focus-refetched). The header-icon spec was a stale premise (FrGreeting has bell+avatar only — verified on live canvas); good-catch hold, owner reverted to canvas.

Parity notes (app-side interims, canvas refresh candidates): undo snackbar on unsave (no 시안); tag chips dropped (no server tags); region chips derive from summary keywords (no area field).

## T2 — 다크 렌더링 sweep (named, sized — approved for TODO 2026-07-06)

Converge the two theme systems (`lib/theme` → themed hook backed by `contexts/theme`, fed by the persisted `settings.theme` instead of the device scheme), restructure ~20 module-scope StyleSheets into theme-aware factories, triage 113 color literals (audit 2026-07-06: worst files index.tsx 19, crew-detail 15, tracking 11; maps/scrims are dark-by-design and stay), wire the status bar to the setting. **Size: units sweep ×3–4. Schedule after crew/item-17 verification debt clears.** Until then the theme picker (T1) is persist-only with an in-UI notice.

## Later items (noted)

- Course-run polish: draw the live GPS trail *and* the course shape together on the tracking map (MiniMap renders one path today); AI-generated courses can't start a tracked run until `RouteResponse` gains an `id` (existing backend ask) — create-flow "시작하기" stays frozen until then

- Real base map (Kakao via JS-SDK WebView) — considered for the live-tracking screen only. Partner's existing key is REST (server-side only, cannot render maps); a JS key has been requested from her. When it arrives: put it in the app's `.env.local` as `EXPO_PUBLIC_KAKAO_JS_KEY`, and the integration item MUST include registering the platform/origin in her Kakao developers console — unregistered origins fail silently (blank map, no error)
- Background GPS tracking (runs keep recording with the app backgrounded) — requires a dev build (not Expo Go), `expo-location` plugin config + `UIBackgroundModes` + background permission + TaskManager; slice 2 is deliberately foreground-only with straight-line gap bridging
- Wire course-preview's "네, 뛸게요" → tracking with course param + title pill (tracking slice 2)
