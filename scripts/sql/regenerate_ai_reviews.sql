-- One-off: clear stored AI reviews so they regenerate with the current prompts.
--
-- NOT a migration — run it by hand in the Supabase SQL editor when you want
-- the old reviews redone. Match and fixture reviews are generated once and
-- cached, so after this the "Generate AI review" button reappears on each
-- match and fixture page and the next click writes a fresh review.
--
-- By default this only touches the current season. To clear every season,
-- remove the three `s.is_current` conditions (the last one is the whole
-- `where` line on the seasons update).

begin;

-- Match reviews (stored on a leg row of each match)
update games g
set ai_review = null,
    ai_review_at = null
from fixtures f
join seasons s on s.id = f.season_id
where g.fixture_id = f.id
  and s.is_current
  and g.ai_review is not null;

-- Fixture (team night) reviews
update fixtures f
set ai_team_review = null,
    ai_team_review_at = null
from seasons s
where s.id = f.season_id
  and s.is_current
  and f.ai_team_review is not null;

-- Season summary: keep the text (the new prompt reads it as "previousSummary"
-- so it reports what has changed) and just reset the fingerprint, which makes
-- the dashboard regenerate it on the next visit.
update seasons s
set ai_season_summary_fixtures = null
where s.is_current;

commit;
