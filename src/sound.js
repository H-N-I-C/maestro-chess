/* Synthesized chess move sounds — no audio assets needed.
   A move is a short "tock": a low sine thump with a fast decay plus a burst
   of filtered noise for the wood contact. Captures are lower and louder. */

let ctx = null;

function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function thump(ac, { freq, gain, at }) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.55, at + 0.08);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + 0.13);
}

function knock(ac, { gain, at }) {
  const len = Math.floor(ac.sampleRate * 0.03);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  filter.Q.value = 0.8;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(at);
}

/** Play a move sound. capture = true for a heavier capture thud. */
export function playMoveSound({ capture = false } = {}) {
  const ac = audioCtx();
  if (!ac) return;
  const t = ac.currentTime + 0.001;
  if (capture) {
    thump(ac, { freq: 150, gain: 0.5, at: t });
    knock(ac, { gain: 0.35, at: t });
  } else {
    thump(ac, { freq: 210, gain: 0.3, at: t });
    knock(ac, { gain: 0.18, at: t });
  }
}
