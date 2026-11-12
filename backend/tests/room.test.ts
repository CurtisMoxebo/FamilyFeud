import { describe, it, expect, vi, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import prisma from '../src/services/db';
import { isValidRoomCodeFormat } from '../src/utils/roomCode';

describe('Backend Regression Suite: Room API Endpoints (US-02 & US-29)', () => {
  const createdRoomIds: string[] = [];

  afterAll(async () => {
    if (createdRoomIds.length > 0) {
      await prisma.room.deleteMany({
        where: { id: { in: createdRoomIds } },
      });
    }
  });

  describe('POST /api/rooms', () => {
    it('creates a room successfully (Scenario 1: French Fast Money)', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          language: 'FR',
          gameMode: 'FAST_MONEY',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.room).toBeDefined();

      const { room } = res.body;
      expect(room.id).toBeDefined();
      expect(room.language).toBe('FR');
      expect(room.gameMode).toBe('FAST_MONEY');
      expect(room.status).toBe('LOBBY');
      expect(isValidRoomCodeFormat(room.roomCode)).toBe(true);

      createdRoomIds.push(room.id);

      // Verify persistence in MySQL database via Prisma
      const dbRecord = await prisma.room.findUnique({
        where: { id: room.id },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord?.roomCode).toBe(room.roomCode);
    });

    it('creates a room in Spanish Main Game mode', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          language: 'ES',
          gameMode: 'MAIN_GAME',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.room.language).toBe('ES');
      expect(res.body.room.gameMode).toBe('MAIN_GAME');

      createdRoomIds.push(res.body.room.id);
    });

    it('creates a room in English Fast Money mode', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          language: 'EN',
          gameMode: 'FAST_MONEY',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.room.language).toBe('EN');
      expect(res.body.room.gameMode).toBe('FAST_MONEY');

      createdRoomIds.push(res.body.room.id);
    });

    it('rejects creation when language is invalid or unsupported', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          language: 'DE',
          gameMode: 'FAST_MONEY',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Language must be one of: EN, FR, ES');
    });

    it('rejects creation when gameMode is invalid', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .send({
          language: 'EN',
          gameMode: 'INVALID_MODE',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Game mode must be either FAST_MONEY or MAIN_GAME');
    });

    it('returns 500 when database insertion fails', async () => {
      const spy = vi.spyOn(prisma.room, 'create').mockRejectedValueOnce(new Error('DB Write Failure'));

      const res = await request(app)
        .post('/api/rooms')
        .send({
          language: 'EN',
          gameMode: 'FAST_MONEY',
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Failed to create room session');

      spy.mockRestore();
    });
  });

  describe('GET /api/rooms/:roomCode', () => {
    it('returns 200 with room details for an existing room', async () => {
      // First create a room
      const createRes = await request(app)
        .post('/api/rooms')
        .send({
          language: 'EN',
          gameMode: 'FAST_MONEY',
        });

      const { roomCode, id } = createRes.body.room;
      createdRoomIds.push(id);

      // Fetch by room code
      const fetchRes = await request(app).get(`/api/rooms/${roomCode}`);
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.success).toBe(true);
      expect(fetchRes.body.room.roomCode).toBe(roomCode);
      expect(fetchRes.body.room.status).toBe('LOBBY');
      expect(Array.isArray(fetchRes.body.room.players)).toBe(true);
    });

    it('supports lowercase room codes in URL parameters', async () => {
      const createRes = await request(app)
        .post('/api/rooms')
        .send({
          language: 'FR',
          gameMode: 'MAIN_GAME',
        });

      const { roomCode, id } = createRes.body.room;
      createdRoomIds.push(id);

      const fetchRes = await request(app).get(`/api/rooms/${roomCode.toLowerCase()}`);
      expect(fetchRes.status).toBe(200);
      expect(fetchRes.body.success).toBe(true);
      expect(fetchRes.body.room.roomCode).toBe(roomCode);
    });

    it('returns 404 when room code is valid format but does not exist', async () => {
      const res = await request(app).get('/api/rooms/FEUD-ZZZZ');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Room not found');
    });

    it('returns 400 when room code has invalid format', async () => {
      const res = await request(app).get('/api/rooms/BAD-FORMAT');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid room code format (must be FEUD-XXXX)');
    });

    it('returns 500 when database lookup fails', async () => {
      const spy = vi.spyOn(prisma.room, 'findUnique').mockRejectedValueOnce(new Error('DB Read Failure'));

      const res = await request(app).get('/api/rooms/FEUD-ABCD');
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Failed to fetch room details');

      spy.mockRestore();
    });
  });
});
