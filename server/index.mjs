import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const app = express();
app.use(express.json({ limit: '256kb' }));

// cross-origin isolation: enables SharedArrayBuffer so the multithreaded
// Stockfish build can run (single-thread fallback when unavailable)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

const PORT = process.env.PORT || 8080;

/* ------------------------------------------------------------------ */
/*  AI Coach endpoint                                                  */
/*                                                                     */
/*  Uses any OpenAI-compatible chat API. Defaults to Kimi/Moonshot:    */
/*    COACH_API_KEY   – required for the live LLM coach                */
/*    COACH_BASE_URL  – default https://api.moonshot.cn/v1             */
/*    COACH_MODEL     – default kimi-k3                                */
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
  const base = (cfg.baseUrl || process.env.COACH_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, '');
  const model = cfg.model || process.env.COACH_MODEL || 'kimi-k3';
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

/* list models available on the configured endpoint (client config overrides env fallback) */
app.get('/api/coach/models', async (req, res) => {
  const { key, base } = resolveCoach({
    baseUrl: req.query.baseUrl,
    apiKey: req.query.apiKey,
  });
  if (!key) {
    return res.status(200).json({ ok: false, error: 'no API key configured' });
  }
  if (!isValidBaseUrl(base)) {
    return res.status(200).json({ ok: false, error: 'invalid base URL' });
  }
  try {
    const upstream = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const text = await upstream.text();
    if (!upstream.ok) {
      return res.status(200).json({ ok: false, error: `LLM ${upstream.status}: ${text.slice(0, 300)}` });
    }
    const data = JSON.parse(text);
    const models = (Array.isArray(data.data) ? data.data : [])
      .map((m) => m?.id)
      .filter(Boolean)
      .sort();
    res.json({ ok: true, models });
  } catch (err) {
    res.status(200).json({ ok: false, error: String(err) });
  }
});

/* simple in-memory rate limiter: RATE_LIMIT_MAX requests per RATE_LIMIT_WINDOW ms per ip */
const rateLimit = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimit) {
    if (entry.resetAt <= now) rateLimit.delete(ip);
  }
}, RATE_LIMIT_WINDOW).unref?.();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || entry.resetAt <= now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function isValidBaseUrl(base) {
  try {
    const url = new URL(base);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/* Anthropic-Messages-style endpoints (e.g. the Kimi Coding plan at
   https://api.kimi.com/coding/v1) use POST /messages with a different shape. */
function isAnthropicStyle(base) {
  return /api\.kimi\.com\/coding/.test(base) || /\/anthropic$/.test(base);
}

function buildAnthropicBody(model, convo, game, effort) {
  const system = convo.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const messages = convo.filter((m) => m.role !== 'system');
  if (game) {
    messages.push({
      role: 'user',
      content: `GAME-STATE:\n${JSON.stringify(game, null, 1)}\n(coach context — no reply needed to this block itself)`,
    });
  }
  const body = { model, system, messages };
  if (effort === 'high' || effort === 'max') {
    body.thinking = { type: 'enabled', budget_tokens: effort === 'max' ? 8000 : 4000 };
    body.max_tokens = body.thinking.budget_tokens + 1000; // must exceed the thinking budget
  } else {
    body.max_tokens = 900;
  }
  return JSON.stringify(body);
}

function buildOpenaiBody(model, convo, game, effort) {
  const messages = [...convo];
  if (game) {
    messages.push({
      role: 'user',
      content: `GAME-STATE:\n${JSON.stringify(game, null, 1)}\n(coach context — no reply needed to this block itself)`,
    });
  }
  const body = { model, messages, temperature: 0.6, max_tokens: 900 };
  if (effort) body.reasoning_effort = effort;
  return JSON.stringify(body);
}

app.post('/api/coach', async (req, res) => {
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: 'rate limited' });
  }
  const { key, base, model } = resolveCoach(req.body?.config);
  if (!key) {
    return res.status(200).json({ ok: false, offline: true, reply: null, model: null });
  }
  if (!isValidBaseUrl(base)) {
    return res.status(200).json({ ok: false, error: 'invalid base URL' });
  }
  const { messages, game } = req.body || {};
  const effort = ['low', 'high', 'max'].includes(req.body?.config?.effort) ? req.body.config.effort : '';

  const convo = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(Array.isArray(messages) ? messages.slice(-20) : []),
  ];

  try {
    const anthropic = isAnthropicStyle(base);
    const controller = new AbortController();
    const upstreamTimeout = setTimeout(() => controller.abort(), 60_000);
    let upstream;
    try {
      upstream = await fetch(anthropic ? `${base}/messages` : `${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: anthropic ? buildAnthropicBody(model, convo, game, effort) : buildOpenaiBody(model, convo, game, effort),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(upstreamTimeout);
    }
    if (!upstream.ok) {
      const text = await upstream.text();
      return res.status(200).json({ ok: false, error: `LLM ${upstream.status}: ${text.slice(0, 300)}` });
    }
    if (req.body?.stream) {
      // SSE passthrough: both OpenAI and Anthropic streams are 'data:' lines
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      Readable.fromWeb(upstream.body).pipe(res);
      res.on('close', () => { try { upstream.body.cancel(); } catch { /* ignore */ } });
      return;
    }
    const data = await upstream.json();
    const reply = anthropic
      ? (data.content || []).map((b) => b.text || '').join('')
      : (data.choices?.[0]?.message?.content ?? '');
    res.json({ ok: true, reply, model });
  } catch (err) {
    if (err?.name === 'AbortError') {
      return res.status(200).json({ ok: false, error: 'LLM request timed out', model });
    }
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
