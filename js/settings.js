export const PRESETS = [3, 9, 11, 27, 54, 108];
export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
export const MAX_COUNT = 9999;

// count: null 은 무한 반복(JSON 으로 저장해야 해서 Infinity 를 쓰지 않는다).
export const DEFAULT_SETTINGS = Object.freeze({
  count: 108,
  corner: 'top-right',
  lastAlert: true,
  doneAlert: true,
});

export function parseCustomCount(text) {
  const t = String(text).trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= MAX_COUNT ? n : null;
}

// 파일별 설정 → 최근 설정 → 기본값 순. 빠진 키는 기본값으로 채운다.
export function resolveSettings(itemSettings, lastUsed) {
  return { ...DEFAULT_SETTINGS, ...(itemSettings ?? lastUsed ?? {}) };
}

export function targetOf(settings) {
  return settings.count ?? Infinity;
}

export const CORNER_ARROWS = Object.freeze({
  'top-left': '↖',
  'top-right': '↗',
  'bottom-left': '↙',
  'bottom-right': '↘',
});

// 목록에 보여 줄 한 줄 요약.
export function describeSettings(s) {
  const onOff = (v) => (v ? 'ON' : 'OFF');
  const count = s.count === null ? '무한 반복' : `${s.count}회`;
  return `${count} · ${CORNER_ARROWS[s.corner]} · 🔔 마지막 ${onOff(s.lastAlert)} · 완료 ${onOff(s.doneAlert)}`;
}
