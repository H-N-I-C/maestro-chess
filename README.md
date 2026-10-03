# Maestro — Chess Academy

Learn chess properly: staged lessons, honest engine difficulty, and an AI coach that watches your games live.

## Features

**Play**
- **Stockfish 16 (NNUE)** — 6 difficulty levels from Novice (~400) to Maestro (near-max strength), honest Elo limits via UCI, plus a custom Elo slider (400–2800).
- **Multithreaded engine** — the pthreads WASM build runs on up to 8 threads (3–4× faster); single-thread fallback when cross-origin isolation isn't available.
- **Game clocks** — 3|2, 5, 5|3, 10, 10|5 and 15|10 time controls with increments, measured in real elapsed time (a background tab can't freeze your clock); flagging loses on time.
- **Premoves** — queue your next move while the opponent (engine or online) is thinking; it plays instantly if still legal.
- **Resign / offer draw** vs the engine (it accepts when its own eval is bad enough), with correct draw detection: threefold repetition (full move history is kept, also across reloads), 50-move rule, stalemate, insufficient material.
- **Hint button** — shows the engine's best move on the board (always at full engine strength, whatever the difficulty).
- **Board annotations** — right-click a square to circle it, right-drag to draw an arrow.
- **Keyboard play** — focus the board, arrows move the focus square, Enter/Space picks up and drops, Esc cancels.
- **Blindfold mode** and a **coordinates toggle** for training.
- **Share / FEN** panel — export the PGN (with headers) or FEN, or load any position from a FEN.
- Move navigation (buttons, arrow keys, click any move), takeback, captured-pieces trays, opening names, check alerts, sounds (mutable), three themes, classic/letters piece sets.

**Review & improve**
- **Post-game review** — every finished game is saved; *Analyze game* runs Stockfish over each position and grades moves (best / inaccuracy / mistake / blunder) with per-side accuracy, an evaluation graph, best-move arrows, and a coach summary of the turning points (AI coach when configured, built-in summary otherwise).
- **Analysis board** — eval bar, live engine line, explore variations from any position, import PGN (single or multi-game, paste or file) or a FEN.
- **Games library** — all your games with result, accuracy, time control; filter, download, import, export all as PGN.
- **Rating estimate** — an Elo estimate from your results against Maestro's calibrated levels, with history chart and a suggested next opponent.
- **Puzzles** — 1,500 rated puzzles from the Lichess database (CC0), a puzzle rating, theme filter, streaks, and spaced-repetition review of the ones you missed.
- **Openings** — opening explorer, your own repertoire, and drills with spaced repetition.

**Learn**
- **Staged learning path** — 5 stages, 19 lessons, ~30 puzzles, several multi-move puzzles with automatic opponent replies:
  1. Tactics I (back-rank mate, queen nets, forks, pins, forcing checks)
  2. Openings (principles, Italian, Queen's Gambit, trap defense)
  3. Tactics II (counting, intermediate moves, Greek Gift, mate in two)
  4. Middlegame (structures, outposts, activity, planning)
  5. Endgames (K+Q, K+R, opposition, promotion races, rook endgames)
- **Progress persists** — solved puzzles, last stage, and lesson are remembered between visits; some lessons have playable "try it" boards.

**Coach (non-negotiable feature)**
- Chat coach observes every game/lesson live, with streaming replies.
- With an API key configured: full conversational LLM coach — any OpenAI-compatible API works, plus the Kimi Coding endpoint (Anthropic-style). Model picker fetches the available models from your key; reasoning effort (low/high/max) is configurable.
- Without a key: built-in offline coach powered by Stockfish — evaluates the position, grades your last move, finds hanging pieces.
- Chat survives collapsing the panel, caps at 200 messages, and can be cleared or copied out. A request log (mode, model, latency, errors) is in Settings → Logs.

**Elsewhere**
- **Online multiplayer** — play a friend: create a game, share the 6-letter code, moves travel peer-to-peer (WebRTC via PeerJS; the host's browser is authoritative for moves, clocks, takebacks and offers). Clocks with increment, chat, draw/takeback offers, resign, rematch (needs the opponent's OK mid-game), reconnection.
- **Spectator links** — share `…#/watch/<code>` and anyone can follow the game live, read-only, with an eval bar.
- **Observe mode** — watch Maestro play itself with pause/speed/rewind controls and live coach commentary.
- **PWA** — installable on your phone (Add to Home Screen), works offline after first load.
- **Responsive** — phone (bottom tab bar, move strip, draggable coach bubble, haptic ticks on Android), tablet, desktop.
- **Accessible** — keyboard play, spoken move announcements ("knight takes e5, check") for screen readers, visible focus rings.

## Play a friend online

1. Both players open the app.
2. One clicks **Play online → Create a game** and shares the 6-letter code.
3. The other clicks **Play online**, enters the code, and plays Black.

No server-side game state: the creator's browser validates every move, so games can't desync.

## Run with Podman

```bash
podman build -t maestro-chess .
podman run -d --name maestro -p 8080:8080 \
  -e COACH_API_KEY=sk-your-key-here \
  maestro-chess
# open http://localhost:8080
```

### Coach configuration (all optional)

Configuration is done **in the app** — the Settings panel (left sidebar) takes Base URL, API key, model, and reasoning effort, stores them in your browser only, and has Test-connection and Fetch-models buttons. The Logs panel shows every coach request. If the browser fields are blank, these server environment variables apply:

| Env var | Default | Purpose |
|---|---|---|
| `COACH_API_KEY` | — | Enables the live LLM coach |
| `COACH_BASE_URL` | `https://api.moonshot.cn/v1` | Any OpenAI-compatible endpoint |
| `COACH_MODEL` | `kimi-k3` | Model name |
| `PORT` | `8080` | Listen port |
| `COACH_ALLOW_PRIVATE_HOSTS` | — | `1` lets the coach proxy reach private/LAN addresses (e.g. a local LLM). Off by default |
| `TRUST_PROXY` | — | Set to `1` behind a reverse proxy so rate limiting sees client IPs |

**Security:** the server's `COACH_API_KEY` is only ever sent to the server's own `COACH_BASE_URL`. A custom base URL entered in the browser must come with its own key, and the proxy refuses loopback/private/link-local targets unless explicitly allowed.

Endpoint notes:
- **Kimi/Moonshot open platform** keys work at `https://api.moonshot.cn/v1` (OpenAI format).
- **Kimi Coding plan** keys (`sk-kimi-…`) only work at `https://api.kimi.com/coding/v1` (Anthropic Messages format — the app detects and translates automatically; use model `kimi-for-coding`).
- The server sends COOP/COEP isolation headers so the multithreaded Stockfish build can use `SharedArrayBuffer`. On static hosts that can't set headers (GitHub Pages) the service worker adds them, after one automatic reload on the first visit.
- **GitHub Pages builds have no server**, so the live AI coach is unavailable there (Settings says so); the offline Stockfish coach and everything else work.

The active coach is always visible on the Coach panel header (model name when live, "offline · stockfish 16" otherwise). Without a key the app still coaches via the local engine.

## Run locally (dev)

```bash
npm install
npm run dev        # API on :8080, vite dev server on :5173 (proxies /api)
npm test           # vitest: game rules, clocks, review, puzzles, openings, server security, …
npm run lint       # eslint (CI runs lint + tests before deploying)
```

Production locally: `npm run build && npm start`.

## Play on your phone

1. Run the container on your computer.
2. On your phone (same Wi-Fi), open `http://<your-computer's-LAN-IP>:8080`.
3. Browser menu → **Add to Home Screen**. It installs as a standalone app and caches assets for offline play.

## Project layout

```
server/index.mjs        Express: static hosting + /api/coach (LLM proxy, streaming, model list)
public/vendor/          Stockfish 16 NNUE (single + multithreaded wasm, NNUE net)
src/engine.js           UCI wrapper, difficulty table, custom Elo helper
src/gameUtils.js        History-preserving move helpers, draw reasons, history validation
src/hooks/useClocks.js  Real-time clocks with increments
src/review.js           Post-game review (win%, accuracy, move classification)
src/library.js          Saved games, PGN import, rating estimate
src/puzzleEngine.js     Puzzle rating, selection, spaced repetition
src/data/               Bundled puzzle/opening data (+ scripts/build-*.mjs to regenerate)
src/lessons.js          Curriculum (stages, lessons, puzzles)
src/offlineCoach.js     Engine-based heuristic coach
src/coachChat.js        Coach chat store (survives panel unmount)
src/api.js              Coach client (streaming + offline fallback)
tests/                  vitest unit tests
Containerfile           All-in-one Podman image
```

## Credits

- App icon knight derived from Cburnett's standard chess set, licensed [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), via Wikimedia Commons.
