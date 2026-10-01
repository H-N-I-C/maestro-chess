/* Coach chat state lives outside React so it survives the panel being
   collapsed/unmounted (desktop dock, mobile widget, tab switches). */

export const COACH_GREETING = `I'm Maestro, your chess coach. I watch your games live — ask me anything: "what's my plan?", "why was that move bad?", or "quiz me on pins".`;

let state = {
  messages: [{ role: 'coach', text: COACH_GREETING }],
  input: '',
  busy: false,
  live: null, // null | 'live' | 'offline'
  model: null,
};

const listeners = new Set();
const MAX_MESSAGES = 200;

export function subscribeCoachChat(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getCoachChat() {
  return state;
}

export function patchCoachChat(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** functional update for messages: patchCoachMessages(ms => [...ms, msg]) */
export function patchCoachMessages(fn) {
  let messages = fn(state.messages);
  if (messages.length > MAX_MESSAGES) {
    // keep the greeting if it still heads the list, trim the oldest middle
    const head = messages[0]?.text === COACH_GREETING ? [messages[0]] : [];
    messages = head.concat(messages.slice(messages.length - (MAX_MESSAGES - head.length)));
  }
  patchCoachChat({ messages });
}

export function resetCoachChat() {
  patchCoachChat({
    messages: [{ role: 'coach', text: COACH_GREETING }],
    input: '',
    busy: false,
    live: null,
    model: null,
  });
}
