// The ticking timer. Each tick it works out where "now" sits in today's
// blocks and which alert events fired since the previous tick.

import { resolveDay, findPosition, eventsBetween } from '../core/schedule.js';
import { minutesOfDay, toMin } from '../core/time.js';

// If the computer slept, don't replay every alert that was missed.
const MAX_CATCH_UP_MS = 2 * 60 * 1000;

export function computeView(schedule, now) {
  const day = resolveDay(schedule, now);
  const nowMin = minutesOfDay(now);
  const pos = findPosition(day.blocks, nowMin);
  let remaining = null;
  let progress = null;
  if (pos.current) {
    const s = toMin(pos.current.start);
    const e = toMin(pos.current.end);
    remaining = e - nowMin;
    progress = (nowMin - s) / (e - s);
  }
  const untilNext = pos.next ? toMin(pos.next.start) - nowMin : null;
  return { now, nowMin, day, ...pos, remaining, progress, untilNext };
}

export function createEngine({ getSchedule, getSettings, onTick, onEvent }) {
  let last = null;
  let timer = null;

  function tick() {
    const now = new Date();
    const vm = computeView(getSchedule(), now);
    if (last && last.key === vm.day.key && now - last.at < MAX_CATCH_UP_MS) {
      for (const ev of eventsBetween(vm.day.blocks, last.min, vm.nowMin, getSettings().warnMinutes)) onEvent(ev, vm);
    }
    last = { key: vm.day.key, min: vm.nowMin, at: now };
    onTick(vm);
  }

  return {
    start() {
      tick();
      // Align ticks to the second so the countdown changes on the beat.
      setTimeout(() => {
        tick();
        timer = setInterval(tick, 1000);
      }, 1000 - (Date.now() % 1000));
    },
    stop() { clearInterval(timer); },
    tick,
    // Fire a start event for the current block now (after skipping ahead) and
    // treat everything up to now as already handled.
    announceCurrent() {
      const now = new Date();
      const vm = computeView(getSchedule(), now);
      last = { key: vm.day.key, min: vm.nowMin, at: now };
      if (vm.current) onEvent({ type: 'start', at: vm.nowMin, block: vm.current, manual: true }, vm);
      onTick(vm);
    },
    // After sleep/resume: resync without replaying alerts.
    resync() {
      last = null;
      tick();
    },
  };
}
