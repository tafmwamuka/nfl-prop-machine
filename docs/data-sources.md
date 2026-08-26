# NFL Prop Machine Data Sources

The research engine is designed to use the official **nflverse** `stats_player` release for player-level historical statistics and the corresponding NFLverse schedule release for slate construction. The current `stats_player` release exposes season-specific, compressed CSV and Parquet files such as `stats_player_post_2025.csv.gz`, which are suitable for lightweight server-side ingestion. NFLverse describes these player summaries as data created through `nflfastR::calculate_stats()`.

NFLverse states that player and team statistic releases are refreshed on the same nightly game-day schedule as its play-by-play data, while schedule data is refreshed every five minutes during the season. The application keeps a clear provenance boundary: NFLverse supports historical opportunity and defensive-vulnerability calculations, while sportsbook lines require a separately configured licensed odds source before a recommendation board can be populated.

| Source | Role in the application | Update profile |
|---|---|---|
| `stats_player` | Player history, opportunity, position, and defensive-allowed rollups | Nightly during the season |
| NFLverse schedules | Slate, week, and opponent context | Approximately every five minutes during the season |
| Licensed sportsbook provider | Current player-prop lines and prices | Provider dependent; requires credentials |

## References

[1] [nflverse-data repository](https://github.com/nflverse/nflverse-data)

[2] [NFLverse data availability schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)

[3] [NFLverse Player Summary Stats release](https://github.com/nflverse/nflverse-data/releases/tag/stats_player)
