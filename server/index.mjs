import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const app = express();
app.use(express.json({ limit: '256kb' }));

const PORT = process.env.PORT || 8080;

/* ------------------------------------------------------------------ */
/*  AI Coach endpoint                                                  */
/*                                                                     */
/*  Uses any OpenAI-compatible chat API. Defaults to Kimi/Moonshot:    */
/*    COACH_API_KEY   – required for the live LLM coach                */
/*    COACH_BASE_URL  – default https://api.moonshot.ai/v1             */
/*    COACH_MODEL     – default kimi-k2-0711-preview                   */
/*  The client always works: without a key it falls back to the        */
/*  built-in offline coach in the browser.                             */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `You are "Maestro", a patient, encouraging chess teacher inside a chess learning app.
You are observing the user's game live. Teach, don't just lecture: explain ideas in plain language,
point out what matters in the current position, and connect it to the lesson stage the user is on.
Be concise (2-5 short paragraphs max per reply, shorter for quick questions). Use short algebraic
notation when mentioning moves (e.g. Nf3, exd5). Never dump engine lines unless asked.
If the user asks something off-topic, answer briefly and steer back to chess.
Game context (FEN, recent moves, stage, difficulty) arrives with each message as a JSON block marked GAME-STATE.`;

/* which coach would be used with a given client config (env vars are the fallback) */
function resolveCoach(cfg = {}) {
  const key = cfg.apiKey || process.env.COACH_API_KEY;
  const base = (cfg.baseUrl || process.env.COACH_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, '');
  const model = cfg.model || process.env.COACH_MODEL || 'kimi-k2-0711-preview';
  return { key, base, model };
}

app.get('/api/coach/status', (req, res) => {
  const { key, base, model } = resolveCoach();
  res.json({
    envConfigured: Boolean(process.env.COACH_API_KEY),
    liveAvailable: Boolean(key),
    base, model,
  });
});

app.post('/api/coach', async (req, res) => {
  const { key, base, model } = resolveCoach(req.body?.config);
  if (!key) {
    return res.status(200).json({ ok: false, offline: true, reply: null, model: null });
  }
  const { messages, game } = req.body || {};

  const convo = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(Array.isArray(messages) ? messages.slice(-20) : []),
  ];
  if (game) {
    convo.push({
      role: 'user',
      content: `GAME-STATE:\n${JSON.stringify(game, null, 1)}\n(coach context — no reply needed to this block itself)`,
    });
  }

  try {
    const upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: convo, temperature: 0.6, max_tokens: 900 }),
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(200).json({ ok: false, error: `LLM ${upstream.status}: ${text.slice(0, 300)}` });
    }
    const data = await upstream.json();
    res.json({ ok: true, reply: data.choices?.[0]?.message?.content ?? '', model });
  } catch (err) {
    res.status(200).json({ ok: false, error: String(err), model });
  }
});

/* health check for podman */
app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* static + SPA */
const dist = path.join(root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '7d', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

/* dev mode: just run the API, vite handles the frontend */
const isDev = process.argv.includes('--dev');
app.listen(PORT, () => {
  console.log(`[maestro] ${isDev ? 'API' : 'server'} on http://localhost:${PORT} — coach: ${process.env.COACH_API_KEY ? 'LLM live' : 'offline fallback'}`);
});
