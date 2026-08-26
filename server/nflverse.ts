import { gunzipSync } from "node:zlib";
import { calculateMismatch, recommendationExplanation } from "../shared/propEngine";

export const MARKET_CONFIG = {
  rush_yards: { stat: "rushing_yards", opportunity: "carries", positions: ["RB"], label: "Rushing yards" },
  rec_yards: { stat: "receiving_yards", opportunity: "targets", positions: ["WR", "TE", "RB"], label: "Receiving yards" },
  targets: { stat: "targets", opportunity: "targets", positions: ["WR", "TE", "RB"], label: "Targets" },
  rush_attempts: { stat: "carries", opportunity: "carries", positions: ["RB"], label: "Rushing attempts" },
  pass_attempts: { stat: "attempts", opportunity: "attempts", positions: ["QB"], label: "Pass attempts" },
} as const;

export type SupportedMarket = keyof typeof MARKET_CONFIG;

export type WeeklyStat = {
  player_id: string;
  player_name: string;
  position: string;
  season: number;
  week: number;
  season_type: string;
  team: string;
  opponent_team: string;
  carries: number;
  rushing_yards: number;
  targets: number;
  receiving_yards: number;
  attempts: number;
};

export type ScheduleGame = {
  season: number;
  game_type: string;
  week: number;
  gameday: string;
  away_team: string;
  home_team: string;
};

export type ComputedProp = {
  playerId: string;
  playerName: string;
  team: string;
  opponent: string;
  position: string;
  opportunityValue: number;
  opportunityPercentile: number;
  vulnerabilityValue: number;
  vulnerabilityPercentile: number;
  mismatchIndex: number;
  projection: number;
  edge: number;
  hitRate: number;
  matchupRank: number;
  confidence: number;
  dataQuality: "complete" | "insufficient_history" | "missing_matchup";
  explanation: string;
  recentGameLogs: Array<{ week: number; value: number; opponent: string }>;
};

function parseNumber(value: string | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(current);
      current = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(current);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      current = "";
    } else {
      current += character;
    }
  }
  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }
  return rows;
}

