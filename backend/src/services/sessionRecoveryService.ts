import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { normalizeRoomCode } from '../utils/roomCode';

export interface PlayerSessionRecord {
  playerId: string;
  roomCode: string;
  sessionToken: string;
  nickname: string;
  socketId?: string;
  isConnected: boolean;
  disconnectedAt?: number;
  graceTimer?: NodeJS.Timeout;
}

class SessionRecoveryService {
  // roomCode -> hostSecret
  private hostSecrets = new Map<string, string>();
  // roomCode -> hostSocketId
  private hostSockets = new Map<string, string>();
  // playerId -> PlayerSessionRecord
  private playerSessions = new Map<string, PlayerSessionRecord>();
  // roomCode -> Set of playerIds
  private roomPlayerIndex = new Map<string, Set<string>>();

  /**
   * Generates or retrieves a hostSecret for a given room.
   */
  public createHostSecret(roomCode: string): string {
    const code = normalizeRoomCode(roomCode);
    let secret = this.hostSecrets.get(code);
    if (!secret) {
      secret = randomUUID();
      this.hostSecrets.set(code, secret);
      logger.info(`[SESSION:HOST_SECRET] Generated host secret for room ${code}`);
    }
    return secret;
  }

  /**
   * Gets the hostSecret for a room if exists.
   */
  public getHostSecret(roomCode: string): string | null {
    const code = normalizeRoomCode(roomCode);
    return this.hostSecrets.get(code) || null;
  }

  /**
   * Validates whether a provided hostSecret matches the room's secret.
   */
  public validateHostSecret(roomCode: string, hostSecret: string): boolean {
    if (!roomCode || !hostSecret) return false;
    const code = normalizeRoomCode(roomCode);
    const storedSecret = this.hostSecrets.get(code);
    return storedSecret !== undefined && storedSecret === hostSecret.trim();
  }

  /**
   * Associates the current active host socket ID with the room.
   */
  public registerHostSocket(roomCode: string, socketId: string): void {
    const code = normalizeRoomCode(roomCode);
    this.hostSockets.set(code, socketId);
  }

  /**
   * Retrieves the current host socket ID for a room.
   */
  public getHostSocket(roomCode: string): string | null {
    const code = normalizeRoomCode(roomCode);
    return this.hostSockets.get(code) || null;
  }

  /**
   * Creates or updates a player's session token and registers their session record.
   */
  public createPlayerSession(
    roomCode: string,
    playerId: string,
    nickname: string,
    socketId?: string
  ): string {
    const code = normalizeRoomCode(roomCode);
    const existing = this.playerSessions.get(playerId);

    if (existing && existing.roomCode === code) {
      if (socketId) existing.socketId = socketId;
      existing.isConnected = true;
      existing.nickname = nickname;
      if (existing.graceTimer) {
        clearTimeout(existing.graceTimer);
        existing.graceTimer = undefined;
      }
      return existing.sessionToken;
    }

    const sessionToken = randomUUID();
    const record: PlayerSessionRecord = {
      playerId,
      roomCode: code,
      sessionToken,
      nickname,
      socketId,
      isConnected: true,
    };

    this.playerSessions.set(playerId, record);

    if (!this.roomPlayerIndex.has(code)) {
      this.roomPlayerIndex.set(code, new Set());
    }
    this.roomPlayerIndex.get(code)!.add(playerId);

    logger.info(`[SESSION:PLAYER_TOKEN] Generated session token for player ${nickname} (${playerId}) in room ${code}`);
    return sessionToken;
  }

  /**
   * Retrieves a player session record by playerId.
   */
  public getPlayerSession(playerId: string): PlayerSessionRecord | null {
    return this.playerSessions.get(playerId) || null;
  }

  /**
   * Validates a player session using roomCode, playerId, and sessionToken.
   */
  public validatePlayerSession(
    roomCode: string,
    playerId: string,
    sessionToken: string
  ): boolean {
    if (!roomCode || !playerId || !sessionToken) return false;
    const code = normalizeRoomCode(roomCode);
    const session = this.playerSessions.get(playerId);
    if (!session) return false;
    return session.roomCode === code && session.sessionToken === sessionToken.trim();
  }

