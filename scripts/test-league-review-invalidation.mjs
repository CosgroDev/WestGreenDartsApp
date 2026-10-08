import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
process.on('uncaughtException', error => { console.error(error.message, error.detail ?? '', error.where ?? ''); process.exit(1); });

// Run only against an isolated database: no application credentials or network.
const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
for (const folder of readdirSync('supabase/migrations', { withFileTypes: true }).filter(f => f.isDirectory())) {
  for (const name of readdirSync(`supabase/migrations/${folder.name}`).sort().filter(f => f.endsWith('.sql'))) {
    await db.exec(readFileSync(`supabase/migrations/${folder.name}/${name}`, 'utf8'));
  }
}
for (const name of readdirSync('supabase/migrations').sort().filter(n => /^\d+.*\.sql$/.test(n) && n >= '20260908193204')) {
  await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
}
const team = randomUUID(), player = randomUUID(), season = randomUUID(), fixture = randomUUID();
await db.query('insert into teams(id,name) values($1,$2)', [team, 'Test team']);
await db.query('insert into players(id,team_id,name) values($1,$2,$3)', [player, team, 'West Green player']);
await db.query('insert into seasons(id,team_id,name) values($1,$2,$3)', [season, team, 'Test season']);
await db.query('insert into fixtures(id,team_id,season_id,starts_at,home,opponent) values($1,$2,$3,now(),true,$4)', [fixture, team, season, 'Visitors']);

const createGame = async () => {
  const id = randomUUID(), match = randomUUID();
  await db.query('insert into games(id,team_id,fixture_id,match_id,west_green_player_id,opponent_player,west_green_starts) values($1,$2,$3,$4,$5,$6,true)', [id, team, fixture, match, player, 'Visitor']);
  return id;
};
const command = async (game, revision, action, score = 0, request = randomUUID()) => {
  const result = await db.query('select wgd_score_command_state($1,$2,$3,$4,false,$5,$6,$7,3) result', [game, team, revision, request, action, 'west_green', score]);
  return result.rows[0].result;
};
const checkout = async game => {
  await command(game, 0, 'record', 180);
  await command(game, 1, 'record', 180);
  await command(game, 2, 'record', 141);
};
const seedReview = async () => {
  await db.query("update games set ai_review='Old match review',ai_review_at=now() where fixture_id=$1", [fixture]);
  await db.query("update fixtures set ai_team_review='Old fixture review',ai_team_review_at=now() where id=$1", [fixture]);
  await db.query("update seasons set ai_season_summary='Old season review' where id=$1", [season]);
};
const assertCleared = async game => {
  assert.deepEqual((await db.query('select ai_team_review,ai_team_review_at from fixtures where id=$1', [fixture])).rows[0], { ai_team_review: null, ai_team_review_at: null });
  assert.deepEqual((await db.query('select ai_review,ai_review_at from games where id=$1', [game])).rows[0], { ai_review: null, ai_review_at: null });
  assert.equal((await db.query('select ai_season_summary from seasons where id=$1', [season])).rows[0].ai_season_summary, null);
};

const first = await createGame();
await checkout(first);
const second = (await command(first, 3, 'new_leg')).next_game_id;
await checkout(second);
await seedReview();
const undoRequest = randomUUID();
await command(second, 3, 'undo', 0, undoRequest);
await assertCleared(second);
assert.equal((await db.query('select status from games where id=$1', [second])).rows[0].status, 'in_progress');

// Recompletion also removes any commentary saved while the match was reopened.
await seedReview();
const finishRequest = randomUUID();
await command(second, 4, 'record', 141, finishRequest);
await assertCleared(second);
assert.equal((await db.query('select status from games where id=$1', [second])).rows[0].status, 'completed');

// A lost response retry must not erase a fresh review or apply a second visit.
await seedReview();
await command(second, 4, 'record', 141, finishRequest);
assert.equal((await db.query('select ai_team_review from fixtures where id=$1', [fixture])).rows[0].ai_team_review, 'Old fixture review');
assert.equal((await db.query('select count(*)::int n from scoring_events where game_id=$1 and not is_deleted', [second])).rows[0].n, 3);

// Failed corrections roll back score changes and commentary together.
await db.exec(`create function reject_reopen() returns trigger language plpgsql as $$ begin
  if old.status='completed' and new.status='in_progress' then raise exception 'Simulated correction failure'; end if; return new;
end $$; create trigger reject_reopen before update on games for each row execute function reject_reopen();`);
await assert.rejects(command(second, 5, 'undo'), /Simulated correction failure/);
assert.equal((await db.query('select ai_team_review from fixtures where id=$1', [fixture])).rows[0].ai_team_review, 'Old fixture review');
assert.equal((await db.query('select count(*)::int n from scoring_events where game_id=$1 and not is_deleted', [second])).rows[0].n, 3);
await db.exec('drop trigger reject_reopen on games;');

// Undo from an untouched successor must invalidate the same fixture atomically.
const previous = await createGame();
await checkout(previous);
const emptyNext = (await command(previous, 3, 'new_leg')).next_game_id;
await seedReview();
const canonical = await command(emptyNext, 0, 'undo');
assert.equal(canonical.state.meta.id, previous);
await assertCleared(previous);
console.log('League review invalidation: completion, correction, recompletion, retry, rollback and empty-successor undo pass.');
await db.close();
