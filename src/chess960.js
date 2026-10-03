/* Chess960 (Fischer Random) rules on top of chess.js.
   chess.js only knows standard castling (king on e1, rooks on a1/h1), so a
   960 game keeps chess.js for everything except castling: the chess.js board
   always has castling rights '-', and this class tracks rights by rook file,
   generates/apply 960 castling itself, and does its own repetition counting.

   FENs use Shredder notation for castling (e.g. "HAha" = rooks on h- and
   a-files), which Stockfish accepts with UCI_Chess960. The API mirrors the
   subset of chess.js the app uses, so most code can treat both alike. */
import { Chess } from 'chess.js';

const FILES = 'abcdefgh';

/** Back rank for Chess960 start position number n (0-959, Scharnagl numbering; 518 = standard). */
export function startRank(n) {
  const rank = Array(8).fill(null);
  const free = () => rank.map((p, i) => (p ? null : i)).filter((i) => i !== null);
  let k = ((n % 960) + 960) % 960;
  rank[[1, 3, 5, 7][k % 4]] = 'b'; k = Math.floor(k / 4); // light-square bishop
  rank[[0, 2, 4, 6][k % 4]] = 'b'; k = Math.floor(k / 4); // dark-square bishop
  rank[free()[k % 6]] = 'q'; k = Math.floor(k / 6);
  const KN = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]][k];
  const f1 = free();
  rank[f1[KN[0]]] = 'n';
  rank[f1[KN[1]]] = 'n';
  const [r1, kk, r2] = free();
  rank[r1] = 'r'; rank[kk] = 'k'; rank[r2] = 'r';
  return rank.join('');
}

/** Start FEN for position n, castling in Shredder notation. */
export function startFen960(n) {
  const r = startRank(n);
  const rooks = [...r].map((p, i) => (p === 'r' ? FILES[i] : null)).filter(Boolean);
  const castle = rooks.map((f) => f.toUpperCase()).reverse().join('') + [...rooks].reverse().join('');
  return `${r}/pppppppp/8/8/8/8/PPPPPPPP/${r.toUpperCase()} w ${castle} - 0 1`;
}

export function randomStartIndex() {
  const b = new Uint16Array(1);
  crypto.getRandomValues(b);
  return b[0] % 960;
}

/** True when a FEN's castling field names rook files (Shredder/X-FEN style). */
export function isShredderFen(fen) {
  const c = String(fen || '').split(' ')[2] || '-';
  return c !== '-' && /[a-hA-H]/.test(c);
}

function kingSquare(cj, color) {
  for (const f of FILES) for (const r of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const p = cj.get(f + r);
    if (p && p.type === 'k' && p.color === color) return f + r;
  }
  return null;
}

/** Parse a castling field into {w:[files], b:[files]} given the position. */
function parseRights(field, cj) {
  const rights = { w: [], b: [] };
  if (!field || field === '-') return rights;
  for (const ch of field) {
    const color = ch === ch.toUpperCase() ? 'w' : 'b';
    const rank = color === 'w' ? '1' : '8';
    const king = kingSquare(cj, color);
    if (!king || king[1] !== rank) continue;
    let file = null;
    const lower = ch.toLowerCase();
    if (lower === 'k' || lower === 'q') {
      // X-FEN K/Q: the outermost rook on that side of the king
      const kf = FILES.indexOf(king[0]);
      const range = lower === 'k' ? [7, kf, -1] : [0, kf, 1];
      for (let i = range[0]; i !== range[1]; i += range[2]) {
        const p = cj.get(FILES[i] + rank);
        if (p && p.type === 'r' && p.color === color) { file = FILES[i]; break; }
      }
    } else {
      file = lower;
    }
    const p = file && cj.get(file + rank);
    if (p && p.type === 'r' && p.color === color && !rights[color].includes(file)) rights[color].push(file);
  }
  return rights;
}

function rightsField(rights) {
  const w = [...rights.w].sort().reverse().map((f) => f.toUpperCase()).join('');
  const b = [...rights.b].sort().reverse().join('');
  return w + b || '-';
}

