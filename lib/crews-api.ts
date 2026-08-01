// Crew API layer — /api/crews/* per docs/API_GUIDE.md. Replaces the direct
// Supabase reads/writes that lived in hooks/use-crews.ts before the migration.

import { ApiError, apiFetch, apiRequest } from '@/lib/api';
import { t, tf, type StringKey } from '@/lib/i18n';

// ─── Types (Crew shape kept from the pre-migration hook — screens are typed
//     against it; re-exported from hooks/use-crews.ts) ─────────────────────────

export type CrewLevel = '무관' | '입문' | '중급' | '고급';

export type Crew = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  area: string | null;
  radius_km: number | null;
  sport: string | null;
  level: CrewLevel;
  max_members: number | null;
  is_public: boolean;
  active_days: string[] | null;
  active_time: string | null;
  color: string | null;
  cover_url: string | null; // BE 87a4026 크루 이미지 — hero band photo (staff-set)
  icon_url: string | null;  // card/hero identity image
  join_policy: 'open' | 'approval';
  member_count: number;
  owner_nickname: string | null;
  // 당근식 둘러보기 fields (BE update, probed 2026-07-09) — null on
  // location-less crews; distance_km only when lat+lng were queried
  sido: string | null;
  sigungu: string | null;
  tags: string[];
  distance_km: number | null;
  admin_count: number | null; // v2 (BE 28a5c25) — admins EXCL. owner; null pre-v2
  // 집결 장소 — crew-native standing meetup (지연 deploy, probed 2026-07-14):
  // nullable trio; explicit null=clear / omit=keep / lat+lng together (region
  // pattern); bbox+≤100 validation server-side. null = unset → card hides.
  meet_place_name: string | null;
  meet_lat: number | null;
  meet_lng: number | null;
  myRole?: 'owner' | 'admin' | 'member';
};

/** 세부 권한 5키 (v2, BE 28a5c25 — guide §207). role은 표시·정렬용,
    행동 판별은 이 키들. owner는 멤버 응답에 all-true 합성(암묵 전권),
    member는 null. 승격 기본값: announcements·challenges ON, 나머지 OFF
    (probed 2026-07-13). */
export type CrewPermissions = {
  announcements: boolean;
  challenges: boolean;
  edit_crew: boolean;
  kick_members: boolean;
  manage_admins: boolean;
};

export type CrewMember = {
  user_id: string;
  role: 'owner' | 'admin' | 'member'; // admin: BE f68a48f v1
  joined_at: string;
  nickname: string;
  avatar_url: string | null; // served since BE 5009cbe (avatar wire-up)
  challenge_km: number;      // BE 7ec4a96 — 현재 챌린지 per-member aggregate
  permissions: CrewPermissions | null; // v2 — null for plain members
};

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected';
export type JoinResult = 'joined' | 'pending' | 'already_member';

// Raw server shape (CrewResponse)
type ServerCrew = {
  id: string;
  created_at: string;
  owner_id: string;
  name: string;
  description: string | null;
  area: string | null;
  radius_km: number | null;
  sport: string | null;
  level: string;
  max_members: number | null;
  is_public: boolean;
  join_policy: string;
  active_days: string[];
  active_time: string | null;
  color: string | null;
  cover_url?: string | null;
  icon_url?: string | null;
  member_count: number;
  owner_nickname: string | null;
  sido?: string | null;
  sigungu?: string | null;
  lat?: number | null;
  lng?: number | null;
  tags?: string[];
  distance_km?: number | null;
  admin_count?: number | null; // v2 (BE 28a5c25)
  meet_place_name?: string | null;
  meet_lat?: number | null;
  meet_lng?: number | null;
};

type ServerMember = {
  user_id: string;
  nickname: string | null;
  avatar_url: string | null; // BE 5009cbe (avatar wire-up)
  role: string;
  joined_at: string;
  challenge_km?: number;
  permissions?: CrewPermissions | null; // v2 (BE 28a5c25)
};

