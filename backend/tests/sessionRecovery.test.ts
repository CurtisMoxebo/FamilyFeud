import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/config/db';
import { sessionRecoveryService } from '../src/services/sessionRecoveryService';

describe('US-20: Session Recovery Service & Token Architecture Suite (Step 1)', () => {
  const TEST_ROOM_CODES = ['REC-01', 'REC-02', 'REC-03'];

  const clearTestSessions = () => {
    for (const code of TEST_ROOM_CODES) {
      sessionRecoveryService.clearRoomSessions(code);
    }
  };

  beforeAll(async () => {
    await prisma.room.deleteMany({
      where: { roomCode: { in: TEST_ROOM_CODES } },
    });
  });

  afterAll(async () => {
    clearTestSessions();
    await prisma.room.deleteMany({
      where: { roomCode: { in: TEST_ROOM_CODES } },
    });
  });

  beforeEach(() => {
    clearTestSessions();
  });

  describe('Host Secret Management', () => {
    it('generates a unique cryptographically secure hostSecret for a room', () => {
      const secret1 = sessionRecoveryService.createHostSecret('REC-01');
      expect(secret1).toBeDefined();
      expect(typeof secret1).toBe('string');
      expect(secret1.length).toBeGreaterThan(16);

      // Re-querying should return the same secret
      const retrieved = sessionRecoveryService.getHostSecret('REC-01');
      expect(retrieved).toBe(secret1);
    });

    it('validates a correct hostSecret and rejects an invalid one', () => {
      const secret = sessionRecoveryService.createHostSecret('REC-01');
      expect(sessionRecoveryService.validateHostSecret('REC-01', secret)).toBe(true);
      expect(sessionRecoveryService.validateHostSecret('rec-01', secret)).toBe(true); // Case-insensitive normalized
      expect(sessionRecoveryService.validateHostSecret('REC-01', 'wrong-secret')).toBe(false);
      expect(sessionRecoveryService.validateHostSecret('NONEXISTENT', secret)).toBe(false);
    });

    it('tracks host socket IDs', () => {
      sessionRecoveryService.registerHostSocket('REC-01', 'socket-host-123');
      expect(sessionRecoveryService.getHostSocket('REC-01')).toBe('socket-host-123');
    });
  });

  describe('Player Session Token Management', () => {
    it('creates and validates a player sessionToken', () => {
      const token = sessionRecoveryService.createPlayerSession(
        'REC-01',
        'player-uuid-1',
        'Speedy'
      );

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(16);

      // Validation
      expect(
        sessionRecoveryService.validatePlayerSession('REC-01', 'player-uuid-1', token)
      ).toBe(true);
      expect(
        sessionRecoveryService.validatePlayerSession('rec-01', 'player-uuid-1', token)
      ).toBe(true);
      expect(
        sessionRecoveryService.validatePlayerSession('REC-01', 'player-uuid-1', 'bad-token')
      ).toBe(false);
      expect(
        sessionRecoveryService.validatePlayerSession('REC-01', 'other-player', token)
      ).toBe(false);
    });

    it('returns existing sessionToken if player re-registers with same playerId in room', () => {
      const token1 = sessionRecoveryService.createPlayerSession('REC-01', 'p1', 'Alice', 'socket-1');
      const token2 = sessionRecoveryService.createPlayerSession('REC-01', 'p1', 'Alice', 'socket-2');

      expect(token2).toBe(token1);
      const session = sessionRecoveryService.getPlayerSession('p1');
      expect(session?.socketId).toBe('socket-2');
      expect(session?.isConnected).toBe(true);
    });

    it('updates player socket ID and reconnect flag on updatePlayerSocket', () => {
      sessionRecoveryService.createPlayerSession('REC-01', 'p2', 'Bob', 'socket-old');
      sessionRecoveryService.updatePlayerSocket('p2', 'socket-new');

      const session = sessionRecoveryService.getPlayerSession('p2');
      expect(session?.socketId).toBe('socket-new');
      expect(session?.isConnected).toBe(true);
    });

    it('clears active grace timer on updatePlayerSocket when player re-attaches', () => {
      sessionRecoveryService.createPlayerSession('REC-01', 'p-grace-update', 'Dave');
      sessionRecoveryService.startGraceTimer('p-grace-update', 10000, () => {});
      expect(sessionRecoveryService.isPlayerInGracePeriod('p-grace-update')).toBe(true);

      sessionRecoveryService.updatePlayerSocket('p-grace-update', 'socket-reconnected');
      expect(sessionRecoveryService.isPlayerInGracePeriod('p-grace-update')).toBe(false);
      const session = sessionRecoveryService.getPlayerSession('p-grace-update');
      expect(session?.isConnected).toBe(true);
      expect(session?.disconnectedAt).toBeUndefined();
    });

    it('resets existing grace timer when startGraceTimer is called repeatedly', () => {
      sessionRecoveryService.createPlayerSession('REC-01', 'p-grace-repeat', 'Eve');
      sessionRecoveryService.startGraceTimer('p-grace-repeat', 10000, () => {});
      expect(sessionRecoveryService.isPlayerInGracePeriod('p-grace-repeat')).toBe(true);

      const timer2 = sessionRecoveryService.startGraceTimer('p-grace-repeat', 10000, () => {});
      expect(timer2).not.toBeNull();
      expect(sessionRecoveryService.isPlayerInGracePeriod('p-grace-repeat')).toBe(true);
    });

    it('cancels active grace timer via cancelGraceTimer', () => {
      sessionRecoveryService.createPlayerSession('REC-01', 'p-grace-cancel', 'Frank');
      sessionRecoveryService.startGraceTimer('p-grace-cancel', 10000, () => {});
      expect(sessionRecoveryService.isPlayerInGracePeriod('p-grace-cancel')).toBe(true);

      sessionRecoveryService.cancelGraceTimer('p-grace-cancel');
      expect(sessionRecoveryService.isPlayerInGracePeriod('p-grace-cancel')).toBe(false);
    });

    it('clears active grace timers when clearing room sessions', () => {
      sessionRecoveryService.createPlayerSession('REC-03', 'p-grace-room', 'Grace');
      sessionRecoveryService.startGraceTimer('p-grace-room', 10000, () => {});
      expect(sessionRecoveryService.isPlayerInGracePeriod('p-grace-room')).toBe(true);

      sessionRecoveryService.clearRoomSessions('REC-03');
      expect(sessionRecoveryService.isPlayerInGracePeriod('p-grace-room')).toBe(false);
      expect(sessionRecoveryService.getPlayerSession('p-grace-room')).toBeNull();
    });

    it('returns false for isPlayerInGracePeriod when player is unknown or has no active timer', () => {
      expect(sessionRecoveryService.isPlayerInGracePeriod('nonexistent')).toBe(false);
      sessionRecoveryService.createPlayerSession('REC-01', 'p-no-timer', 'Helen');
      expect(sessionRecoveryService.isPlayerInGracePeriod('p-no-timer')).toBe(false);
    });

    it('lists all registered sessions for a room and clears properly', () => {
      sessionRecoveryService.createPlayerSession('REC-01', 'p1', 'Alice');
      sessionRecoveryService.createPlayerSession('REC-01', 'p2', 'Bob');
      sessionRecoveryService.createPlayerSession('REC-02', 'p3', 'Charlie');

      expect(sessionRecoveryService.getRoomPlayerSessions('REC-01')).toHaveLength(2);
      expect(sessionRecoveryService.getRoomPlayerSessions('REC-02')).toHaveLength(1);

      sessionRecoveryService.clearRoomSessions('REC-01');
      expect(sessionRecoveryService.getRoomPlayerSessions('REC-01')).toHaveLength(0);
      expect(sessionRecoveryService.getHostSecret('REC-01')).toBeNull();
      // Sibling room unaffected
      expect(sessionRecoveryService.getRoomPlayerSessions('REC-02')).toHaveLength(1);
    });

    it('returns empty list for non-existent room session query', () => {
      expect(sessionRecoveryService.getRoomPlayerSessions('NON-EXISTENT')).toEqual([]);
    });

    it('returns null when starting grace timer for an unknown playerId', () => {
      const timer = sessionRecoveryService.startGraceTimer('unknown-id', 5000, () => {});
      expect(timer).toBeNull();
    });

    it('clears all sessions and active grace timers on clearAllSessions', () => {
      sessionRecoveryService.createHostSecret('REC-CLEAR');
      sessionRecoveryService.createPlayerSession('REC-CLEAR', 'p-clear', 'ClearMe');
      sessionRecoveryService.startGraceTimer('p-clear', 10000, () => {});

      sessionRecoveryService.clearAllSessions();
      expect(sessionRecoveryService.getHostSecret('REC-CLEAR')).toBeNull();
      expect(sessionRecoveryService.getPlayerSession('p-clear')).toBeNull();
      expect(sessionRecoveryService.getRoomPlayerSessions('REC-CLEAR')).toEqual([]);
    });
  });

  describe('POST /api/rooms: Host Secret Generation API Integration', () => {
    it('creates room and returns hostSecret in response for sessionStorage storage', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          language: 'EN',
          gameMode: 'MAIN_GAME',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.room).toBeDefined();
      expect(res.body.hostSecret).toBeDefined();
      expect(typeof res.body.hostSecret).toBe('string');
      expect(res.body.room.hostSecret).toBe(res.body.hostSecret);

      // Verify server registered the secret
      const isValid = sessionRecoveryService.validateHostSecret(
        res.body.room.roomCode,
        res.body.hostSecret
      );
      expect(isValid).toBe(true);

      // Cleanup
      await prisma.room.delete({ where: { id: res.body.room.id } });
      sessionRecoveryService.clearRoomSessions(res.body.room.roomCode);
    });
  });
});

