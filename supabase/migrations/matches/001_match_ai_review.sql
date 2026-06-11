-- Store the AI performance review for a match so it only runs once.
-- The review is keyed on the match's representative game (leg) and is read
-- back rather than regenerated, since a completed match never changes.
alter table games add column if not exists ai_review text;
alter table games add column if not exists ai_review_at timestamptz;
