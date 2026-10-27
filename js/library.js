const VIDEO_EXT = ['mp4', 'm4v', 'mov', '3gp', 'webm', 'mkv'];
const AUDIO_EXT = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'amr', 'flac'];

// MIME 우선, video/audio 가 아니면(빈 값, octet-stream 등) 확장자로 판별한다.
export function kindOf(mimeType, fileName) {
  if (mimeType?.startsWith('video/')) return 'video';
  if (mimeType?.startsWith('audio/')) return 'audio';
  const ext = String(fileName).split('.').pop().toLowerCase();
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  return null;
}

// 즐겨찾기 먼저, 각 묶음 안에서는 최근 추가순.
export function sortLibrary(items) {
  return [...items].sort((a, b) =>
    (b.favorite === true) - (a.favorite === true) || b.addedAt - a.addedAt);
}

export function isDuplicate(items, file) {
  return items.some((it) => it.name === file.name && it.size === file.size);
}

export function describeAddError(err, fileName) {
  const base = `"${fileName}"을(를) 추가하지 못했어요.`;
  return err?.name === 'QuotaExceededError' ? `저장 공간이 부족해요. ${base}` : base;
}
