// Static weather bundle — shared between the home screen and the course chooser.
// Replace with a real weather API hook when live data is ready.

export type WTone = 'good' | 'ok' | 'bad';

export const FR_WEATHER = {
  area:      '성수동',
  condition: '맑음',
  temp:      18,
  feels:     16,
  humidity:  45,
  pm10:      { v: 28, label: '좋음' },
  pm25:      { v: 19, label: '보통' },
  wind:      2.1,
  uv:        { v: 4, label: '보통' },
  rain:      10,
  verdict:   { label: '러닝하기 좋아요', short: '좋음', tone: 'good' as WTone },
  tip:       '미세먼지가 적고 바람이 약해 야외 러닝에 좋은 날이에요. 해 지기 전 가볍게 한 바퀴 어때요?',
};
