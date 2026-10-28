import { stripVideoTracks } from './audio-track.js';

// 미디어 엔진. 소리는 항상 <audio> 하나에서만 나오고, <video> 는 음소거로 그림만 맞춘다.
// 화면이 꺼져 영상이 멈춰도 소리를 넘겨줄 일이 없으므로 회차가 어긋나지 않는다.
// 회차 사이에는 멈추지 않고 loop 로 이어 튼다. 화면이 꺼진 동안 끝난 소리를 다시 play() 하면
// 크롬이 가끔 거부해서 재생이 멈췄다(휴대폰에서 36회 중 3회 뒤 멈춤).
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
  let urls = [];
  let active = false;
  let loaded = false;
  let endedCb = null;
  let errorCb = null;
  let playingCb = null;
  let timeCb = null;
  let wakeLock = null;
  let lastTime = 0; // loop 로 처음으로 돌아간 것을 알아채는 데 쓴다.
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

  audio.addEventListener('ended', () => { if (active) endedCb?.({ wrapped: false }); });
  // loop 가 처음으로 돌아가면 seeked 가 오고 재생 위치가 줄어든다. 둘 중 먼저 온 쪽에서 한 번만 센다.
  function checkWrap() {
    const t = audio.currentTime;
    const wrapped = audio.loop && t < lastTime - 0.2;
    lastTime = t;
    if (wrapped && active) endedCb?.({ wrapped: true });
  }
  audio.addEventListener('seeked', checkWrap);
  audio.addEventListener('timeupdate', checkWrap);
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
  // 진행바용 재생 위치. 화면이 꺼져 있으면 그릴 필요가 없다.
  for (const type of ['timeupdate', 'durationchange', 'seeked']) {
    audio.addEventListener(type, () => {
      if (active && !document.hidden) timeCb?.(audio.currentTime, audio.duration);
    });
  }
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
    lastTime = 0;
    audio.loop = false;
    clearInterval(syncTimer);
    syncTimer = null;
    audio.pause();
    video.pause();
    audio.removeAttribute('src');
    video.removeAttribute('src');
    audio.load();
    video.load();
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
  }

  return {
    async load(blob, newKind) {
      unload();
      kind = newKind;
      active = true;
      // 동영상이면 소리 재생기에는 영상 트랙을 뺀 파일을 준다. 못 빼면 원본을 쓴다.
      const audioBlob = kind === 'video' ? (await stripVideoTracks(blob)) ?? blob : blob;
      if (!active) throw new Error('cancelled');
      const audioUrl = URL.createObjectURL(audioBlob);
      const videoUrl = kind === 'video' ? URL.createObjectURL(blob) : null;
      urls = [audioUrl, videoUrl].filter(Boolean);
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
        audio.src = audioUrl;
        if (videoUrl) video.src = videoUrl;
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

    // 다음 회차가 남아 있으면 켠다. 마지막 회차에서 끄면 그 회차가 끝날 때 ended 가 온다.
    setLoop(on) {
      audio.loop = on;
    },

    // loop 를 끈 채 끝났을 때만 쓴다. 거부되면(화면 꺼짐 등) pause 이벤트가 오지 않으므로 멈춤을 직접 알린다.
    restart() {
      lastTime = 0;
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
    onTimeUpdate(cb) { timeCb = cb; },

    position() {
      return { current: audio.currentTime, duration: audio.duration };
    },

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
