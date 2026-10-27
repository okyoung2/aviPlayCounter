// 미디어 엔진. 소리는 항상 <audio> 하나에서만 나오고, <video> 는 음소거로 그림만 맞춘다.
// 화면이 꺼져 영상이 멈춰도 소리를 넘겨줄 일이 없으므로 회차가 어긋나지 않는다.
const LOAD_TIMEOUT_MS = 10_000;
const SYNC_INTERVAL_MS = 1000;
const MAX_DRIFT_SEC = 0.3;

function makeAlert(src, which) {
  const el = new Audio(src);
  el.preload = 'auto';
  el.dataset.alert = which;
  el.hidden = true;
  document.body.append(el);
  return el;
}

export function createPlayer({ audio, video, lastAlertSrc, doneAlertSrc }) {
  const alerts = { last: makeAlert(lastAlertSrc, 'last'), done: makeAlert(doneAlertSrc, 'done') };
  let kind = 'audio';
  let url = null;
  let active = false;
  let loaded = false;
  let endedCb = null;
  let errorCb = null;
  let playingCb = null;
  let wakeLock = null;
  let syncTimer = null;

  video.muted = true;
  video.playsInline = true;

  const showsVideo = () => active && kind === 'video' && !document.hidden;

  function syncVideo() {
    if (!showsVideo()) return;
    if (Math.abs(video.currentTime - audio.currentTime) > MAX_DRIFT_SEC) {
      video.currentTime = audio.currentTime;
    }
    if (audio.paused) video.pause();
    else if (video.paused) video.play().catch(() => {});
  }

  async function requestWakeLock() {
    if (!navigator.wakeLock || document.hidden || wakeLock) return;
    try {
      const lock = await navigator.wakeLock.request('screen');
      // 요청하는 사이에 정지됐으면 바로 놓는다.
      if (!active || audio.paused) { lock.release().catch(() => {}); return; }
      wakeLock = lock;
      lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
    } catch { /* 지원 안 함 또는 거부: 무시 */ }
  }

  function releaseWakeLock() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  audio.addEventListener('ended', () => { if (active) endedCb?.(); });
  // 불러온 뒤에 생긴 오류(재생 도중 디코딩 실패 등). 불러오는 중의 오류는 load() 가 처리한다.
  audio.addEventListener('error', () => { if (active && loaded) errorCb?.(); });
  audio.addEventListener('play', () => {
    if (!active) return;
    playingCb?.(true);
    syncVideo();
    requestWakeLock();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  });
  audio.addEventListener('pause', () => {
    // 회차가 끝날 때 생기는 pause 는 일시정지가 아니다.
    if (!active || audio.ended) return;
    playingCb?.(false);
    syncVideo();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  });
  audio.addEventListener('seeked', syncVideo);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !active) return;
    syncVideo();
    if (!audio.paused) requestWakeLock();
  });

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => { if (active) audio.play().catch(() => {}); });
    navigator.mediaSession.setActionHandler('pause', () => { if (active) audio.pause(); });
  }

  function unload() {
    active = false;
    loaded = false;
    clearInterval(syncTimer);
    syncTimer = null;
    audio.pause();
    video.pause();
    audio.removeAttribute('src');
    video.removeAttribute('src');
    audio.load();
    video.load();
    if (url) URL.revokeObjectURL(url);
    url = null;
  }

  return {
    load(blob, newKind) {
      unload();
      kind = newKind;
      url = URL.createObjectURL(blob);
      active = true;
      return new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          audio.removeEventListener('loadedmetadata', onOk);
          audio.removeEventListener('error', onFail);
        };
        const onOk = () => { cleanup(); loaded = true; resolve(); };
        const onFail = () => { cleanup(); unload(); reject(new Error('unplayable')); };
        const timer = setTimeout(onFail, LOAD_TIMEOUT_MS);
        audio.addEventListener('loadedmetadata', onOk);
        audio.addEventListener('error', onFail);
        audio.src = url;
        if (kind === 'video') video.src = url;
        syncTimer = setInterval(() => { if (!audio.paused) syncVideo(); }, SYNC_INTERVAL_MS);
      });
    },

    // 사용자 터치 처리 중에 불러야 한다. 이후 화면이 꺼져도 알림음을 재생할 수 있게 된다.
    async primeAlerts() {
      const els = Object.values(alerts);
      const plays = els.map((el) => { el.muted = true; return el.play().catch(() => {}); });
      await Promise.all(plays);
      for (const el of els) {
        el.pause();
        el.currentTime = 0;
        el.muted = false;
      }
    },

    play() {
      return audio.play();
    },

    pause() {
      audio.pause();
    },

    // 거부되면(화면 꺼짐 등) pause 이벤트가 오지 않으므로 멈춤을 직접 알린다.
    restart() {
      audio.currentTime = 0;
      return audio.play().catch(() => { if (active) playingCb?.(false); });
    },

    stop() {
      unload();
      releaseWakeLock();
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
      }
    },

    onEnded(cb) { endedCb = cb; },
    onPlayingChange(cb) { playingCb = cb; },
    onError(cb) { errorCb = cb; },

    playAlert(which) {
      const el = alerts[which];
      if (!el) return;
      el.muted = false;
      el.currentTime = 0;
      el.play().catch(() => {});
    },

    setNowPlaying(title, progress) {
      if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: progress,
        artwork: [{ src: new URL('../icons/icon-512.png', import.meta.url).href, sizes: '512x512', type: 'image/png' }],
      });
    },
  };
}
