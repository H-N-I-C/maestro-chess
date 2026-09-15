/* Online multiplayer over WebRTC (PeerJS public cloud for signaling).
   The host (game creator) is White and authoritative: guest moves are
   validated on the host with chess.js and the resulting state is synced
   back, so neither side can play illegal moves even if tampered with. */
import Peer from 'peerjs';

const PREFIX = 'maestro-';
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/**
 * Host a game. handlers: { onOpen, onConnected(conn), onData(data), onClose, onError(err) }
 * Returns the Peer (call .destroy() to cancel/leave).
 */
export function hostGame(code, handlers) {
  const peer = new Peer(PREFIX + code);
  peer.on('open', () => handlers.onOpen?.());
  peer.on('connection', (conn) => {
    conn.on('open', () => handlers.onConnected?.(conn));
    conn.on('data', (d) => handlers.onData?.(d));
    conn.on('close', () => handlers.onClose?.());
    conn.on('error', (e) => handlers.onError?.(e));
  });
  peer.on('error', (e) => handlers.onError?.(e));
  return peer;
}

/** Join a game by code. Same handler shape as hostGame. */
export function joinGame(code, handlers) {
  const peer = new Peer();
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code.toLowerCase().trim(), { reliable: true });
    conn.on('open', () => handlers.onConnected?.(conn));
    conn.on('data', (d) => handlers.onData?.(d));
    conn.on('close', () => handlers.onClose?.());
    conn.on('error', (e) => handlers.onError?.(e));
  });
  peer.on('error', (e) => handlers.onError?.(e));
  return peer;
}
