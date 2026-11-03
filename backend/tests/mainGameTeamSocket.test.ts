import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { Server as SocketIOServer } from 'socket.io';
import { prisma } from '../src/services/db';
import { setupSocketServer, TeamsAssignedPayload, GameStartedPayload, RoomStateUpdate, RoomErrorPayload } from '../src/sockets/lobbyHandler';

describe('US-11: Main Game Team Partitioning WebSocket Integration', () => {
  let testServer: http.Server;
  let testIo: SocketIOServer;
  let port: number;
  let clientSockets: ClientSocket[] = [];

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
          roomCode: 'FEUD-TM01',
          roomName: 'Main Game 4 Players Room',
          language: 'EN',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-TM02',
          roomName: 'Main Game Odd Players Room',
          language: 'FR',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
        },
        {
          roomCode: 'FEUD-TM03',
          roomName: 'Main Game 10 Players Room',
          language: 'ES',
          gameMode: 'MAIN_GAME',
          status: 'LOBBY',
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
    clientSockets.forEach((s) => s.disconnect());
    clientSockets = [];

    await new Promise<void>((resolve) => {
      testIo.close(() => {
        testServer.close(() => resolve());
      });
    });

    // Clean up test data
    await prisma.room.deleteMany({
      where: {
        roomCode: { in: ['FEUD-TM01', 'FEUD-TM02', 'FEUD-TM03'] },
      },
    });
  });

  beforeEach(() => {
    clientSockets.forEach((s) => s.disconnect());
    clientSockets = [];
  });

  it('satisfies Scenario 1: partitions 4 players into 2 equal teams, updates DB, and broadcasts teams_assigned', async () => {
    const hostSocket = await connectClient(port);
    const p1Socket = await connectClient(port);
    const p2Socket = await connectClient(port);
    const p3Socket = await connectClient(port);
    const p4Socket = await connectClient(port);
    clientSockets.push(hostSocket, p1Socket, p2Socket, p3Socket, p4Socket);

    // Host joins as host
    hostSocket.emit('join_room', { roomCode: 'FEUD-TM01', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    // 4 players join: Alex, Sarah, David, Emma
    p1Socket.emit('join_room', { roomCode: 'FEUD-TM01', nickname: 'Alex', isHost: false });
    await waitForEvent(p1Socket, 'room_state_update');

    p2Socket.emit('join_room', { roomCode: 'FEUD-TM01', nickname: 'Sarah', isHost: false });
    await waitForEvent(p2Socket, 'room_state_update');

    p3Socket.emit('join_room', { roomCode: 'FEUD-TM01', nickname: 'David', isHost: false });
    await waitForEvent(p3Socket, 'room_state_update');

    p4Socket.emit('join_room', { roomCode: 'FEUD-TM01', nickname: 'Emma', isHost: false });
    const lastRoster = await waitForEvent<RoomStateUpdate>(p4Socket, 'room_state_update');

    expect(lastRoster.playerCount).toBe(4);
    expect(lastRoster.canStart).toBe(true);

    // Prepare listeners for teams_assigned, game_started, and refreshed room_state_update
    const teamsAssignedPromise = waitForEvent<TeamsAssignedPayload>(p1Socket, 'teams_assigned');
    const gameStartedPromise = waitForEvent<GameStartedPayload>(hostSocket, 'game_started');
    const finalRoomStatePromise = new Promise<RoomStateUpdate>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for ACTIVE state')), 3000);
      const handler = (state: RoomStateUpdate) => {
        if (state.status === 'ACTIVE') {
          clearTimeout(timer);
          p2Socket.off('room_state_update', handler);
          resolve(state);
        }
      };
      p2Socket.on('room_state_update', handler);
    });

    // Host starts game
    hostSocket.emit('start_game', { roomCode: 'FEUD-TM01' });

    const teamsAssigned = await teamsAssignedPromise;
    expect(teamsAssigned.roomCode).toBe('FEUD-TM01');
    expect(teamsAssigned.team1).toHaveLength(2);
    expect(teamsAssigned.team2).toHaveLength(2);

    // Verify batting order and team tags
    expect(teamsAssigned.team1[0].team).toBe('TEAM_1');
    expect(teamsAssigned.team1[0].battingOrder).toBe(1);
    expect(teamsAssigned.team1[1].team).toBe('TEAM_1');
    expect(teamsAssigned.team1[1].battingOrder).toBe(2);

    expect(teamsAssigned.team2[0].team).toBe('TEAM_2');
    expect(teamsAssigned.team2[0].battingOrder).toBe(1);
    expect(teamsAssigned.team2[1].team).toBe('TEAM_2');
    expect(teamsAssigned.team2[1].battingOrder).toBe(2);

    const gameStarted = await gameStartedPromise;
    expect(gameStarted.roomCode).toBe('FEUD-TM01');
    expect(gameStarted.gameMode).toBe('MAIN_GAME');
    expect(gameStarted.status).toBe('IN_PROGRESS');

    const finalRoomState = await finalRoomStatePromise;
    expect(finalRoomState.status).toBe('ACTIVE');

    // Verify that player records in DB have been updated with team assignments
    const dbRoom = await prisma.room.findUnique({
      where: { roomCode: 'FEUD-TM01' },
      include: { players: true },
    });

    expect(dbRoom?.players).toHaveLength(4);
    const dbTeam1 = dbRoom?.players.filter((p) => p.team === 'TEAM_1');
    const dbTeam2 = dbRoom?.players.filter((p) => p.team === 'TEAM_2');
    expect(dbTeam1).toHaveLength(2);
    expect(dbTeam2).toHaveLength(2);
  });

  it('satisfies Scenario 2: blocks starting game with odd number of players (5) with exact warning message', async () => {
    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-TM02', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    // Add 5 players to FEUD-TM02
    let hostRoster: RoomStateUpdate | null = null;
    for (let i = 1; i <= 5; i++) {
      const p = await connectClient(port);
      clientSockets.push(p);
      const hostUpdatePromise = waitForEvent<RoomStateUpdate>(hostSocket, 'room_state_update');
      p.emit('join_room', {
        roomCode: 'FEUD-TM02',
        nickname: `Player${i}`,
        isHost: false,
      });
      hostRoster = await hostUpdatePromise;
    }

    // Check room_state_update canStart is false with odd player count message
    expect(hostRoster).not.toBeNull();
    expect(hostRoster!.playerCount).toBe(5);
    expect(hostRoster!.canStart).toBe(false);
    expect(hostRoster!.startDisabledReason).toBe(
      'Cannot start with an odd number of players (5). Connect 1 more player to reach 6.'
    );

    // Host attempts to start game anyway
    const errorPromise = waitForEvent<RoomErrorPayload>(hostSocket, 'room_error');
    hostSocket.emit('start_game', { roomCode: 'FEUD-TM02' });

    const err = await errorPromise;
    expect(err.code).toBe('CANNOT_START');
    expect(err.message).toBe(
      'Cannot start with an odd number of players (5). Connect 1 more player to reach 6.'
    );

    // Room in DB must still be in LOBBY status
    const dbRoom = await prisma.room.findUnique({
      where: { roomCode: 'FEUD-TM02' },
    });
    expect(dbRoom?.status).toBe('LOBBY');
  });

  it('satisfies Scenario 3: enforces max 10 players and partitions 10 players into 5 per team', async () => {
    const hostSocket = await connectClient(port);
    clientSockets.push(hostSocket);

    hostSocket.emit('join_room', { roomCode: 'FEUD-TM03', isHost: true });
    await waitForEvent(hostSocket, 'room_state_update');

    // Connect 10 players
    for (let i = 1; i <= 10; i++) {
      const p = await connectClient(port);
      clientSockets.push(p);
      p.emit('join_room', {
        roomCode: 'FEUD-TM03',
        nickname: `Player${i}`,
        isHost: false,
      });
      await waitForEvent(p, 'room_state_update');
    }

    // 11th player attempts to join -> rejected with ROOM_FULL
    const p11 = await connectClient(port);
    clientSockets.push(p11);
    const roomErrorPromise = waitForEvent<RoomErrorPayload>(p11, 'room_error');
    p11.emit('join_room', {
      roomCode: 'FEUD-TM03',
      nickname: 'Player11',
      isHost: false,
    });
    const joinErr = await roomErrorPromise;
    expect(joinErr.code).toBe('ROOM_FULL');

    // Host starts game with 10 players
    const teamsAssignedPromise = waitForEvent<TeamsAssignedPayload>(hostSocket, 'teams_assigned');
    hostSocket.emit('start_game', { roomCode: 'FEUD-TM03' });

    const teams = await teamsAssignedPromise;
    expect(teams.team1).toHaveLength(5);
    expect(teams.team2).toHaveLength(5);

    // Verify 1-indexed batting orders 1..5 for both teams
    expect(teams.team1.map((p) => p.battingOrder)).toEqual([1, 2, 3, 4, 5]);
    expect(teams.team2.map((p) => p.battingOrder)).toEqual([1, 2, 3, 4, 5]);
  });
});
