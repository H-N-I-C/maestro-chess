import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { askCoach } from '../api.js';

const GREETING = `I'm Maestro, your chess coach. I watch your games live — ask me anything: "what's my plan?", "why was that move bad?", or "quiz me on pins".`;

function CoachPanel({ game, disabled, onCollapse, onHeaderPointerDown }, ref) {
  const [messages, setMessages] = useState([{ role: 'coach', text: GREETING }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(null);
  const [model, setModel] = useState(null);
  const scrollRef = useRef(null);

  // lets the app inject commentary (e.g. auto-commentary in watch mode)
  useImperativeHandle(ref, () => ({
    comment(text) { send(text); },
  }));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setInput('');
    setBusy(true);
    const convo = messages
      .filter((m) => m.role === 'user' || m.role === 'coach')
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    convo.push({ role: 'user', content });
    setMessages((ms) => [...ms, { role: 'user', text: content }]);
    try {
      const { reply, live: isLive, error, model: replyModel } = await askCoach({
        messages: convo,
        game: game ? {
          fen: game.fen(),
          pgn: game.pgn(),
          lastMoves: game.history().slice(-8),
          stage: game.stageTitle,
          difficulty: game.difficultyLabel,
          yourColor: game.humanColor,
        } : undefined,
      });
      setLive(isLive ? 'live' : 'offline');
      setModel(isLive ? replyModel : null);
      setMessages((ms) => [...ms, { role: 'coach', text: reply || `Coach error: ${error || 'unknown'}` }]);
    } finally {
      setBusy(false);
    }
  }

  const quick = ['What should I do here?', 'Was my last move good?', "What's the plan?", 'Quiz me on this position'];

  return (
    <section className="coach">
      <header className={`coach-head${onHeaderPointerDown ? ' draggable' : ''}`} onPointerDown={onHeaderPointerDown}>
        <h2>Coach</h2>
        {live === 'live' && model && <span className="badge live">AI · {model}</span>}
        {live === 'offline' && <span className="badge offline">offline · stockfish 16</span>}
        {onCollapse && (
          <button
            type="button"
            className="coach-collapse-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onCollapse}
            aria-label="Collapse coach"
            title="Collapse"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        )}
      </header>
      <div className="coach-log" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.text}</div>
        ))}
        {busy && <div className="msg coach thinking">…</div>}
      </div>
      <div className="coach-quick">
        {quick.map((q) => (
          <button key={q} onClick={() => send(q)} disabled={busy || disabled}>{q}</button>
        ))}
      </div>
      <form className="coach-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={disabled ? 'Start a game to give me context…' : 'Ask your coach anything…'}
          disabled={busy || disabled}
        />
        <button type="submit" disabled={busy || disabled || !input.trim()}>Send</button>
      </form>
    </section>
  );
}

export default forwardRef(CoachPanel);
