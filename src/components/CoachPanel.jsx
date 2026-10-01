import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react';
import { askCoach } from '../api.js';
import {
  subscribeCoachChat, getCoachChat, patchCoachChat, patchCoachMessages, resetCoachChat,
} from '../coachChat.js';

let streamIdCounter = 0;

function CoachPanel({ game, disabled, onCollapse, onHeaderPointerDown }, ref) {
  const { messages, input, busy, live, model } = useSyncExternalStore(subscribeCoachChat, getCoachChat);
  const scrollRef = useRef(null);
  const [copied, setCopied] = useState(false);

  // lets the app inject commentary (e.g. auto-commentary in watch mode)
  useImperativeHandle(ref, () => ({
    comment(text) { send(text); },
  }));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    patchCoachChat({ input: '', busy: true });
    const convo = getCoachChat().messages
      .filter((m) => m.role === 'user' || (m.role === 'coach' && !m.streaming && m.text))
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
    convo.push({ role: 'user', content });
    patchCoachMessages((ms) => [...ms, { role: 'user', text: content }]);
    const sid = ++streamIdCounter;
    let streaming = false;
    try {
      const { reply, live: isLive, error, model: replyModel, dropped } = await askCoach({
        messages: convo,
        game: game ? {
          fen: game.fen(),
          pgn: game.pgn(),
          lastMoves: game.history().slice(-8),
          stage: game.stageTitle,
          difficulty: game.difficultyLabel,
          yourColor: game.humanColor,
        } : undefined,
        stream: true,
        onToken: (t) => {
          if (!streaming) {
            streaming = true;
            patchCoachMessages((ms) => [...ms, { role: 'coach', text: t, streamId: sid, streaming: true }]);
          } else {
            patchCoachMessages((ms) => ms.map((m) => (m.streamId === sid ? { ...m, text: t } : m)));
          }
        },
      });
      patchCoachChat({
        live: isLive ? 'live' : 'offline',
        model: isLive ? replyModel : null,
      });
      if (streaming) {
        patchCoachMessages((ms) => ms.map((m) => (m.streamId === sid
          ? { ...m, text: (reply || '').trim() ? reply : m.text, streaming: false, dropped: Boolean(dropped) }
          : m)));
      } else {
        patchCoachMessages((ms) => [...ms, { role: 'coach', text: reply || `Coach error: ${error || 'unknown'}` }]);
      }
    } finally {
      patchCoachChat({ busy: false });
    }
  }

  const hasStreamingMsg = messages.some((m) => m.streaming);

  async function exportChat() {
    const text = messages
      .filter((m) => !m.streaming && m.text)
      .map((m) => `${m.role === 'user' ? 'You' : 'Maestro'}: ${m.text}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — leave the button inert */ }
  }

  const quick = ['What should I do here?', 'Was my last move good?', "What's the plan?", 'Quiz me on this position'];

  return (
    <section className="coach">
      <header className={`coach-head${onHeaderPointerDown ? ' draggable' : ''}`} onPointerDown={onHeaderPointerDown}>
        <h2>Coach</h2>
        {live === 'live' && model && <span className="badge live">AI · {model}</span>}
        {live === 'offline' && <span className="badge offline">offline · stockfish 16</span>}
        <button
          type="button"
          className="coach-clear-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={exportChat}
          aria-label="Copy conversation"
          title={copied ? 'Copied' : 'Copy conversation'}
          disabled={busy}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
          </svg>
          {copied && <span className="copied-tip">Copied</span>}
        </button>
        <button
          type="button"
          className="coach-clear-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={resetCoachChat}
          aria-label="Clear chat"
          title="Clear chat"
          disabled={busy}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m3 0l-.8 12a1 1 0 0 1-1 .94H7.8a1 1 0 0 1-1-.94L6 7" />
          </svg>
        </button>
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
      <div className="coach-log" ref={scrollRef} aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.streaming ? (
              <span className="typing-dots" aria-hidden="true"><span /><span /><span /></span>
            ) : (
              <>
                {m.text}
                {m.dropped && <span className="stream-dropped"> (connection dropped)</span>}
              </>
            )}
          </div>
        ))}
        {busy && !hasStreamingMsg && (
          <div className="msg coach thinking" aria-label="Coach is thinking">
            <span className="typing-dots" aria-hidden="true">
              <span /><span /><span />
            </span>
            <span className="thinking-label">Maestro is thinking…</span>
          </div>
        )}
      </div>
      <div className="coach-quick">
        {quick.map((q) => (
          <button key={q} onClick={() => send(q)} disabled={busy || disabled}>{q}</button>
        ))}
      </div>
      <form className="coach-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          value={input}
          onChange={(e) => patchCoachChat({ input: e.target.value })}
          placeholder={disabled ? 'Start a game to give me context…' : 'Ask your coach anything…'}
          disabled={busy || disabled}
        />
        <button type="submit" disabled={busy || disabled || !input.trim()}>Send</button>
      </form>
    </section>
  );
}

export default forwardRef(CoachPanel);
