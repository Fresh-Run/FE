export type Coordinate = { lat: number; lng: number };

/** Run-track point — her ③ (8/5): alt in 0.1m rounds, null/absent where the
    client never sent (pre-deploy runs serve alt: null on every point —
    null-skip treats both identically). Extends Coordinate so every map
    consumer keeps reading tracks unchanged. */
export type TrackPoint = Coordinate & { alt?: number | null };

export type Vibe = 'park' | 'riverside' | 'city_night' | 'straight';

export type AudioSettings = {
  enabled: boolean;
  voice: 'joy' | 'david';
  rate: number;
  cueIntervalKm: number;
  announceDistance: boolean;
  announcePace: boolean;
  announceCalories: boolean;
};

export type CourseFilters = {
  vibe: Vibe;
  targetDistanceKm: number;
  pitstopKeyword: string | null;
  avoidHills: boolean;
  avoidDust: boolean;
  preferLit: boolean;
  loop: boolean;
};

export type Preferences = {
  theme: 'light' | 'dark' | 'system';
  audio: AudioSettings;
  filters: CourseFilters;
  displayName: string | null;
};

export type Waypoint = {
  name: string;
  coordinate: Coordinate;
  is_pitstop: boolean;
  description?: string;
};

export type RouteResponse = {
  id?: string;
  summary: string;
  total_distance_km: number;
  estimated_duration_min: number;
  waypoints: Waypoint[];
  polyline: Coordinate[];
};

export type Run = {
  id: string;
  user_id: string;
  created_at: string;
  route_id: string | null;
  title: string;
  distance_km: number;
  duration_s: number;
  avg_pace_s_per_km: number;
  calories: number;
  polyline: Coordinate[];
  vibe: Vibe | null;
  liked: boolean | null;
  feedback_tags: string[];
};

export type LiveMetrics = {
  distanceKm: number;
  durationS: number;
  pacePerKmS: number;
  calories: number;
  path: Coordinate[];
};

export type Weather = {
  tempC: number;
  condition: 'clear' | 'clouds' | 'rain' | 'snow' | 'haze';
  humidity: number;
  windKph: number;
  aqiLabel: '좋음' | '보통' | '나쁨' | '매우나쁨';
  aqi: number;
};

export type FeedItem = {
  id: string;
  author_name: string;
  author_avatar: string | null;
  area: string;
  created_at: string;
  title: string;
  distance_km: number;
  duration_s: number;
  avg_pace_s_per_km: number;
  polyline: Coordinate[];
  tags: string[];
  likes: number;
  comments: number;
  liked_by_me: boolean;
};

export type PersonalBest = {
  metric: 'distance' | 'pace' | 'duration';
  value: number;
  previous: number | null;
};
