import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import prisma from '../src/services/db';
import {
  setupSocketServer,
  calculateCanStart,
  RoomStateUpdate,
  RoomErrorPayload,
} from '../src/sockets/lobbyHandler';

describe('Backend Regression Suite: Lobby WebSocket & Capacity Locks (US-04)', () => {
  let testServer: http.Server;
  let testIo: SocketIOServer;
  let port: number;
  const clientSockets: ClientSocket[] = [];

  const connectClient = (p: number): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const socket = Client(`http://localhost:${p}`, {
        transports: ['websocket'],
        forceNew: true,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(err));
    });
  };

  const waitForEvent = <T = unknown>(
    socket: ClientSocket,
    event: string,
    timeout = 3000
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for event "${event}" after ${timeout}ms`));
      }, timeout);

      socket.once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  };

  beforeAll(async () => {
    // 1. Create clean test rooms in DB
    await prisma.room.createMany({
      data: [
        {
          roomCode: 'FEUD-LB01',
          roomName: 'TEST-Lobby-FastMoney',
          language: 'EN',
          gameMode: 'FAST_MONEY',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-LB02',
          roomName: 'TEST-Lobby-MainGame',
          language: 'FR',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-LB03',
          roomName: 'TEST-Active-Room',
          language: 'ES',
          gameMode: 'MAIN_GAME',
          status: 'ACTIVE',
        },
      ],
      skipDuplicates: true,
    });

    // 2. Initialize isolated test socket server
    testServer = http.createServer();
    testIo = new SocketIOServer(testServer, {
      cors: { origin: '*' },
    });

    setupSocketServer(testIo, prisma);

    await new Promise<void>((resolve) => {
      testServer.listen(0, () => {
        const addr = testServer.address() as AddressInfo;
        port = addr.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Disconnect any active client sockets
    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }

    testIo.close();
    await new Promise<void>((resolve) => {
      testServer.close(() => resolve());
    });

    // Cleanup DB records
    await prisma.player.deleteMany({
      where: {
        room: {
          roomCode: { in: ['FEUD-LB01', 'FEUD-LB02', 'FEUD-LB03'] },
        },
      },
    });
    await prisma.room.deleteMany({
      where: {
        roomCode: { in: ['FEUD-LB01', 'FEUD-LB02', 'FEUD-LB03'] },
      },
    });
  });

  describe('Unit Logic: calculateCanStart', () => {
    it('evaluates Fast Money mode strictly requiring exactly 2 players', () => {
      expect(calculateCanStart('FAST_MONEY', 0)).toEqual({
        canStart: false,
        startDisabledReason: 'Waiting for 2 players (current: 0/2)',
      });
      expect(calculateCanStart('FAST_MONEY', 1)).toEqual({
        canStart: false,
        startDisabledReason: 'Waiting for 2 players (current: 1/2)',
      });
      expect(calculateCanStart('FAST_MONEY', 2)).toEqual({
        canStart: true,
      });
    });

    it('evaluates Main Game mode requiring between 2 and 10 even players', () => {
      expect(calculateCanStart('MAIN_GAME', 0).canStart).toBe(false);
      expect(calculateCanStart('MAIN_GAME', 1)).toEqual({
        canStart: false,
        startDisabledReason: 'At least 2 players required (current: 1)',
      });
      expect(calculateCanStart('MAIN_GAME', 2)).toEqual({ canStart: true });
      expect(calculateCanStart('MAIN_GAME', 3)).toEqual({
        canStart: false,
        startDisabledReason: 'Waiting for an even number of players (current: 3)',
      });
      expect(calculateCanStart('MAIN_GAME', 4)).toEqual({ canStart: true });
      expect(calculateCanStart('MAIN_GAME', 10)).toEqual({ canStart: true });
      expect(calculateCanStart('MAIN_GAME', 12)).toEqual({
        canStart: false,
        startDisabledReason: 'Maximum 10 players allowed',
      });
    });
  });

  describe('Integration: Real-Time Roster Synchronization (Scenario 1)', () => {
    it('synchronizes host display and notifies all clients when players join', async () => {
      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);

      const hostUpdatePromise = waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');
      hostSocket.emit('join_room', { roomCode: 'FEUD-LB01', isHost: true });

      const hostState = await hostUpdatePromise;
      expect(hostState.roomCode).toBe('FEUD-LB01');
      expect(hostState.playerCount).toBe(0);
      expect(hostState.players).toHaveLength(0);
      expect(hostState.canStart).toBe(false);

      // Player 1 "Sarah" joins
      const player1Socket = await connectClient(port);
      clientSockets.push(player1Socket);

      const hostUpdateForSarah = waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');
      const p1UpdateForSarah = waitForEvent<RoomStateUpdate>(player1Socket, 'room_state_update');

      player1Socket.emit('join_room', { roomCode: 'FEUD-LB01', nickname: 'Sarah' });

      const [hStateSarah, p1StateSarah] = await Promise.all([
        hostUpdateForSarah,
        p1UpdateForSarah,
      ]);

      expect(hStateSarah.playerCount).toBe(1);
      expect(hStateSarah.players[0].nickname).toBe('Sarah');
      expect(hStateSarah.players[0].isConnected).toBe(true);
      expect(hStateSarah.canStart).toBe(false);

      expect(p1StateSarah.playerCount).toBe(1);
      expect(p1StateSarah.players[0].nickname).toBe('Sarah');
    });
  });

  describe('Integration: Fast Money 2-Player Capacity Lock (Scenario 2)', () => {
    it('admits 2nd player and rejects 3rd player with ROOM_FULL', async () => {
      const hostSocket = clientSockets[0];

      // Player 2 "Michael" joins
      const player2Socket = await connectClient(port);
      clientSockets.push(player2Socket);

      const hostUpdateForMichael = waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');
      player2Socket.emit('join_room', { roomCode: 'FEUD-LB01', nickname: 'Michael' });

      const hStateMichael = await hostUpdateForMichael;
      expect(hStateMichael.playerCount).toBe(2);
      expect(hStateMichael.canStart).toBe(true);

      // Player 3 "Emma" attempts to join 3rd
      const player3Socket = await connectClient(port);
      clientSockets.push(player3Socket);

      const errorPromise = waitForEvent<RoomErrorPayload>(player3Socket, 'room_error');
      player3Socket.emit('join_room', { roomCode: 'FEUD-LB01', nickname: 'Emma' });

      const error = await errorPromise;
      expect(error.code).toBe('ROOM_FULL');
      expect(error.message).toBe('This Fast Money room is already full (2/2 players).');
    });
  });

  describe('Integration: Main Game Even-Count Start Enforcement (Scenario 3)', () => {
    it('dynamically enables and disables canStart based on even player counts', async () => {
      const hostSocket = await connectClient(port);
      clientSockets.push(hostSocket);

      hostSocket.emit('join_room', { roomCode: 'FEUD-LB02', isHost: true });
      await waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');

      // Player 1 joins (Count = 1 -> canStart = false)
      const p1 = await connectClient(port);
      clientSockets.push(p1);
      const update1Promise = waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');
      p1.emit('join_room', { roomCode: 'FEUD-LB02', nickname: 'Lucas' });
      const state1 = await update1Promise;
      expect(state1.playerCount).toBe(1);
      expect(state1.canStart).toBe(false);
      expect(state1.startDisabledReason).toContain('At least 2 players required');

      // Player 2 joins (Count = 2 -> canStart = true)
      const p2 = await connectClient(port);
      clientSockets.push(p2);
      const update2Promise = waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');
      p2.emit('join_room', { roomCode: 'FEUD-LB02', nickname: 'Chloe' });
      const state2 = await update2Promise;
      expect(state2.playerCount).toBe(2);
      expect(state2.canStart).toBe(true);

      // Player 3 joins (Count = 3 -> canStart = false)
      const p3 = await connectClient(port);
      clientSockets.push(p3);
      const update3Promise = waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');
      p3.emit('join_room', { roomCode: 'FEUD-LB02', nickname: 'Antoine' });
      const state3 = await update3Promise;
      expect(state3.playerCount).toBe(3);
      expect(state3.canStart).toBe(false);
      expect(state3.startDisabledReason).toContain('Waiting for an even number of players (current: 3)');

      // Player 4 joins (Count = 4 -> canStart = true)
      const p4 = await connectClient(port);
      clientSockets.push(p4);
      const update4Promise = waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');
      p4.emit('join_room', { roomCode: 'FEUD-LB02', nickname: 'Camille' });
      const state4 = await update4Promise;
      expect(state4.playerCount).toBe(4);
      expect(state4.canStart).toBe(true);
    });
  });

  describe('Integration: Player Disconnection Handling (Scenario 4)', () => {
    it('updates player roster and decrements connected count when player disconnects', async () => {
      const hostSocket = clientSockets[0]; // Connected to FEUD-LB01
      const player2Socket = clientSockets[2]; // "Michael" in FEUD-LB01

      const hostUpdateAfterDC = waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');

      // Player 2 closes connection
      player2Socket.disconnect();

      const hStateDC = await hostUpdateAfterDC;
      expect(hStateDC.playerCount).toBe(1);
      expect(hStateDC.canStart).toBe(false);

      const dcPlayer = hStateDC.players.find((p) => p.nickname === 'Michael');
      expect(dcPlayer).toBeDefined();
      expect(dcPlayer?.isConnected).toBe(false);
    });
  });

  describe('Validation & Edge Cases', () => {
    it('rejects join_room when roomCode is invalid or blank', async () => {
      const socket = await connectClient(port);
      clientSockets.push(socket);

      const errorPromise = waitForEvent<RoomErrorPayload>(socket, 'room_error');
      socket.emit('join_room', { roomCode: '' });

      const err = await errorPromise;
      expect(err.code).toBe('INVALID_ROOM');
    });

    it('rejects join_room when room does not exist', async () => {
      const socket = await connectClient(port);
      clientSockets.push(socket);

      const errorPromise = waitForEvent<RoomErrorPayload>(socket, 'room_error');
      socket.emit('join_room', { roomCode: 'FEUD-NONEXISTENT', nickname: 'Ghost' });

      const err = await errorPromise;
      expect(err.code).toBe('ROOM_NOT_FOUND');
    });

    it('rejects join_room when nickname is shorter than 2 characters', async () => {
      const socket = await connectClient(port);
      clientSockets.push(socket);

      const errorPromise = waitForEvent<RoomErrorPayload>(socket, 'room_error');
      socket.emit('join_room', { roomCode: 'FEUD-LB01', nickname: 'A' });

      const err = await errorPromise;
      expect(err.code).toBe('INVALID_NICKNAME');
    });

    it('rejects join_room when room status is not LOBBY', async () => {
      const socket = await connectClient(port);
      clientSockets.push(socket);

      const errorPromise = waitForEvent<RoomErrorPayload>(socket, 'room_error');
      socket.emit('join_room', { roomCode: 'FEUD-LB03', nickname: 'LatePlayer' });

      const err = await errorPromise;
      expect(err.code).toBe('ROOM_LOCKED');
    });

    it('reconnects existing player when same nickname joins again', async () => {
      const socket = await connectClient(port);
      clientSockets.push(socket);

      // Reconnect "Michael" who was disconnected earlier
      const updatePromise = waitForEvent<RoomStateUpdate>(socket, 'room_state_update');
      socket.emit('join_room', { roomCode: 'FEUD-LB01', nickname: 'Michael' });

      const state = await updatePromise;
      expect(state.playerCount).toBe(2);
      expect(state.canStart).toBe(true);

      const reconnectedPlayer = state.players.find((p) => p.nickname === 'Michael');
      expect(reconnectedPlayer?.isConnected).toBe(true);
    });
  });
});

