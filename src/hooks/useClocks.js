import { useEffect, useRef, useState } from 'react';

/** Time controls: base minutes + increment seconds. 'off' = no clock. */
export const TIME_CONTROLS = [
  { id: 'off', label: 'Clock: off', base: 0, inc: 0 },
  { id: '3+2', label: '3 | 2', base: 3, inc: 2 },
  { id: '5+0', label: '5 min', base: 5, inc: 0 },
  { id: '5+3', label: '5 | 3', base: 5, inc: 3 },
  { id: '10+0', label: '10 min', base: 10, inc: 0 },
  { id: '10+5', label: '10 | 5', base: 10, inc: 5 },
  { id: '15+10', label: '15 | 10', base: 15, inc: 10 },
];

export function timeControl(id) {
  return TIME_CONTROLS.find((t) => t.id === id) || TIME_CONTROLS[0];
}

/** Older saves stored plain minutes (0/5/10/15). */
export function migrateTimeControl(saved) {
  if (saved?.clockId && TIME_CONTROLS.some((t) => t.id === saved.clockId)) return saved.clockId;
  if (saved?.clockMinutes) {
    const id = `${saved.clockMinutes}+0`;
    if (TIME_CONTROLS.some((t) => t.id === id)) return id;
  }
  return 'off';
}

export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  // tenths in the last 10 seconds, like a real clock
  if (ms > 0 && ms < 10_000) return `0:0${(ms / 1000).toFixed(1)}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Chess clocks measured in real elapsed time (performance.now deltas), so a
 * throttled background tab still drains the right amount of time.
 *   active  – whether the side to move's clock is running
 *   turn    – 'w' | 'b' side to move
 *   onFlag(side) – called once when a running clock hits zero
 *   onPersist(clocks) – called about once a second while running
 */
export function useClocks({ tcId, initial, active, turn, onFlag, onPersist }) {
  const tc = timeControl(tcId);
  const clocksRef = useRef(
    initial && Number.isFinite(initial.w) && Number.isFinite(initial.b)
      ? { w: initial.w, b: initial.b }
      : { w: tc.base * 60_000, b: tc.base * 60_000 }
  );
  const [, setTick] = useState(0);
  const cbRef = useRef({ onFlag, onPersist });
  cbRef.current = { onFlag, onPersist };

  useEffect(() => {
    if (!active || tc.base === 0) return;
    const started = clocksRef.current;
    let last = performance.now();
    let lastPersist = last;
    const id = setInterval(() => {
      const now = performance.now();
      const c = clocksRef.current;
      c[turn] = Math.max(0, c[turn] - (now - last));
      last = now;
      if (now - lastPersist > 1000) {
        lastPersist = now;
        cbRef.current.onPersist?.({ ...c });
      }
      if (c[turn] <= 0) {
        clearInterval(id);
        cbRef.current.onFlag?.(turn);
      }
      setTick((t) => t + 1);
    }, 100);
    return () => {
      // account for the time since the last tick when the clock stops (a move was made)
      clearInterval(id);
      // (skipped when reset()/apply() replaced the clocks meanwhile)
      const c = clocksRef.current;
      if (c === started) c[turn] = Math.max(0, c[turn] - (performance.now() - last));
    };
  }, [active, turn, tc.base]);

  return {
    tc,
    clocks: clocksRef.current,
    reset(id = tcId) {
      const base = timeControl(id).base * 60_000;
      clocksRef.current = { w: base, b: base };
      setTick((t) => t + 1);
    },
    addIncrement(side) {
      if (tc.base === 0 || !tc.inc) return;
      clocksRef.current[side] += tc.inc * 1000;
    },
    snapshot() {
      return { w: clocksRef.current.w, b: clocksRef.current.b };
    },
    apply(remote) {
      if (!remote || !Number.isFinite(remote.w) || !Number.isFinite(remote.b)) return;
      clocksRef.current = { w: remote.w, b: remote.b };
      setTick((t) => t + 1);
    },
  };
}
