import { useEffect, useState } from 'react';
import CoachPanel from './CoachPanel.jsx';

const BUBBLE_KEY = 'maestro-coach-bubble-pos';
const PANEL_KEY = 'maestro-coach-widget-panel-pos';
const TAP_THRESHOLD = 6;

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

function loadPos(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && typeof saved.x === 'number') return saved;
  } catch { /* ignore */ }
  return fallback;
}

/**
 * Coach as a free-floating widget for phone-width screens: a draggable
 * bubble when collapsed, a draggable panel when expanded. Tapping the
 * bubble (without dragging it) opens the panel; dragging moves it.
 */
export default function CoachWidget({ game, open, onOpen, onClose, panelRef }) {
  const [bubblePos, setBubblePos] = useState(() => loadPos(BUBBLE_KEY, {
    x: 16, y: Math.max(80, window.innerHeight - 150),
  }));
  const [panelPos, setPanelPos] = useState(() => {
    const width = Math.min(340, window.innerWidth - 32);
    const height = Math.min(480, window.innerHeight - 140);
    return loadPos(PANEL_KEY, { x: (window.innerWidth - width) / 2, y: 90, width, height });
  });

  useEffect(() => {
    try { localStorage.setItem(BUBBLE_KEY, JSON.stringify(bubblePos)); } catch { /* ignore */ }
  }, [bubblePos]);
  useEffect(() => {
    try { localStorage.setItem(PANEL_KEY, JSON.stringify(panelPos)); } catch { /* ignore */ }
  }, [panelPos]);

  useEffect(() => {
    function onResize() {
      setBubblePos((p) => ({
        x: clamp(p.x, 8, window.innerWidth - 60), y: clamp(p.y, 8, window.innerHeight - 60),
      }));
      setPanelPos((p) => {
        const width = Math.min(p.width, window.innerWidth - 16);
        const height = Math.min(p.height, window.innerHeight - 16);
        return {
          width, height,
          x: clamp(p.x, 8, Math.max(8, window.innerWidth - width - 8)),
          y: clamp(p.y, 8, Math.max(8, window.innerHeight - height - 8)),
        };
      });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function dragBubble(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = bubblePos;
    let moved = false;
    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) moved = true;
      setBubblePos({
        x: clamp(orig.x + dx, 8, window.innerWidth - 60),
        y: clamp(orig.y + dy, 8, window.innerHeight - 60),
      });
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!moved) onOpen();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function dragPanel(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = panelPos;
    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setPanelPos((p) => ({
        ...p,
        x: clamp(orig.x + dx, 8, Math.max(8, window.innerWidth - p.width - 8)),
        y: clamp(orig.y + dy, 8, Math.max(8, window.innerHeight - p.height - 8)),
      }));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="coach-bubble"
        style={{ left: bubblePos.x, top: bubblePos.y }}
        onPointerDown={dragBubble}
        aria-label="Open coach"
        title="Coach"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path fill="currentColor" d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4.4 3.3A1 1 0 0 1 3 19.5V5a1 1 0 0 1 1-1Z" />
        </svg>
      </button>
    );
  }

  return (
    <div
      className="coach-widget-panel panel"
      style={{ left: panelPos.x, top: panelPos.y, width: panelPos.width, height: panelPos.height }}
    >
      <CoachPanel ref={panelRef} game={game} onCollapse={onClose} onHeaderPointerDown={dragPanel} />
    </div>
  );
}