export function mapCrew(row: ServerCrew, myRole?: 'owner' | 'admin' | 'member'): Crew {
  return {
    id:          row.id,
    owner_id:    row.owner_id,
    name:        row.name,
    description: row.description ?? null,
    area:        row.area ?? null,
    radius_km:   row.radius_km ?? null,
    sport:       row.sport ?? null,
    level:       row.level as CrewLevel,
    max_members: row.max_members ?? null,
    is_public:   row.is_public,
    active_days: row.active_days ?? null,
    active_time: row.active_time ?? null,
    color:       row.color ?? null,
    cover_url:   row.cover_url ?? null,
    icon_url:    row.icon_url ?? null,
    join_policy: (row.join_policy as 'open' | 'approval') ?? 'open',
    member_count: row.member_count,
    owner_nickname: row.owner_nickname ?? null,
    sido:        row.sido ?? null,
    sigungu:     row.sigungu ?? null,
    tags:        row.tags ?? [],
    distance_km: row.distance_km ?? null,
    admin_count: row.admin_count ?? null,
    meet_place_name: row.meet_place_name ?? null,
    meet_lat:        row.meet_lat ?? null,
    meet_lng:        row.meet_lng ?? null,
    myRole,
  };
}

function mapMember(row: ServerMember): CrewMember {
  return {
    user_id:    row.user_id,
    role:       (row.role as 'owner' | 'admin' | 'member') ?? 'member',
    joined_at:  row.joined_at,
    nickname:   row.nickname ?? t('home.runner'),
    challenge_km: row.challenge_km ?? 0,
    avatar_url: row.avatar_url ?? null,
    permissions: row.permissions ?? null,
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────

// 둘러보기 필드 (guide §202): tags = 서버 정의 어휘 13종 (자유입력 아님 —
// 목록 밖 값은 422), 저장 ≤5개·카드엔 2개. sido = 17개 표준명(korea-regions),
// sigungu = 자유 문자열. lat/lng = 한국 bbox (거리순 정렬용).
// Tag VALUES are the server vocabulary (목록 밖 422) — wire stays ko; display
// localizes via TAG_LABEL_KEY (the server-value enum class). Group labels are
// keys resolved at render (static-capture rule).
export const CREW_TAG_GROUPS: { label: StringKey; tags: string[] }[] = [
  { label: 'tagG.time',    tags: ['새벽', '아침', '저녁', '야간', '주말'] },
  { label: 'tagG.terrain', tags: ['평지', '트레일', '언덕'] },
  { label: 'tagG.vibe',    tags: ['입문환영', '기록도전', '친목', '여성전용', '페이스그룹'] },
];
export const TAG_LABEL_KEY: Record<string, StringKey> = {
  새벽: 'tag.dawn', 아침: 'tag.morning', 저녁: 'tag.evening', 야간: 'tag.night', 주말: 'tag.weekend',
  평지: 'tag.flat', 트레일: 'tag.trail', 언덕: 'tag.hill',
  입문환영: 'tag.beginners', 기록도전: 'tag.record', 친목: 'tag.social', 여성전용: 'tag.womenOnly', 페이스그룹: 'tag.paceGroup',
};
export const LEVEL_LABEL_KEY: Record<string, StringKey> = {
  입문: 'crw.lvBeginner', 중급: 'crw.lvMid', 고급: 'crw.lvAdv', 무관: 'crw.lvAny',
};
/** Localized level chip label — server level values render through this. */
export function levelLabel(level: string): string {
  const k = LEVEL_LABEL_KEY[level];
  return k ? t(k) : level;
}
/** Localized tag chip label — server tag values render through this. */
export function tagLabel(tag: string): string {
  const k = TAG_LABEL_KEY[tag];
  return k ? t(k) : tag;
}
export const CREW_TAG_MAX = 5;

/** 둘러보기 discovery fields — sending sido/sigungu makes a crew findable in
    the region filter (the decay fix); lat/lng adds distance sort. */
type CrewDiscoveryFields = {
  sido?: string | null;
  sigungu?: string | null;
  lat?: number | null;
  lng?: number | null;
  tags?: string[];
  // 집결 장소 (2026-07-14) — same null-clear semantics as the region quartet
  meet_place_name?: string | null;
  meet_lat?: number | null;
  meet_lng?: number | null;
};

export type CrewCreateInput = {
  name: string;                       // server min 1; client enforces ≥2 per design
  description?: string | null;
  area?: string | null;
  radius_km?: number | null;
  sport?: string | null;
  level?: CrewLevel;
  max_members?: number | null;
  is_public?: boolean;                // 비공개 = false (join via invite code only)
  join_policy?: 'open' | 'approval';
  active_days?: string[];
  active_time?: string | null;
  color?: string | null;
} & CrewDiscoveryFields;

/** POST /crews — free tier: 1 owned crew (403 premium_required beyond);
    returns the full crew, creator auto-membered. */
export async function createCrew(input: CrewCreateInput): Promise<Crew> {
  const row = await apiFetch<ServerCrew>('/api/crews', { method: 'POST', body: input });
  return mapCrew(row, 'owner');
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/** 당근식 둘러보기 params: lat+lng (both) → distance_km + 거리 오름차순;
    sido/sigungu → 행정구역 filter; include_full=false(default) excludes
    full crews. Parameterless = 기존 동작. */
export type ListCrewsParams = {
  sido?: string;
  sigungu?: string;
  lat?: number;
  lng?: number;
  includeFull?: boolean;
};

export async function listCrews(params: ListCrewsParams = {}): Promise<ServerCrew[]> {
  const q = new URLSearchParams();
  if (params.sido) q.set('sido', params.sido);
  if (params.sigungu) q.set('sigungu', params.sigungu);
  if (params.lat != null && params.lng != null) {
    q.set('lat', String(params.lat));
    q.set('lng', String(params.lng));
  }
  if (params.includeFull) q.set('include_full', 'true');
  const qs = q.toString();
  return apiFetch<ServerCrew[]>(`/api/crews${qs ? `?${qs}` : ''}`);
}

export async function listMyCrews(): Promise<ServerCrew[]> {
  return apiFetch<ServerCrew[]>('/api/crews/mine');
}

export async function getCrew(id: string): Promise<ServerCrew> {
  return apiFetch<ServerCrew>(`/api/crews/${id}`);
}

export async function getCrewMembers(id: string): Promise<CrewMember[]> {
  const rows = await apiFetch<ServerMember[]>(`/api/crews/${id}/members`);
  return rows.map(mapMember);
}

// ─── Join / leave ─────────────────────────────────────────────────────────────

/** 200 → joined immediately (open crew); 202 → request pending (approval crew);
    409 already_requested → pending; other 409 → already a member. */
export async function joinCrew(id: string): Promise<JoinResult> {
  try {
    const { status } = await apiRequest<unknown>(`/api/crews/${id}/join`, { method: 'POST' });
    return status === 202 ? 'pending' : 'joined';
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      return e.code === 'already_requested' ? 'pending' : 'already_member';
    }
    throw e;
  }
}

export async function leaveCrew(id: string): Promise<void> {
  await apiFetch<void>(`/api/crews/${id}/leave`, { method: 'DELETE' });
}

// ─── Member management (M3, BE f68a48f admin v1) ─────────────────────────────

/** v2: owner OR manage_admins admin, 멱등; target=owner → 422 (transfer only).
    승격은 서버가 기본 permissions를 자동 부여(공지·챌린지 ON), 강등은 null. */
export async function setMemberRole(crewId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
  await apiFetch<void>(`/api/crews/${crewId}/members/${userId}/role`, {
    method: 'PATCH',
    body: { role },
  });
}

/** 세부 권한 PATCH (v2, probed 2026-07-13): partial — send ONLY changed keys.
    위임 사슬 §3: manage_admins admin은 자기 보유 키만 부여 가능, 주의 2키
    (kick_members·manage_admins)는 owner만, 셀프 manage_admins 회수 불가 —
    위반은 403 "Cannot grant this permission". target=owner 422, member 대상
    422. 200 = updated row. */
export async function updateMemberPermissions(
  crewId: string, userId: string, patch: Partial<CrewPermissions>,
): Promise<void> {
  await apiFetch<void>(`/api/crews/${crewId}/members/${userId}/permissions`, {
    method: 'PATCH',
    body: patch,
  });
}

/** Kick — owner||admin; admins may kick members only (admin/owner target → 403);
    self-kick → 400. The UI renders these as disabled affordances. */
export async function kickMember(crewId: string, userId: string): Promise<void> {
  await apiFetch<void>(`/api/crews/${crewId}/members/${userId}`, { method: 'DELETE' });
}

// ─── 인앱 개인 초대 (BE 23d2936, guide §215 — probed 2026-07-13) ─────────────
// 크루원이면 누구나 비크루원을 초대 (NOT a permission key — any-member confirmed
// live: a non-owner admin sent 204). 204 = 대상에게 crew_invited 알림(초대코드).
// 이미 크루원 409. 비크루원 발송자·차단 관계·프로필 없는 유저 404 은닉. RE-INVITE
// = 204 멱등(중복 dedup 없음 — 그냥 재알림, probed). 초대코드 없으면 자동 발급.
export type InviteResult = 'sent' | 'already_member';

export async function inviteToCrew(crewId: string, userId: string): Promise<InviteResult> {
  try {
    await apiFetch<void>(`/api/crews/${crewId}/invitations`, { method: 'POST', body: { user_id: userId } });
    return 'sent';
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 409) return 'already_member';
    throw e; // 404 은닉 (차단·비크루원 발송자·프로필 없음) → caller shows a friendly line
  }
}

// ─── Ranking (M2b) — 이번 주 KST 거리순; verified GPS runs only ───────────────

export type CrewRankingEntry = {
  rank: number;
  user_id: string;
  nickname: string | null;
  avatar_url: string | null; // BE 5009cbe (avatar wire-up)
  distance_km: number;
  me: boolean;
};

// ─── 크루 러닝 피드 (BE, guide §217 — probed 2026-07-13) ─────────────────────
// 크루원들의 최근 run, ran_at 최신순. 크루원만(비크루원 403). visibility 적용:
// private만 제외, public·followers는 크루원에게 노출 (크루=활동 공유 관계).
// 탈퇴 멤버 run 자동 제외. v3.6: 차단 상대 카드 서버 제외 (zero FE).
// Pagination = limit&offset (활동 피드와 동형, chat before= 커서 아님).
// 엣지 ⓑ (probed): 잠금 프로필 멤버의 run도 카드로 뜨고, 탭 → 상세 200
//   (프로필/히스토리는 잠겨도 "서피스에 보이는 카드는 상세까지").
// kudos_count/my_kudos: 그녀 8/3 배포로 합류 (K1 시맨틱·배치 — 8/5 프로브:
//   {kudos_count, my_kudos, allow_likes} 전 로우 라이브) — 크루-♥ 와이어링
//   슬라이스가 소비. comment_count 종전 그대로.
// L1 크루 러닝 세션 태깅 (BE 09d7af0, guide §217 — probed live 2026-07-13):
//   is_crew_session=true → "정기런" 배지 + session_participant_count("N명 참여",
//   같은 세션 distinct 참여자). 참여자 수 = 참석 집계(verified 무관·수동 러닝도
//   카운트)·private 제외·차단 전역 카운트(명단은 L2). 미태그 run은 false/null.
export type CrewRunItem = {
  run_id: string;
  user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  ran_at: string;
  title: string | null;
  distance_km: number;
  duration_sec: number;
  avg_pace_sec_per_km: number | null;
  route_id: string | null;
  area: string | null;
  photo_thumb: string | null;   // signed URL (1h) — 8/5 media fix: card renders it FIRST (photo > map, 기록 parity); never cached
  polyline_thumb: { lat: number; lng: number }[] | null;
  route_summary: string | null;
  comment_count: number;
  /** pre-render feed-hint flags (BE 4fd5b66): true=on, false=off, null=locked/unknown */
  allow_likes: boolean | null;
  kudos_count: number;
  my_kudos: boolean;
  allow_comments: boolean | null;
  /** L1 정기런 태그 (BE 09d7af0): true → "정기런" 배지; false = 일반 러닝 */
  is_crew_session: boolean;
  /** 같은 세션 참여자 수 ("N명 참여"); null = 미태그 run */
  session_participant_count: number | null;
  /** 세션-콜랩스 (그녀 8/5 계약, LIVE): 세션 런 = 실키, 그 외 null.
      프리픽스 a:{id} = 공지 기반 (정밀) · c:{crewId}:{date} = 동일-일
      애드혹 버킷. 키 공유 로우는 카드 하나로 흡수. */
  session_key: string | null;
};

export const CREW_FEED_PAGE = 20;

/** Crew run feed — members only (403 hides for non-members). offset-paginated.
    ALWAYS crew-tagged 정기런 only (owner ruling 2026-07-13 [final]): a crew feed
    of members' unrelated solo runs isn't a crew feed — the firehose reads worse
    than an honest empty state. `session_only=true` is hard-coded (probed staging:
    omit=full feed, true=tagged only, empty → [] 200); no caller wants the
    firehose, so there's no arg to pass wrong. */
/** Session-collapse grouping (derivation-over-state, the replies pattern):
    rows sharing a non-null session_key become ONE group anchored on the
    EARLIEST run (its media/identity lead the card); the group sits at the
    first-seen row's position (server order preserved — "absorb, never
    spawn"). Null keys never group (trivially null-safe: the null branch
    pushes an individual group). Later pages absorb by construction — the
    caller re-derives from the full flat array on every append.
    participant count is read VERBATIM off the anchor (server-global). */
export type CrewRunGroup = { anchor: CrewRunItem; sessionKey: string | null; groupSize: number };
export function groupCrewSessions(rows: CrewRunItem[]): CrewRunGroup[] {
  const out: CrewRunGroup[] = [];
  const byKey = new Map<string, number>();
  for (const r of rows) {
    const k = r.session_key;
    if (!k) { out.push({ anchor: r, sessionKey: null, groupSize: 1 }); continue; }
    const idx = byKey.get(k);
    if (idx == null) {
      byKey.set(k, out.length);
      out.push({ anchor: r, sessionKey: k, groupSize: 1 });
    } else {
      const g = out[idx];
      g.groupSize += 1;
      if (r.ran_at < g.anchor.ran_at) g.anchor = r; // earliest leads
    }
  }
  return out;
}

export function getCrewRuns(crewId: string, offset = 0, limit = CREW_FEED_PAGE): Promise<CrewRunItem[]> {
  return apiFetch<CrewRunItem[]>(`/api/crews/${crewId}/runs?limit=${limit}&offset=${offset}&session_only=true`);
}

// ─── 크루 이미지 (BE 87a4026, guide "크루 이미지 업로드" — probed 2026-07-13) ──
// Avatar-isomorphic 3-step: upload-url → PUT → PATCH {cover_url|icon_url}
// w/ ?v= cache-bust. Fixed path per crew (re-upload overwrites). 운영진 get
// the upload-url BUT the attach PATCH is 크루장만 (403 probed — 지연 flag
// ledgered): the FE gates the whole affordance to OWNER until she
// special-cases the image fields. ⚠️ PUBLIC bucket — the caller must pass
// an already re-encoded, EXIF-free uri (avatar-crop output or
// reencodeForUpload), never a raw picker uri.

type CrewImageUploadUrl = {
  upload_url: string;
  public_url: string;
  max_bytes: number;
  allowed_types: string[];
};

export async function uploadCrewImage(
  crewId: string,
  kind: 'cover' | 'icon',
  cleanLocalUri: string,
): Promise<string> {
  const { upload_url, public_url } = await apiFetch<CrewImageUploadUrl>(
    `/api/crews/${crewId}/${kind}/upload-url`, { method: 'POST' });
  const bytes = await (await fetch(cleanLocalUri)).blob();
  const put = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: bytes,
  });
  if (!put.ok) throw new Error(tf('crw.uploadFail', { s: put.status }));
  const busted = `${public_url}?v=${Date.now()}`;
  await apiFetch<void>(`/api/crews/${crewId}`, {
    method: 'PATCH',
    body: { [kind === 'cover' ? 'cover_url' : 'icon_url']: busted },
  });
  return busted;
}

