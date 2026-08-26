import { describe, expect, it } from "vitest";
import { calculateMismatchIndex, calculateMismatch, linePercentile } from "../shared/propEngine";
import { buildMismatchBoard, type ScheduleGame, type WeeklyStat } from "./nflverse";

describe("NFL prop matchup engine", () => {
  it("combines opportunity and vulnerability percentiles into the specified mismatch index", () => {
    expect(calculateMismatchIndex(82, 74)).toBe(56);
  });

  it("converts a book line into a player-history percentile", () => {
    expect(linePercentile([32, 49, 62, 78], 62)).toBe(50);
  });

  it("marks thin input samples as insufficient history", () => {
    const result = calculateMismatch({
      opportunityPercentile: 90,
      vulnerabilityPercentile: 80,
      playerHistory: [45, 56],
      bookLine: 50,
      opportunityGames: 2,
      defenseGames: 2,
      lookbackWeeks: 6,
    });

    expect(result.mismatchIndex).toBe(70);
    expect(result.lineDelta).toBeGreaterThan(0);
    expect(result.dataQuality).toBe("insufficient_history");
  });

  it("builds a target-week board from recent player opportunity and opponent vulnerability", () => {
    const weekly: WeeklyStat[] = [
      { player_id: "rb-1", player_name: "Lead Back", position: "RB", season: 2025, week: 1, season_type: "REG", team: "AAA", opponent_team: "BBB", carries: 20, rushing_yards: 90, targets: 2, receiving_yards: 8, attempts: 0 },
      { player_id: "rb-1", player_name: "Lead Back", position: "RB", season: 2025, week: 2, season_type: "REG", team: "AAA", opponent_team: "CCC", carries: 19, rushing_yards: 85, targets: 2, receiving_yards: 8, attempts: 0 },
      { player_id: "rb-1", player_name: "Lead Back", position: "RB", season: 2025, week: 3, season_type: "REG", team: "AAA", opponent_team: "DDD", carries: 18, rushing_yards: 88, targets: 3, receiving_yards: 13, attempts: 0 },
      { player_id: "rb-2", player_name: "Other Back", position: "RB", season: 2025, week: 1, season_type: "REG", team: "BBB", opponent_team: "AAA", carries: 10, rushing_yards: 35, targets: 0, receiving_yards: 0, attempts: 0 },
      { player_id: "rb-2", player_name: "Other Back", position: "RB", season: 2025, week: 2, season_type: "REG", team: "BBB", opponent_team: "CCC", carries: 8, rushing_yards: 28, targets: 0, receiving_yards: 0, attempts: 0 },
      { player_id: "rb-2", player_name: "Other Back", position: "RB", season: 2025, week: 3, season_type: "REG", team: "BBB", opponent_team: "DDD", carries: 11, rushing_yards: 30, targets: 0, receiving_yards: 0, attempts: 0 },
    ];
    const schedule: ScheduleGame[] = [
      { season: 2025, game_type: "REG", week: 1, gameday: "2025-09-01", away_team: "AAA", home_team: "BBB" },
      { season: 2025, game_type: "REG", week: 2, gameday: "2025-09-08", away_team: "AAA", home_team: "CCC" },
      { season: 2025, game_type: "REG", week: 3, gameday: "2025-09-15", away_team: "AAA", home_team: "DDD" },
      { season: 2025, game_type: "REG", week: 4, gameday: "2025-09-22", away_team: "AAA", home_team: "BBB" },
    ];
    const board = buildMismatchBoard({ weekly, schedule, season: 2025, targetWeek: 4, market: "rush_yards", lines: [{ playerId: "rb-1", line: 72.5 }] });
    expect(board).toHaveLength(1);
    expect(board[0]?.opponent).toBe("BBB");
    expect(board[0]?.matchupRank).toBe(1);
  });
});
