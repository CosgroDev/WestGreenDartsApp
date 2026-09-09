alter table seasons add column if not exists ai_season_summary text;
alter table seasons add column if not exists ai_season_summary_at timestamptz;
alter table seasons add column if not exists ai_season_summary_fixtures int;;