export async function getCrewRanking(crewId: string): Promise<CrewRankingEntry[]> {
  return apiFetch<CrewRankingEntry[]>(`/api/crews/${crewId}/ranking`);
}

// ─── Crew edit / delete (owner-only — both 403-probed 2026-07-15) ─────────────

export type CrewUpdateInput = Partial<{
  name: string;               // ≤50
  description: string | null; // ≤500
  area: string | null;        // ≤50
  radius_km: number;          // 0<r≤500
  sport: string;              // ≤30
  level: CrewLevel;
  max_members: number;        // ≤100000
  is_public: boolean;
  join_policy: 'open' | 'approval';
  active_days: string[];      // ≤7
  active_time: string | null;
  color: string;
}> & CrewDiscoveryFields; // 둘러보기 backfill — an owner can add location/tags to a location-less crew

/** Partial update — only provided fields are written (BE CrewUpdate). */
export async function updateCrew(id: string, patch: CrewUpdateInput): Promise<Crew> {
  const row = await apiFetch<ServerCrew>(`/api/crews/${id}`, { method: 'PATCH', body: patch });
  return mapCrew(row, 'owner');
}

/** Owner-only. Deletes WITH members — no empty-first requirement: the DB
    cascade removes memberships, 공지, RSVP (+ crew-targeted notifications,
    BE M10); members' RUNS are untouched (runs reference users, not crews).
    The free-plan crew slot frees up (guide §189). */