async function downloadText(url: string, compressed = false) {
  const response = await fetch(url, { headers: { "user-agent": "NFL-Prop-Machine/1.0" } });
  if (!response.ok) throw new Error(`NFLverse request failed: ${response.status} ${response.statusText}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return compressed ? gunzipSync(buffer).toString("utf-8") : buffer.toString("utf-8");
}

export async function loadWeeklyStats(season: number): Promise<WeeklyStat[]> {
  const source = `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv.gz`;
  const rows = parseCsv(await downloadText(source, true));
  const header = rows.shift();
  if (!header) return [];
  const fields = new Map(header.map((value, index) => [value, index]));
  const get = (record: string[], key: string) => record[fields.get(key) ?? -1] ?? "";

  return rows.map((record) => ({
    player_id: get(record, "player_id"),
    player_name: get(record, "player_display_name") || get(record, "player_name"),
    position: get(record, "position"),
    season: parseNumber(get(record, "season")),
    week: parseNumber(get(record, "week")),
    season_type: get(record, "season_type"),
    team: get(record, "team"),
    opponent_team: get(record, "opponent_team"),
    carries: parseNumber(get(record, "carries")),
    rushing_yards: parseNumber(get(record, "rushing_yards")),
    targets: parseNumber(get(record, "targets")),
    receiving_yards: parseNumber(get(record, "receiving_yards")),
    attempts: parseNumber(get(record, "attempts")),
  }));
}

export async function loadSchedule(season: number): Promise<ScheduleGame[]> {
  const rows = parseCsv(await downloadText("https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv"));
  const header = rows.shift();
  if (!header) return [];
  const fields = new Map(header.map((value, index) => [value, index]));
  const get = (record: string[], key: string) => record[fields.get(key) ?? -1] ?? "";
  return rows
    .map((record) => ({
      season: parseNumber(get(record, "season")),
      game_type: get(record, "game_type"),
      week: parseNumber(get(record, "week")),
      gameday: get(record, "gameday"),
      away_team: get(record, "away_team"),
      home_team: get(record, "home_team"),
    }))
    .filter((game) => game.season === season && game.game_type === "REG");
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function percentile(value: number, values: number[]) {
  if (!values.length) return 0;
  return (values.filter((candidate) => candidate <= value).length / values.length) * 100;
}

function positionKey(position: string, key: string) {
  return `${position}::${key}`;
}

export function buildMismatchBoard({
  weekly,
  schedule,
  season,
  targetWeek,
  market,
  lines,
  lookbackWeeks = 6,
}: {
  weekly: WeeklyStat[];
  schedule: ScheduleGame[];
  season: number;
  targetWeek: number;
  market: SupportedMarket;
  lines: Array<{ playerId: string; line: number }>;
  lookbackWeeks?: number;
}): ComputedProp[] {
  const config = MARKET_CONFIG[market];
  const lineByPlayer = new Map(lines.map((line) => [line.playerId, line.line]));
  const startWeek = Math.max(1, targetWeek - lookbackWeeks);
  const priorRows = weekly.filter((row) => row.season === season
    && row.season_type === "REG"
    && row.week >= startWeek
    && row.week < targetWeek
    && config.positions.includes(row.position as never));
  const targetGames = schedule.filter((game) => game.week === targetWeek);
  if (!targetGames.length) throw new Error(`No regular-season games were found for week ${targetWeek}.`);
  if (!priorRows.length) throw new Error(`No historical player records were found before week ${targetWeek}.`);

  const opponentByTeam = new Map<string, string>();
  targetGames.forEach((game) => {
    opponentByTeam.set(game.home_team, game.away_team);
    opponentByTeam.set(game.away_team, game.home_team);
  });

  const playerRows = new Map<string, WeeklyStat[]>();
  priorRows.forEach((row) => {
    if (!playerRows.has(row.player_id)) playerRows.set(row.player_id, []);
    playerRows.get(row.player_id)?.push(row);
  });

  const opportunityRows = Array.from(playerRows.entries()).map(([playerId, records]) => {
    const latest = records.slice().sort((a, b) => b.week - a.week)[0];
    const opportunityValue = average(records.map((record) => record[config.opportunity]));
    const history = records.slice().sort((a, b) => a.week - b.week).map((record) => record[config.stat]);
    return { playerId, latest, records, opportunityValue, history };
  }).filter((row) => lineByPlayer.has(row.playerId));

  const opportunitiesByPosition = new Map<string, number[]>();
  opportunityRows.forEach((row) => {
    const key = row.latest.position;
    opportunitiesByPosition.set(key, [...(opportunitiesByPosition.get(key) ?? []), row.opportunityValue]);
  });

  const allowedByDefensePosition = new Map<string, Map<number, number>>();
  priorRows.forEach((row) => {
    const key = positionKey(row.position, row.opponent_team);
    const games = allowedByDefensePosition.get(key) ?? new Map<number, number>();
    games.set(row.week, (games.get(row.week) ?? 0) + row[config.stat]);
    allowedByDefensePosition.set(key, games);
  });

  const actualTeamGames = schedule.filter((game) => game.week >= startWeek && game.week < targetWeek);
  const defenseRows: Array<{ defense: string; position: string; allowedValue: number; gameCount: number }> = [];
  const distinctDefenses = new Set<string>();
  actualTeamGames.forEach((game) => { distinctDefenses.add(game.home_team); distinctDefenses.add(game.away_team); });
  Array.from(distinctDefenses).forEach((defense) => {
    config.positions.forEach((position) => {
      const games = allowedByDefensePosition.get(positionKey(position, defense)) ?? new Map<number, number>();
      const actualWeeks = actualTeamGames
        .filter((game) => game.home_team === defense || game.away_team === defense)
        .map((game) => game.week);
      const values = actualWeeks.map((week) => games.get(week) ?? 0);
      defenseRows.push({ defense, position, allowedValue: average(values), gameCount: values.length });
    });
  });

  const vulnerabilitiesByPosition = new Map<string, number[]>();
  defenseRows.forEach((row) => {
    vulnerabilitiesByPosition.set(row.position, [...(vulnerabilitiesByPosition.get(row.position) ?? []), row.allowedValue]);
  });

  const board = opportunityRows.map((player) => {
    const opponent = opponentByTeam.get(player.latest.team) ?? "";
    const defense = defenseRows.find((row) => row.defense === opponent && row.position === player.latest.position);
    const opportunityPercentile = percentile(player.opportunityValue, opportunitiesByPosition.get(player.latest.position) ?? []);
    const vulnerabilityPercentile = defense
      ? percentile(defense.allowedValue, vulnerabilitiesByPosition.get(player.latest.position) ?? [])
      : 0;
    const line = lineByPlayer.get(player.playerId) ?? 0;
    const output = calculateMismatch({
      opportunityPercentile,
      vulnerabilityPercentile,
      playerHistory: player.history,
      bookLine: line,
      opportunityGames: player.records.length,
      defenseGames: defense?.gameCount ?? 0,
      lookbackWeeks,
    });
    const dataQuality = opponent && defense ? output.dataQuality : "missing_matchup";
    return {
      playerId: player.playerId,
      playerName: player.latest.player_name,
      team: player.latest.team,
      opponent,
      position: player.latest.position,
      opportunityValue: player.opportunityValue,
      opportunityPercentile,
      vulnerabilityValue: defense?.allowedValue ?? 0,
      vulnerabilityPercentile,
      mismatchIndex: output.mismatchIndex,
      projection: output.projection,
      edge: output.projection - line,
      hitRate: output.hitRate,
      matchupRank: 0,
      confidence: dataQuality === "complete" ? output.confidence : Math.min(output.confidence, 40),
      dataQuality,
      explanation: recommendationExplanation({
        playerName: player.latest.player_name,
        marketLabel: config.label.toLowerCase(),
        opportunityPercentile,
        vulnerabilityPercentile,
        lineDelta: output.lineDelta,
        opportunityValue: player.opportunityValue,
        allowedValue: defense?.allowedValue ?? 0,
      }),
      recentGameLogs: player.records.slice().sort((a, b) => a.week - b.week).map((record) => ({
        week: record.week,
        value: record[config.stat],
        opponent: record.opponent_team,
      })),
    };
  }).sort((a, b) => b.mismatchIndex - a.mismatchIndex);

  return board.map((row, index) => ({ ...row, matchupRank: index + 1 }));
}
