-- Store the AI team performance review for a fixture so it only runs once.
-- The review is the night's summary; once generated it is read back rather
-- than regenerated.
alter table fixtures add column if not exists ai_team_review text;
alter table fixtures add column if not exists ai_team_review_at timestamptz;