export function deleteCrew(id: string): Promise<void> {
  return apiFetch<void>(`/api/crews/${id}`, { method: 'DELETE' });
}

// ─── 가입 신청 관리 (owner-only, guide §200-201) ───────────────────────────────
// List = PENDING only, newest first; non-owner → 403 (probed 2026-07-15).
// No avatar_url in this payload (지연-observation — the avatar batch skipped
// JoinRequestItem); nickname nullable → '러너' fallback.

export type CrewJoinRequest = {
  id: string;
  user_id: string;
  nickname: string | null;
  created_at: string;
};

export function listJoinRequests(crewId: string): Promise<CrewJoinRequest[]> {
  return apiFetch<CrewJoinRequest[]>(`/api/crews/${crewId}/join-requests?limit=100`);
}

/** 204; 409 = 정원 초과 (request stays pending); 404 = already decided. */
export function approveJoinRequest(crewId: string, requestId: string): Promise<void> {
  return apiFetch<void>(`/api/crews/${crewId}/join-requests/${requestId}/approve`, { method: 'POST' });
}

/** 204 — silent to the requester BY DESIGN (guide §198: no rejection
    notification; their button state comes from join-requests/me). */
export function rejectJoinRequest(crewId: string, requestId: string): Promise<void> {
  return apiFetch<void>(`/api/crews/${crewId}/join-requests/${requestId}/reject`, { method: 'POST' });
}

