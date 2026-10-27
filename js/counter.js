// 회차 세기 상태기계. target은 1 이상 정수 또는 Infinity.
// current: 지금 재생 중인 회차(시작 전 0), completed: 끝까지 재생한 회차 수.
export function createCounter(target) {
  if (!(target === Infinity || (Number.isInteger(target) && target >= 1))) {
    throw new RangeError(`invalid target: ${target}`);
  }
  let current = 0;
  let completed = 0;
  let finished = false;

  const step = (action, lastRound, complete) => ({ action, lastRound, complete });

  return {
    get target() { return target; },
    get current() { return current; },
    get completed() { return completed; },
    get finished() { return finished; },

    start() {
      current = 1;
      completed = 0;
      finished = false;
      return step('play', target === 1, false);
    },

    trackEnded() {
      // 완료 뒤에 늦게 들어온 ended는 무시한다.
      if (finished) return step('finish', false, false);
      completed += 1;
      if (completed >= target) {
        finished = true;
        return step('finish', false, true);
      }
      current += 1;
      return step('play', current === target, false);
    },
  };
}
