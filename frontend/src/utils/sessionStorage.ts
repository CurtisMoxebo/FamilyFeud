/**
 * Client Storage Utilities for US-20: Host & Player Session Reconnection
 * Host: sessionStorage.setItem('ff_host_secret', hostSecret)
 * Player: localStorage.setItem('ff_session', JSON.stringify({ roomCode, playerId, sessionToken }))
 */

export interface PlayerSessionCredentials {
  roomCode: string;
  playerId: string;
  sessionToken: string;
  nickname?: string;
}

export const HOST_SECRET_KEY = 'ff_host_secret';
export const PLAYER_SESSION_KEY = 'ff_session';

/**
 * Saves the Host secret in browser sessionStorage.
 */
export function saveHostSecret(hostSecret: string, roomCode?: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(HOST_SECRET_KEY, hostSecret);
    if (roomCode) {
      sessionStorage.setItem(`${HOST_SECRET_KEY}_${roomCode.toUpperCase()}`, hostSecret);
    }
  } catch {
    // Storage access failures in restricted browser environments
  }
}

/**
 * Retrieves the Host secret from browser sessionStorage.
 */
export function getHostSecret(roomCode?: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    if (roomCode) {
      const roomSpecific = sessionStorage.getItem(`${HOST_SECRET_KEY}_${roomCode.toUpperCase()}`);
      if (roomSpecific) return roomSpecific;
    }
    return sessionStorage.getItem(HOST_SECRET_KEY);
  } catch {
    return null;
  }
}

/**
 * Clears the Host secret from browser sessionStorage.
 */
export function clearHostSecret(roomCode?: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(HOST_SECRET_KEY);
    if (roomCode) {
      sessionStorage.removeItem(`${HOST_SECRET_KEY}_${roomCode.toUpperCase()}`);
    }
  } catch {
    // Storage access failures
  }
}

/**
 * Saves player session credentials in browser localStorage.
 */
export function savePlayerSession(credentials: PlayerSessionCredentials): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(credentials);
    localStorage.setItem(PLAYER_SESSION_KEY, serialized);
    if (credentials.roomCode) {
      localStorage.setItem(`${PLAYER_SESSION_KEY}_${credentials.roomCode.toUpperCase()}`, serialized);
    }
  } catch {
    // Storage access failures
  }
}

/**
 * Retrieves player session credentials from browser localStorage.
 */
export function getPlayerSession(roomCode?: string): PlayerSessionCredentials | null {
  if (typeof window === 'undefined') return null;
  try {
    if (roomCode) {
      const roomSpecific = localStorage.getItem(`${PLAYER_SESSION_KEY}_${roomCode.toUpperCase()}`);
      if (roomSpecific) {
        return JSON.parse(roomSpecific) as PlayerSessionCredentials;
      }
    }
    const raw = localStorage.getItem(PLAYER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlayerSessionCredentials;
    if (roomCode && parsed.roomCode && parsed.roomCode.toUpperCase() !== roomCode.toUpperCase()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Clears player session credentials from browser localStorage.
 */
export function clearPlayerSession(roomCode?: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PLAYER_SESSION_KEY);
    if (roomCode) {
      localStorage.removeItem(`${PLAYER_SESSION_KEY}_${roomCode.toUpperCase()}`);
    }
  } catch {
    // Storage access failures
  }
}

