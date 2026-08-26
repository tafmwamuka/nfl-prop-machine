import { decimal, index, int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const slates = mysqlTable("nfl_slates", {
  id: int("id").autoincrement().primaryKey(),
  season: int("season").notNull(),
  week: int("week").notNull(),
  label: varchar("label", { length: 80 }).notNull(),
  startsAt: timestamp("startsAt").notNull(),
  gameCount: int("gameCount").notNull().default(0),
  status: varchar("status", { length: 32 }).notNull().default("upcoming"),
  source: varchar("source", { length: 80 }).notNull().default("nflverse"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [uniqueIndex("slate_season_week_unique").on(table.season, table.week)]);

export const playerProps = mysqlTable("player_props", {
  id: int("id").autoincrement().primaryKey(),
  slateId: int("slateId").notNull(),
  playerId: varchar("playerId", { length: 100 }).notNull(),
  playerName: varchar("playerName", { length: 120 }).notNull(),
  team: varchar("team", { length: 8 }).notNull(),
  opponent: varchar("opponent", { length: 8 }).notNull(),
  position: varchar("position", { length: 8 }).notNull(),
  market: varchar("market", { length: 40 }).notNull(),
  line: decimal("line", { precision: 8, scale: 2 }).notNull(),
  americanOdds: int("americanOdds").notNull().default(-110),
  source: varchar("source", { length: 80 }).notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("props_slate_idx").on(table.slateId),
  index("props_team_idx").on(table.team),
  uniqueIndex("prop_record_unique").on(table.slateId, table.playerId, table.market, table.line),
]);

export const propMetrics = mysqlTable("prop_metrics", {
  id: int("id").autoincrement().primaryKey(),
  propId: int("propId").notNull(),
  lookbackWeeks: int("lookbackWeeks").notNull().default(6),
  opportunityValue: decimal("opportunityValue", { precision: 8, scale: 2 }).notNull(),
  opportunityPercentile: decimal("opportunityPercentile", { precision: 6, scale: 2 }).notNull(),
  vulnerabilityValue: decimal("vulnerabilityValue", { precision: 8, scale: 2 }).notNull(),
  vulnerabilityPercentile: decimal("vulnerabilityPercentile", { precision: 6, scale: 2 }).notNull(),
  mismatchIndex: decimal("mismatchIndex", { precision: 7, scale: 2 }).notNull(),
  projection: decimal("projection", { precision: 8, scale: 2 }).notNull(),
  edge: decimal("edge", { precision: 8, scale: 2 }).notNull(),
  hitRate: decimal("hitRate", { precision: 6, scale: 2 }).notNull(),
  matchupRank: int("matchupRank").notNull(),
  confidence: int("confidence").notNull(),
  dataQuality: varchar("dataQuality", { length: 32 }).notNull().default("complete"),
  explanation: text("explanation").notNull(),
  recentGameLogs: json("recentGameLogs").$type<Array<{ week: number; value: number; opponent: string; date?: string }>>(),
  calculatedAt: timestamp("calculatedAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("metric_prop_unique").on(table.propId),
  index("metrics_rank_idx").on(table.matchupRank),
]);

export const watchlists = mysqlTable("watchlists", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  propId: int("propId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("watchlist_user_prop_unique").on(table.userId, table.propId),
  index("watchlist_user_idx").on(table.userId),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
