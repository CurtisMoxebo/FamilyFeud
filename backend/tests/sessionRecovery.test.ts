import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { prisma } from '../src/config/db';
import { sessionRecoveryService } from '../src/services/sessionRecoveryService';

describe('US-20: Session Recovery Service & Token Architecture Suite (Step 1)', () => {
  const TEST_ROOM_CODES = ['REC-01', 'REC-02', 'REC-03'];

  beforeAll(async () => {
    await prisma.room.deleteMany({
      where: { roomCode: { in: TEST_ROOM_CODES } },
    });
  });

  afterAll(async () => {
    sessionRecoveryService.clearAllSessions();
    await prisma.room.deleteMany({
      where: { roomCode: { in: TEST_ROOM_CODES } },
    });
  });

  beforeEach(() => {
    sessionRecoveryService.clearAllSessions();
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
  });

  describe('POST /api/rooms: Host Secret Generation API Integration', () => {
    it('creates room and returns hostSecret in response for sessionStorage storage', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          roomName: 'Host Secret Test Room',
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

