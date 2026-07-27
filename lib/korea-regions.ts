// 시·도/시·군·구 static dataset (당근식 크루 둘러보기 — guide: "프론트가
// 시군구 목록을 정적 보유해 표준 명칭으로 보낸다").
// SIDO: the 17 standard names, guide-exact spelling (특별자치도 renames
// included) — server Literal + DB CHECK match these strings exactly.
// SIGUNGU: free string server-side (no 422 risk); metros use 구, provinces
// use 시/군 per the guide's examples (성동구, 수원시).

import { getLang } from '@/lib/i18n';

export const SIDO_LIST = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시',
  '대전광역시', '울산광역시', '세종특별자치시', '경기도', '강원특별자치도',
  '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도',
  '경상남도', '제주특별자치도',
] as const;

export type Sido = typeof SIDO_LIST[number];

export const SIGUNGU: Record<Sido, string[]> = {
  서울특별시: [
    '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
    '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구',
    '성동구', '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구',
    '종로구', '중구', '중랑구',
  ],
  부산광역시: [
    '강서구', '금정구', '기장군', '남구', '동구', '동래구', '부산진구', '북구',
    '사상구', '사하구', '서구', '수영구', '연제구', '영도구', '중구', '해운대구',
  ],
  대구광역시: ['군위군', '남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구'],
  인천광역시: ['강화군', '계양구', '남동구', '동구', '미추홀구', '부평구', '서구', '연수구', '옹진군', '중구'],
  광주광역시: ['광산구', '남구', '동구', '북구', '서구'],
  대전광역시: ['대덕구', '동구', '서구', '유성구', '중구'],
  울산광역시: ['남구', '동구', '북구', '울주군', '중구'],
  세종특별자치시: [], // 세종 has no 시군구 — sido-only selection
  경기도: [
    '가평군', '고양시', '과천시', '광명시', '광주시', '구리시', '군포시', '김포시',
    '남양주시', '동두천시', '부천시', '성남시', '수원시', '시흥시', '안산시',
    '안성시', '안양시', '양주시', '양평군', '여주시', '연천군', '오산시', '용인시',
    '의왕시', '의정부시', '이천시', '파주시', '평택시', '포천시', '하남시', '화성시',
  ],
  강원특별자치도: [
    '강릉시', '고성군', '동해시', '삼척시', '속초시', '양구군', '양양군', '영월군',
    '원주시', '인제군', '정선군', '철원군', '춘천시', '태백시', '평창군', '홍천군',
    '화천군', '횡성군',
  ],
  충청북도: ['괴산군', '단양군', '보은군', '영동군', '옥천군', '음성군', '제천시', '증평군', '진천군', '청주시', '충주시'],
  충청남도: [
    '계룡시', '공주시', '금산군', '논산시', '당진시', '보령시', '부여군', '서산시',
    '서천군', '아산시', '예산군', '천안시', '청양군', '태안군', '홍성군',
  ],
  전북특별자치도: [
    '고창군', '군산시', '김제시', '남원시', '무주군', '부안군', '순창군', '완주군',
    '익산시', '임실군', '장수군', '전주시', '정읍시', '진안군',
  ],
  전라남도: [
    '강진군', '고흥군', '곡성군', '광양시', '구례군', '나주시', '담양군', '목포시',
    '무안군', '보성군', '순천시', '신안군', '여수시', '영광군', '영암군', '완도군',
    '장성군', '장흥군', '진도군', '함평군', '해남군', '화순군',
  ],
  경상북도: [
    '경산시', '경주시', '고령군', '구미시', '김천시', '문경시', '봉화군', '상주시',
    '성주군', '안동시', '영덕군', '영양군', '영주시', '영천시', '예천군', '울릉군',
    '울진군', '의성군', '청도군', '청송군', '칠곡군', '포항시',
  ],
  경상남도: [
    '거제시', '거창군', '고성군', '김해시', '남해군', '밀양시', '사천시', '산청군',
    '양산시', '의령군', '진주시', '창녕군', '창원시', '통영시', '하동군', '함안군',
    '함양군', '합천군',
  ],
  제주특별자치도: ['서귀포시', '제주시'],
};