// ─── Invite code (owner-only, guide §204) ─────────────────────────────────────
// 8 chars A-Z/2-9 (no I/O/0/1). GET 404 = not yet issued → POST issues.
// POST REGENERATES: the old code (and every shared link carrying it) dies
// immediately — the UI's confirm must say so.

export async function getInviteCode(crewId: string): Promise<string | null> {
  try {
    const r = await apiFetch<{ code: string }>(`/api/crews/${crewId}/invite`);
    return r.code;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null; // 미발급
    throw e;
  }
}

export async function issueInviteCode(crewId: string): Promise<string> {
  const r = await apiFetch<{ code: string }>(`/api/crews/${crewId}/invite`, { method: 'POST' });
  return r.code;
}

/** name/area/description 부분일치 (guide §188) — no region params: search is
    GLOBAL, the browse region filter doesn't apply to results. */
export async function searchCrews(q: string): Promise<Crew[]> {
  const rows = await apiFetch<ServerCrew[]>(`/api/crews/search?q=${encodeURIComponent(q)}`);
  return rows.map(r => mapCrew(r));
}

/** Owner-only (403 otherwise — probed 2026-07-15): hand ownership to a
    member. `leave_after` keeps the old owner as a regular member when false
    (our UI's semantics). Body shape per BE TransferRequest. */
