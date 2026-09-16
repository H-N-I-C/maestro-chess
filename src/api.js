/* Coach API client. Tries the server (LLM) first, falls back to the offline engine coach.
   Logs every exchange for the Logs panel. */

import { offlineCoachReply } from './offlineCoach.js';
import { getCoachConfig, logCoachEntry } from './coachConfig.js';

export async function askCoach({ messages, game }) {
  const started = performance.now();
  const config = getCoachConfig();
  const lastUser = [...(messages || [])].reverse().find((m) => m.role === 'user');

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
