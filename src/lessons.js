/* Maestro curriculum — staged lessons.
   Lesson shapes:
   { id, stage, title, intro, demoFen, demoNote, puzzles:[{fen, prompt, accept:[SAN], hint}], coachFocus }
   Puzzles are validated by SAN match against `accept`. */

export const STAGES = [
  { id: 'tactics-1', num: 1, title: 'Tactics I — Striking Patterns', blurb: 'The mating patterns and double attacks that win games outright.' },
  { id: 'openings', num: 2, title: 'Openings — Sound Starts', blurb: 'Principles over memorization: build a complete, honest repertoire.' },
  { id: 'tactics-2', num: 3, title: 'Tactics II — Calculation', blurb: 'Counting, intermediate moves, and seeing one layer deeper.' },
  { id: 'middlegame', num: 4, title: 'Middlegame — Planning', blurb: 'Structures, weak squares, piece activity, and real plans.' },
  { id: 'endgames', num: 5, title: 'Endgames — Converting', blurb: 'The technique that turns advantages into points.' },
];

export const LESSONS = [
  /* ---------------- STAGE 1 ---------------- */
  {
    id: 'mate-backrank', stage: 'tactics-1', title: 'The Back-Rank Mate',
    intro: `A king boxed in by its own pawns on the second rank is a target for any rook or queen that reaches the back rank.\n\nRule of thumb: if the enemy king has pawns on f2/g2/h2 (or f7/g7/h7) and no escape square, a major piece landing on the 8th (or 1st) rank is often instant mate.\n\nIn your own games: give your king an escape hatch (…h6 or …g6) before it becomes a problem.`,
    demoFen: '6k1/5ppp/8/8/8/8/8/2R3K1 w - - 0 1', demoNote: 'White to move. Look at Black\'s king: pawns on f7, g7, h7, nothing defending the 8th rank.',
    puzzles: [
      { fen: '6k1/5ppp/8/8/8/8/8/2R3K1 w - - 0 1', prompt: 'White to play — deliver mate in one.', accept: ['Rc8#'], hint: 'The back rank is undefended. Which rook move lands on the 8th?' },
      { fen: '7k/6pp/8/8/8/5K2/8/R7 w - - 0 1', prompt: 'White to play — mate in one.', accept: ['Ra8#'], hint: 'Black\'s own pawns on g7 and h7 box in the king. The rook checks along the back rank.' },
    ],
    coachFocus: 'Watch for back-rank weaknesses — kings with f/g/h pawns and no luft.',
  },
  {
    id: 'mate-queen', stage: 'tactics-1', title: 'Mate with the Queen Up Close',
    intro: `The queen is the perfect mating piece because it attacks in every direction — but she must be protected by her king or a piece, or the enemy king will simply capture her.\n\nThe classic pattern: king one square away from the enemy king, queen delivering check while protected. The two kings work as a net; the queen delivers the final blow.`,
    demoFen: '7k/8/6K1/8/8/8/8/Q7 w - - 0 1', demoNote: 'The king on g6 guards g7. The queen on a1 slides along the long diagonal to deliver mate.',
    puzzles: [
      { fen: '7k/8/6K1/8/8/8/8/Q7 w - - 0 1', prompt: 'White to play — mate in one.', accept: ['Qg7#'], hint: 'Queen along the long diagonal to g7 — guarded by your king on g6.' },
      { fen: 'k7/8/1K6/8/8/8/8/Q7 w - - 0 1', prompt: 'White to play — mate in one.', accept: ['Qa7#'], hint: 'Queen up the a-file to the 7th rank — guarded by your king on b6.' }
    ],
    coachFocus: 'Queen-and-king mate nets: bring the king close first, then check with protection.',
  },
  {
    id: 'fork', stage: 'tactics-1', title: 'The Knight Fork',
    intro: `A fork attacks two (or more) targets at once. The knight is the supreme forking piece because its jumps can't be blocked.\n\nThe most feared pattern is the family fork: knight checks the king and attacks the queen at the same time. The king must move, and the queen is lost.\n\nHunt for it: knights love outposts near the enemy camp — squares like e6, f6, d5 where they attack both the king and valuable pieces.`,
    demoFen: '6k1/8/8/7q/6N1/8/8/6K1 w - - 0 1', demoNote: 'Nf6+ (from g4) checks the king on g8 AND attacks the queen on h5. One move, two victims.',
    puzzles: [
      { fen: '6k1/8/8/7q/6N1/8/8/6K1 w - - 0 1', prompt: 'White to play — win material with a fork.', accept: ['Nf6+'], hint: 'The knight on g4 jumps to f6: check to g8, and the queen on h5 is attacked.'},
      { fen: '6k1/8/8/3r4/6N1/8/8/6K1 w - - 0 1', prompt: 'White to play — win the rook.', accept: ['Nf6+'], hint: 'The knight on g4 checks the king from f6 — and f6 also sees the rook on d5.' }
    ],
    coachFocus: 'Spot knight forks: checks on e6/f6/d5/c7 that simultaneously hit loose pieces.',
  },
  {
    id: 'pin', stage: 'tactics-1', title: 'The Pin — Paralysing Pieces',
    intro: `A pinned piece is a piece that cannot move without exposing something more valuable behind it.\n\nAbsolute pin: the piece is pinned to the king — it legally cannot move.\nRelative pin: moving exposes the queen or a rook.\n\nTactical meaning: pinned pieces are weak attackers and weak defenders. You can pile up on them, win them, or ignore them because they "don't count" as defenders.`,
    demoFen: '6k1/5ppp/5n2/6B1/8/8/8/6K1 w - - 0 1', demoNote: 'The bishop on g5 pins the knight on f6 to the king on g8. The knight is frozen — Bxf6 wins it.',
    puzzles: [
      { fen: '6k1/5ppp/5n2/6B1/8/8/8/6K1 w - - 0 1', prompt: 'White to play — win the pinned piece.', accept: ['Bxf6'], hint: 'The knight cannot legally move because the king is behind it. Just take it.' },
      { fen: '6k1/5ppp/5n2/6B1/8/8/8/2Q3K1 w - - 0 1', prompt: 'White to play — the strongest move piles up on the pin. Find it.', accept: ['Qb2', 'Qc7'], hint: 'Bxf6 works, but add one more attacker first — or hit the square the knight can never leave.' },
    ],
    coachFocus: 'Pins: count pinned pieces as half-defenders; pile attackers on pinned pieces.',
  },
  {
    id: 'check-collect', stage: 'tactics-1', title: 'Check and Collect',
    intro: `Checks are the most forcing moves in chess — the opponent MUST respond. That makes every check a free move.\n\nPattern: check the king, and while the king runs, your piece keeps attacking something else. Then collect.\n\nAlways scan your checks first when hunting for tactics. "Check, capture, threat" — in that order.`,
    demoFen: '5rk1/8/8/8/8/8/1r6/2Q3K1 w - - 0 1', demoNote: 'Qc8+ forces Black to deal with check. The rook on b2 is then hanging — Qxb2 next.',
    puzzles: [
      { fen: '5rk1/8/8/8/8/8/1r6/2Q3K1 w - - 0 1', prompt: 'White to play — start the sequence that wins a rook.', accept: ['Qc8'], hint: 'Queen to c8 attacks the rook on f8 — Black must save it, then Qxb2. (The f8 rook blocks the check, so no +.)'},
      { fen: '6k1/8/8/8/8/2r5/8/3Q2K1 w - - 0 1', prompt: 'White to play — win the rook on c3.', accept: ['Qd8+'], hint: 'Queen to the back rank: check first, capture next.' },
    ],
    coachFocus: 'Forcing moves: check the king to win time and collect hanging material.',
  },
  {
    id: 'mate-net', stage: 'tactics-1', title: 'The King Hunt — Closing the Net',
    intro: `Winning material is good; mating is better. When the enemy king is exposed, stop counting points and start counting moves to mate.\n\nTechnique: cut off escape squares with quiet, protected queen moves. Every square the king cannot go to is worth more than a pawn.`,
    demoFen: '6k1/8/6K1/8/8/8/8/3Q4 w - - 0 1', demoNote: 'The net is almost closed: f7, g7, h7 are covered by the king. One queen move covers the whole back rank.',
    puzzles: [
      { fen: '6k1/8/6K1/8/8/8/8/3Q4 w - - 0 1', prompt: 'White to play — mate in one.', accept: ['Qd8#'], hint: 'Queen to d8 covers the entire 8th rank.' },
    ],
    coachFocus: 'Closing mating nets: cover escape squares before giving the final check.',
  },

  /* ---------------- STAGE 2 ---------------- */
  {
    id: 'opening-rules', stage: 'openings', title: 'The Three Golden Rules',
    intro: `Forget memorizing 25 moves. Opening strength comes from three rules:\n\n1. CONTROL THE CENTER with pawns (e4, d4, e5, d5) and pieces.\n2. DEVELOP knights and bishops quickly — every piece you don't develop is a piece not fighting.\n3. CASTLE EARLY. An uncastled king is a tactical target (remember Scholar's Mate?).\n\nAnd the golden tiebreaker: don't move the same piece twice, and don't bring the queen out early — she becomes a target for developing tempi.`,
    demoFen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 6 5',
    demoNote: 'A perfect start for White: pawns on e4/d4 space, both knights out, bishops active, king castled. Black is one tempo behind.',
    puzzles: [
      { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', prompt: 'White to move (move 2). What is the principled developing move?', accept: ['Nf3'], hint: 'Develop a knight toward the center — it also attacks e5.' },
      { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2', prompt: 'Black to move — follow the same rule.', accept: ['Nc6'], hint: 'Develop your own knight and defend e5.' }
    ],
    coachFocus: 'Opening principles: center pawns, quick development, early castling, no queen excursions.',
  },
  {
    id: 'italian', stage: 'openings', title: 'Your First Repertoire: The Italian Game',
    intro: `1.e4 e5 2.Nf3 Nc6 3.Bc4 — the Italian Game. It has taught beginners for 500 years because every move follows a principle.\n\nThe bishop on c4 eyes f7 — the weakest point in Black's camp (only the king defends it). Typical plan: castle, play d3, then either c3 and d4 (Giuoco Piano) or attack with Ng5 ideas.\n\nAs Black against 1.e4: 1...e5, develop both knights, both bishops, castle. You will reach solid positions every time.`,
    demoFen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 6 5',
    demoNote: 'The classic Italian tabiya. White\'s plan: c3, d4, or Re1 and Ng5 pressure on f7.',
    puzzles: [
      { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 1 3', prompt: 'White to move — complete the Italian trio (3rd move).', accept: ['Bc4'], hint: 'Which bishop aims at the weakest square, f7?' },
    ],
    coachFocus: 'Italian Game plans: pressure on f7, c3-d4 pawn center, Re1/Ng5 ideas.',
  },
  {
    id: 'queens-gambit', stage: 'openings', title: 'The Queen\'s Gambit: Holding the Center',
    intro: `1.d4 d5 2.c4 — the Queen's Gambit. White offers a wing pawn to pull Black's center pawn away.\n\nBlack's sound response is 2...e6 (declining — keeping a strong center) or 2...dxc4 (accepting — but after e3 and Bxc4 White gets quick development).\n\nWhat NOT to do: 2...c5?! gambits back, and hanging onto the c4 pawn with ...b5 weakens the queenside catastrophically. The lesson: in the opening, development beats material.`,
    demoFen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2',
    demoNote: 'The gambit position. White will build with Nc3, e4 breaks; Black should develop and strike back with ...e5 or ...c5 later, not cling to pawns.',
    puzzles: [
      { fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2', prompt: 'White to move — play the gambit (2nd move).', accept: ['c4'], hint: 'Queen\'s Gambit: the c-pawn attacks d5.' },
      { fen: 'rnbqkbnr/ppp1pppp/8/2pp4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq c6 0 2', prompt: 'White to move — Black replied 2...c5?! How do you refute the greediest plan?', accept: ['dxc5'], hint: 'Take! Black cannot defend c5 while keeping a healthy center.' },
    ],
    coachFocus: 'Queen\'s Gambit structures: development and central breaks (e4/e5) decide, not the c4 pawn.',
  },
  {
    id: 'scholars', stage: 'openings', title: 'Trapology: Scholar\'s Mate & How to Punish It',
    intro: `1.e4 e5 2.Qh5?! — the four-move-mate attempt. It threatens Qxf7#. Thousands of beginners lose to it; thousands more lose BY playing it.\n\nDefend: 2...Nf6 attacks the queen and ends the threat (or 2...Qe7). Then punish: White's queen is exposed in the middle of the board. Develop with tempi — Nf6, Nc6, Bc5 — and the queen will run.\n\nThe meta-skill: when your opponent attacks, ask "what does this threat actually need?" — then meet it with a move that also develops.`,
    demoFen: 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1K1NR b KQkq - 1 2',
    demoNote: 'After 2.Qh5?!. Black to move: Nf6! attacks the queen and kills the mate threat in one go.',
    puzzles: [
      { fen: 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 1 2', prompt: 'Black to move — defend AND counterattack.', accept: ['Nf6'], hint: 'A knight move that attacks the queen. The mate threat dies with it.' },
      { fen: 'r1bqkbnr/pppp1p1p/2n3p1/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4', prompt: 'Black just played 3...g6?? (wrong — the f8 bishop is blocked). White to move: punish it.', accept: ['Qxe5+'], hint: 'The e5 pawn was defended only by the d7 pawn... which now can\'t recapture. Take with check.' },
    ],
    coachFocus: 'Opening traps: identify the real threat, answer it with a developing counterattack.',
  },

  /* ---------------- STAGE 3 ---------------- */
  {
    id: 'counting', stage: 'tactics-2', title: 'Counting — The Most Skipped Skill',
    intro: `Before any capture sequence, count attackers and defenders. If attackers > defenders, you usually win; if equal, the first capturer loses material.\n\nBut watch the piece VALUES: trading your queen (9) for a defended pawn (1) in a sequence loses material even if you capture "first".\n\nPractice the ritual: point at the target, count attackers, count defenders, then and only then calculate.`,
    demoFen: '6k1/8/8/3r4/4P3/8/8/4R1K1 w - - 0 1',
    demoNote: 'Attackers of d5: one pawn. Defenders of d5: zero. exd5 wins a whole rook.',
    puzzles: [
      { fen: '6k1/8/8/3r4/4P3/8/8/4R1K1 w - - 0 1', prompt: 'White to play — counting says this rook is loose. Prove it.', accept: ['exd5'], hint: 'One attacker, zero defenders on d5.' },
      { fen: '6k1/8/8/3r4/4P3/8/8/3R2K1 w - - 0 1', prompt: 'White to play — attackers vs defenders of d5?', accept: ['exd5', 'Rxd5'], hint: 'Two attackers (pawn, rook), one defender (the rook itself). Either way the rook is lost.' },
    ],
    coachFocus: 'Count attackers and defenders before every exchange; value awareness in sequences.',
  },
  {
    id: 'intermezzo', stage: 'tactics-2', title: 'The Intermediate Move (Zwischenzug)',
    intro: `When a sequence seems forced — "I take, he takes" — pause. Is there a more urgent move you can insert FIRST?\n\nAn intermediate move, usually a check or a bigger threat, breaks the rhythm of the expected sequence and wins material or time.\n\nHabit: before recapturing automatically, scan ALL your checks and captures. Recapture is the most common autopilot mistake in club chess.`,
    demoFen: '6k1/8/8/8/8/8/1r6/2R3K1 w - - 0 1',
    demoNote: 'Rxb2?? trades rooks. But Rc8+ forces the king to move FIRST — then Rxb2 wins a whole rook.',
    puzzles: [
      { fen: '6k1/8/8/8/8/8/1r6/2R3K1 w - - 0 1', prompt: 'White to play — win material, not just trade.', accept: ['Rc8+'], hint: 'Don\'t trade on b2 yet. Insert a check first.'},
      { fen: '6k1/8/8/3r4/4P3/8/8/4R1K1 w - - 0 1', prompt: 'White to play — the simple capture works here. Take it.', accept: ['exd5'], hint: 'The rook on d5 is attacked once, defended zero times. exd5 wins it.' },
    ],
    coachFocus: 'Intermediate moves: check your checks before recapturing; break automatic sequences.',
  },
  {
    id: 'greek-gift', stage: 'tactics-2', title: 'The Greek Gift — A Real Sacrifice',
    intro: `Bxh7+! — the bishop sacrifice that defines attacking chess. Preconditions:\n\n1. The h7 pawn is defended ONLY by the king.\n2. Your knight can reach g5 (attacking h7).\n3. Your queen can reach the h-file or d1-h5 diagonal.\n4. The enemy king has no escape (no …g6 with a solid dark-square bishop, no knight on f6 to block).\n\nAfter Bxh7+ Kxh7, Ng5+ and Qh5+ (or Qd3+) drag the king out. Sometimes it mates; sometimes you win three pawns and the initiative. Calculate — don't guess.`,
    demoFen: 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 6 5',
    demoNote: 'NOT the moment yet — Black\'s knight covers f6/h7 area and g7 bishop defends h6. Spotting WHEN it doesn\'t work is half the skill.',
    puzzles: [],
    coachFocus: 'Greek Gift preconditions: h7 only defended by king, Ng5 available, queen ready, no defensive pieces.',
  },
  {
    id: 'mate-in-2', stage: 'tactics-2', title: 'Mate in Two — Thinking Forcing Moves',
    intro: `Mate in one is pattern recognition; mate in two is discipline. Method:\n\n1. List EVERY check.\n2. For each check, list every legal reply.\n3. If all but one reply are impossible, calculate that one reply — does mate follow?\n\nRestricting the king is the key skill: checks that drive the king into a corner, quiet moves that take away escape squares (quiet moves are the hard part — look for them first).`,
    demoFen: '6k1/6pp/8/8/8/8/8/3Q2K1 w - - 0 1',
    demoNote: 'Qd8+ Kh7, Qg8# — or Qxg7# if the king retreats. One check, one reply, one final blow.',
    puzzles: [
      { fen: '6k1/6pp/8/8/8/8/8/3Q2K1 w - - 0 1', prompt: 'White to play — start mate in two (the forcing first move).', accept: ['Qd8+'], hint: 'Back-rank check. Where can the king run — and what follows?' }
    ],
    coachFocus: 'Mate in two method: enumerate checks, enumerate replies, calculate the single branch.',
  },

  /* ---------------- STAGE 4 ---------------- */
  {
    id: 'structures', stage: 'middlegame', title: 'Pawn Structures Define Plans',
    intro: `Pawns can't move backwards — their skeleton IS the position. Learn to read three skeletons:\n\nISOLATED d-PAWN (IQP): dynamic power (the d4/d5 break) vs endgame weakness. Play actively, trade pieces, use the outpost on e5/e4.\n\nHANGING PAWNS (c+d): strong in attack, fragile in defense. Pressure them — force them to advance, then blockade.\n\nCARLSBAD (QGD exchange): the minority attack — advance b4-b5 to induce a weakness on c6/c7, then attack it forever.\n\nWhen you don't know what to do: identify the structure, name its characteristic plan, and play it.`,
    demoFen: 'r2q1rk1/ppp1bppp/3p1n2/8/3NP3/2N2P2/PPP3PP/R1BQ1RK1 b - - 0 9',
    demoNote: 'Carlsbad-type structure. White\'s plan is textbook: Rb1, b4-b5, create and attack a c-pawn weakness.',
    puzzles: [
      { fen: 'r2q1rk1/ppp1bppp/3p1n2/8/3NP3/2N2P2/PPP3PP/R1BQ1RK1 b - - 0 9', prompt: 'Black to move — use your activity to grab a pawn.', accept: ['Nxe4'], hint: 'The knight on f6 can take on e4 — is that pawn actually defended?' }
    ],
    coachFocus: 'Pawn structures: name the structure, find its characteristic plan (IQP breaks, minority attack, hanging pawns).',
  },
  {
    id: 'outposts', stage: 'middlegame', title: 'Weak Squares & Outposts',
    intro: `A weak square is one your opponent can't defend with a pawn. An outpost is a weak square where YOUR piece (usually a knight) can sit, protected, forever.\n\nKnights on outposts are monsters: a knight on d6/d3 attacks the whole position. Rooks and queens love open files; bishops love diagonals with fixed targets.\n\nTo create outposts: advance pawns past the square, exchange the defenders, and park a piece there. To fight them: trade the piece on the outpost, or fix a pawn to control it.`,
    demoFen: 'r2q1rk1/ppp1bppp/3p1n2/8/4P3/5N2/PPP2PPP/R1BQ1RK1 w - - 0 10',
    demoNote: 'd5 is a dream outpost: no black pawn can ever attack it. Nd2-c4/e4-d5 is the plan.',
    puzzles: [
      { fen: 'r2q1rk1/ppp1bppp/3p1n2/8/4P3/5N2/PPP2PPP/R1BQ1RK1 w - - 0 10', prompt: 'White to play — head for the outpost.', accept: ['Nd2'], hint: 'Route: f3–d2–c4/e4–d5. Start the journey.' },
    ],
    coachFocus: 'Weak squares and outposts: find squares no enemy pawn can control, and occupy them.',
  },
  {
    id: 'activity', stage: 'middlegame', title: 'Piece Activity — The Hanging Pieces Lecture',
    intro: `A piece doing nothing is a piece you're playing without. Before every move, audit the board:\n\n- Which of my pieces is worst-placed? Improve IT.\n- Which enemy pieces are unprotected? Attack THEM.\n\nThe "worst piece" heuristic fixes more club games than any tactic. Bishops on e2/d2 behind pawns, rooks on f1/g1 blocked by their own bishop — free them with f3/e4 breaks or reroute.`,
    demoFen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b - - 0 5',
    demoNote: 'Black\'s c8 bishop is the worst piece — ...d6 is played, so ...Bd7–c6 (or ...b6, ...Bb7) is the fix. White\'s c1 bishop wants f4 or g5.',
    puzzles: [
      { fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b - - 0 5', prompt: 'Black to move — improve your worst piece.', accept: ['Bd7', 'Be6', 'b6'], hint: 'The c8 bishop is asleep — d7 or e6 wakes it. (b6 also frees the c8–h3 diagonal long-term.)' }
    ],
    coachFocus: 'Piece activity: improve your worst piece each move; audit for unprotected enemy pieces.',
  },
  {
    id: 'plans', stage: 'middlegame', title: 'Planning: The Two Weaknesses Principle',
    intro: `A single weakness can often be defended indefinitely. The winning method: create a SECOND weakness on the other wing, stretching the defense until it cracks.\n\nThe practical loop:\n1. Improve all your pieces.\n2. Probe for weaknesses.\n3. When the defense overcommits to one wing — SWITCH (the "Alekhine's gun" or simple wing transfer).\n\nAsk yourself each move: "What is my opponent's worst-placed piece, and what weakness can I make them defend?"`,
    demoFen: 'r2q1rk1/ppp1bppp/3p1n2/8/3NP3/2N2P2/PPP3PP/R1BQ1RK1 b - - 0 9',
    demoNote: 'Black holds d6 and b7 for now. The long game: pressure on the queenside, then e4/e5 central break as the second front.',
    puzzles: [],
    coachFocus: 'Planning: improve pieces, probe weaknesses, create a second front when defense overcommits.',
  },

  /* ---------------- STAGE 5 ---------------- */
  {
    id: 'kq-mate', stage: 'endgames', title: 'Checkmate with King & Queen',
    intro: `The method: use the queen to build a shrinking box around the enemy king, walk your own king up, deliver mate.\n\nNever stalemate! Rule: when the king is on the edge, bring your king CLOSE before checking. Check → king approaches → repeat.\n\nThe final pattern: enemy king on the edge, your king two squares away covering escape, queen delivers mate from a protected square or the edge of the box.`,
    demoFen: '8/8/8/4k3/8/3K4/8/3Q4 w - - 0 1',
    demoNote: 'Qd4 builds the box; Kc3 walks forward. Do NOT check from afar — shrink the cage first.',
    puzzles: [
      { fen: '6k1/8/6K1/8/8/8/8/3Q4 w - - 0 1', prompt: 'White to play — mate in one to finish the drill.', accept: ['Qd8#'], hint: 'The whole back rank with one queen move.' },
    ],
    coachFocus: 'K+Q mate: box with the queen, approach with the king, beware stalemate before the final check.',
  },
  {
    id: 'kr-mate', stage: 'endgames', title: 'Checkmate with King & Rook',
    intro: `The rook can't mate alone — it needs the king's help to cut off escape squares.\n\nMethod: 1. Use the rook to cut the king off one rank/file.\n2. Walk your king to the edge.\n3. When the enemy king is boxed on the edge with your king guarding escape squares, deliver mate.\n\nThe classic mate: enemy king h8, your king f7, rook mates on the back rank — Rh8# or Ra8#. Practice it against the engine until it takes under 30 seconds.`,
    demoFen: '7k/8/6K1/8/8/8/8/R7 w - - 0 1',
    demoNote: 'The mate is one move away: Ra8#. Your king covers g7 and h7 — that\'s the cooperation.',
    puzzles: [
      { fen: '7k/8/6K1/8/8/8/8/R7 w - - 0 1', prompt: 'White to play — mate in one.', accept: ['Ra8#'], hint: 'Rook to the back rank. Your king stops g7/h7.' },
      { fen: '6k1/8/6K1/8/8/8/8/R7 w - - 0 1', prompt: 'White to play — mate in one.', accept: ['Ra8#'], hint: 'Same pattern, mirrored.' },
    ],
    coachFocus: 'K+R mate: rook cuts, king approaches, back-rank mate with king cover.',
  },
  {
    id: 'opposition', stage: 'endgames', title: 'The Opposition — King Endgames',
    intro: `When two kings face each other with one square between, the side NOT to move "has the opposition" — the enemy king must step aside.\n\nIn pawn endgames, the opposition often decides everything: the winning king escorts its pawn forward, zugzwang forcing the enemy king to retreat.\n\nKey skills: the square rule (can the enemy king catch my pawn?), key squares (can my king reach e8/d8/c8 in front of my pawn?), and NEVER advance the pawn past your king — the king leads.`,
    demoFen: '8/8/3k4/8/8/3K4/4P3/8 w - - 0 1',
    demoNote: 'Kd3 vs Kd6 — white to move TAKES the opposition with Ke4! (or Kc4). The black king must give way.',
    puzzles: [
      { fen: '8/8/3k4/8/8/3K4/4P3/8 w - - 0 1', prompt: 'White to play — seize the opposition.', accept: ['Ke4', 'Kc4'], hint: 'Mirror the black king: same file, one square between — but choose the side your pawn can use.' },
    ],
    coachFocus: 'King endgames: opposition, square rule, key squares; king leads, pawn follows.',
  },
  {
    id: 'promotion', stage: 'endgames', title: 'Promotion Races & Passed Pawns',
    intro: `A passed pawn (no enemy pawns blocking its file or neighbors) is a queen in waiting. Endgames are often promotion races:\n\n1. COUNT: who queens first? If you queen with check, you often win even a tempo behind.\n2. The SQUARE RULE: draw a square from the pawn to the promotion rank; if the enemy king stands outside it, the pawn runs free.\n3. Protected passed pawns (defended by another pawn) are endgame gold — push them and use the enemy king's restraint to win elsewhere.\n\nConnected passed pawns on adjacent files beat a rook more often than you'd believe.`,
    demoFen: '8/8/8/1k6/8/1P6/1K6/8 w - - 0 1',
    demoNote: 'b4! — protected and passed. If Kxb4?? then Kb2 and the king escorts; if the black king retreats, b5-b6-b7-b8=Q.',
    puzzles: [
      { fen: '8/8/8/1k6/8/1P6/1K6/8 w - - 0 1', prompt: 'White to play — the winning pawn move.', accept: ['b4'], hint: 'Push where the king can\'t capture: b4 is protected by your king... and check the square rule if he runs.' },
      { fen: '8/2p5/8/8/8/2K5/8/4k3 w - - 0 1', prompt: 'White to play — can you catch the pawn? (Square rule!)', accept: ['Kd4'], hint: 'Draw the square c7-c5... c5-h5. Is your king inside the square of the c7 pawn? Move diagonally toward it.' },
    ],
    coachFocus: 'Passed pawns: square rule, count the race, use protected passers as decoys.',
  },
  {
    id: 'rook-activity', stage: 'endgames', title: 'Rook Endgames: Activity Over Everything',
    intro: `Rook endgames are the most common endgames — and the most misplayed. Rules of survival and conversion:\n\n1. ROOKS BELONG BEHIND PASSED PAWNS — yours (pushing, from the rear) and theirs (attacking from behind).\n2. In R+p vs R, the defender builds the "Philidor position": third-rank defense. Know it; it saves half points.\n3. Activity beats material: a rook on the 7th rank cutting the king can be worth a pawn or two.\n4. Cut the enemy king OFF — a rook check that forces the king sideways decides races.`,
    demoFen: '8/8/3k4/8/8/3K4/4P3/4R3 w - - 0 1',
    demoNote: 'Re1 keeps the black king cut from the e-pawn. Kd3-c4-b5, e4-e5-e6 and the rook stays behind the pawn.',
    puzzles: [
      { fen: '8/8/3k4/8/3K4/8/5P2/4R3 w - - 0 1', prompt: 'White to play — cut the black king off from your pawn, with check.', accept: ['Re6+'], hint: 'Rook to the 6th rank: check, and the king can never approach your f-pawn.' }
    ],
    coachFocus: 'Rook endgames: rook behind passed pawns, cut the king off, Philidor defense.',
  },
];

export function lessonsForStage(stageId) {
  return LESSONS.filter((l) => l.stage === stageId);
}
