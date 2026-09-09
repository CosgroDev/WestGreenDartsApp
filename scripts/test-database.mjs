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
await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
for (const folder of readdirSync('supabase/migrations', {withFileTypes: true}).filter(x => x.isDirectory())) {
  for (const file of readdirSync(`supabase/migrations/${folder.name}`).sort()) {
    if (file.endsWith('.sql')) await db.exec(readFileSync(`supabase/migrations/${folder.name}/${file}`, 'utf8'));
  }
}
const migration = readFileSync('supabase/migrations/20260908193204_audit_scoring_and_access_fixes.sql', 'utf8');
await db.exec(migration);
await db.exec(migration);
console.log('Schema and migration apply successfully, including a repeat application.');
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
await db.exec('set role anon');
await assert.rejects(db.query('select * from games'), /permission denied/);
await assert.rejects(command(id,9,'west_green',0), /permission denied/);
await db.exec('reset role');
console.log('Anonymous table access and scoring RPC access are denied.');
await db.close();