export class Chess960Game {
  constructor(fen) {
    const parts = String(fen).trim().split(/\s+/);
    if (parts.length < 4) throw new Error('Invalid FEN');
    const castle = parts[2];
    parts[2] = '-';
    this._cj = new Chess(parts.join(' '));
    this._rights = parseRights(castle, this._cj);
    this._startFen = this.fen();
    this._history = []; // verbose moves
    this._counts = new Map([[this._key(), 1]]);
    this._headers = {};
  }

  static fromFen(fen) { return new Chess960Game(fen); }
  static start(n) { return new Chess960Game(startFen960(n)); }

  /** Clone with full history (repetition counts included). */
  clone() {
    const c = new Chess960Game(this._startFen);
    for (const m of this._history) c.move({ from: m.from, to: m.rookFrom || m.to, promotion: m.promotion });
    return c;
  }

  get variant() { return 'chess960'; }

  _key() {
    // placement + side + rights + ep, like FIDE's "same position"
    const f = this._cj.fen().split(' ');
    return `${f[0]} ${f[1]} ${rightsField(this._rights)} ${f[3]}`;
  }

  fen() {
    const f = this._cj.fen().split(' ');
    f[2] = rightsField(this._rights);
    return f.join(' ');
  }

  turn() { return this._cj.turn(); }
  get(sq) { return this._cj.get(sq); }
  board() { return this._cj.board(); }
  isAttacked(sq, color) { return this._cj.isAttacked(sq, color); }
  attackers(sq, color) { return this._cj.attackers(sq, color); }
  inCheck() { return this._cj.inCheck(); }
  isCheck() { return this._cj.inCheck(); }

  /** Legal 960 castling moves for the side to move. */
  _castlingMoves() {
    const color = this.turn();
    if (this._cj.inCheck()) return [];
    const rank = color === 'w' ? '1' : '8';
    const enemy = color === 'w' ? 'b' : 'w';
    const king = kingSquare(this._cj, color);
    if (!king || king[1] !== rank) return [];
    const kf = FILES.indexOf(king[0]);
    const out = [];
    for (const rookFile of this._rights[color]) {
      const rf = FILES.indexOf(rookFile);
      const side = rf > kf ? 'h' : 'a';
      const kDest = side === 'h' ? 6 : 2; // g / c
      const rDest = side === 'h' ? 5 : 3; // f / d
      // every square either piece crosses or lands on must be empty, apart from the two castling pieces
      const lo = Math.min(kf, rf, kDest, rDest), hi = Math.max(kf, rf, kDest, rDest);
      let clear = true;
      for (let i = lo; i <= hi && clear; i++) {
        if (i === kf || i === rf) continue;
        if (this._cj.get(FILES[i] + rank)) clear = false;
      }
      if (!clear) continue;
      // the king may not pass through or land on an attacked square
      const step = kDest > kf ? 1 : -1;
      let safe = true;
      for (let i = kf; safe; i += step) {
        if (this._attackedAfterRemoving(FILES[i] + rank, enemy, [king, rookFile + rank])) safe = false;
        if (i === kDest) break;
      }
      if (!safe) continue;
      out.push({
        color, piece: 'k', from: king, to: FILES[kDest] + rank, rookFrom: rookFile + rank,
        rookTo: FILES[rDest] + rank, flags: side === 'h' ? 'k' : 'q', san: side === 'h' ? 'O-O' : 'O-O-O',
      });
    }
    return out;
  }

  /** Is `sq` attacked by `by` with the castling king and rook lifted off the board? */
  _attackedAfterRemoving(sq, by, lift) {
    const parts = this._cj.fen().split(' ');
    const g = new Chess(parts.join(' '), { skipValidation: true });
    for (const s of lift) g.remove(s);
    return g.isAttacked(sq, by);
  }

