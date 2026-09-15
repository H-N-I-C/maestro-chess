/* Stockfish wrapper: UCI protocol over a Web Worker.
   Singleton — analysis and move requests share one engine. */

let worker = null;
let readyPromise = null;
let seq = 0;
const pending = new Map(); // id -> {resolve, reject, lines:[]}

function init() {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve, reject) => {
    try {
      worker = new Worker('/vendor/stockfish-nnue-16-single.js');
      let sawReady = false;
      const bootTimeout = setTimeout(() => reject(new Error('engine boot timeout')), 20000);
      worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : e.data?.data || '';
        if (line === 'readyok' && !sawReady) {
          sawReady = true;
          clearTimeout(bootTimeout);
          resolve();
          return;
        }
        handleLine(line);
      };
      worker.onerror = (err) => {
        clearTimeout(bootTimeout);
        reject(err);
      };
      send('uci');
      send('isready');
    } catch (err) {
      reject(err);
    }
  });
  return readyPromise;
}

function send(cmd) { worker?.postMessage(cmd); }

function handleLine(line) {
  // bestmove resolves the move/analysis request it belongs to
  if (line.startsWith('bestmove')) {
    for (const [id, p] of pending) {
      if (p.kind === 'search') {
        p.resolve({ bestmove: line.split(/\s+/)[1], lines: p.lines });
        pending.delete(id);
        break;
      }
    }
    return;
  }
  if (line.startsWith('info depth')) {
    for (const p of pending.values()) {
      if (p.kind === 'search') p.lines.push(line);
    }
  }
}

/** Evaluate a position: returns {cp, mate, bestmove} (cp from side-to-move perspective). */
export async function analyze(fen, { depth = 12, movetime = 400 } = {}) {
  await init();
  send(`position fen ${fen}`);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const lines = [];
    pending.set(id, { kind: 'search', lines, resolve: (r) => {
      let cp = null, mate = null;
      for (const l of r.lines) {
        const m = l.match(/score cp (-?\d+)/);
        if (m) cp = parseInt(m[1], 10);
        const mm = l.match(/score mate (-?\d+)/);
        if (mm) mate = parseInt(mm[1], 10);
      }
      resolve({ cp, mate, bestmove: r.bestmove, depth: r.lines.length ? undefined : 0 });
    }, reject });
    send(`go depth ${depth} movetime ${movetime}`);
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); send('stop'); }
    }, movetime + 1500);
  });
}

/**
 * Pick an engine move for a difficulty level.
 * level: { skill: 0-20, depth, movetime } — skill injects human-like error via UCI_LimitStrength.
 */
export async function bestMove(fen, level) {
  await init();
  send(`setoption name Skill Level value ${level.skill}`);
  send(`setoption name UCI_LimitStrength value ${level.limit ? 'true' : 'false'}`);
  if (level.elo) send(`setoption name UCI_Elo value ${level.elo}`);
  send(`position fen ${fen}`);
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { kind: 'search', lines: [], resolve: (r) => resolve(r.bestmove), reject });
    send(`go depth ${level.depth} movetime ${level.movetime}`);
    setTimeout(() => {
      if (pending.has(id)) { send('stop'); }
    }, level.movetime + 3000);
  });
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