// ─── English display names (slice 2.5, romanization ruling 2026-07-27) ────────
// DISPLAY ONLY — the Korean strings above stay on the wire (server Literal +
// DB CHECK). Flat lookup: identical hangul ⇒ identical Revised Romanization,
// so cross-sido duplicates (서구/중구/…) collapse safely.
// SIDO = official conventional English names. RULED: renamed 특별자치도 show
// conventional -do forms (Gangwon-do, Jeonbuk-do) — international recognition
// over branding ("Gangwon State"/"Jeonbuk State" noted for future revisit);
// Sejong bare, matching the metros. SIGUNGU = Revised Romanization with the
// hyphenated administrative suffix (표기법 §7): Gangnam-gu, Suwon-si,
// Gapyeong-gun.
export const REGION_EN: Record<string, string> = {
  // 17 sido — official conventional spellings
  서울특별시: 'Seoul', 부산광역시: 'Busan', 대구광역시: 'Daegu', 인천광역시: 'Incheon',
  광주광역시: 'Gwangju', 대전광역시: 'Daejeon', 울산광역시: 'Ulsan', 세종특별자치시: 'Sejong',
  경기도: 'Gyeonggi-do', 강원특별자치도: 'Gangwon-do', 충청북도: 'Chungcheongbuk-do',
  충청남도: 'Chungcheongnam-do', 전북특별자치도: 'Jeonbuk-do', 전라남도: 'Jeollanam-do',
  경상북도: 'Gyeongsangbuk-do', 경상남도: 'Gyeongsangnam-do', 제주특별자치도: 'Jeju-do',
  // 서울
  강남구: 'Gangnam-gu', 강동구: 'Gangdong-gu', 강북구: 'Gangbuk-gu', 강서구: 'Gangseo-gu',
  관악구: 'Gwanak-gu', 광진구: 'Gwangjin-gu', 구로구: 'Guro-gu', 금천구: 'Geumcheon-gu',
  노원구: 'Nowon-gu', 도봉구: 'Dobong-gu', 동대문구: 'Dongdaemun-gu', 동작구: 'Dongjak-gu',
  마포구: 'Mapo-gu', 서대문구: 'Seodaemun-gu', 서초구: 'Seocho-gu', 성동구: 'Seongdong-gu',
  성북구: 'Seongbuk-gu', 송파구: 'Songpa-gu', 양천구: 'Yangcheon-gu', 영등포구: 'Yeongdeungpo-gu',
  용산구: 'Yongsan-gu', 은평구: 'Eunpyeong-gu', 종로구: 'Jongno-gu', 중구: 'Jung-gu',
  중랑구: 'Jungnang-gu',
  // 부산 (dupes with 서울 collapse above)
  금정구: 'Geumjeong-gu', 기장군: 'Gijang-gun', 남구: 'Nam-gu', 동구: 'Dong-gu',
  동래구: 'Dongnae-gu', 부산진구: 'Busanjin-gu', 북구: 'Buk-gu', 사상구: 'Sasang-gu',
  사하구: 'Saha-gu', 서구: 'Seo-gu', 수영구: 'Suyeong-gu', 연제구: 'Yeonje-gu',
  영도구: 'Yeongdo-gu', 해운대구: 'Haeundae-gu',
  // 대구
  군위군: 'Gunwi-gun', 달서구: 'Dalseo-gu', 달성군: 'Dalseong-gun', 수성구: 'Suseong-gu',
  // 인천
  강화군: 'Ganghwa-gun', 계양구: 'Gyeyang-gu', 남동구: 'Namdong-gu', 미추홀구: 'Michuhol-gu',
  부평구: 'Bupyeong-gu', 연수구: 'Yeonsu-gu', 옹진군: 'Ongjin-gun',
  // 광주
  광산구: 'Gwangsan-gu',
  // 대전
  대덕구: 'Daedeok-gu', 유성구: 'Yuseong-gu',
  // 울산
  울주군: 'Ulju-gun',
  // 경기
  가평군: 'Gapyeong-gun', 고양시: 'Goyang-si', 과천시: 'Gwacheon-si', 광명시: 'Gwangmyeong-si',
  광주시: 'Gwangju-si', 구리시: 'Guri-si', 군포시: 'Gunpo-si', 김포시: 'Gimpo-si',
  남양주시: 'Namyangju-si', 동두천시: 'Dongducheon-si', 부천시: 'Bucheon-si', 성남시: 'Seongnam-si',
  수원시: 'Suwon-si', 시흥시: 'Siheung-si', 안산시: 'Ansan-si', 안성시: 'Anseong-si',
  안양시: 'Anyang-si', 양주시: 'Yangju-si', 양평군: 'Yangpyeong-gun', 여주시: 'Yeoju-si',
  연천군: 'Yeoncheon-gun', 오산시: 'Osan-si', 용인시: 'Yongin-si', 의왕시: 'Uiwang-si',
  의정부시: 'Uijeongbu-si', 이천시: 'Icheon-si', 파주시: 'Paju-si', 평택시: 'Pyeongtaek-si',
  포천시: 'Pocheon-si', 하남시: 'Hanam-si', 화성시: 'Hwaseong-si',
  // 강원
  강릉시: 'Gangneung-si', 고성군: 'Goseong-gun', 동해시: 'Donghae-si', 삼척시: 'Samcheok-si',
  속초시: 'Sokcho-si', 양구군: 'Yanggu-gun', 양양군: 'Yangyang-gun', 영월군: 'Yeongwol-gun',
  원주시: 'Wonju-si', 인제군: 'Inje-gun', 정선군: 'Jeongseon-gun', 철원군: 'Cheorwon-gun',
  춘천시: 'Chuncheon-si', 태백시: 'Taebaek-si', 평창군: 'Pyeongchang-gun', 홍천군: 'Hongcheon-gun',
  화천군: 'Hwacheon-gun', 횡성군: 'Hoengseong-gun',
  // 충북
  괴산군: 'Goesan-gun', 단양군: 'Danyang-gun', 보은군: 'Boeun-gun', 영동군: 'Yeongdong-gun',
  옥천군: 'Okcheon-gun', 음성군: 'Eumseong-gun', 제천시: 'Jecheon-si', 증평군: 'Jeungpyeong-gun',
  진천군: 'Jincheon-gun', 청주시: 'Cheongju-si', 충주시: 'Chungju-si',
  // 충남
  계룡시: 'Gyeryong-si', 공주시: 'Gongju-si', 금산군: 'Geumsan-gun', 논산시: 'Nonsan-si',
  당진시: 'Dangjin-si', 보령시: 'Boryeong-si', 부여군: 'Buyeo-gun', 서산시: 'Seosan-si',
  서천군: 'Seocheon-gun', 아산시: 'Asan-si', 예산군: 'Yesan-gun', 천안시: 'Cheonan-si',
  청양군: 'Cheongyang-gun', 태안군: 'Taean-gun', 홍성군: 'Hongseong-gun',
  // 전북
  고창군: 'Gochang-gun', 군산시: 'Gunsan-si', 김제시: 'Gimje-si', 남원시: 'Namwon-si',
  무주군: 'Muju-gun', 부안군: 'Buan-gun', 순창군: 'Sunchang-gun', 완주군: 'Wanju-gun',
  익산시: 'Iksan-si', 임실군: 'Imsil-gun', 장수군: 'Jangsu-gun', 전주시: 'Jeonju-si',
  정읍시: 'Jeongeup-si', 진안군: 'Jinan-gun',
  // 전남
  강진군: 'Gangjin-gun', 고흥군: 'Goheung-gun', 곡성군: 'Gokseong-gun', 광양시: 'Gwangyang-si',
  구례군: 'Gurye-gun', 나주시: 'Naju-si', 담양군: 'Damyang-gun', 목포시: 'Mokpo-si',
  무안군: 'Muan-gun', 보성군: 'Boseong-gun', 순천시: 'Suncheon-si', 신안군: 'Sinan-gun',
  여수시: 'Yeosu-si', 영광군: 'Yeonggwang-gun', 영암군: 'Yeongam-gun', 완도군: 'Wando-gun',
  장성군: 'Jangseong-gun', 장흥군: 'Jangheung-gun', 진도군: 'Jindo-gun', 함평군: 'Hampyeong-gun',
  해남군: 'Haenam-gun', 화순군: 'Hwasun-gun',
  // 경북
  경산시: 'Gyeongsan-si', 경주시: 'Gyeongju-si', 고령군: 'Goryeong-gun', 구미시: 'Gumi-si',
  김천시: 'Gimcheon-si', 문경시: 'Mungyeong-si', 봉화군: 'Bonghwa-gun', 상주시: 'Sangju-si',
  성주군: 'Seongju-gun', 안동시: 'Andong-si', 영덕군: 'Yeongdeok-gun', 영양군: 'Yeongyang-gun',
  영주시: 'Yeongju-si', 영천시: 'Yeongcheon-si', 예천군: 'Yecheon-gun', 울릉군: 'Ulleung-gun',
  울진군: 'Uljin-gun', 의성군: 'Uiseong-gun', 청도군: 'Cheongdo-gun', 청송군: 'Cheongsong-gun',
  칠곡군: 'Chilgok-gun', 포항시: 'Pohang-si',
  // 경남
  거제시: 'Geoje-si', 거창군: 'Geochang-gun', 김해시: 'Gimhae-si', 남해군: 'Namhae-gun',
  밀양시: 'Miryang-si', 사천시: 'Sacheon-si', 산청군: 'Sancheong-gun', 양산시: 'Yangsan-si',
  의령군: 'Uiryeong-gun', 진주시: 'Jinju-si', 창녕군: 'Changnyeong-gun', 창원시: 'Changwon-si',
  통영시: 'Tongyeong-si', 하동군: 'Hadong-gun', 함안군: 'Haman-gun', 함양군: 'Hamyang-gun',
  합천군: 'Hapcheon-gun',
  // 제주
  서귀포시: 'Seogwipo-si', 제주시: 'Jeju-si',
};

/** Locale-keyed region display: en users see the romanized form, ko users see
    today's bytes untouched. Unknown strings (future renames) fall back ko. */
export function regionName(ko: string): string {
  return getLang() === 'en' ? (REGION_EN[ko] ?? ko) : ko;
}
