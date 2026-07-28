// 신고 — 지연's POST /reports (probed staging 2026-07-14: 204 · duplicate 204
// idempotent · self 400 · 404 은닉 · bad reason 422). THE UX RULE IS LAW:
// 204 AND 404 both render "신고가 접수되었어요" — never reveal target state
// to the reporter (the 404-은닉 twin of the send-invite rule). Report ≠
// block: independent affordances. v1.1 (BE 07f1f8f) opened target_type
// 'run' — wired 2026-07-20 (run-reporting slice); 'comment' still pending
// her shape.
import { ApiError, apiFetch } from '@/lib/api';

// reason CODES are the wire contract (server enum + DB CHECK — anything else
// 422s); labels are DISPLAY ONLY, resolved at render (server-value enum class)
export const REPORT_REASONS = [
  { value: 'spam',          label: 'rpt.spam' },
  { value: 'abuse',         label: 'rpt.abuse' },
  { value: 'inappropriate', label: 'rpt.inappropriate' },
  { value: 'impersonation', label: 'rpt.impersonation' },
  { value: 'other',         label: 'rpt.other' },
] as const;
export type ReportReason = typeof REPORT_REASONS[number]['value'];

/** Resolves on 204 AND on 404 (은닉 — the reporter learns nothing either way).
    Throws only on real failures (network, 400 self, 422). detail ≤500. */
async function report(
  targetType: 'user' | 'run',
  targetId: string,
  reason: ReportReason,
  detail?: string,
): Promise<void> {
  try {
    await apiFetch<void>('/api/reports', {
      method: 'POST',
      body: {
        target_type: targetType,
        target_id: targetId,
        reason,
        ...(detail?.trim() ? { detail: detail.trim().slice(0, 500) } : {}),
      },
    });
  } catch (e: unknown) {
    if (e instanceof ApiError && e.status === 404) return; // 은닉 — same 접수 face
    throw e;
  }
}

export function reportUser(targetId: string, reason: ReportReason, detail?: string): Promise<void> {
  return report('user', targetId, reason, detail);
}

export function reportRun(runId: string, reason: ReportReason, detail?: string): Promise<void> {
  return report('run', runId, reason, detail);
}
