# Maestro — Chess Academy

Learn chess properly: staged lessons, honest engine difficulty, and an AI coach that watches your games live.

## Features

- **Play vs Stockfish 16 (NNUE)** — 6 difficulty levels from Novice (~400) to Maestro (near-max strength), honest Elo limits via UCI.
- **Staged learning path** — 5 stages, 17 lessons, ~25 interactive puzzles:
  1. Tactics I (back-rank mate, queen nets, forks, pins, forcing checks)
  2. Openings (principles, Italian, Queen's Gambit, trap defense)
  3. Tactics II (counting, intermediate moves, Greek Gift, mate in two)
  4. Middlegame (structures, outposts, activity, planning)
  5. Endgames (K+Q, K+R, opposition, promotion races, rook endgames)
- **AI coach (non-negotiable feature)** — a chat coach observes every game/lesson live:
  - With `COACH_API_KEY` set: full conversational LLM coach (defaults to Kimi/Moonshot; any OpenAI-compatible API works).
  - Without a key: built-in offline coach powered by Stockfish — evaluates the position, grades your last move, finds hanging pieces.
- **Three hand-crafted themes** — Walnut Study, Folio, Ember Library. No neon.
- **PWA** — installable on your phone (Add to Home Screen), works offline after first load.
- **Responsive** — phone, tablet, desktop.
- **Online multiplayer** — play a friend over the internet: create a game, share the 6-letter code, and moves travel peer-to-peer (WebRTC via PeerJS; the host's browser is authoritative, so illegal moves are rejected). Hosted at https://h-n-i-c.github.io/maestro-chess/ (GitHub Pages, deployed automatically from `main`); or self-host the container below.
- **Observe mode** — watch Maestro play itself with pause/speed/rewind controls and live coach commentary.

## Play a friend online

1. Both players open the app (the Pages URL above, or your self-hosted container).
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

Configuration can be done **in the app** — the Settings panel (left sidebar) takes Base URL, API key, and model, stores them in your browser, and has a Test-connection button. The Logs panel shows every coach request (mode, model, latency, errors). If the browser fields are blank, these server environment variables apply:

| Env var | Default | Purpose |
|---|---|---|
| `COACH_API_KEY` | — | Enables the live LLM coach |
| `COACH_BASE_URL` | `https://api.moonshot.ai/v1` | Any OpenAI-compatible endpoint |
| `COACH_MODEL` | `kimi-k2-0711-preview` | Model name |
| `PORT` | `8080` | Listen port |

The active coach is always visible on the Coach panel header (model name when live, "offline · stockfish 16" otherwise). Without a key the app still coaches via the local engine: engine-accurate evaluation, move grading, and hanging-piece alerts — but no free conversation.

## Run locally (dev)

```bash
npm install
npm run dev        # API on :8080, vite dev server on :5173 (proxies /api)
```

Production locally: `npm run build && npm start`.

## Play on your phone

1. Run the container on your computer.
2. On your phone (same Wi-Fi), open `http://<your-computer's-LAN-IP>:8080`.
3. Browser menu → **Add to Home Screen**. It installs as a standalone app and caches assets for offline play.

## Project layout

```
server/index.mjs        Express: static hosting + /api/coach (LLM proxy)
public/vendor/          Stockfish 16 NNUE (wasm + network, served to the browser)
src/engine.js           UCI wrapper, difficulty table
src/lessons.js          Curriculum (stages, lessons, puzzles)
src/offlineCoach.js     Engine-based heuristic coach
src/components/         Board, Play, Lessons, CoachPanel
Containerfile           All-in-one Podman image
```

## Credits

- App icon knight derived from Cburnett's standard chess set, licensed [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), via Wikimedia Commons.