  /**
   * Updates a player's socket connection ID and reconnect status.
   */
  public updatePlayerSocket(playerId: string, socketId: string): void {
    const session = this.playerSessions.get(playerId);
    if (session) {
      session.socketId = socketId;
      session.isConnected = true;
      session.disconnectedAt = undefined;
      if (session.graceTimer) {
        clearTimeout(session.graceTimer);
        session.graceTimer = undefined;
      }
    }
  }

  /**
   * Removes a player session and cancels any active grace timer (US-21 Scenario 3).
   */
  public removePlayerSession(playerId: string): void {
    const session = this.playerSessions.get(playerId);
    if (session) {
      if (session.graceTimer) {
        clearTimeout(session.graceTimer);
        session.graceTimer = undefined;
      }
      this.playerSessions.delete(playerId);
      const code = normalizeRoomCode(session.roomCode);
      const playerIds = this.roomPlayerIndex.get(code);
      if (playerIds) {
        playerIds.delete(playerId);
      }
    }
  }

  /**
   * Starts a disconnect grace period timer for a disconnected player (US-20 Scenario 4).
   */
  public startGraceTimer(
    playerId: string,
    durationMs: number = 30000,
    onExpire: () => void
  ): NodeJS.Timeout | null {
    const session = this.playerSessions.get(playerId);
    if (!session) {
      logger.warn(`[SESSION:GRACE] Session not found for player ${playerId}`);
      return null;
    }

    if (session.graceTimer) {
      clearTimeout(session.graceTimer);
      session.graceTimer = undefined;
    }

    session.isConnected = false;
    session.disconnectedAt = Date.now();

    session.graceTimer = setTimeout(() => {
      session.graceTimer = undefined;
      logger.info(
        `[SESSION:GRACE_EXPIRED] Disconnect grace timer expired (${durationMs}ms) for player ${session.nickname} (${playerId}) in room ${session.roomCode}`
      );
      onExpire();
    }, durationMs);

    logger.info(
      `[SESSION:GRACE_START] Started ${durationMs}ms grace timer for player ${session.nickname} (${playerId}) in room ${session.roomCode}`
    );

    return session.graceTimer;
  }

  /**
   * Cancels any active disconnect grace timer for a player.
   */
  public cancelGraceTimer(playerId: string): void {
    const session = this.playerSessions.get(playerId);
    if (session?.graceTimer) {
      clearTimeout(session.graceTimer);
      session.graceTimer = undefined;
      logger.info(`[SESSION:GRACE_CANCELLED] Cancelled grace timer for player ${playerId}`);
    }
  }

  /**
   * Checks if a player currently has an active grace period timer running.
   */
  public isPlayerInGracePeriod(playerId: string): boolean {
    const session = this.playerSessions.get(playerId);
    return Boolean(session?.graceTimer);
  }

  /**
   * Retrieves all registered player sessions for a given room.
   */
  public getRoomPlayerSessions(roomCode: string): PlayerSessionRecord[] {
    const code = normalizeRoomCode(roomCode);
    const playerIds = this.roomPlayerIndex.get(code);
    if (!playerIds) return [];
    const result: PlayerSessionRecord[] = [];
    for (const pid of playerIds) {
      const s = this.playerSessions.get(pid);
      if (s) result.push(s);
    }
    return result;
  }

  /**
   * Clears session tracking for a specific room.
   */
  public clearRoomSessions(roomCode: string): void {
    const code = normalizeRoomCode(roomCode);
    this.hostSecrets.delete(code);
    this.hostSockets.delete(code);

    const playerIds = this.roomPlayerIndex.get(code);
    if (playerIds) {
      for (const pid of playerIds) {
        const session = this.playerSessions.get(pid);
        if (session?.graceTimer) {
          clearTimeout(session.graceTimer);
        }
        this.playerSessions.delete(pid);
      }
      this.roomPlayerIndex.delete(code);
    }
  }

  /**
   * Clears all session records across the application (useful for test resets).
   */
  public clearAllSessions(): void {
    for (const session of this.playerSessions.values()) {
      if (session.graceTimer) {
        clearTimeout(session.graceTimer);
      }
    }
    this.hostSecrets.clear();
    this.hostSockets.clear();
    this.playerSessions.clear();
    this.roomPlayerIndex.clear();
  }
}

export const sessionRecoveryService = new SessionRecoveryService();
export default sessionRecoveryService;

