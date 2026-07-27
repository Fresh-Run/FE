/**
 * i18n string resources — ko is the SOURCE OF TRUTH (slice 1, 2026-07-27).
 * Keys are flat `surface.name` strings; every key added here forces an en
 * entry via the Record type in en.ts (tsc-enforced completeness — a missing
 * translation is a compile error, not a runtime fallback surprise).
 * Interpolation slots use {name} (lib/i18n.ts `tf`). Rich-text lines that
 * wrap a styled <Text> split into `.before`/`.after` halves.
 * Scope: core loop only (i18n ruling (b), 2026-07-27) — non-core surfaces
 * keep their inline Korean until post-gate.
 */
export const ko = {
  // ── common ──────────────────────────────────────────────────────────────
  'common.cancel': '취소',
  'common.later': '나중에',
  'common.retry': '다시 시도',
  'common.delete': '삭제',
  'common.openSettings': '설정 열기',
  'common.freeRun': '자유 러닝',

  // ── date words (formatters) ─────────────────────────────────────────────
  'date.today': '오늘',
  'date.yesterday': '어제',

  // ── time-of-day run titles (timeTitle — also the saved default title) ───
  'title.dawn': '새벽 러닝',
  'title.morning': '아침 러닝',
  'title.forenoon': '오전 러닝',
  'title.lunch': '점심 러닝',
  'title.afternoon': '오후 러닝',
  'title.evening': '저녁 러닝',
  'title.night': '야간 러닝',

  // ── run visibility (shared vocabulary: run-save + edit-run) ─────────────
  'vis.public': '전체 공개',
  'vis.publicSub': '피드와 프로필에 공개',
  'vis.followers': '팔로워만',
  'vis.followersSub': '팔로워에게만 보여요',
  'vis.private': '비공개',
  'vis.privateSub': '나만 볼 수 있어요',

  // ── 러닝 저장 (the slice-1 pattern screen) ──────────────────────────────
  'runSave.title': '러닝 저장',
  'runSave.save': '저장',
  'runSave.gpsCaption': 'GPS 기록',
  'runSave.crewTag.before': '이 러닝은 ',
  'runSave.crewTag.after': ' 정기런으로 기록돼요',
  'runSave.crewMeeting': "'{title}' 모임",
  'runSave.tagRemoved': '정기런으로 기록하지 않아요',
  'runSave.undo': '되돌리기',
  'runSave.statDist': '거리',
  'runSave.statTime': '시간',
  'runSave.statPace': '페이스',
  'runSave.addPhoto': '사진 추가',
  'runSave.memoPlaceholder': '오늘 러닝은 어땠나요? 메모를 남겨보세요...',
  'runSave.visibility': '공개 범위',
  'runSave.tooShort': '너무 짧은 러닝은 저장되지 않아요',
  'runSave.deleteRun': '러닝 삭제하기',
  'runSave.discardTitle': '러닝을 삭제할까요?',
  'runSave.discardSub': '이 러닝 기록은 저장되지 않고 사라져요.',
  'runSave.photoFailTitle': '사진 추가 실패',
  'runSave.photoFailBody': '사진을 불러오지 못했어요. 다시 시도해 주세요.',
  'runSave.cameraPermTitle': '카메라 권한이 필요해요',
  'runSave.cameraPermBody': '러닝 사진을 찍으려면 카메라 접근을 허용해 주세요.',
  'runSave.shootFailTitle': '촬영 실패',
  'runSave.shootFailBody': '사진을 찍지 못했어요. 다시 시도해 주세요.',
  'runSave.saveFailTitle': '저장 실패',
  'runSave.saveFailBody': '잠시 후 다시 시도해 주세요',
} as const;
