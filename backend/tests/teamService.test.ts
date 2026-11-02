import { describe, it, expect, vi } from 'vitest';
import {
  validateTeamCount,
  fisherYatesShuffle,
  partitionTeams,
  persistTeamAssignments,
} from '../src/services/teamService';
import { PrismaClient } from '@prisma/client';

describe('US-11: Main Game Team Partitioning Service (teamService)', () => {
  describe('validateTeamCount', () => {
    it('rejects player counts fewer than 2', () => {
      const res0 = validateTeamCount(0);
      expect(res0.isValid).toBe(false);
      expect(res0.error).toContain('At least 2 players required');
      expect(res0.neededToEven).toBe(2);

      const res1 = validateTeamCount(1);
      expect(res1.isValid).toBe(false);
      expect(res1.error).toContain('At least 2 players required');
      expect(res1.neededToEven).toBe(1);
    });

    it('satisfies Scenario 2: rejects odd player counts and computes neededToEven', () => {
      const res3 = validateTeamCount(3);
      expect(res3.isValid).toBe(false);
      expect(res3.error).toBe(
        'Cannot start with an odd number of players (3). Connect 1 more player to reach 4.'
      );
      expect(res3.neededToEven).toBe(1);

      const res5 = validateTeamCount(5);
      expect(res5.isValid).toBe(false);
      expect(res5.error).toBe(
        'Cannot start with an odd number of players (5). Connect 1 more player to reach 6.'
      );
      expect(res5.neededToEven).toBe(1);

      const res7 = validateTeamCount(7);
      expect(res7.isValid).toBe(false);
      expect(res7.error).toContain('(7)');

      const res9 = validateTeamCount(9);
      expect(res9.isValid).toBe(false);
      expect(res9.error).toContain('(9)');
    });

    it('rejects player counts greater than 10', () => {
      const res11 = validateTeamCount(11);
      expect(res11.isValid).toBe(false);
      expect(res11.error).toBe('Maximum 10 players allowed');

      const res12 = validateTeamCount(12);
      expect(res12.isValid).toBe(false);
      expect(res12.error).toBe('Maximum 10 players allowed');
    });

    it('accepts even player counts between 2 and 10 inclusive', () => {
      [2, 4, 6, 8, 10].forEach((count) => {
        const res = validateTeamCount(count);
        expect(res.isValid).toBe(true);
        expect(res.error).toBeUndefined();
        expect(res.count).toBe(count);
      });
    });
  });

  describe('fisherYatesShuffle', () => {
    it('returns empty array when input is empty', () => {
      expect(fisherYatesShuffle([])).toEqual([]);
    });

    it('preserves all items without loss or duplication', () => {
      const original = [1, 2, 3, 4, 5, 6];
      const shuffled = fisherYatesShuffle(original);
      expect(shuffled).toHaveLength(original.length);
      expect([...shuffled].sort()).toEqual(original);
    });

    it('produces deterministic permutations with seeded random function', () => {
      const players = ['A', 'B', 'C', 'D'];
      // Fixed sequence: always picks first available element (j = 0)
      const deterministicRandom = () => 0;
      const result = fisherYatesShuffle(players, deterministicRandom);
      expect(result).toHaveLength(4);
      expect(result).not.toBe(players); // Must be a new array copy
    });
  });

  describe('partitionTeams', () => {
    const mockPlayers4 = [
      { id: 'p1', nickname: 'Alex' },
      { id: 'p2', nickname: 'Sarah' },
      { id: 'p3', nickname: 'David' },
      { id: 'p4', nickname: 'Emma' },
    ];

    it('satisfies Scenario 1: partitions 4 players into 2 players in Team 1 and 2 in Team 2', () => {
      // Deterministic reverse order shuffle simulation
      const reversedRandom = (i: number) => 0;
      const result = partitionTeams(mockPlayers4);

      expect(result.team1).toHaveLength(2);
      expect(result.team2).toHaveLength(2);
      expect(result.allAssigned).toHaveLength(4);

      // Verify Team 1 assignments
      result.team1.forEach((player, idx) => {
        expect(player.team).toBe('TEAM_1');
        expect(player.battingOrder).toBe(idx + 1);
        expect(player.id).toBeDefined();
        expect(player.nickname).toBeDefined();
      });

      // Verify Team 2 assignments
      result.team2.forEach((player, idx) => {
        expect(player.team).toBe('TEAM_2');
        expect(player.battingOrder).toBe(idx + 1);
        expect(player.id).toBeDefined();
        expect(player.nickname).toBeDefined();
      });

      // Verify no player is placed on both teams
      const team1Ids = new Set(result.team1.map((p) => p.id));
      const team2Ids = new Set(result.team2.map((p) => p.id));
      for (const id of team1Ids) {
        expect(team2Ids.has(id)).toBe(false);
      }
    });

    it('partitions 2 players into 1 player per team', () => {
      const players2 = [
        { id: 'p1', nickname: 'Alice' },
        { id: 'p2', nickname: 'Bob' },
      ];
      const result = partitionTeams(players2);

      expect(result.team1).toHaveLength(1);
      expect(result.team2).toHaveLength(1);
      expect(result.team1[0].team).toBe('TEAM_1');
      expect(result.team1[0].battingOrder).toBe(1);
      expect(result.team2[0].team).toBe('TEAM_2');
      expect(result.team2[0].battingOrder).toBe(1);
    });

    it('partitions 6 players into 3 players per team with batting orders 1, 2, 3', () => {
      const players6 = Array.from({ length: 6 }, (_, i) => ({
        id: `p${i + 1}`,
        nickname: `Player ${i + 1}`,
      }));
      const result = partitionTeams(players6);

      expect(result.team1).toHaveLength(3);
      expect(result.team2).toHaveLength(3);
      expect(result.team1.map((p) => p.battingOrder)).toEqual([1, 2, 3]);
      expect(result.team2.map((p) => p.battingOrder)).toEqual([1, 2, 3]);
    });

    it('partitions 8 players into 4 players per team', () => {
      const players8 = Array.from({ length: 8 }, (_, i) => ({
        id: `p${i + 1}`,
        nickname: `Player ${i + 1}`,
      }));
      const result = partitionTeams(players8);

      expect(result.team1).toHaveLength(4);
      expect(result.team2).toHaveLength(4);
    });

    it('partitions 10 players (maximum capacity) into 5 players per team', () => {
      const players10 = Array.from({ length: 10 }, (_, i) => ({
        id: `p${i + 1}`,
        nickname: `Player ${i + 1}`,
      }));
      const result = partitionTeams(players10);

      expect(result.team1).toHaveLength(5);
      expect(result.team2).toHaveLength(5);
    });

    it('throws error when player count is odd (5 players)', () => {
      const players5 = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i + 1}`,
        nickname: `Player ${i + 1}`,
      }));

      expect(() => partitionTeams(players5)).toThrowError(
        'Cannot start with an odd number of players (5). Connect 1 more player to reach 6.'
      );
    });

    it('throws error when player count is less than 2', () => {
      expect(() => partitionTeams([{ id: 'p1', nickname: 'Solo' }])).toThrowError(
        'At least 2 players required'
      );
    });

    it('throws error when player count is greater than 10', () => {
      const players12 = Array.from({ length: 12 }, (_, i) => ({
        id: `p${i + 1}`,
        nickname: `Player ${i + 1}`,
      }));
      expect(() => partitionTeams(players12)).toThrowError('Maximum 10 players allowed');
    });

    it('demonstrates non-deterministic random distribution across multiple runs', () => {
      const players = [
        { id: 'p1', nickname: 'P1' },
        { id: 'p2', nickname: 'P2' },
        { id: 'p3', nickname: 'P3' },
        { id: 'p4', nickname: 'P4' },
      ];

      const p1Teams = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const res = partitionTeams(players);
        const p1 = res.allAssigned.find((p) => p.id === 'p1');
        if (p1) p1Teams.add(p1.team);
      }

      // Over 50 random runs, player 1 should be on both TEAM_1 and TEAM_2
      expect(p1Teams.has('TEAM_1')).toBe(true);
      expect(p1Teams.has('TEAM_2')).toBe(true);
    });
  });

  describe('persistTeamAssignments', () => {
    it('executes prisma transaction with updates for each player', async () => {
      const mockUpdate = vi.fn().mockImplementation((args) => args);
      const mockTransaction = vi.fn().mockResolvedValue([{}, {}]);

      const mockPrisma = {
        player: {
          update: mockUpdate,
        },
        $transaction: mockTransaction,
      } as unknown as PrismaClient;

      const assignments = [
        { id: 'p1', team: 'TEAM_1' as const },
        { id: 'p2', team: 'TEAM_2' as const },
      ];

      await persistTeamAssignments(mockPrisma, assignments);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockUpdate).toHaveBeenNthCalledWith(1, {
        where: { id: 'p1' },
        data: { team: 'TEAM_1' },
      });
      expect(mockUpdate).toHaveBeenNthCalledWith(2, {
        where: { id: 'p2' },
        data: { team: 'TEAM_2' },
      });
    });

    it('does nothing when assignments list is empty', async () => {
      const mockTransaction = vi.fn();
      const mockPrisma = {
        $transaction: mockTransaction,
      } as unknown as PrismaClient;

      await persistTeamAssignments(mockPrisma, []);
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });
});

