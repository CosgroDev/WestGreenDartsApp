-- Store the AI season-to-date summary against the season so it is generated
-- once per completed fixture and read back the rest of the time. The summary
-- analyses the whole season so far; `ai_season_summary_fixtures` records how
-- many completed fixtures it covered so the dashboard knows when it is stale
-- (a new fixture has completed) and should regenerate.
alter table seasons add column if not exists ai_season_summary text;
alter table seasons add column if not exists ai_season_summary_at timestamptz;
alter table seasons add column if not exists ai_season_summary_fixtures int;
