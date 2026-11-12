import { describe, it, expect, beforeEach } from 'vitest';
import {
  MainGameScoreboardSession,
  getFaceOffContendersForRound,
  initMatchScoreboard,
  getMatchScoreboard,
  deleteMatchScoreboard,
  clearAllMatchScoreboards,
  SUDDEN_DEATH_FALLBACK_QUESTIONS,
} from '../src/services/mainGameScoreboardService';

describe('US-16: Main Game Scoreboard & Replay Service (mainGameScoreboardService)', () => {
  const roomCode = 'FEUD-9999';
  const gameId = 'game-12345';

  beforeEach(() => {
    clearAllMatchScoreboards();
  });

  describe('Session Initialization & Configuration', () => {
    it('initializes match with default 3 rounds and 0 cumulative grand totals', () => {
      const session = new MainGameScoreboardSession(roomCode, gameId);
      const state = session.getState();

      expect(state.roomCode).toBe('FEUD-9999');
      expect(state.gameId).toBe(gameId);
      expect(state.currentRoundNumber).toBe(1);
      expect(state.totalRounds).toBe(3);
      expect(state.team1GrandTotal).toBe(0);
      expect(state.team2GrandTotal).toBe(0);
      expect(state.activeRoundBank).toBe(0);
      expect(state.phase).toBe('ROUND_IN_PROGRESS');
      expect(state.roundWinners).toEqual([]);
      expect(state.matchWinner).toBeNull();
      expect(state.isSuddenDeath).toBe(false);
    });

    it('accepts custom total rounds and initial scores if provided', () => {
      const session = new MainGameScoreboardSession(roomCode, gameId, {
        totalRounds: 5,
        team1Initial: 50,
        team2Initial: 25,
      });
      const state = session.getState();

      expect(state.totalRounds).toBe(5);
      expect(state.team1GrandTotal).toBe(50);
      expect(state.team2GrandTotal).toBe(25);
    });
  });

  describe('Scenario 2: Round Bank vs Grand Total Distinction', () => {
    it('updates live round bank without modifying cumulative team grand totals', () => {
      const session = new MainGameScoreboardSession(roomCode, gameId, {
        team1Initial: 120,
        team2Initial: 75,
      });

      // Answer 1 revealed worth 35 pts
      session.updateActiveRoundBank(35);
      expect(session.activeRoundBank).toBe(35);
      expect(session.team1GrandTotal).toBe(120);
      expect(session.team2GrandTotal).toBe(75);

      // Answer 2 revealed worth 28 pts -> total bank = 63 pts
      session.updateActiveRoundBank(63);
      expect(session.activeRoundBank).toBe(63);
      expect(session.team1GrandTotal).toBe(120);
      expect(session.team2GrandTotal).toBe(75);
    });

    it('sanitizes negative values to 0 for round bank and points', () => {
      const session = new MainGameScoreboardSession(roomCode, gameId);
      session.updateActiveRoundBank(-20);
      expect(session.activeRoundBank).toBe(0);

      session.awardRoundPoints('TEAM_1', -50);
      expect(session.team1GrandTotal).toBe(0);
    });
  });

  describe('Scenario 3: Next Round Face-Off Contender Rotation', () => {
    const team1Players = [
      { id: 'p1', nickname: 'Alice', team: 'TEAM_1' as const, battingOrder: 1 },
      { id: 'p2', nickname: 'Bob', team: 'TEAM_1' as const, battingOrder: 2 },
    ];
    const team2Players = [
      { id: 'p3', nickname: 'Charlie', team: 'TEAM_2' as const, battingOrder: 1 },
      { id: 'p4', nickname: 'David', team: 'TEAM_2' as const, battingOrder: 2 },
    ];

    it('picks Player 1 (batting order 1) for Round 1', () => {
      const result = getFaceOffContendersForRound(1, team1Players, team2Players);
      expect(result.team1Contender.nickname).toBe('Alice');
      expect(result.team2Contender.nickname).toBe('Charlie');
      expect(result.t1Index).toBe(0);
      expect(result.t2Index).toBe(0);
    });

    it('advances buzzer contenders to Player 2 (batting order 2) for Round 2', () => {
      const result = getFaceOffContendersForRound(2, team1Players, team2Players);
      expect(result.team1Contender.nickname).toBe('Bob');
      expect(result.team2Contender.nickname).toBe('David');
      expect(result.t1Index).toBe(1);
      expect(result.t2Index).toBe(1);
    });

    it('cycles modulo team size back to Player 1 for Round 3 in 2-player teams', () => {
      const result = getFaceOffContendersForRound(3, team1Players, team2Players);
      expect(result.team1Contender.nickname).toBe('Alice');
      expect(result.team2Contender.nickname).toBe('Charlie');
      expect(result.t1Index).toBe(0);
      expect(result.t2Index).toBe(0);
    });

    it('throws error if team player roster is empty', () => {
      expect(() => getFaceOffContendersForRound(1, [], team2Players)).toThrow(
        /Team 1 players roster cannot be empty/i
      );
      expect(() => getFaceOffContendersForRound(1, team1Players, [])).toThrow(
        /Team 2 players roster cannot be empty/i
      );
    });
  });

  describe('Scenario 4: Multi-Round Progression & Final Winner Announcement', () => {
    it('progresses through 3 rounds and declares Team 1 champion when higher points', () => {
      const session = new MainGameScoreboardSession(roomCode, gameId, { totalRounds: 3 });

      // Round 1: Team 1 wins 65 pts
      session.updateActiveRoundBank(65);
      const stateR1 = session.awardRoundPoints('TEAM_1', 65, 'BOARD_CLEARED');
      expect(stateR1.team1GrandTotal).toBe(65);
      expect(stateR1.team2GrandTotal).toBe(0);
      expect(stateR1.activeRoundBank).toBe(0);
      expect(stateR1.phase).toBe('ROUND_RESOLVED');
      expect(stateR1.matchWinner).toBeNull();
      expect(stateR1.roundWinners).toHaveLength(1);

      // Advance to Round 2
      const advR2 = session.advanceToNextRound();
      expect(advR2.nextRoundNumber).toBe(2);
      expect(advR2.isSuddenDeath).toBe(false);
      expect(session.phase).toBe('ROUND_IN_PROGRESS');

      // Round 2: Team 2 wins 80 pts
      session.updateActiveRoundBank(80);
      const stateR2 = session.awardRoundPoints('TEAM_2', 80, 'STEAL_SUCCESS');
      expect(stateR2.team1GrandTotal).toBe(65);
      expect(stateR2.team2GrandTotal).toBe(80);
      expect(stateR2.phase).toBe('ROUND_RESOLVED');

      // Advance to Round 3
      const advR3 = session.advanceToNextRound();
      expect(advR3.nextRoundNumber).toBe(3);

      // Round 3: Team 1 wins 180 pts (65 + 180 = 245 vs 80)
      session.updateActiveRoundBank(180);
      const stateR3 = session.awardRoundPoints('TEAM_1', 180, 'STEAL_SUCCESS');
      expect(stateR3.team1GrandTotal).toBe(245);
      expect(stateR3.team2GrandTotal).toBe(80);
      expect(stateR3.phase).toBe('MATCH_OVER');
      expect(stateR3.matchWinner).toBe('TEAM_1');
    });

    it('declares Team 2 champion when Team 2 finishes with higher points', () => {
      const session = new MainGameScoreboardSession(roomCode, gameId, { totalRounds: 1 });
      session.awardRoundPoints('TEAM_2', 95, 'BOARD_CLEARED');

      const state = session.getState();
      expect(state.phase).toBe('MATCH_OVER');
      expect(state.matchWinner).toBe('TEAM_2');
      expect(state.team2GrandTotal).toBe(95);
    });

    it('throws error when trying to advance round after match is over', () => {
      const session = new MainGameScoreboardSession(roomCode, gameId, { totalRounds: 1 });
      session.awardRoundPoints('TEAM_1', 100);
      expect(session.phase).toBe('MATCH_OVER');

      expect(() => session.advanceToNextRound()).toThrow(
        /Cannot advance round: match has already concluded/i
      );
    });
  });

  describe('Scenario 6: Sudden Death Tie-Breaker Resolution', () => {
    it('triggers Sudden Death round when all standard rounds conclude with an exact tie', () => {
      const session = new MainGameScoreboardSession(roomCode, gameId, { totalRounds: 2 });

      // Round 1: Team 1 wins 100 pts
      session.awardRoundPoints('TEAM_1', 100);
      expect(session.phase).toBe('ROUND_RESOLVED');
      session.advanceToNextRound();

      // Round 2: Team 2 wins 100 pts -> Tie at 100 - 100!
      session.awardRoundPoints('TEAM_2', 100);
      expect(session.phase).toBe('SUDDEN_DEATH');
      expect(session.isSuddenDeath).toBe(true);
      expect(session.matchWinner).toBeNull();

      // Advance to Sudden Death round
      const advSD = session.advanceToNextRound();
      expect(advSD.nextRoundNumber).toBe(3);
      expect(advSD.isSuddenDeath).toBe(true);
      expect(session.phase).toBe('SUDDEN_DEATH');

      // Sudden Death round won by Team 2
      const finalState = session.awardRoundPoints('TEAM_2', 100, 'SUDDEN_DEATH_WIN');
      expect(finalState.phase).toBe('MATCH_OVER');
      expect(finalState.matchWinner).toBe('TEAM_2');
      expect(finalState.suddenDeathWinner).toBe('TEAM_2');
      expect(finalState.team2GrandTotal).toBe(200);
    });

    it('has fallback single-answer sudden death questions for all supported languages', () => {
      expect(SUDDEN_DEATH_FALLBACK_QUESTIONS.EN.answerText).toBe('Towel');
      expect(SUDDEN_DEATH_FALLBACK_QUESTIONS.FR.answerText).toBe('Serviette');
      expect(SUDDEN_DEATH_FALLBACK_QUESTIONS.ES.answerText).toBe('Toalla');
    });
  });

  describe('Scenario 5: Replay Preserves Room & Resetting Match', () => {
    it('resets scores, round number, and winners for a new match with fresh gameId', () => {
      const session = new MainGameScoreboardSession(roomCode, gameId, { totalRounds: 1 });
      session.awardRoundPoints('TEAM_1', 150);
      expect(session.phase).toBe('MATCH_OVER');

      // Replay
      const resetState = session.resetForReplay('new-game-67890', { totalRounds: 3 });

      expect(resetState.gameId).toBe('new-game-67890');
      expect(resetState.currentRoundNumber).toBe(1);
      expect(resetState.totalRounds).toBe(3);
      expect(resetState.team1GrandTotal).toBe(0);
      expect(resetState.team2GrandTotal).toBe(0);
      expect(resetState.activeRoundBank).toBe(0);
      expect(resetState.phase).toBe('ROUND_IN_PROGRESS');
      expect(resetState.roundWinners).toEqual([]);
      expect(resetState.matchWinner).toBeNull();
      expect(resetState.isSuddenDeath).toBe(false);
      expect(resetState.suddenDeathWinner).toBeNull();
    });
    it('allows every player in team to do a face-off when total rounds equals team size (e.g. 5 rounds for 5 players)', () => {
      const team1 = [
        { id: 't1-p1', nickname: 'Alice', team: 'TEAM_1' as const, battingOrder: 1 },
        { id: 't1-p2', nickname: 'Bob', team: 'TEAM_1' as const, battingOrder: 2 },
        { id: 't1-p3', nickname: 'Charlie', team: 'TEAM_1' as const, battingOrder: 3 },
        { id: 't1-p4', nickname: 'David', team: 'TEAM_1' as const, battingOrder: 4 },
        { id: 't1-p5', nickname: 'Eve', team: 'TEAM_1' as const, battingOrder: 5 },
      ];
      const team2 = [
        { id: 't2-p1', nickname: 'Frank', team: 'TEAM_2' as const, battingOrder: 1 },
        { id: 't2-p2', nickname: 'Grace', team: 'TEAM_2' as const, battingOrder: 2 },
        { id: 't2-p3', nickname: 'Heidi', team: 'TEAM_2' as const, battingOrder: 3 },
        { id: 't2-p4', nickname: 'Ivan', team: 'TEAM_2' as const, battingOrder: 4 },
        { id: 't2-p5', nickname: 'Judy', team: 'TEAM_2' as const, battingOrder: 5 },
      ];

      const session = new MainGameScoreboardSession(roomCode, gameId, { totalRounds: 5 });
      expect(session.totalRounds).toBe(5);

      for (let round = 1; round <= 5; round++) {
        const rotation = getFaceOffContendersForRound(round, team1, team2);
        expect(rotation.team1Contender.battingOrder).toBe(round);
        expect(rotation.team2Contender.battingOrder).toBe(round);
        expect(rotation.team1Contender.id).toBe(`t1-p${round}`);
        expect(rotation.team2Contender.id).toBe(`t2-p${round}`);

        session.awardRoundPoints(round % 2 === 0 ? 'TEAM_2' : 'TEAM_1', 50);

        if (round < 5) {
          expect(session.phase).toBe('ROUND_RESOLVED');
          session.advanceToNextRound();
          expect(session.phase).toBe('ROUND_IN_PROGRESS');
          expect(session.currentRoundNumber).toBe(round + 1);
        } else {
          // At round 5, all 5 players have faced off and match finishes
          expect(session.phase).toBe('MATCH_OVER');
          expect(session.matchWinner).toBe('TEAM_1');
        }
      }
    });
  });

  describe('Registry & Lifecycle Management', () => {
    it('manages active sessions in memory via registry functions', () => {
      const created = initMatchScoreboard('feud-1111', 'g1');
      expect(created.roomCode).toBe('FEUD-1111');

      const fetched = getMatchScoreboard('FEUD-1111');
      expect(fetched).toBe(created);

      const deleted = deleteMatchScoreboard('FEUD-1111');
      expect(deleted).toBe(true);
      expect(getMatchScoreboard('FEUD-1111')).toBeUndefined();
    });
  });
});

