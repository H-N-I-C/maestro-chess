/* Online multiplayer over WebRTC (PeerJS public cloud for signaling).
   The host (game creator) is White and authoritative: guest moves are
   validated on the host with chess.js and the resulting state is synced
   back, so neither side can play illegal moves even if tampered with. */
import Peer from 'peerjs';

const PREFIX = 'maestro-';
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

export function makeCode() {
  // crypto RNG: codes are the only thing standing between a stranger and your game
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += CODE_CHARS[b % CODE_CHARS.length];
  return s;
}

/**
 * Host a game. handlers: { onOpen, onConnected(conn), onData(data, conn), onClose(conn), onError(err) }
 * Every handler gets the connection, so the host can tell its opponent apart
 * from spectators (conn.metadata.role === 'spectator') and strangers.
 * Returns the Peer (call .destroy() to cancel/leave).
 */
export function hostGame(code, handlers) {
  const peer = new Peer(PREFIX + code);
  peer.on('open', () => handlers.onOpen?.());
  peer.on('connection', (conn) => {
    conn.on('open', () => handlers.onConnected?.(conn));
    conn.on('data', (d) => handlers.onData?.(d, conn));
    conn.on('close', () => handlers.onClose?.(conn));
    conn.on('error', (e) => handlers.onError?.(e, conn));
  });
  peer.on('error', (e) => handlers.onError?.(e));
  return peer;
}

/** Join a game by code (as the opponent, or with {spectator:true} to watch). */
export function joinGame(code, handlers, { spectator = false } = {}) {
  const peer = new Peer();
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code.toLowerCase().trim(), {
      reliable: true,
      metadata: { role: spectator ? 'spectator' : 'player' },
    });
    conn.on('open', () => handlers.onConnected?.(conn));
    conn.on('data', (d) => handlers.onData?.(d));
    conn.on('close', () => handlers.onClose?.());
    conn.on('error', (e) => handlers.onError?.(e));
  });
  peer.on('error', (e) => handlers.onError?.(e));
  return peer;
}
