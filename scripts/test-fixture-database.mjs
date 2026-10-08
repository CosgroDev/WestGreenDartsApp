import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec(readFileSync('supabase/schema.sql', 'utf8'));
for (const folder of readdirSync('supabase/migrations', { withFileTypes: true }).filter(f => f.isDirectory())) {
  for (const name of readdirSync(`supabase/migrations/${folder.name}`).sort().filter(f => f.endsWith('.sql'))) {
    await db.exec(readFileSync(`supabase/migrations/${folder.name}/${name}`, 'utf8'));
  }
}
for (const name of ['20260908193204_audit_scoring_and_access_fixes.sql', '20261001090000_scoring_snapshots.sql']) await db.exec(readFileSync(`supabase/migrations/${name}`, 'utf8'));
const migration = readFileSync('supabase/migrations/20261008193903_fixture_lineup_positions.sql', 'utf8');
await db.exec(migration); await db.exec(migration);
const team = randomUUID(), other = randomUUID(), player = randomUUID(), fixture = randomUUID();
await db.query('insert into teams(id,name) values($1,$2),($3,$4)', [team,'West Green',other,'Other team']);
await db.query('insert into players(id,team_id,name) values($1,$2,$3)', [player,team,'Team player']);
await db.query('insert into fixtures(id,team_id,starts_at,home,opponent) values($1,$2,now(),true,$3)', [fixture,team,'Visitors']);
const create = (who = team, game = randomUUID()) => db.query('select wgd_create_fixture_match($1,$2,$3,$4,$5) id',[fixture,who,player,'Visitor',game]);
const first = (await create()).rows[0].id;
const firstRow = (await db.query('select match_id,match_position,west_green_starts from games where id=$1',[first])).rows[0];
assert.equal(firstRow.match_position,1);
assert.equal(firstRow.west_green_starts,false);
await create(team,first);
await db.query('update players set active=false where id=$1',[player]);
await create(team,first); // Previously saved creation can be recovered after deactivation.
await db.query('update players set active=true where id=$1',[player]);
await assert.rejects(db.query('select wgd_create_fixture_match($1,$2,$3,$4,$5)',[fixture,team,player,'Changed visitor',first]),/already saved a match with different details/);
assert.equal((await db.query('select count(*)::int n from games where fixture_id=$1',[fixture])).rows[0].n,1);
await assert.rejects(create(other),/Fixture not found/);
// Every leg inherits the original slot, including next legs made by old scoring commands.
await db.query('insert into games(team_id,fixture_id,match_id,west_green_player_id,opponent_player,west_green_starts) values($1,$2,$3,$4,$5,true)',[team,fixture,firstRow.match_id,player,'Visitor']);
assert.equal((await db.query('select count(*)::int n from games where match_position=1')).rows[0].n,2);
for (let i=1;i<6;i++) await create();
await assert.rejects(create(),/six match positions/);
await assert.rejects(db.query('select wgd_delete_empty_fixture($1,$2)',[fixture,team]),/Remove the matches/);
await db.query('select wgd_delete_fixture_match($1,$2,$3,$4,$5)',[fixture,team,firstRow.match_id,player,'Visitor']);
assert.equal((await db.query('select count(*)::int n from games where match_id=$1 and deleted',[firstRow.match_id])).rows[0].n,2);
const replacement = (await create()).rows[0].id;
assert.equal((await db.query('select match_position from games where id=$1',[replacement])).rows[0].match_position,1);
const positions=(await db.query('select distinct match_position from games where fixture_id=$1 and not deleted order by match_position',[fixture])).rows.map(r=>r.match_position);
assert.deepEqual(positions,[1,2,3,4,5,6]);
// A failed event cleanup rolls back match deletion, leaving scoring data intact.
await db.exec(`create function reject_game_delete() returns trigger language plpgsql as $$ begin if new.deleted then raise exception 'Simulated delete failure'; end if; return new; end $$;
create trigger reject_game_delete before update on games for each row execute function reject_game_delete();`);
await db.query("insert into scoring_events(team_id,game_id,throw_index,score,darts,remaining_after) values($1,$2,1,60,3,441)",[team,replacement]);
const replacementMatch=(await db.query('select match_id from games where id=$1',[replacement])).rows[0].match_id;
await assert.rejects(db.query('select wgd_delete_fixture_match($1,$2,$3,$4,$5)',[fixture,team,replacementMatch,player,'Visitor']),/Simulated delete failure/);
assert.equal((await db.query('select is_deleted from scoring_events where game_id=$1',[replacement])).rows[0].is_deleted,false);
await db.exec('drop trigger reject_game_delete on games');
const a=randomUUID(),b=randomUUID(),c=randomUUID();
await db.query('insert into seasons(id,team_id,name,is_current) values($1,$2,$3,true),($4,$2,$5,false),($6,$7,$8,true)',[a,team,'2025/26',b,'2026/27',c,other,'Other season']);
await db.query('select wgd_set_current_season($1,$2)',[team,b]);
assert.deepEqual((await db.query('select id from seasons where team_id=$1 and is_current',[team])).rows.map(r=>r.id),[b]);
await assert.rejects(db.query('select wgd_set_current_season($1,$2)',[team,c]),/Season not found/);
assert.equal((await db.query('select is_current from seasons where id=$1',[c])).rows[0].is_current,true);
const scheduled=randomUUID(), start='2026-10-08T19:00:00Z';
await db.query('select wgd_create_fixture($1,$2,$3,$4,false,$5,null,null)',[team,b,scheduled,start,'Next opponents']);
await db.query('select wgd_create_fixture($1,$2,$3,$4,false,$5,null,null)',[team,b,scheduled,start,'Next opponents']);
assert.equal((await db.query('select count(*)::int n from fixtures where id=$1',[scheduled])).rows[0].n,1);
await assert.rejects(db.query('select wgd_create_fixture($1,$2,$3,$4,false,$5,null,null)',[team,b,scheduled,start,'Changed opponents']),/already saved a fixture with different details/);
await assert.rejects(db.query('select wgd_create_fixture($1,$2,$3,now(),false,$4,null,null)',[team,c,randomUUID(),'Other season']),/Season not found/);
for (const fn of ['wgd_create_fixture_match(uuid,uuid,uuid,text,uuid)','wgd_delete_fixture_match(uuid,uuid,uuid,uuid,text)','wgd_delete_empty_fixture(uuid,uuid)','wgd_set_current_season(uuid,uuid)','wgd_create_fixture(uuid,uuid,uuid,timestamptz,boolean,text,text,text)']) {
  const row=(await db.query("select has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('authenticated',$1,'EXECUTE') authenticated,has_function_privilege('service_role',$1,'EXECUTE') service",[fn])).rows[0];
  assert.deepEqual(row,{anon:false,authenticated:false,service:true});
}
console.log('Fixture database: repeat migration, six-slot enforcement, next-leg slot inheritance, replacement numbering, team isolation, deletion rollback, atomic current season and function permissions pass.');
await db.close();
