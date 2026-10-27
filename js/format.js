const pad = (n) => String(n).padStart(2, '0');

// 1시간 미만은 mm:ss, 이상은 h:mm:ss. 초 단위는 내림.
export function formatElapsed(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
