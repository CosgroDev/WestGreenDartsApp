select id, throw_index, score, darts, remaining_after, is_checkout, is_deleted
from scoring_events
where game_id = ''
order by throw_index;