  moves({ verbose = false, square } = {}) {
    let list = this._cj.moves({ verbose: true, ...(square ? { square } : {}) });
    const castles = this._castlingMoves().filter((m) => !square || m.from === square);
    list = [...list, ...castles.map((c) => this._castleSan(c))];
    return verbose ? list : list.map((m) => m.san);
  }

  _castleSan(c) {
    // decorate O-O/O-O-O with +/# by trying it on a copy
    const copy = this._applyCastle(c, true);
    const suffix = copy._cj.inCheck() ? (copy.moves().length === 0 ? '#' : '+') : '';
    return { ...c, san: c.san + suffix, lan: c.from + c.rookFrom };
  }

  /** Board after a castle. `dry` returns a new game instead of mutating. */
  _applyCastle(c, dry = false) {
    const target = dry ? new Chess960Game(this.fen()) : this;
    const cj = target._cj;
    const parts = cj.fen().split(' ');
    const g = new Chess(parts.join(' '), { skipValidation: true });
    g.remove(c.from); g.remove(c.rookFrom);
    g.put({ type: 'k', color: c.color }, c.to);
    g.put({ type: 'r', color: c.color }, c.rookTo);
    const f = g.fen().split(' ');
    f[1] = c.color === 'w' ? 'b' : 'w';
    f[2] = '-';
    f[3] = '-';
    f[4] = String(Number(parts[4]) + 1);
    f[5] = String(Number(parts[5]) + (c.color === 'b' ? 1 : 0));
    target._cj = new Chess(f.join(' '));
    target._rights = { ...target._rights, [c.color]: [] };
    return target;
  }

