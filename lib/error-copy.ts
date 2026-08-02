// errorMessage(e) — the §5 error-copy convention (G, 2026-08-08).
//
// SERVER PROSE NEVER RETURNS FROM THIS FUNCTION. Priority:
//  ① ApiError with a known error_code → keyed copy (CODE_KEY below — the
//     ten product codes + the general trio + her reply additions; unknown
//     codes fall through to ③, never to e.message).
//  ② validation_error / 422 → composed from detail[]'s type+loc pairs
//     (§5 consumption rule: msg is debug-only English, NEVER rendered;
//     input was removed server-side 7/31). loc's field key is rendered
//     verbatim in the template — no per-field label map exists yet, the
//     "else the field key" branch of the ruling.
//  ③ status buckets: network / timeout / 5xx / 4xx keyed generics.
//
// COMPILER NOTE (stated by design): this is called at EVENT TIME — catch
// handlers and error-state setters — never as a render-body expression, so
// the React Compiler's visible-args expression cache has no purchase; `e`
// is the only input and the internal getLang() read is fresh at the moment
// of the error. Sites that store the result render a resolved string; a
// later language flip re-resolves on the next error (accepted boundary —
// the reactive-t rider converts the enumerated long-lived stores to keys).
import { ApiError } from '@/lib/api';
import { getLang, tfIn, tIn, type StringKey } from '@/lib/i18n';

const CODE_KEY: Record<string, StringKey> = {
  // ── the ten product codes (client-reachable set, guide §347 enum) ──
  already_member: 'err.alreadyMember',
  already_requested: 'err.alreadyRequested',
  rsvp_closed: 'err.rsvpClosed',
  crew_owner: 'err.crewOwner',
  demo_account: 'err.demoAccount',
  likes_disabled: 'err.likesDisabled',
  comments_disabled: 'err.commentsDisabled',
  follow_request_pending: 'err.followPending',
  route_generation_failed: 'err.routeGenFailed',
  route_generation_unavailable: 'err.routeGenBusy',
  // ── general trio ──
  server_error: 'err.serverError',
  bad_request: 'err.badRequest',
  // validation_error routes through composeValidation (below), not here
  // ── her reply additions (run-post's site catches keep their richer
  //    flows; this map serves every other surface) ──
  comment_parent_invalid: 'rp.replyParentGone',
  reply_depth_exceeded: 'rp.replyDepth',
};

const TYPE_KEY: Record<string, StringKey> = {
  missing: 'err.fieldMissing',
  string_too_long: 'err.fieldTooLong',
  extra_forbidden: 'err.fieldInvalid',
};

type PydanticItem = { type?: unknown; loc?: unknown };

/** First detail[] item → keyed sentence. The first error suffices for an
    alert; enumerating all fields is toast-hostile. */
function composeValidation(detail: unknown, lang: 'ko' | 'en'): string {
  if (Array.isArray(detail) && detail.length > 0) {
    const item = detail[0] as PydanticItem;
    const loc = Array.isArray(item.loc) ? item.loc : [];
    const field = String(loc[loc.length - 1] ?? '');
    const typeKey = typeof item.type === 'string' ? TYPE_KEY[item.type] : undefined;
    if (typeKey && field) return tfIn(lang, typeKey, { field });
  }
  return tIn(lang, 'err.invalidInput');
}

export function errorMessage(e: unknown): string {
  return errorMessageIn(getLang(), e);
}

/** RENDER-BODY variant (the fmtDate lang-param pattern, 2026-08-03 class):
    for surfaces that STORE the raw error and resolve at render — lang is a
    VISIBLE arg, so the React Compiler tracks the locale as a dependency
    (an internal getLang() read would be cached away with the expression).
    Pass useLang()'s value. */
export function errorMessageIn(lang: 'ko' | 'en', e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'validation_error' || e.status === 422) {
      return composeValidation(e.detail, lang);
    }
    if (e.code && CODE_KEY[e.code]) return tIn(lang, CODE_KEY[e.code]);
    if (e.code === 'timeout') return tIn(lang, 'err.timeout');
    if (e.status === 0) return tIn(lang, 'err.network');
    if (e.status >= 500) return tIn(lang, 'err.serverError');
    if (e.status >= 400) return tIn(lang, 'err.badRequest');
  }
  // non-ApiError (programming errors, unexpected throws) — same generic,
  // never the raw message
  return tIn(lang, 'err.badRequest');
}
