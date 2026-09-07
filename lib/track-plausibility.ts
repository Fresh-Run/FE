/**
 * 트랙 실측성 판정 (9/7 피드 스크리블 진단) — bbox 대각선 vs 신고 거리.
 *
 * 클래스: 실내/정지 지터가 오도미터 게이트 (25m 정확도 · 7m/s · 5m 세그먼트)
 * 를 "통과하며" 거리를 적산 — 거리는 시간-적분 합이라 지터에 부풀고, 트랙
 * bbox는 공간 범위라 지터 불변. 5.0km/24:46이 ~100m 박스 스크리블로 그려진
 * 실사용자 카드 2건이 발단. 판정이 거짓이면 카드는 기존 트랙리스 페이스
 * (시드 MiniMap / photo_thumb)로 떨어진다 — 숫자와 모순되는 그림 금지.
 *
 * 튜닝 (데스크-실행 케이스, 체크포인트 9/7):
 *  - 5km 왕복 (편도 2.5km): diag ≈ 2,500m ≫ 임계 — 통과.
 *  - 400m 트랙 5km 워크아웃: bbox ≈ 157×73m, diag ≈ 173m — CAP(150m)이
 *    보호. k=4% 단독이면 임계 200m로 오탐하던 케이스 — CAP의 존재 이유.
 *  - 1km 루프: diag ≈ 450m vs 임계 50m — 통과 (짧은 거리는 k-항이 관대:
 *    마당 셔틀런 같은 극소-범위 실런을 살린다).
 *  - k는 4%→5%로 상향: 3km 스크린샷 케이스 (diag ~141m)가 4%(임계 120m)를
 *    빠져나감 — 5%는 min(150,150)=150으로 포착.
 * 보수성 원칙: diag ≥ 150m인 런은 거리 무관 항상 통과 (10km/160m-박스는
 * 놓치지만, 소형 트랙 인터벌 워크아웃 오탐 제로가 우선 — 인-코멘트 트레이드).
 */
import { haversineKm } from '@/lib/run-metrics';
import type { Coordinate } from '@/types';

/** diag가 신고 거리의 이 비율 미만이면 의심 (CAP과 min 결합). */
export const PLAUSIBLE_MIN_FRAC = 0.05;
/** 이 범위(m) 이상의 트랙은 거리 무관 항상 실측 취급. */
export const PLAUSIBLE_DIAG_CAP_M = 150;

/** true = 지도 그려도 됨 · false = 트랙리스 페이스로 폴백.
    지오메트리/거리 부재 시 true (판정 기권 — 기존 널-경로가 관장). */
export function isPlausibleTrack(
  points: Coordinate[] | null | undefined,
  distanceKm: number | null | undefined,
): boolean {
  if (!points || points.length < 2) return true;
  if (distanceKm == null || !(distanceKm > 0)) return true;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const diagM = haversineKm({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng }) * 1000;
  return diagM >= Math.min(PLAUSIBLE_MIN_FRAC * distanceKm * 1000, PLAUSIBLE_DIAG_CAP_M);
}
