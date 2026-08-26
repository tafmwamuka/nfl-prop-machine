import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { propMetrics, playerProps, slates, watchlists } from "../../drizzle/schema";
import { getDb } from "../db";
import { buildMismatchBoard, loadSchedule, loadWeeklyStats, MARKET_CONFIG, type SupportedMarket } from "../nflverse";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { toggleWatchlistRecord } from "../watchlistService";

const boardInput = z.object({
  slateId: z.number().int().positive().optional(),
  market: z.string().min(1).optional(),
  team: z.string().min(1).optional(),
  position: z.string().min(1).optional(),
  sortBy: z.enum(["edge", "projection", "hitRate", "matchupRank", "confidence"]).default("edge"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const selectFields = {
  id: playerProps.id,
  slateId: playerProps.slateId,
  playerId: playerProps.playerId,
  playerName: playerProps.playerName,
  team: playerProps.team,
  opponent: playerProps.opponent,
  position: playerProps.position,
  market: playerProps.market,
  line: playerProps.line,
  americanOdds: playerProps.americanOdds,
  source: playerProps.source,
  slateLabel: slates.label,
  season: slates.season,
  week: slates.week,
  opportunityValue: propMetrics.opportunityValue,
  opportunityPercentile: propMetrics.opportunityPercentile,
  vulnerabilityValue: propMetrics.vulnerabilityValue,
  vulnerabilityPercentile: propMetrics.vulnerabilityPercentile,
  mismatchIndex: propMetrics.mismatchIndex,
  projection: propMetrics.projection,
  edge: propMetrics.edge,
  hitRate: propMetrics.hitRate,
  matchupRank: propMetrics.matchupRank,
  confidence: propMetrics.confidence,
  dataQuality: propMetrics.dataQuality,
  explanation: propMetrics.explanation,
  recentGameLogs: propMetrics.recentGameLogs,
  calculatedAt: propMetrics.calculatedAt,
};

export const researchRouter = router({
  status: publicProcedure.query(async () => ({
    oddsProviderConfigured: Boolean(process.env.ODDS_API_KEY),
    model: "Percentile Matchup Engine",
    dataSource: "NFLverse weekly player statistics and schedules",
  })),

  filters: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { slates: [], markets: [], teams: [], positions: [] };
    const [slateRows, propRows] = await Promise.all([
      db.select({ id: slates.id, label: slates.label, season: slates.season, week: slates.week, status: slates.status })
        .from(slates)
        .orderBy(desc(slates.startsAt)),
      db.select({ market: playerProps.market, team: playerProps.team, position: playerProps.position }).from(playerProps),
    ]);
    return {
      slates: slateRows,
      markets: Array.from(new Set(propRows.map((row) => row.market))).sort(),
      teams: Array.from(new Set(propRows.map((row) => row.team))).sort(),
      positions: Array.from(new Set(propRows.map((row) => row.position))).sort(),
    };
  }),

  syncSlates: protectedProcedure.input(z.object({ season: z.number().int().min(1999).max(2100) })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("The database is not available.");
    const schedule = await loadSchedule(input.season);
    const weeklyGames = new Map<number, { startsAt: Date; gameCount: number }>();
    schedule.forEach((game) => {
      const current = weeklyGames.get(game.week);
      const startsAt = new Date(`${game.gameday}T12:00:00.000Z`);
      weeklyGames.set(game.week, {
        startsAt: current && current.startsAt < startsAt ? current.startsAt : startsAt,
        gameCount: (current?.gameCount ?? 0) + 1,
      });
    });
    const records = Array.from(weeklyGames.entries()).map(([week, slate]) => ({
      season: input.season,
      week,
      label: `${input.season} · Week ${week}`,
      startsAt: slate.startsAt,
      gameCount: slate.gameCount,
      status: "upcoming",
      source: "nflverse",
    }));
    for (const record of records) {
      await db.insert(slates).values(record).onDuplicateKeyUpdate({
        set: { label: record.label, startsAt: record.startsAt, gameCount: record.gameCount, source: record.source },
      });
    }
    return { synced: records.length };
  }),

  board: publicProcedure.input(boardInput).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const conditions = [];
    if (input.slateId) conditions.push(eq(playerProps.slateId, input.slateId));
    if (input.market) conditions.push(eq(playerProps.market, input.market));
    if (input.team) conditions.push(eq(playerProps.team, input.team));
    if (input.position) conditions.push(eq(playerProps.position, input.position));
    const query = db.select(selectFields)
      .from(playerProps)
      .innerJoin(slates, eq(playerProps.slateId, slates.id))
      .leftJoin(propMetrics, eq(propMetrics.propId, playerProps.id));
    const rows = conditions.length ? await query.where(and(...conditions)) : await query;
    const multiplier = input.sortOrder === "asc" ? 1 : -1;
    return rows.sort((a, b) => (Number(a[input.sortBy] ?? 0) - Number(b[input.sortBy] ?? 0)) * multiplier);
  }),

  player: publicProcedure.input(z.object({ propId: z.number().int().positive() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db.select(selectFields)
      .from(playerProps)
      .innerJoin(slates, eq(playerProps.slateId, slates.id))
      .leftJoin(propMetrics, eq(propMetrics.propId, playerProps.id))
      .where(eq(playerProps.id, input.propId))
      .limit(1);
    return rows[0] ?? null;
  }),

  addProp: protectedProcedure.input(z.object({
    slateId: z.number().int().positive(),
    playerId: z.string().min(1).max(100),
    playerName: z.string().min(1).max(120),
    team: z.string().min(2).max(8),
    opponent: z.string().min(2).max(8),
    position: z.string().min(1).max(8),
    market: z.enum(["rush_yards", "rec_yards", "targets", "rush_attempts", "pass_attempts"]),
    line: z.number().positive(),
    americanOdds: z.number().int().default(-110),
    source: z.string().min(2).max(80),
  })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("The database is not available.");
    await db.insert(playerProps).values({
      ...input,
      line: input.line.toFixed(2),
      team: input.team.toUpperCase(),
      opponent: input.opponent.toUpperCase(),
      position: input.position.toUpperCase(),
    }).onDuplicateKeyUpdate({ set: { americanOdds: input.americanOdds, source: input.source, lastSeenAt: new Date() } });
    return { success: true };
  }),

  recalculateSlate: protectedProcedure.input(z.object({ slateId: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("The database is not available.");
    const slate = await db.select().from(slates).where(eq(slates.id, input.slateId)).limit(1);
    if (!slate[0]) throw new Error("Slate not found.");
    const props = await db.select().from(playerProps).where(eq(playerProps.slateId, input.slateId));
    if (!props.length) return { recalculated: 0, message: "Add sportsbook player-prop records before calculating this slate." };
    const [weekly, schedule] = await Promise.all([loadWeeklyStats(slate[0].season), loadSchedule(slate[0].season)]);
    let updated = 0;
    const markets = Array.from(new Set(props.map((prop) => prop.market)));
    for (const market of markets) {
      if (!(market in MARKET_CONFIG)) continue;
      const marketProps = props.filter((prop) => prop.market === market);
      const board = buildMismatchBoard({
        weekly,
        schedule,
        season: slate[0].season,
        targetWeek: slate[0].week,
        market: market as SupportedMarket,
        lines: marketProps.map((prop) => ({ playerId: prop.playerId, line: Number(prop.line) })),
      });
      for (const result of board) {
        const prop = marketProps.find((candidate) => candidate.playerId === result.playerId);
        if (!prop) continue;
        const values = {
          opportunityValue: result.opportunityValue.toFixed(2), opportunityPercentile: result.opportunityPercentile.toFixed(2),
          vulnerabilityValue: result.vulnerabilityValue.toFixed(2), vulnerabilityPercentile: result.vulnerabilityPercentile.toFixed(2),
          mismatchIndex: result.mismatchIndex.toFixed(2), projection: result.projection.toFixed(2), edge: result.edge.toFixed(2),
          hitRate: result.hitRate.toFixed(2), matchupRank: result.matchupRank, confidence: result.confidence,
          dataQuality: result.dataQuality, explanation: result.explanation, recentGameLogs: result.recentGameLogs, calculatedAt: new Date(),
        };
        await db.insert(propMetrics).values({ propId: prop.id, ...values }).onDuplicateKeyUpdate({ set: values });
        updated += 1;
      }
    }
    return { recalculated: updated, message: updated ? "Metrics updated from NFLverse historical data." : "No matching NFLverse player records were found for this slate." };
  }),

  watchlist: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db.select({ propId: watchlists.propId, savedAt: watchlists.createdAt })
      .from(watchlists)
      .where(eq(watchlists.userId, ctx.user.id));
  }),

  toggleWatchlist: protectedProcedure.input(z.object({ propId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("The database is not available.");
    return toggleWatchlistRecord({
      findExisting: async (userId, propId) => {
        const current = await db.select({ id: watchlists.id })
          .from(watchlists)
          .where(and(eq(watchlists.userId, userId), eq(watchlists.propId, propId)))
          .limit(1);
        return current[0]?.id;
      },
      remove: async (watchlistId) => { await db.delete(watchlists).where(eq(watchlists.id, watchlistId)); },
      save: async (userId, propId) => { await db.insert(watchlists).values({ userId, propId }); },
    }, ctx.user.id, input.propId);
  }),
});
