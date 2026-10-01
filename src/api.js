/* Coach API client. Tries the server (LLM) first, falls back to the offline engine coach.
   Logs every exchange for the Logs panel. */

import { offlineCoachReply } from './offlineCoach.js';
import { getCoachConfig, logCoachEntry } from './coachConfig.js';

/** Read an SSE stream from res.body, accumulating coach text via onToken.
    Throws if the response isn't a usable stream or a parse error occurs. */
async function readCoachStream(res, onToken) {
  if (!res.ok || !res.body) throw new Error(`server responded ${res.status}`);
  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('text/event-stream')) throw new Error('server did not stream');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        throw new Error('bad stream chunk');
      }
      const delta = json.choices?.[0]?.delta?.content
        ?? (json.type === 'content_block_delta' ? json.delta?.text : undefined);
      if (typeof delta === 'string' && delta) {
        text += delta;
        onToken(text);
      }
    }
  }
  if (!text) throw new Error('empty stream');
  return text;
}

export async function askCoach({ messages, game, stream = false, onToken }) {
  const started = performance.now();
  const config = getCoachConfig();
  const lastUser = [...(messages || [])].reverse().find((m) => m.role === 'user');

  if (stream && onToken) {
    let partial = '';
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, game, config, stream: true }),
      });
      const reply = await readCoachStream(res, (t) => { partial = t; onToken(t); });
      logCoachEntry({
        mode: 'live', model: config.model || null, ok: true, streamed: true,
        latencyMs: Math.round(performance.now() - started),
        question: lastUser?.content?.slice(0, 120),
      });
      return { reply, live: true, model: config.model || null, streamed: true };
    } catch (err) {
      // if tokens already arrived, show the partial text with a drop note
      if (partial) {
        logCoachEntry({
          mode: 'live', model: config.model || null, ok: false, dropped: true,
          latencyMs: Math.round(performance.now() - started),
          error: 'stream dropped: ' + String(err).slice(0, 120),
          question: lastUser?.content?.slice(0, 120),
        });
        return { reply: partial, live: true, model: config.model || null, dropped: true };
      }
      logCoachEntry({
        mode: 'live', model: null, ok: false,
        latencyMs: Math.round(performance.now() - started),
        error: 'streaming failed: ' + String(err).slice(0, 120),
        question: lastUser?.content?.slice(0, 120),
      });
      // fall through to the non-streaming path
    }
  }

  try {
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, game, config }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.reply) {
        logCoachEntry({
          mode: 'live', model: data.model, ok: true,
          latencyMs: Math.round(performance.now() - started),
          question: lastUser?.content?.slice(0, 120),
        });
        return { reply: data.reply, live: true, model: data.model };
      }
      if (data.error) {
        logCoachEntry({
          mode: 'live', model: data.model, ok: false,
          latencyMs: Math.round(performance.now() - started),
          error: String(data.error).slice(0, 200),
          question: lastUser?.content?.slice(0, 120),
        });
        return { reply: null, live: false, error: data.error };
      }
      if (data.offline) {
        logCoachEntry({
          mode: 'live', model: null, ok: false,
          latencyMs: Math.round(performance.now() - started),
          error: 'no API key on server',
          question: lastUser?.content?.slice(0, 120),
        });
      }
    } else {
      logCoachEntry({
        mode: 'live', model: null, ok: false,
        latencyMs: Math.round(performance.now() - started),
        error: `server responded ${res.status}`,
        question: lastUser?.content?.slice(0, 120),
      });
    }
  } catch (err) {
    logCoachEntry({
      mode: 'live', model: null, ok: false,
      latencyMs: Math.round(performance.now() - started),
      error: 'server unreachable: ' + String(err).slice(0, 120),
      question: lastUser?.content?.slice(0, 120),
    });
  }

  const reply = await offlineCoachReply({
    fen: game?.fen,
    pgn: game?.pgn,
    message: lastUser?.content || '',
    stage: game?.stageTitle,
  });
  logCoachEntry({
    mode: 'offline', model: 'stockfish-16 (local)', ok: true,
    latencyMs: Math.round(performance.now() - started),
    question: lastUser?.content?.slice(0, 120),
  });
  return { reply, live: false, model: null };
}

/** Ask the server which coach is active right now (env fallback included). */
export async function coachStatus() {
  try {
    const res = await fetch('/api/coach/status');
    return await res.json();
  } catch {
    return null;
  }
}
