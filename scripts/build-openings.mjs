// Builds src/data/openings.json from the hand-curated line list below.
// Each entry: [eco, name, idea, movesSAN]. Names attach to the node at the
// end of the line; shared prefixes merge into one tree. Every line is
// replayed with chess.js so an illegal move fails the build.
// Run: node scripts/build-openings.mjs
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const LINES = [
  ['C20', "King's Pawn Game", 'Grab the centre and open lines for queen and bishop', 'e4'],
  ['C20', 'Open Game', 'Symmetrical centre — the classical battleground', 'e4 e5'],
  ['C40', "King's Knight Opening", 'Develop with tempo against e5', 'e4 e5 Nf3'],
  ['C44', "King's Knight: Normal", 'Defend e5 with a developing move', 'e4 e5 Nf3 Nc6'],
  ['C50', 'Italian Game', 'Fight for d5, aim at f7', 'e4 e5 Nf3 Nc6 Bc4'],
  ['C50', 'Italian: Giuoco Piano', 'Mirror the bishop, prepare c3 and d4', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['C54', 'Italian: Giuoco Pianissimo', 'Slow build-up with c3, d3, O-O and a later d4', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O'],
  ['C51', 'Italian: Evans Gambit', 'Give the b-pawn to gain time for c3 and d4', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5'],
  ['C55', 'Two Knights Defense', 'Counter-attack e4 instead of copying', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['C57', 'Two Knights: Fried Liver line', 'Ng5 hits f7; Black must play ...d5 accurately', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5'],
  ['C55', 'Two Knights: Modern d3', 'Quiet d3 keeps e4 solid and plays for a slow squeeze', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O'],
  ['C60', 'Ruy Lopez', 'Pressure the defender of e5', 'e4 e5 Nf3 Nc6 Bb5'],
  ['C65', 'Ruy Lopez: Berlin Defense', 'Hit e4 at once; aim for a solid endgame', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6'],
  ['C68', 'Ruy Lopez: Exchange Variation', 'Damage Black’s pawns, play for a better endgame', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6'],
  ['C78', 'Ruy Lopez: Morphy Defense', 'Question the bishop before deciding a set-up', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6'],
  ['C84', 'Ruy Lopez: Closed', 'Keep tension, re-route pieces, slow kingside play', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O'],
  ['C45', 'Scotch Game', 'Open the centre straight away with d4', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4'],
  ['C45', 'Scotch: Classical', 'Bc5 hits the d4 knight and develops', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7'],
  ['C45', 'Scotch: Schmidt Variation', 'Nf6 hits e4; Nxc6 and e5 is the main line', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7'],
  ['C42', 'Petrov Defense', 'Mirror attack on e4 — solid and symmetrical', 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5'],
  ['C41', 'Philidor Defense', 'Solid d6 support of e5, cramped but sturdy', 'e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7'],
  ['C47', 'Four Knights Game', 'Symmetrical development, safe and classical', 'e4 e5 Nf3 Nc6 Nc3 Nf6 Bb5 Bb4'],
  ['C25', 'Vienna Game', 'Nc3 keeps the f-pawn free for f4', 'e4 e5 Nc3 Nf6 f4 d5'],
  ['C33', "King's Gambit Accepted", 'Trade the f-pawn for open lines and the centre', 'e4 e5 f4 exf4 Nf3 g5'],
  ['B20', 'Sicilian Defense', 'Fight for d4 from the side; unbalance the game', 'e4 c5'],
  ['B50', 'Sicilian: Open', 'Trade c- for d-pawn; White gets space, Black the half-open c-file', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3'],
  ['B90', 'Sicilian: Najdorf', '...a6 controls b5 and keeps every plan flexible', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6'],
  ['B90', 'Sicilian: Najdorf, English Attack', 'f3, Qd2, g4 — castle long and storm the kingside', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3'],
  ['B70', 'Sicilian: Dragon', 'Fianchetto on the long diagonal aimed at the white king', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6'],
  ['B33', 'Sicilian: Sveshnikov', '...e5 grabs space at the cost of a hole on d5', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6'],
  ['B40', 'Sicilian: French Variation', 'Flexible ...e6 for Taimanov or Kan set-ups', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6'],
  ['B22', 'Sicilian: Alapin', 'c3 prepares d4 and avoids the main-line theory', 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3'],
  ['B23', 'Sicilian: Closed', 'Nc3 and g3 — a slow kingside build-up', 'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6'],
  ['B10', 'Caro-Kann Defense', 'Prepare ...d5 with a rock-solid pawn chain', 'e4 c6'],
  ['B18', 'Caro-Kann: Classical', 'Develop the light bishop before ...e6', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6'],
  ['B12', 'Caro-Kann: Advance', 'White takes space; Black hits the chain with ...c5 and ...Bf5', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5'],
  ['B13', 'Caro-Kann: Exchange', 'Symmetrical structure; fight over the e-file and e4', 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6'],
  ['C00', 'French Defense', 'Solid ...e6 and ...d5; counter-punch with ...c5', 'e4 e6 d4 d5'],
  ['C02', 'French: Advance', 'White gains space; Black attacks the base with ...c5', 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6'],
  ['C11', 'French: Classical', 'Nf6 hits e4 and asks White to commit', 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7'],
  ['C15', 'French: Winawer', 'Pin the knight and pressure e4', 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7'],
  ['C01', 'French: Exchange', 'Symmetrical open file, easy development', 'e4 e6 d4 d5 exd5 exd5 Bd3 Bd6'],
  ['B01', 'Scandinavian Defense', 'Challenge e4 at once and recapture with the queen', 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6'],
  ['B07', 'Pirc Defense', 'Let White build a centre, then strike with ...e5 or ...c5', 'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O'],
  ['B06', 'Modern Defense', 'Fianchetto first, keep the knight flexible', 'e4 g6 d4 Bg7 Nc3 d6'],
  ['B02', "Alekhine's Defense", 'Provoke the pawns forward, then undermine them', 'e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4'],
  ['A40', "Queen's Pawn Game", 'Claim the centre with a protected pawn', 'd4'],
  ['D00', 'Closed Game', 'Classical ...d5 reply to d4', 'd4 d5'],
  ['D06', "Queen's Gambit", 'Offer the c-pawn to deflect Black’s d-pawn', 'd4 d5 c4'],
  ['D53', "Queen's Gambit Declined", 'Hold d5 with ...e6 and complete development', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7'],
  ['D35', 'QGD: Exchange Variation', 'Fixed structure; minority attack with b4-b5', 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 c6'],
  ['D32', 'Tarrasch Defense', 'Free development in exchange for an isolated pawn', 'd4 d5 c4 e6 Nc3 c5 cxd5 exd5 Nf3 Nc6'],
  ['D20', "Queen's Gambit Accepted", 'Take the pawn, give it back for quick development', 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5'],
  ['D15', 'Slav Defense', 'Support d5 with ...c6, keeping the light bishop free', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5'],
  ['D45', 'Semi-Slav Defense', '...e6 and ...c6 — a sturdy triangle around d5', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7'],
  ['D02', 'London System', 'Bf4, e3, c3 — the same easy set-up every game', 'd4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6'],
  ['A45', 'Indian Defense', 'Control e4 with a piece and stay flexible', 'd4 Nf6'],
  ['A48', 'London System (vs ...Nf6)', 'Same London set-up against the Indian move order', 'd4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O'],
  ['E90', "King's Indian Defense", 'Hand White the centre, then attack it with ...e5', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5'],
  ['E97', "King's Indian: Mar del Plata", 'Closed centre; Black storms the kingside with ...f5', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7'],
  ['D85', 'Grünfeld Defense', 'Let White take the centre, then blast it with ...c5', 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7'],
  ['E46', 'Nimzo-Indian Defense', 'Pin the c3 knight to fight for e4', 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5'],
  ['E32', 'Nimzo-Indian: Classical', 'Qc2 avoids doubled pawns and eyes e4', 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3'],
  ['E15', "Queen's Indian Defense", 'Fianchetto to control e4 from afar', 'd4 Nf6 c4 e6 Nf3 b6 g3 Ba6'],
  ['E06', 'Catalan Opening', 'Fianchetto bishop presses on d5 and the long diagonal', 'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O'],
  ['A57', 'Benko Gambit', 'Sacrifice a pawn for long-term queenside pressure', 'd4 Nf6 c4 c5 d5 b5 cxb5 a6'],
  ['A70', 'Modern Benoni', 'Asymmetric pawns: Black gets the queenside majority', 'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6'],
  ['A81', 'Dutch Defense', 'Grab e4 with ...f5 and play on the kingside', 'd4 f5 g3 Nf6 Bg2 e6 Nf3 Be7'],
  ['A10', 'English Opening', 'Flank control of d5; often transposes', 'c4'],
  ['A29', 'English: Reversed Sicilian', 'A Sicilian with an extra tempo for White', 'c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6'],
  ['A38', 'English: Symmetrical', 'Mirror ...c5 — slow, positional manoeuvring', 'c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7'],
  ['A13', 'Réti Opening', 'Develop first, hit the centre with pieces', 'Nf3 d5 c4 e6 g3 Nf6 Bg2 Be7'],
  ['A07', "King's Indian Attack", 'KID set-up with White: Nf3, g3, Bg2, O-O, d3, e4', 'Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7'],
];

const root = { san: null, children: [] };
for (const [eco, name, idea, line] of LINES) {
  const g = new Chess();
  let node = root;
  for (const san of line.split(' ')) {
    const mv = g.move(san); // throws on an illegal move
    let child = node.children.find((c) => c.san === mv.san);
    if (!child) { child = { san: mv.san, children: [] }; node.children.push(child); }
    node = child;
  }
  if (node.name) throw new Error(`duplicate name at ${line}`);
  Object.assign(node, { eco, name, idea });
}

const clean = (n) => {
  const o = { san: n.san };
  if (n.name) Object.assign(o, { eco: n.eco, name: n.name, idea: n.idea });
  if (n.children.length) o.children = n.children.map(clean);
  return o;
};
const out = new URL('../src/data/openings.json', import.meta.url);
writeFileSync(out, JSON.stringify({ source: 'Hand-curated in scripts/build-openings.mjs', tree: clean(root) }) + '\n');
console.log(`wrote ${LINES.length} named lines`);
