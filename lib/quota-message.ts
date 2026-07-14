// 429 quota-exceeded honest copy (B8, guide §5) — a LEAF module (no api
// import) so lib/api.ts can use it without a circular dep. Server 429 detail:
// {error:'quota_exceeded', limit, used, remaining, reset_at}. reset_at is
// KST-anchored ("...T00:00:00+09:00") → the date prefix IS the KST date, so
// parse it directly (TZ-independent; no device-tz drift).
function fmtResetKst(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[2])}월 ${Number(m[3])}일` : '';
}

/** Honest quota-exhausted copy from a 429 detail. Never a generic error where
    the real limit + reset time are available. */
export function quotaExceededMessage(detail: Record<string, unknown> | null | undefined): string {
  const limit = typeof detail?.limit === 'number' ? detail.limit : null;
  const resetIso = typeof detail?.reset_at === 'string' ? detail.reset_at : null;
  const resetTxt = resetIso ? fmtResetKst(resetIso) : '';
  const head = limit != null ? `이번 주 AI 코스 ${limit}회를 모두 썼어요` : '이번 주 무료 생성 횟수를 모두 썼어요';
  return resetTxt ? `${head} · ${resetTxt}에 초기화돼요` : head;
}
