// Crew API layer — /api/crews/* per docs/API_GUIDE.md. Replaces the direct
// Supabase reads/writes that lived in hooks/use-crews.ts before the migration.

import { ApiError, apiFetch, apiRequest } from '@/lib/api';

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
  join_policy: 'open' | 'approval';
  member_count: number;
  owner_nickname: string | null;
  myRole?: 'owner' | 'member';
};

export type CrewMember = {
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  nickname: string;
  avatar_url: string | null; // not in CrewMemberResponse yet — initials avatar
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
  member_count: number;
  owner_nickname: string | null;
};

type ServerMember = {
  user_id: string;
  nickname: string | null;
  role: string;
  joined_at: string;
};

export function mapCrew(row: ServerCrew, myRole?: 'owner' | 'member'): Crew {
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
    join_policy: (row.join_policy as 'open' | 'approval') ?? 'open',
    member_count: row.member_count,
    owner_nickname: row.owner_nickname ?? null,
    myRole,
  };
}

function mapMember(row: ServerMember): CrewMember {
  return {
    user_id:    row.user_id,
    role:       (row.role as 'owner' | 'member') ?? 'member',
    joined_at:  row.joined_at,
    nickname:   row.nickname ?? '러너',
    avatar_url: null,
  };
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function listCrews(): Promise<ServerCrew[]> {
  return apiFetch<ServerCrew[]>('/api/crews');
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
