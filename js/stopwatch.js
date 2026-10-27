// 일시정지 가능한 스톱워치. 시계(now)를 주입받아 테스트할 수 있다.
export function createStopwatch(now = () => performance.now()) {
  let accumulated = 0;
  let startedAt = null;

  return {
    get running() { return startedAt !== null; },
    start() { accumulated = 0; startedAt = now(); },
    pause() {
      if (startedAt === null) return;
      accumulated += now() - startedAt;
      startedAt = null;
    },
    resume() {
      if (startedAt !== null) return;
      startedAt = now();
    },
    elapsedMs() {
      return accumulated + (startedAt === null ? 0 : now() - startedAt);
    },
  };
}
