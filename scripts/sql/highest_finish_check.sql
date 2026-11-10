-- Highest finish using remaining_after
select max(501 - remaining_after) as highest_finish_from_remaining
from scoring_events
where game_id = '';

-- Highest finish using score on checkout rows
select max(score) as highest_finish_from_score
from scoring_events
where game_id = ''
  and (is_checkout = true or remaining_after = 0);

-- Show the checkout rows for inspection
select id, throw_index, score, darts, remaining_after, is_checkout, is_deleted
from scoring_events
where game_id = ''
order by throw_index;
