import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { Readable, pipeline } from 'node:stream';
import { Agent, fetch as undiciFetch } from 'undici';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const app = express();
// behind a reverse proxy set TRUST_PROXY=1 so req.ip (rate limiting) is the client, not the proxy
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : process.env.TRUST_PROXY);
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

const ENV_BASE = (process.env.COACH_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/$/, '');

/* which coach would be used with a given client config (env vars are the fallback).
   The server's own key is only ever sent to the server's own base URL — a
   client-supplied base URL must come with a client-supplied key, otherwise
   anyone could point the proxy at their host and harvest COACH_API_KEY. */
export function resolveCoach(cfg = {}) {
  const clientBase = typeof cfg.baseUrl === 'string' ? cfg.baseUrl.trim().replace(/\/$/, '') : '';
  const clientKey = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : '';
  const base = clientBase || ENV_BASE;
  const key = clientKey || (base === ENV_BASE ? process.env.COACH_API_KEY : undefined);
  const model = (typeof cfg.model === 'string' && cfg.model.trim()) || process.env.COACH_MODEL || 'kimi-k3';
  return { key, base, model, usingEnvKey: !clientKey && Boolean(key) };
}

/* private / loopback / link-local ranges — blocked as upstream targets unless
   COACH_ALLOW_PRIVATE_HOSTS=1 (e.g. a self-hosted LLM on the LAN) */
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  return true;
}

/* DNS-rebinding guard: the address is re-checked at connect time, so a host
   that resolved public during isAllowedUpstream can't switch to a private IP
   for the real request. */
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }).then((addrs) => {
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
      callback(Object.assign(new Error(`blocked private address for ${hostname}`), { code: 'EPRIVATE' }));
      return;
    }
    if (options?.all) callback(null, addrs);
    else callback(null, addrs[0].address, addrs[0].family);
  }, (err) => callback(err));
}
const guardedAgent = new Agent({ connect: { lookup: safeLookup } });

/** fetch to an LLM upstream: never follows redirects (a 30x could point at an
    internal address), and pins DNS checks to the actual connection. */
export async function upstreamFetch(url, opts = {}) {
  const res = await undiciFetch(url, {
    ...opts,
    redirect: 'manual',
    ...(process.env.COACH_ALLOW_PRIVATE_HOSTS === '1' ? {} : { dispatcher: guardedAgent }),
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`upstream redirected (${res.status}) — redirects are not followed`);
  }
  return res;
}

async function isAllowedUpstream(base) {
  if (!isValidBaseUrl(base)) return false;
  if (process.env.COACH_ALLOW_PRIVATE_HOSTS === '1') return true;
  const host = new URL(base).hostname.replace(/^\[|\]$/g, '');
  try {
    const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

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

/* only user/assistant turns with string content reach the model — clients
   must not be able to inject their own system prompt */
export function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
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
app.post('/api/coach/models', async (req, res) => {
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ ok: false, error: 'rate limited' });
  }
  const { key, base } = resolveCoach(req.body?.config);
  if (!key) {
    return res.status(200).json({ ok: false, error: 'no API key configured' });
  }
  if (!(await isAllowedUpstream(base))) {
    return res.status(200).json({ ok: false, error: 'invalid or disallowed base URL' });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await upstreamFetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
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
    res.status(200).json({ ok: false, error: err?.name === 'AbortError' ? 'request timed out' : String(err?.message || err) });
  } finally {
    clearTimeout(timer);
  }
});

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
  if (!(await isAllowedUpstream(base))) {
    return res.status(200).json({ ok: false, error: 'invalid or disallowed base URL' });
  }
  const { messages, game } = req.body || {};
  const effort = ['low', 'high', 'max'].includes(req.body?.config?.effort) ? req.body.config.effort : '';

  const convo = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...sanitizeMessages(messages),
  ];

  try {
    const anthropic = isAnthropicStyle(base);
    const controller = new AbortController();
    const upstreamTimeout = setTimeout(() => controller.abort(), 60_000);
    let upstream;
    try {
      upstream = await upstreamFetch(anthropic ? `${base}/messages` : `${base}/chat/completions`, {
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
      // pipeline handles upstream errors (no uncaught 'error' crashing the
      // server) and tears the upstream down when the client disconnects
      const src = Readable.fromWeb(upstream.body);
      pipeline(src, res, () => {});
      res.on('close', () => src.destroy());
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

export { app };

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
if (!process.env.VITEST) app.listen(PORT, () => {
  console.log(`[maestro] ${isDev ? 'API' : 'server'} on http://localhost:${PORT} — coach: ${process.env.COACH_API_KEY ? 'LLM live' : 'offline fallback'}`);
});
