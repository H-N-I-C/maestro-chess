/* Minimal opening recognition: longest SAN-prefix match wins.
   Covers the mainstream openings a learner meets; unknown lines just
   report the family (e.g. "Sicilian Defense"). */

const BOOK = [
  { p: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], n: 'Italian Game' },
  { p: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], n: 'Italian Game: Giuoco Piano' },
  { p: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6'], n: 'Italian Game: Giuoco Piano' },
  { p: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'], n: 'Italian Game: Evans Gambit' },
  { p: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], n: 'Scotch Game' },
  { p: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Bc4'], n: 'Scotch Game: Haxo/Classical' },
  { p: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], n: 'Ruy López (Spanish)' },
  { p: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'], n: 'Ruy López: Closed' },
  { p: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'], n: 'Ruy López: Exchange' },
  { p: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], n: 'Ruy López: Berlin Defense' },
  { p: ['e4', 'e5', 'Nf3', 'd6'], n: 'Philidor Defense' },
  { p: ['e4', 'e5', 'Nf3', 'f5'], n: 'King\'s Gambit' },
  { p: ['e4', 'e5', 'Nf3', 'f5', 'exf5'], n: 'King\'s Gambit Accepted' },
  { p: ['e4', 'e5', 'f4'], n: 'King\'s Gambit' },
  { p: ['e4', 'e5', 'd4', 'exd4'], n: 'Center Game' },
  { p: ['e4', 'e5', 'Nc3', 'Nf6'], n: 'Vienna Game' },
  { p: ['e4', 'e5', 'Qh5'], n: 'Wayward Queen (scholar\'s mate try)' },
  { p: ['e4', 'c5'], n: 'Sicilian Defense' },
  { p: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], n: 'Sicilian: Najdorf' },
  { p: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'], n: 'Sicilian: Dragon' },
  { p: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5'], n: 'Sicilian: Sveshnikov' },
  { p: ['e4', 'c5', 'Nf3', 'e6'], n: 'Sicilian: French Variation' },
  { p: ['e4', 'c5', 'c3'], n: 'Sicilian: Alapin' },
  { p: ['e4', 'c6'], n: 'Caro-Kann Defense' },
  { p: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'], n: 'Caro-Kann: Classical' },
  { p: ['e4', 'd5'], n: 'Scandinavian Defense' },
  { p: ['e4', 'd6'], n: 'Pirc Defense' },
  { p: ['e4', 'g6'], n: 'Modern Defense' },
  { p: ['e4', 'e6', 'd4', 'd5', 'e5'], n: 'French Defense: Advance' },
  { p: ['e4', 'e6', 'd4', 'd5', 'Nc3'], n: 'French Defense' },
  { p: ['e4', 'e6', 'd4', 'd5', 'exd5'], n: 'French Defense: Exchange' },
  { p: ['d4', 'd5', 'c4'], n: 'Queen\'s Gambit' },
  { p: ['d4', 'd5', 'c4', 'dxc4'], n: 'Queen\'s Gambit Accepted' },
  { p: ['d4', 'd5', 'c4', 'c6'], n: 'Queen\'s Gambit: Slav' },
  { p: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O'], n: 'Queen\'s Gambit: Orthodox' },
  { p: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'c5'], n: 'Tarrasch Defense' },
  { p: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'd5'], n: 'Queen\'s Gambit' },
  { p: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'], n: 'Grünfeld Defense' },
  { p: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'], n: 'King\'s Indian Defense' },
  { p: ['d4', 'Nf6', 'c4', 'g6', 'Nf3', 'Bg7'], n: 'King\'s Indian Defense' },
  { p: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'Bb4'], n: 'Nimzo-Indian Defense' },
  { p: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'], n: 'Queen\'s Indian Defense' },
  { p: ['d4', 'Nf6', 'c4', 'c5'], n: 'Benoni Defense' },
  { p: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'e6', 'Nc3', 'exd5', 'cxd5', 'd6'], n: 'Modern Benoni' },
  { p: ['d4', 'Nf6', 'Nf3', 'e6', 'Bg5'], n: 'Trompowsky Attack' },
  { p: ['d4', 'Nf6', 'Bf4'], n: 'London System' },
  { p: ['d4', 'Nf6', 'Bg5'], n: 'Pseudo-Trompowsky' },
  { p: ['d4', 'd5', 'Bf4'], n: 'London System' },
  { p: ['c4'], n: 'English Opening' },
  { p: ['c4', 'e5'], n: 'English: Reversed Sicilian' },
  { p: ['c4', 'c5'], n: 'English: Symmetrical' },
  { p: ['Nf3'], n: 'Réti Opening' },
  { p: ['Nf3', 'd5', 'g3'], n: 'Réti Opening' },
  { p: ['e4', 'e5', 'Ke2'], n: 'Bongcloud — seriously?' },
];

const FAMILY = [
  { p: ['e4', 'e5'], n: 'Open Game (1.e4 e5)' },
  { p: ['e4'], n: 'King\'s Pawn Opening' },
  { p: ['d4', 'd5'], n: 'Closed Game (1.d4 d5)' },
  { p: ['d4'], n: 'Queen\'s Pawn Opening' },
  { p: ['c4'], n: 'English Opening' },
  { p: ['Nf3'], n: 'Réti Opening' },
];

/** Best-match opening name for a SAN move list, or null if nothing fits. */
export function openingName(sans) {
  if (!sans?.length) return null;
  let best = null;
  for (const entry of [...BOOK, ...FAMILY]) {
    if (entry.p.length > sans.length) continue;
    if (entry.p.every((m, i) => sans[i] === m)) {
      if (!best || entry.p.length > best.p.length) best = entry;
    }
  }
  return best?.n || null;
}
