CREATE TABLE `player_props` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slateId` int NOT NULL,
	`playerId` varchar(100) NOT NULL,
	`playerName` varchar(120) NOT NULL,
	`team` varchar(8) NOT NULL,
	`opponent` varchar(8) NOT NULL,
	`position` varchar(8) NOT NULL,
	`market` varchar(40) NOT NULL,
	`line` decimal(8,2) NOT NULL,
	`americanOdds` int NOT NULL DEFAULT -110,
	`source` varchar(80) NOT NULL,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `player_props_id` PRIMARY KEY(`id`),
	CONSTRAINT `prop_record_unique` UNIQUE(`slateId`,`playerId`,`market`,`line`)
);
--> statement-breakpoint
CREATE TABLE `prop_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`propId` int NOT NULL,
	`lookbackWeeks` int NOT NULL DEFAULT 6,
	`opportunityValue` decimal(8,2) NOT NULL,
	`opportunityPercentile` decimal(6,2) NOT NULL,
	`vulnerabilityValue` decimal(8,2) NOT NULL,
	`vulnerabilityPercentile` decimal(6,2) NOT NULL,
	`mismatchIndex` decimal(7,2) NOT NULL,
	`projection` decimal(8,2) NOT NULL,
	`edge` decimal(8,2) NOT NULL,
	`hitRate` decimal(6,2) NOT NULL,
	`matchupRank` int NOT NULL,
	`confidence` int NOT NULL,
	`dataQuality` varchar(32) NOT NULL DEFAULT 'complete',
	`explanation` text NOT NULL,
	`recentGameLogs` json,
	`calculatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `prop_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `metric_prop_unique` UNIQUE(`propId`)
);
--> statement-breakpoint
CREATE TABLE `nfl_slates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` int NOT NULL,
	`week` int NOT NULL,
	`label` varchar(80) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`gameCount` int NOT NULL DEFAULT 0,
	`status` varchar(32) NOT NULL DEFAULT 'upcoming',
	`source` varchar(80) NOT NULL DEFAULT 'nflverse',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nfl_slates_id` PRIMARY KEY(`id`),
	CONSTRAINT `slate_season_week_unique` UNIQUE(`season`,`week`)
);
--> statement-breakpoint
CREATE TABLE `watchlists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`propId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watchlists_id` PRIMARY KEY(`id`),
	CONSTRAINT `watchlist_user_prop_unique` UNIQUE(`userId`,`propId`)
);
--> statement-breakpoint
CREATE INDEX `props_slate_idx` ON `player_props` (`slateId`);--> statement-breakpoint
CREATE INDEX `props_team_idx` ON `player_props` (`team`);--> statement-breakpoint
CREATE INDEX `metrics_rank_idx` ON `prop_metrics` (`matchupRank`);--> statement-breakpoint
CREATE INDEX `watchlist_user_idx` ON `watchlists` (`userId`);