import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveHostSecret,
  getHostSecret,
  clearHostSecret,
  savePlayerSession,
  getPlayerSession,
  clearPlayerSession,
  HOST_SECRET_KEY,
  PLAYER_SESSION_KEY,
} from '../src/utils/sessionStorage';

describe('US-20: Client Storage Utilities Suite (Step 1)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('Host Secret Storage (sessionStorage)', () => {
    it('saves and retrieves the host secret in sessionStorage', () => {
      saveHostSecret('secret-xyz-123');
      expect(sessionStorage.getItem(HOST_SECRET_KEY)).toBe('secret-xyz-123');
      expect(getHostSecret()).toBe('secret-xyz-123');
    });

    it('saves and retrieves room-scoped host secret in sessionStorage', () => {
      saveHostSecret('secret-room-a', 'FEUD-AAAA');
      saveHostSecret('secret-room-b', 'FEUD-BBBB');

      expect(getHostSecret('FEUD-AAAA')).toBe('secret-room-a');
      expect(getHostSecret('feud-aaaa')).toBe('secret-room-a'); // Case insensitive
      expect(getHostSecret('FEUD-BBBB')).toBe('secret-room-b');
    });

    it('clears host secret from sessionStorage', () => {
      saveHostSecret('secret-test', 'FEUD-9999');
      expect(getHostSecret('FEUD-9999')).toBe('secret-test');

      clearHostSecret('FEUD-9999');
      expect(sessionStorage.getItem(HOST_SECRET_KEY)).toBeNull();
      expect(getHostSecret('FEUD-9999')).toBeNull();
    });

    it('returns null if no secret exists', () => {
      expect(getHostSecret()).toBeNull();
      expect(getHostSecret('UNKNOWN')).toBeNull();
    });
  });

  describe('Player Session Credentials Storage (localStorage)', () => {
    it('saves and retrieves player session credentials from localStorage', () => {
      const credentials = {
        roomCode: 'FEUD-PLAY',
        playerId: 'p-100',
        sessionToken: 'token-abc-456',
        nickname: 'SuperGuesser',
      };

      savePlayerSession(credentials);

      const raw = localStorage.getItem(PLAYER_SESSION_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toEqual(credentials);

      const retrieved = getPlayerSession();
      expect(retrieved).toEqual(credentials);
    });

    it('retrieves room-scoped player session credentials from localStorage', () => {
      savePlayerSession({
        roomCode: 'FEUD-1111',
        playerId: 'p-1',
        sessionToken: 'token-1',
        nickname: 'Player1',
      });

      savePlayerSession({
        roomCode: 'FEUD-2222',
        playerId: 'p-2',
        sessionToken: 'token-2',
        nickname: 'Player2',
      });

      expect(getPlayerSession('FEUD-1111')?.nickname).toBe('Player1');
      expect(getPlayerSession('feud-1111')?.nickname).toBe('Player1');
      expect(getPlayerSession('FEUD-2222')?.nickname).toBe('Player2');
      expect(getPlayerSession('FEUD-OTHER')).toBeNull();
    });

    it('clears player session from localStorage', () => {
      savePlayerSession({
        roomCode: 'FEUD-CLEAR',
        playerId: 'p-clear',
        sessionToken: 'token-clear',
      });

      expect(getPlayerSession('FEUD-CLEAR')).not.toBeNull();

      clearPlayerSession('FEUD-CLEAR');
      expect(getPlayerSession('FEUD-CLEAR')).toBeNull();
      expect(localStorage.getItem(PLAYER_SESSION_KEY)).toBeNull();
    });

    it('handles corrupted localStorage JSON safely without crashing', () => {
      localStorage.setItem(PLAYER_SESSION_KEY, 'corrupted{json');
      expect(getPlayerSession()).toBeNull();
    });
  });
});