  /**
   * Play a move: SAN, or {from,to,promotion}. Castling is accepted as king→
   * destination (g/c file) or king→own rook (UCI_Chess960 style, e.g. e1h1).
   */
  move(m) {
    const before = this.fen();
    let castle = null;
    const castles = this._castlingMoves();
    if (typeof m === 'string') {
      const clean = m.replace(/[+#]$/, '').replace(/0/g, 'O');
      if (clean === 'O-O' || clean === 'O-O-O') castle = castles.find((c) => c.san === clean);
    } else if (m && this._cj.get(m.from)?.type === 'k') {
      castle = castles.find((c) => c.from === m.from && (c.rookFrom === m.to || (c.to === m.to && !this._isNormalKingMove(m.from, m.to))));
    }
    let record;
    if (castle) {
      const san = this._castleSan(castle).san;
      this._applyCastle(castle);
      record = { ...castle, san, captured: undefined };
    } else {
      const r = this._cj.move(m); // throws on illegal, like chess.js
      record = { color: r.color, piece: r.piece, from: r.from, to: r.to, san: r.san, flags: r.flags, captured: r.captured, promotion: r.promotion };
      // castling rights: king moves lose both, rook moves/captures lose that file
      const color = r.color, enemy = color === 'w' ? 'b' : 'w';
      const rights = { w: [...this._rights.w], b: [...this._rights.b] };
      if (r.piece === 'k') rights[color] = [];
      const homeRank = color === 'w' ? '1' : '8', enemyRank = color === 'w' ? '8' : '1';
      if (r.piece === 'r' && r.from[1] === homeRank) rights[color] = rights[color].filter((f) => f !== r.from[0]);
      if (r.captured === 'r' && r.to[1] === enemyRank) rights[enemy] = rights[enemy].filter((f) => f !== r.to[0]);
      this._rights = rights;
    }
    const after = this.fen();
    const full = { ...record, before, after, lan: record.from + (record.rookFrom || record.to) + (record.promotion || '') };
    this._history.push(full);
    const key = this._key();
    this._counts.set(key, (this._counts.get(key) || 0) + 1);
    return full;
  }

  _isNormalKingMove(from, to) {
    return this._cj.moves({ verbose: true, square: from }).some((x) => x.to === to);
  }

  undo() {
    if (!this._history.length) return null;
    const moves = this._history.slice(0, -1);
    const last = this._history[this._history.length - 1];
    const fresh = new Chess960Game(this._startFen);
    for (const m of moves) fresh.move({ from: m.from, to: m.rookFrom || m.to, promotion: m.promotion });
    Object.assign(this, { _cj: fresh._cj, _rights: fresh._rights, _history: fresh._history, _counts: fresh._counts });
    return last;
  }

  history({ verbose = false } = {}) {
    return verbose ? this._history.map((m) => ({ ...m })) : this._history.map((m) => m.san);
  }

  isCheckmate() { return this._cj.inCheck() && this.moves().length === 0; }
  isStalemate() { return !this._cj.inCheck() && this.moves().length === 0; }
  isInsufficientMaterial() { return this._cj.isInsufficientMaterial(); }
  isThreefoldRepetition() { return (this._counts.get(this._key()) || 0) >= 3; }
  isDrawByFiftyMoves() { return Number(this._cj.fen().split(' ')[4]) >= 100; }
  isDraw() { return this.isStalemate() || this.isInsufficientMaterial() || this.isThreefoldRepetition() || this.isDrawByFiftyMoves(); }
  isGameOver() { return this.isCheckmate() || this.isDraw(); }

  header(...kv) { for (let i = 0; i + 1 < kv.length; i += 2) this._headers[kv[i]] = kv[i + 1]; return this._headers; }
  getHeaders() { return { ...this._headers }; }

  /** PGN with the Variant/SetUp/FEN headers other tools need for 960. */
  pgn() {
    const h = { Event: '?', Site: '?', Date: '????.??.??', Round: '?', White: '?', Black: '?', Result: '*', ...this._headers, Variant: 'Chess960', SetUp: '1', FEN: this._startFen };
    const head = Object.entries(h).map(([k, v]) => `[${k} "${String(v).replace(/"/g, "'")}"]`).join('\n');
    const startMove = Number(this._startFen.split(' ')[5]) || 1;
    const blackFirst = this._startFen.split(' ')[1] === 'b';
    const parts = [];
    this._history.forEach((m, i) => {
      const ply = i + (blackFirst ? 1 : 0);
      const num = startMove + Math.floor(ply / 2);
      if (ply % 2 === 0) parts.push(`${num}. ${m.san}`);
      else parts.push(i === 0 ? `${num}... ${m.san}` : m.san);
    });
    parts.push(h.Result);
    return `${head}\n\n${parts.join(' ')}`;
  }
}

/** Movetext SAN tokens of a PGN (comments, variations, NAGs, numbers and results removed). */
export function pgnSans(pgn) {
  let body = String(pgn).replace(/^\s*\[[^\]]*\]\s*$/gm, '');
  body = body.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
  // drop (nested) variations
  let prev;
  do { prev = body; body = body.replace(/\([^()]*\)/g, ' '); } while (body !== prev);
  return body.split(/\s+/)
    .map((tok) => tok.replace(/^\d+\.(\.\.)?/, '').replace(/[!?]+$/, ''))
    .filter((tok) => tok && !/^\$\d+$/.test(tok) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok));
}

/** Load a Chess960 PGN (needs a [FEN] header). Throws if a move is illegal. */
export function load960Pgn(pgn) {
  const fen = (String(pgn).match(/\[FEN\s+"([^"]+)"\]/) || [])[1];
  if (!fen) throw new Error('Chess960 PGN without a FEN header');
  const g = new Chess960Game(fen);
  for (const m of String(pgn).matchAll(/\[(\w+)\s+"([^"]*)"\]/g)) {
    if (!['FEN', 'SetUp', 'Variant'].includes(m[1])) g.header(m[1], m[2]);
  }
  for (const san of pgnSans(pgn)) g.move(san);
  return g;
}

export function isChess960Pgn(pgn) {
  return /\[Variant\s+"(Chess960|Fischerandom|Fischer Random|chess 960)"\]/i.test(String(pgn));
}

/** Load any position: Shredder-FEN castling → Chess960Game, otherwise chess.js. */
export function loadFen(fen) {
  return isShredderFen(fen) ? new Chess960Game(fen) : new Chess(fen);
}