export function transferCrew(crewId: string, newOwnerId: string): Promise<void> {
  return apiFetch<void>(`/api/crews/${crewId}/transfer`, {
    method: 'PATCH',
    body: { new_owner_id: newOwnerId, leave_after: false },
  });
}

// ─── My join requests (Stage B, guide §197) ──────────────────────────────────

export type MyJoinRequest = {
  crew_id: string;
  crew_name: string;
  status: JoinRequestStatus;
  created_at: string;
  decided_at: string | null;
};

/** ALL my join requests across crews, newest first (probed 2026-07-14).
    Badge consumers must filter status === 'pending' — approved/rejected
    rows are history, not open requests. */
export function getMyJoinRequests(): Promise<MyJoinRequest[]> {
  return apiFetch<MyJoinRequest[]>('/api/me/join-requests?limit=50');
}

// ─── Join requests (approval crews) ──────────────────────────────────────────

/** null = no request on record (guide: 404 means "가입 신청" is available). */
export async function getMyJoinRequestStatus(crewId: string): Promise<JoinRequestStatus | null> {
  try {
    const r = await apiFetch<{ status: JoinRequestStatus }>(`/api/crews/${crewId}/join-requests/me`);
    return r.status;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function cancelJoinRequest(crewId: string): Promise<void> {
  await apiFetch<void>(`/api/crews/${crewId}/join-requests/me`, { method: 'DELETE' });
}

// ─── Invite codes ─────────────────────────────────────────────────────────────

/** Preview which crew a code belongs to before joining (works for private crews). */
export async function previewCrewByCode(code: string): Promise<ServerCrew> {
  return apiFetch<ServerCrew>(`/api/crews/preview-by-code?code=${encodeURIComponent(code.trim())}`);
}

/** Immediate join regardless of join_policy/visibility — the code IS the invite. */
export async function joinCrewByCode(code: string): Promise<ServerCrew> {
  return apiFetch<ServerCrew>('/api/crews/join-by-code', {
    method: 'POST',
    body: { code: code.trim() },
  });
}
