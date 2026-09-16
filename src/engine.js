/* Stockfish wrapper: UCI protocol over a Web Worker.
   Singleton — analysis and move requests share one engine, serialized
   through a promise queue so only one search runs at a time. */

let worker = null;
let readyPromise = null;
let active = null; // current request: {kind:'search'|'sync', resolve, reject, lines, timer}
let chain = Promise.resolve();

function init() {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve, reject) => {
    let w;
    try {
      w = new Worker('/vendor/stockfish-nnue-16-single.js');
    } catch (err) {
      readyPromise = null;
      reject(err);
      return;
    }
    worker = w;
    let sawReady = false;
    const bootTimeout = setTimeout(() => {
      fail(new Error('engine boot timeout'));
    }, 20000);
    const fail = (err) => {
      clearTimeout(bootTimeout);
      if (active) {
        const a = active;
        active = null;
        clearTimeout(a.timer);
        a.reject(err);
      }
      try { w.terminate(); } catch { /* already dead */ }
      worker = null;
      readyPromise = null; // failed boot must not wedge future calls
      reject(err);
    };
    w.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : e.data?.data || '';
      if (line === 'readyok' && !sawReady) {
        sawReady = true;
        clearTimeout(bootTimeout);
        resolve();
        return;
      }
      handleLine(line);
    };
    w.onerror = fail;
    send('uci');
    send('isready');
  });
  return readyPromise;
}

function send(cmd) { worker?.postMessage(cmd); }

function handleLine(line) {
  if (!active) return;
  if (line.startsWith('bestmove')) {
    // a search resolves only on its own bestmove; stale bestmoves from a
    // stopped search arrive while a 'sync' request holds the queue
    if (active.kind !== 'search') return;
    const a = active;
    active = null;
    clearTimeout(a.timer);
    a.resolve({ bestmove: line.split(/\s+/)[1], lines: a.lines });
    return;
  }
  if (line === 'readyok') {
    if (active.kind !== 'sync') return;
    const a = active;
    active = null;
    clearTimeout(a.timer);
    a.resolve();
    return;
  }
  if (line.startsWith('info depth') && active.kind === 'search') {
    active.lines.push(line);
  }
}

function enqueue(task) {
  const result = chain.then(task);
  chain = result.catch(() => {}); // a failed request must not wedge the queue
  return result;
}

/**
 * Run one serialized search. `beforeGo` sends option commands (bestMove),
 * `go` is the go command. Resolves with {bestmove, lines}. On timeout the
 * caller is rejected AND the engine is recovered (stop + isready resync
 * absorbs the late bestmove) so the next queued request starts clean.
 */
function runSearch({ fen, beforeGo, go, timeoutMs }) {
  return enqueue(async () => {
    await init();
    beforeGo?.();
    send(`position fen ${fen}`);
    let release;
    const drained = new Promise((r) => { release = r; });
    let entry;
    const result = new Promise((resolve, reject) => {
      entry = { kind: 'search', lines: [], resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        if (active !== entry) return;
        active = null;
        reject(new Error('engine search timeout'));
        // recover: stop the search, then hold the queue behind an isready
        // resync so the stopped search's late bestmove is drained before the
        // next request starts
        send('stop');
        active = {
          kind: 'sync', lines: [], resolve: release, reject: release,
          timer: setTimeout(() => { if (active?.kind === 'sync') { active = null; release(); } }, 5000),
        };
        send('isready');
      }, timeoutMs);
    });
    active = entry;
    send(go);
    try {
      return await result;
    } catch (err) {
      await drained.catch(() => {});
      throw err;
    }
  });
}

/** Evaluate a position: returns {cp, mate, bestmove} (cp from side-to-move perspective). */
export async function analyze(fen, { depth = 12, movetime = 400 } = {}) {
  const { bestmove, lines } = await runSearch({
    fen,
    go: `go depth ${depth} movetime ${movetime}`,
    timeoutMs: movetime + 1500,
  });
  let cp = null, mate = null;
  for (const l of lines) {
    const m = l.match(/score cp (-?\d+)/);
    if (m) cp = parseInt(m[1], 10);
    const mm = l.match(/score mate (-?\d+)/);
    if (mm) mate = parseInt(mm[1], 10);
  }
  return { cp, mate, bestmove };
}

/**
 * Pick an engine move for a difficulty level.
 * level: { skill: 0-20, depth, movetime } — skill injects human-like error via UCI_LimitStrength.
 */
export async function bestMove(fen, level) {
  const { bestmove } = await runSearch({
    fen,
    beforeGo: () => {
      send(`setoption name Skill Level value ${level.skill}`);
      send(`setoption name UCI_LimitStrength value ${level.limit ? 'true' : 'false'}`);
      if (level.elo) send(`setoption name UCI_Elo value ${level.elo}`);
    },
    go: `go depth ${level.depth} movetime ${level.movetime}`,
    timeoutMs: level.movetime + 3000,
  });
  return bestmove;
}

export const DIFFICULTIES = [
  { id: 'novice',    label: 'Novice',    sub: 'First real games',           skill: 0,  elo: 400,  limit: true,  depth: 5,  movetime: 150 },
  { id: 'casual',    label: 'Casual',    sub: 'Club night beginner',        skill: 3,  elo: 800,  limit: true,  depth: 7,  movetime: 250 },
  { id: 'club',      label: 'Club',      sub: 'Solid intermediate',         skill: 6,  elo: 1200, limit: true,  depth: 9,  movetime: 350 },
  { id: 'advanced',  label: 'Advanced',  sub: 'Tournament player',          skill: 10, elo: 1600, limit: true,  depth: 11, movetime: 500 },
  { id: 'expert',    label: 'Expert',    sub: 'Sharp and punishing',        skill: 14, elo: 2000, limit: true,  depth: 14, movetime: 700 },
  { id: 'maestro',   label: 'Maestro',   sub: 'Near maximum strength',      skill: 20, elo: 0,    limit: false, depth: 16, movetime: 900 },
];

export async function engineReady() { return init(); }
