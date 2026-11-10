import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.on('uncaughtException', error => {
  console.error(error.message, error.detail ?? '', error.where ?? '', error.internalQuery ?? '');
  process.exit(1);
});

const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
// The timestamped chain alone must build the whole schema from an empty database.
const chain = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
for (const file of chain) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
// Every migration is written to be safely re-applied.
for (const file of chain) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
const open = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`)).rows.map(r => r.relname);
assert.deepEqual(open, [], `tables without row level security: ${open}`);
const granted = (await db.query(`select distinct table_name from information_schema.role_table_grants
 where table_schema='public' and grantee in ('anon','authenticated')`)).rows.map(r => r.table_name);
assert.deepEqual(granted, [], `tables or views granted to anon/authenticated: ${granted}`);
console.log('The migration chain builds the schema from empty, re-applies cleanly, and leaves every table server-only.');
const team = randomUUID(), player = randomUUID(), fixture = randomUUID(), match = randomUUID();
await db.query('insert into teams(id,name) values($1,$2)', [team,'Test team']);
await db.query('insert into players(id,team_id,name) values($1,$2,$3)', [player,team,'Test player']);
await db.query('insert into fixtures(id,team_id,starts_at,home,opponent) values($1,$2,now(),true,$3)', [fixture,team,'Visitors']);
async function game() {
  const id=randomUUID();
  await db.query('insert into games(id,team_id,fixture_id,match_id,west_green_player_id,opponent_player,west_green_starts) values($1,$2,$3,$4,$5,$6,false)',[id,team,fixture,match,player,'Visitor']);
  return id;
}
async function command(id, revision, side, score, darts=3, action='record', practice=false, request=randomUUID()) {
  return db.query('select wgd_score_command($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[id,team,revision,request,practice,action,side,score,darts]);
}
const id=await game();
const request=randomUUID();
await command(id,0,'opponent',100,3,'record',false,request);
await command(id,0,'opponent',100,3,'record',false,request);
assert.equal((await db.query('select count(*)::int n from scoring_events')).rows[0].n,1);
await assert.rejects(command(id,0,'west_green',60), /changed on another device/);
await command(id,1,'west_green',180);
await command(id,2,'opponent',100);
assert.equal((await db.query("select remaining_after from scoring_events where thrower='opponent' order by id desc limit 1")).rows[0].remaining_after,301);
await command(id,3,'opponent',0,3,'undo');
await command(id,4,'west_green',180);
await command(id,5,'west_green',150); // bust on 141
await assert.rejects(command(id,6,'west_green',141,1), /needs more darts/);
await command(id,6,'west_green',141,3);
await assert.rejects(command(id,7,'opponent',100), /no longer active/);
assert.equal((await db.query('select winner from games where id=$1',[id])).rows[0].winner,'west_green');
const stats=(await db.query('select * from player_stats_view where player_id=$1',[player])).rows[0];
assert.equal(Number(stats.three_dart_avg),125.25); // 501 points /12 darts, bust contributes zero.
const next=(await command(id,7,'west_green',0,3,'new_leg')).rows[0].result.next_game_id;
assert.equal((await db.query('select west_green_starts from games where id=$1',[next])).rows[0].west_green_starts,true);
await command(id,8,'west_green',0,3,'undo');
assert.equal((await db.query('select deleted from games where id=$1',[next])).rows[0].deleted,true);
console.log('League: persisted opponent scores, stale requests, retries, bust totals, checkout validation, next starter and undo pass.');
const session=randomUUID(), pg=randomUUID();
await db.query('insert into practice_sessions(id,team_id,legs_to_play,start_score) values($1,$2,2,40)',[session,team]);
await db.query('insert into practice_games(id,session_id,leg_index) values($1,$2,1)',[pg,session]);
await command(pg,0,'player_a',40,1,'record',true);
assert.equal((await db.query('select count(*)::int n from practice_games where session_id=$1',[session])).rows[0].n,2);
await assert.rejects(command(pg,1,'player_b',40,1,'record',true), /no longer active/);
await command(pg,1,'player_a',0,3,'undo',true);
assert.equal((await db.query('select count(*)::int n from practice_games where session_id=$1',[session])).rows[0].n,1);
await command(pg,2,'player_a',40,1,'record',true);
const pg2=(await db.query('select id from practice_games where session_id=$1 and leg_index=2',[session])).rows[0].id;
await command(pg2,0,'player_b',40,1,'record',true);
assert.equal((await db.query('select status from practice_sessions where id=$1',[session])).rows[0].status,'completed');
await command(pg2,1,'player_b',0,3,'undo',true);
assert.equal((await db.query('select status from practice_sessions where id=$1',[session])).rows[0].status,'in_progress');
console.log('Practice: completed-leg protection, next-leg cleanup, re-checkout and session reopening pass.');
// A completion failure must roll back its visit too.
await db.exec(`create function reject_completion() returns trigger language plpgsql as $$ begin
 if new.status='completed' then raise exception 'Simulated storage failure'; end if; return new; end $$;
 create trigger reject_completion before update on practice_games for each row execute function reject_completion();`);
await assert.rejects(command(pg2,2,'player_b',40,1,'record',true), /Simulated storage failure/);
assert.equal((await db.query('select revision from practice_games where id=$1',[pg2])).rows[0].revision,2);
assert.equal((await db.query('select count(*)::int n from practice_events where game_id=$1 and not is_deleted',[pg2])).rows[0].n,0);
await db.exec('drop trigger reject_completion on practice_games');
async function drill(mode, id, rev, event, patch, who=null, playerPatch=null, request=randomUUID()) {
 return db.query('select wgd_drill_command($1,$2,$3,$4,$5,$6,$7,$8,$9)',[mode,id,team,rev,request,event,patch,who,playerPatch]);
}
const checkoutSession=randomUUID();
await db.query('insert into checkout_practice_sessions(id,team_id,current_target) values($1,$2,100)',[checkoutSession,team]);
await assert.rejects(drill('checkout',checkoutSession,0,{success:true,darts_used:1},{current_target:40}), /needs more darts/);
await drill('checkout',checkoutSession,0,{success:true,darts_used:2},{current_target:40});
await assert.rejects(drill('checkout',checkoutSession,0,{success:true,darts_used:2},{current_target:40}), /changed on another device/);
assert.equal((await db.query('select attempt_index from checkout_practice_sessions where id=$1',[checkoutSession])).rows[0].attempt_index,1);
await drill('checkout',checkoutSession,1,null,{status:'completed'});
await assert.rejects(drill('checkout',checkoutSession,2,{success:true,darts_used:2},{current_target:40}), /no longer active/);
const session121=randomUUID();
await db.query('insert into game_121_sessions(id,team_id) values($1,$2)',[session121,team]);
await drill('121',session121,0,{score:121,remaining_after:0,is_bust:false,result:'locked'},
 {base_checkout:121,current_checkout:122,current_turn:1,remaining:122,status:'in_progress',completed_at:null});
assert.equal((await db.query('select checkout from game_121_turns where session_id=$1',[session121])).rows[0].checkout,121);
await drill('121',session121,1,null,{status:'abandoned'});
const ds=randomUUID(), dp=randomUUID();
await db.query('insert into doubles_practice_sessions(id,team_id) values($1,$2)',[ds,team]);
await db.query('insert into doubles_practice_players(id,session_id,player_id,throw_order) values($1,$2,$3,0)',[dp,ds,player]);
await drill('doubles',ds,0,{round_index:0,target:1,phase:'sequence',dart_hit:1,points:3},{current_slot:0},dp,
 {round_index:1,current_target:2,phase:'sequence',score:3,hits:1,first_dart_hits:1});
assert.equal((await db.query('select score from doubles_practice_players where id=$1',[dp])).rows[0].score,3);
console.log('Completion failure rollback and atomic checkout, 121 and doubles commands pass.');
// One write-and-state RPC returns coherent data and remains idempotent.
const fresh=await game(), oneRequest=randomUUID();
const fast=await db.query('select wgd_score_command_state($1,$2,0,$3,false,$4,$5,60,3) result',[fresh,team,oneRequest,'record','west_green']);
assert.equal(fast.rows[0].result.state.meta.revision,1);
assert.equal(fast.rows[0].result.state.events[0].remaining_after,441);
await db.query('select wgd_score_command_state($1,$2,0,$3,false,$4,$5,60,3)',[fresh,team,oneRequest,'record','west_green']);
assert.equal((await db.query('select count(*)::int n from scoring_events where game_id=$1',[fresh])).rows[0].n,1);
await assert.rejects(db.query('select wgd_score_snapshot($1,$2,false)',[fresh,randomUUID()]),/Fixture not found/);
const leagueState=(await db.query('select wgd_score_snapshot($1,$2,false) result',[fresh,team])).rows[0].result;
assert.equal(leagueState.meta.players.name,'Test player');
assert.equal(leagueState.events.length,1);
const practiceState=(await db.query('select wgd_score_snapshot($1,$2,true) result',[pg2,team])).rows[0].result;
assert.equal(practiceState.meta.practice_sessions.start_score,40);
assert.equal(practiceState.meta.revision,2);
console.log('Single-call score snapshots: coherent revisions, player metadata, retry deduplication and team isolation pass.');
// PIN attempt limiting.
for (let i = 0; i < 4; i++) assert.equal((await db.query("select wgd_pin_failed('c1') w")).rows[0].w, 0);
assert.equal((await db.query("select wgd_pin_failed('c1') w")).rows[0].w, 30);
assert.equal((await db.query("select wgd_pin_failed('c1') w")).rows[0].w, 60);
assert.ok((await db.query("select wgd_pin_locked('c1') w")).rows[0].w > 50);
assert.equal((await db.query("select wgd_pin_locked('other') w")).rows[0].w, 0);
await db.query("update pin_attempts set locked_until = now() - interval '1 second' where client_key='c1'");
assert.equal((await db.query("select wgd_pin_locked('c1') w")).rows[0].w, 0);
await db.query("update pin_attempts set updated_at = now() - interval '2 hours' where client_key='c1'");
assert.equal((await db.query("select wgd_pin_failed('c1') w")).rows[0].w, 0);
await db.query("select wgd_pin_succeeded('c1')");
assert.equal((await db.query('select count(*)::int n from pin_attempts')).rows[0].n, 0);
console.log('PIN attempts: free tries, doubling lockout, expiry, reset after an hour and on success pass.');
// One current season per team, switched atomically.
const s1=randomUUID(), s2=randomUUID();
await db.query('insert into seasons(id,team_id,name,is_current) values($1,$3,$4,true),($2,$3,$5,false)',[s1,s2,team,'24/25','25/26']);
await assert.rejects(db.query('update seasons set is_current=true where id=$1',[s2]), /seasons_one_current/);
assert.equal((await db.query('select wgd_set_current_season($1,$2) ok',[team,s2])).rows[0].ok, true);
assert.deepEqual((await db.query('select id from seasons where is_current')).rows.map(r=>r.id), [s2]);
assert.equal((await db.query('select wgd_set_current_season($1,$2) ok',[randomUUID(),s1])).rows[0].ok, false);
assert.deepEqual((await db.query('select id from seasons where is_current')).rows.map(r=>r.id), [s2]);
// Fixture delete: refused with live games, team-scoped, removes games and events together.
const doomed=randomUUID(), dg=randomUUID();
await db.query('insert into fixtures(id,team_id,starts_at,home,opponent) values($1,$2,now(),true,$3)',[doomed,team,'Doomed']);
await db.query('insert into games(id,team_id,fixture_id,match_id,west_green_player_id,opponent_player,west_green_starts) values($1,$2,$3,$4,$5,$6,true)',[dg,team,doomed,randomUUID(),player,'X']);
await db.query('insert into scoring_events(team_id,game_id,throw_index,score,darts,remaining_after) values($1,$2,1,60,3,441)',[team,dg]);
assert.equal((await db.query('select wgd_delete_fixture($1,$2) r',[team,doomed])).rows[0].r, 'has_games');
assert.equal((await db.query('select wgd_delete_fixture($1,$2) r',[randomUUID(),doomed])).rows[0].r, 'not_found');
await db.query('update games set deleted=true where id=$1',[dg]);
assert.equal((await db.query('select wgd_delete_fixture($1,$2) r',[team,doomed])).rows[0].r, 'deleted');
assert.equal((await db.query('select count(*)::int n from scoring_events where game_id=$1',[dg])).rows[0].n, 0);
assert.equal((await db.query('select count(*)::int n from fixtures where id=$1',[doomed])).rows[0].n, 0);
console.log('Season switch and fixture delete: atomic, team-scoped and constraint-backed pass.');
// AI generation claims: one holder at a time, takeover only after expiry.
assert.equal((await db.query("select wgd_claim_ai('match:1') ok")).rows[0].ok, true);
assert.equal((await db.query("select wgd_claim_ai('match:1') ok")).rows[0].ok, false);
assert.equal((await db.query("select wgd_claim_ai('match:2') ok")).rows[0].ok, true);
await db.query("update ai_generation_claims set claimed_at = now() - interval '10 minutes' where claim_key='match:1'");
assert.equal((await db.query("select wgd_claim_ai('match:1') ok")).rows[0].ok, true);
await db.query("select wgd_release_ai('match:1')");
assert.equal((await db.query("select wgd_claim_ai('match:1') ok")).rows[0].ok, true);
console.log('AI generation claims: exclusive, released and taken over after expiry pass.');
await db.exec('set role anon');
await assert.rejects(db.query('select * from games'), /permission denied/);
await assert.rejects(command(id,9,'west_green',0), /permission denied/);
await assert.rejects(db.query('select wgd_score_snapshot($1,$2,false)',[fresh,team]),/permission denied/);
await assert.rejects(db.query("select wgd_pin_succeeded('c1')"),/permission denied/);
await assert.rejects(db.query('select * from pin_attempts'),/permission denied/);
await db.exec('reset role');
console.log('Anonymous table access and scoring RPC access are denied.');
await db.close();
