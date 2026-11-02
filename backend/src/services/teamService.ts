import { PrismaClient, Team } from '@prisma/client';
import { logger } from '../utils/logger';

export type TeamId = 'TEAM_1' | 'TEAM_2';

export interface AssignedPlayer<T = { id: string; nickname?: string }> {
  id: string;
  nickname?: string;
  team: TeamId;
  battingOrder: number;
  originalPlayer: T;
}

export interface PartitionResult<T = { id: string; nickname?: string }> {
  team1: AssignedPlayer<T>[];
  team2: AssignedPlayer<T>[];
  allAssigned: AssignedPlayer<T>[];
}

export interface TeamValidationResult {
  isValid: boolean;
  error?: string;
  count: number;
  neededToEven?: number;
}

/**
 * Validates player count for Main Game team partitioning (US-11).
 * Requires an even count between 2 and 10 players inclusive.
 */
export function validateTeamCount(count: number): TeamValidationResult {
  if (count < 2) {
    return {
      isValid: false,
      error: `At least 2 players required (current: ${count})`,
      count,
      neededToEven: 2 - count,
    };
  }

  if (count > 10) {
    return {
      isValid: false,
      error: 'Maximum 10 players allowed',
      count,
    };
  }

  if (count % 2 !== 0) {
    return {
      isValid: false,
      error: `Cannot start with an odd number of players (${count}). Connect 1 more player to reach ${count + 1}.`,
      count,
      neededToEven: 1,
    };
  }

  return {
    isValid: true,
    count,
  };
}

/**
 * Modern Fisher-Yates (Knuth) Shuffle algorithm.
 * Guarantees uniform random distribution O(N) time and O(N) space.
 */
export function fisherYatesShuffle<T>(items: T[], randomFn: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Randomly partitions players into two equal, balanced teams (Team 1 and Team 2)
 * using Fisher-Yates shuffle while recording individual team batting orders (US-11 Scenario 1).
 */
export function partitionTeams<T extends { id: string; nickname?: string }>(
  players: T[],
  randomFn: () => number = Math.random
): PartitionResult<T> {
  const validation = validateTeamCount(players.length);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid player count for team partitioning.');
  }

  const shuffled = fisherYatesShuffle(players, randomFn);
  const half = shuffled.length / 2;

  const team1: AssignedPlayer<T>[] = shuffled.slice(0, half).map((p, idx) => ({
    id: p.id,
    nickname: p.nickname,
    team: 'TEAM_1' as TeamId,
    battingOrder: idx + 1,
    originalPlayer: p,
  }));

  const team2: AssignedPlayer<T>[] = shuffled.slice(half).map((p, idx) => ({
    id: p.id,
    nickname: p.nickname,
    team: 'TEAM_2' as TeamId,
    battingOrder: idx + 1,
    originalPlayer: p,
  }));

  const allAssigned = [...team1, ...team2];

  logger.info(
    `[TEAM:PARTITION] Partitioned ${players.length} players into Team 1 (${team1.length}) and Team 2 (${team2.length})`
  );

  return {
    team1,
    team2,
    allAssigned,
  };
}

/**
 * Persists player team assignments to MySQL via Prisma $transaction (US-11).
 */
export async function persistTeamAssignments(
  prisma: PrismaClient,
  assignments: { id: string; team: TeamId }[]
): Promise<void> {
  if (assignments.length === 0) return;

  await prisma.$transaction(
    assignments.map((a) =>
      prisma.player.update({
        where: { id: a.id },
        data: {
          team: a.team as Team,
        },
      })
    )
  );

  logger.info(`[TEAM:PERSIST] Updated ${assignments.length} player team assignments in database`);
}

